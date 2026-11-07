import {
  SUBAGENT_ENTRY_KEYS,
  entry_claims,
  introduces_collision,
  free_entry_id,
  free_entry_name,
  new_subagent_entry,
  pool_where,
  shared_entry_id_rows,
  subagent_pool_problems,
} from "./subagent_pool_config";
import { ENTRY_ID_ROWS } from "./skeleton_entry_id_capture";

describe("an entry this editor composes is the entry the store writes", () => {
  /* The contract plan's rule for this boundary: the product's defaults are
     written by the producer and never silently supplied by the consumer. The
     UI composing a definition is a producer, so an entry it makes carries all
     ten fields — and they are the same values the store writes when it
     converts a legacy pool, so a hand-made entry and a converted one are one
     object rather than two dialects. */
  const made = new_subagent_entry({ id: "subagent-1", name: "Summarizer", agent_id: "res-1" });

  test("every field the wire closes is written out", () => {
    expect(Object.keys(made).sort()).toEqual([...SUBAGENT_ENTRY_KEYS].sort());
    expect(subagent_pool_problems({ subagents: [made] })).toEqual([]);
  });

  test("the defaults are the store's own", () => {
    /* `_subagent_entry`, `skeleton_resource_store.py:287-301`. */
    expect(made.allowed_modes).toEqual(["delegate", "worker"]);
    expect(made.output_mode).toBe("summary");
    expect(made.memory_policy).toBe("ephemeral");
    expect(made.parallel_safe).toBe(true);
    expect(made.disabled_tools).toEqual([]);
  });

  test("every tool is not the same answer as no tool", () => {
    /* `null` is "every tool"; `[]` is "no tool". A consumer that treated the
       absent one as an empty list would silently take every tool away. */
    expect(made.allowed_tools).toBe(null);
    expect(subagent_pool_problems({ subagents: [{ ...made, allowed_tools: [] }] })).toEqual([]);
  });

  test("it references by resource id, never by name", () => {
    expect(made.source).toEqual({ kind: "agent_ref", agent_id: "res-1" });
  });
});

describe("an id and a name nothing in the pool is using", () => {
  test("the first entry gets the first id", () => {
    expect(free_entry_id([])).toBe("subagent-1");
  });

  test("an id in use is skipped rather than reused", () => {
    expect(free_entry_id(["subagent-1"])).toBe("subagent-2");
    expect(free_entry_id(["subagent-1", "subagent-3"])).toBe("subagent-2");
  });

  test("the Agent's own name is the name, where it is free", () => {
    expect(free_entry_name([], "Summarizer")).toBe("Summarizer");
  });

  test("a second entry for the same Agent is numbered, not refused", () => {
    /* Two entries may reference one Agent — the runtime requires unique entry
       ids and names, not unique targets — so the pool is allowed to call the
       same Agent twice in two roles. */
    expect(free_entry_name(["Summarizer"], "Summarizer")).toBe("Summarizer 2");
    expect(free_entry_name(["Summarizer", "Summarizer 2"], "Summarizer")).toBe("Summarizer 3");
  });

  test("a nameless Agent still produces a name, because the wire requires one", () => {
    expect(free_entry_name([], "")).toBe("Subagent");
    expect(free_entry_name([], undefined)).toBe("Subagent");
    expect(free_entry_name(["Subagent"], "   ")).toBe("Subagent 2");
  });
});

describe("a problem is addressed the way the runtime addresses it", () => {
  test("the path reads as a path", () => {
    expect(pool_where(["config", "subagents", 0, "source", "agent_id"])).toBe(
      "config.subagents[0].source.agent_id",
    );
  });

  test("an entry's problems are addressed under that entry", () => {
    const problems = subagent_pool_problems({
      subagents: [
        new_subagent_entry({ id: "subagent-1", name: "A", agent_id: "res-1" }),
        { ...new_subagent_entry({ id: "subagent-2", name: "B", agent_id: "res-2" }), output_mode: "digest" },
      ],
    });
    expect(problems.map((p) => p.where)).toEqual(["config.subagents[1].output_mode"]);
  });
});

describe("a legacy pool is not this wire", () => {
  test("its shape would be described wrongly by these rules", () => {
    /* Which is why the panel decides first and only then asks: the store
       expands `legacy_fields` at preflight, so neither of these is a fault in
       the document the store will actually run. */
    const codes = subagent_pool_problems({ legacy_fields: { subagents: [] } }).map(
      (p) => `${p.code} @ ${p.where}`,
    );
    expect(codes).toContain("missing_field @ config.subagents");
    expect(codes).toContain("unknown_field @ config.legacy_fields");
  });
});

