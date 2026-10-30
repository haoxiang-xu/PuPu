import {
  entry_agent_id,
  entry_source_label,
  subagent_candidates,
  why_not_a_subagent,
} from "./skeleton_subagent_eligibility";

/* The gate, in both directions. A Workflow offered here is a definition the
   author can compose and the store then refuses at Run with `wrong_kind` —
   which is the whole reason the rule lives in one function rather than in
   whichever list happens to be on screen. */

const agent = (over) => ({ id: "res-1", kind: "agent", name: "Summarizer", archived: false, ...over });

describe("a Subagent Pool references Agents", () => {
  test("an Agent is offered", () => {
    expect(why_not_a_subagent(agent(), { owner_id: "parent" })).toBe(null);
  });

  test("a Workflow is not, and says which it is", () => {
    const reason = why_not_a_subagent(agent({ kind: "workflow" }), { owner_id: "parent" });
    expect(reason).toMatch(/Workflow/);
    expect(reason).toMatch(/holds Agents/i);
  });

  test("a resource declaring no kind is refused rather than assumed", () => {
    /* The opposite default to the legacy recipe listing, deliberately. That
       listing has no `kind` field at all, so it has to read an absent one as
       the only thing it could be. This listing stores `kind` as a column the
       envelope requires, so an absent one means a resource this build cannot
       read — and reading it as an Agent would admit exactly what the rule
       exists to keep out. */
    expect(why_not_a_subagent({ id: "res-9", name: "Mystery" }, {})).toMatch(
      /does not declare itself an Agent/i,
    );
  });

  test("an unrecognised kind is not a third kind", () => {
    expect(why_not_a_subagent(agent({ kind: "hook" }), {})).toMatch(
      /does not declare itself an Agent/i,
    );
  });

  test("an archived Agent is not offered, because it cannot run", () => {
    expect(why_not_a_subagent(agent({ archived: true }), {})).toMatch(/archived/i);
  });

  test("the Agent being edited is not offered to itself", () => {
    expect(why_not_a_subagent(agent({ id: "parent" }), { owner_id: "parent" })).toMatch(
      /cannot be its own subagent/i,
    );
  });

  test("a resource with no id is not a reference at all", () => {
    expect(why_not_a_subagent({ kind: "agent", name: "No id" }, {})).toMatch(/no resource id/i);
    expect(why_not_a_subagent(null, {})).toMatch(/no resource id/i);
  });

  test("neither a file extension nor a legacy field name decides it", () => {
    /* `.recipe`, `recipe_ref`: one is a file name and the other is a
       reference mechanism. Only the stored kind decides. */
    expect(
      why_not_a_subagent(
        { id: "old.recipe", kind: "agent", name: "Legacy", recipe_ref: "Legacy" },
        {},
      ),
    ).toBe(null);
    expect(
      why_not_a_subagent({ id: "w.recipe", kind: "workflow", name: "Flow" }, {}),
    ).toMatch(/Workflow/);
  });

  test("the candidate list is exactly the ones with no reason", () => {
    const resources = [
      agent(),
      agent({ id: "res-2", kind: "workflow", name: "Flow" }),
      agent({ id: "parent", name: "Itself" }),
      agent({ id: "res-3", name: "Archived", archived: true }),
      agent({ id: "res-4", name: "Second" }),
    ];
    expect(
      subagent_candidates(resources, { owner_id: "parent" }).map((r) => r.id),
    ).toEqual(["res-1", "res-4"]);
  });

  test("nothing is offered out of a listing that is not one", () => {
    expect(subagent_candidates(null, {})).toEqual([]);
    expect(subagent_candidates({ resources: [] }, {})).toEqual([]);
  });
});

describe("what a row says about where its Agent comes from", () => {
  test("a reference and an embedded graph are named apart", () => {
    expect(entry_source_label({ source: { kind: "agent_ref", agent_id: "a" } })).toBe(
      "Referenced",
    );
    expect(entry_source_label({ source: { kind: "embedded", document: {} } })).toBe(
      "Embedded",
    );
  });

  test("a legacy reference field is not a kind, and is not read as one", () => {
    /* The row used to print the entry's `kind` verbatim, so a `recipe_ref`
       row read "workflow". Every entry in a pool is an Agent. */
    expect(entry_source_label({ kind: "recipe_ref", recipe_ref: "S" })).toBe(
      "Unreadable source",
    );
    expect(entry_source_label({ source: { kind: "recipe_ref" } })).toBe(
      "Unreadable source",
    );
  });

  test("the referenced id is read only from a reference", () => {
    expect(entry_agent_id({ source: { kind: "agent_ref", agent_id: "res-1" } })).toBe("res-1");
    expect(entry_agent_id({ source: { kind: "embedded", document: {} } })).toBe(null);
    expect(entry_agent_id({ source: { kind: "agent_ref", agent_id: 7 } })).toBe(null);
    expect(entry_agent_id(null)).toBe(null);
  });
});
