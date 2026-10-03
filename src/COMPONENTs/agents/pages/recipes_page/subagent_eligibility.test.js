import {
  ADMISSION,
  admission,
  eligible_subagent_resources,
  entry_is_reference,
  entry_reference,
  ineligible_reason,
  is_eligible_subagent,
  resource_kind,
} from "./subagent_eligibility";

describe("a pool holds Agents, never Workflows", () => {
  test("a declared Workflow is refused", () => {
    const workflow = { name: "Nightly", kind: "workflow" };
    expect(is_eligible_subagent(workflow)).toBe(false);
    expect(ineligible_reason(workflow)).toMatch(/cannot be a subagent/i);
  });

  test("a declared Agent is accepted", () => {
    const agent = { name: "Explore", kind: "agent" };
    expect(is_eligible_subagent(agent)).toBe(true);
    expect(ineligible_reason(agent)).toBeNull();
  });

  test("eligibility never reads a file extension or a reference field name", () => {
    /* `.recipe` is the extension every stored resource has, and `recipe_ref` is
     * the field that points at one. Neither says what the resource is. */
    expect(is_eligible_subagent({ name: "Nightly.recipe", kind: "workflow" })).toBe(
      false,
    );
    expect(
      is_eligible_subagent({ name: "Nightly", kind: "workflow", recipe_ref: true }),
    ).toBe(false);
  });

  test("an undeclared resource is an Agent, because the store cannot hold a Workflow", () => {
    /* The legacy compat path: no kind, no schema version — the shape the old
     * producer emits. Pinned on the producer side by
     * test_recipe.py::test_a_graph_without_an_agent_node_is_refused. */
    expect(admission({ name: "Explore" })).toBe(ADMISSION.LEGACY_AGENT);
    expect(is_eligible_subagent({ name: "Explore" })).toBe(true);
  });

  test("declaring nothing and declaring something unreadable are not the same", () => {
    /* The compat path exists for resources the old producer validated, not for
     * anything this build happens not to understand. Collapsing the two admits
     * exactly what the rule exists to keep out. */
    expect(admission({ name: "Explore" })).toBe(ADMISSION.LEGACY_AGENT);
    expect(admission({ name: "Hooked", kind: "hook" })).toBe(
      ADMISSION.UNKNOWN_KIND,
    );
    expect(is_eligible_subagent({ name: "Hooked", kind: "hook" })).toBe(false);
    expect(ineligible_reason({ name: "Hooked", kind: "hook" })).toMatch(
      /does not recognise/i,
    );
  });

  test("a newer definition format is refused, not read as a legacy Agent", () => {
    /* No schema version is known to this build, so any declared version is a
     * format it cannot interpret — including one that also says "agent", since
     * that word cannot be trusted to mean the same thing in a schema this
     * build has never seen. */
    const newer = { name: "Explore", schema_version: 2, kind: "agent" };
    expect(admission(newer)).toBe(ADMISSION.UNKNOWN_SCHEMA);
    expect(is_eligible_subagent(newer)).toBe(false);
    expect(ineligible_reason(newer)).toMatch(/cannot read/i);
  });

  test("a known format that declares no kind is malformed, not legacy", () => {
    expect(admission({ name: "Explore", schema_version: 2 })).toBe(
      ADMISSION.UNKNOWN_SCHEMA,
    );
  });

  test("resource_kind reports for display and never launders an unknown kind", () => {
    expect(resource_kind({ name: "X", kind: "hook" })).toBeNull();
    expect(resource_kind({ name: "X" })).toBeNull();
    expect(resource_kind({ name: "X", kind: "agent" })).toBe("agent");
    /* Both report null, and admission still tells them apart. */
    expect(admission({ name: "X", kind: "hook" })).not.toBe(
      admission({ name: "X" }),
    );
  });

  test("a nameless resource is never offered", () => {
    expect(is_eligible_subagent({ kind: "agent" })).toBe(false);
    expect(is_eligible_subagent(null)).toBe(false);
    expect(admission(null)).toBe(ADMISSION.UNUSABLE);
  });
});

describe("what a picker may offer", () => {
  const resources = [
    { name: "Default", kind: "agent" },
    { name: "Explore" },
    { name: "Nightly", kind: "workflow" },
    { name: "Hooked", kind: "hook" },
    { name: "Future", schema_version: 2, kind: "agent" },
    { name: "" },
  ];

  test("everything this build cannot admit as an Agent is left out", () => {
    expect(
      eligible_subagent_resources(resources, { exclude_name: "Default" }).map(
        (r) => r.name,
      ),
    ).toEqual(["Explore"]);
  });

  test("a non-list is empty rather than a throw", () => {
    expect(eligible_subagent_resources(undefined)).toEqual([]);
    expect(eligible_subagent_resources(null, { exclude_name: "x" })).toEqual([]);
  });
});

describe("a row says where its Agent comes from", () => {
  test("a recipe_ref row is Referenced, never 'workflow'", () => {
    const row = entry_reference({ kind: "recipe_ref", recipe_name: "Explore" });
    expect(row).toEqual({ name: "Explore", source: "Referenced" });
    expect(row.source).not.toMatch(/workflow/i);
    expect(entry_is_reference({ kind: "recipe_ref" })).toBe(true);
  });

  test("legacy entries are labelled legacy, and carry their own copy", () => {
    expect(entry_reference({ kind: "ref", template_name: "Reviewer" })).toEqual({
      name: "Reviewer",
      source: "Legacy template",
    });
    expect(entry_reference({ kind: "inline", name: "summarizer" })).toEqual({
      name: "summarizer",
      source: "Legacy inline",
    });
    expect(entry_is_reference({ kind: "inline", name: "summarizer" })).toBe(false);
  });

  test("an unrecognised entry is kept and marked rather than dropped", () => {
    expect(entry_reference({ kind: "local", name: "summarizer" })).toEqual({
      name: "summarizer",
      source: "Unknown",
    });
    expect(entry_reference({})).toEqual({ name: "(unnamed)", source: "Unknown" });
  });
});