describe("what a write to a pool may not make worse", () => {
  /* The two unique fields, and a draft that already breaks them. The store's
     format check asks nothing of a pool's contents, so three entries sharing
     one id is a document that saves and reloads — and the author has to be
     able to get out of it, one step at a time, with the only control there is
     for an id: removal. */
  const row = (id, name) => ({ id, name });
  const three = [row("dup", "A"), row("dup", "B"), row("dup", "C")];

  test("a removal never does", () => {
    expect(introduces_collision(three, three.slice(1))).toBe(false);
    expect(introduces_collision(three, [row("dup", "C")])).toBe(false);
    expect(introduces_collision(three, [])).toBe(false);
  });

  test("an edit that touches neither field never does", () => {
    const edited = three.map((entry, index) =>
      index === 2 ? { ...entry, description: "later" } : entry,
    );
    expect(introduces_collision(three, edited)).toBe(false);
  });

  test("a new collision does", () => {
    const two = [row("sa1", "A"), row("sa2", "B")];
    expect(introduces_collision(two, [row("sa1", "A"), row("sa2", "A")])).toBe(true);
    expect(introduces_collision(two, [row("sa1", "A"), row("sa1", "B")])).toBe(true);
  });

  test("and so does one more claim on a value that already collides", () => {
    /* The part a set of colliding values cannot say. Two entries called `A`
       and a third renamed onto it leaves the same set and a worse document. */
    const two_of_a = [row("sa1", "A"), row("sa2", "A"), row("sa3", "B")];
    const three_of_a = [row("sa1", "A"), row("sa2", "A"), row("sa3", "A")];
    expect(introduces_collision(two_of_a, three_of_a)).toBe(true);
  });

  test("an entry that states nothing claims nothing", () => {
    expect(introduces_collision([null, null], [null, null, null])).toBe(false);
    expect(entry_claims([null, row("sa1", "A"), "text"], "name").get("A")).toBe(1);
  });

  test("the empty name is a name, and is counted like one", () => {
    /* `""` is a legal name the wire allows, so two entries claiming it is a
       collision like any other. */
    expect(introduces_collision([row("sa1", "")], [row("sa1", ""), row("sa2", "")])).toBe(
      true,
    );
  });
});

describe("the rows a pool cannot tell apart, and what repairing one buys", () => {
  const row = (id, name) => ({ id, name });

  test("the rows that share an id are named by position", () => {
    /* By position, because the repair is offered on a row and two rows is
       what the author sees. */
    expect(shared_entry_id_rows([row("dup", "A"), row("dup", "B")])).toEqual([0, 1]);
    expect(
      shared_entry_id_rows([row("a", "A"), row("dup", "B"), row("dup", "C")]),
    ).toEqual([1, 2]);
    expect(shared_entry_id_rows([row("dup", "A"), row("b", "B")])).toEqual([]);
    expect(
      shared_entry_id_rows([row("dup", "A"), row("dup", "B"), row("dup", "C")]),
    ).toEqual([0, 1, 2]);
  });

  test("an entry that states no id takes no part", () => {
    expect(shared_entry_id_rows([{ name: "A" }, { name: "B" }])).toEqual([]);
    expect(shared_entry_id_rows([null, row("dup", "A"), row("dup", "B")])).toEqual([1, 2]);
    expect(shared_entry_id_rows(null)).toEqual([]);
    /* A name collision is not an id collision: names have their own control. */
    expect(shared_entry_id_rows([row("a", "same"), row("b", "same")])).toEqual([]);
  });

  test("the id it writes is free in this pool, which is the only place it means anything", () => {
    /* Measured on the pair: the same entry id in two different pools of one
       document runs. So "unused" is asked of this pool. */
    const by = (name) => ENTRY_ID_ROWS.find((item) => item.case === name);
    expect(by("same_entry_id_two_pools").run.ok).toBe(true);
    expect(free_entry_id(["subagent-1", "duplicated-entry"])).toBe("subagent-2");
    expect(free_entry_id(["duplicated-entry", "duplicated-entry"])).toBe("subagent-1");
  });

  test("the store's answer before and after the repair", () => {
    const by = (name) => ENTRY_ID_ROWS.find((item) => item.case === name);
    /* Two entries under one id: refused at the second one's id. */
    const before = by("duplicate_ids");
    expect([before.saved, before.round_trip, before.draft_diagnostics]).toEqual([
      true,
      true,
      [],
    ]);
    expect([before.run.code, before.run.path.slice(-2)]).toEqual([
      "duplicate_name",
      [1, "id"],
    ]);
    /* Given an unused id, the document runs. */
    expect(by("repaired_ids").run).toEqual({ ok: true, code: null, path: null });
    /* And where the two embedded graphs carry one document id, it does not —
       so repairing the entry id is not a claim that the Agent runs. */
    const shared_graph = by("repaired_ids_one_graph");
    expect([shared_graph.run.code, shared_graph.run.path.slice(-2)]).toEqual([
      "dependency_conflict",
      [1, "source"],
    ]);
  });

  test("an entry id is otherwise whatever the author has", () => {
    /* Nothing to validate beyond "unused here": the store saves and runs an
       entry id of `__proto__`, one with a space, one in Chinese and a
       300-character one. The editor never uses an entry id as a table key. */
    ["entry_id___proto__", "entry_id_constructor", "entry_id_with_space",
     "entry_id_子代理", "entry_id_xxxxxxxxxxxxxx"].forEach((name) => {
      const item = ENTRY_ID_ROWS.find((row_item) => row_item.case === name);
      expect([name, item.saved, item.round_trip, item.run.ok]).toEqual([
        name,
        true,
        true,
        true,
      ]);
    });
  });
});
