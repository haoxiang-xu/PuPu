import {
  SUBAGENT_ENTRY_KEYS,
  free_entry_id,
  free_entry_name,
  new_subagent_entry,
  pool_where,
  subagent_pool_problems,
} from "./subagent_pool_config";

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
