import capture from "./skill_read_capture.json";
import {
  read_skill_inventory,
  same_identity,
  skill_identity,
  skill_read_problems,
  source_label,
  with_skill,
  without_inputs,
} from "./skill_read_config";

/* The Skill Read node's configuration (#352 B3), as the fixed runtime defines
 * it: `skill: {source, source_id, name}`, CLOSED and exact; no runtime inputs
 * (`SkeletonSkillRuntime.__call__` refuses any, though preflight lets them
 * through — steps-352/probe/skill-read-store-01, "with-input"). The inventory
 * below is the sidecar's own answer (skill_read_capture.json). */

const INVENTORY = JSON.parse(capture.inventory.body_text);
const notes = INVENTORY.skills.find((skill) => skill.name === "notes");
const identity = { source: notes.source, source_id: notes.source_id, name: notes.name };
const node = (config) => ({ id: "skill", type: "skill_read", config: { execution: { inputs: [], outputs: [] }, ...config } });
const doc = (...nodes) => ({ schema_version: 1, kind: "agent", id: "a", name: "A", nodes: [{ id: "start", type: "start", config: { execution: { outputs: [] } } }, ...nodes], edges: [] });

describe("the inventory, read strictly", () => {
  test("the captured answer becomes one row per skill, identity first", () => {
    const rows = read_skill_inventory(INVENTORY);
    expect(rows.map((row) => row.identity)).toEqual(INVENTORY.skills.map((skill) => ({ source: skill.source, source_id: skill.source_id, name: skill.name })));
    expect(rows[0]).toMatchObject({ description: "capture skill drafts" });
  });

  test.each([
    ["another schema", { ...INVENTORY, schema: "pupu.skill_inventory.v2" }],
    ["skills not a list", { ...INVENTORY, skills: {} }],
    ["a skill without a source", { ...INVENTORY, skills: [{ ...notes, source: undefined }] }],
    ["a blank name", { ...INVENTORY, skills: [{ ...notes, name: "" }] }],
    ["one identity twice", { ...INVENTORY, skills: [notes, notes] }],
    ["nothing at all", null],
  ])("refuses %s rather than listing something else", (_label, payload) => {
    expect(() => read_skill_inventory(payload)).toThrow("The skill list could not be read.");
  });
});

describe("reading and writing the identity", () => {
  test("absent until picked; written exactly, other config kept", () => {
    expect(skill_identity(node({}))).toBeNull();
    const written = with_skill(doc(node({})), "skill", { ...identity, description: "not stored" });
    expect(written.nodes[1].config).toStrictEqual({ execution: { inputs: [], outputs: [] }, skill: identity });
  });

  test("refuses to write anywhere but one Skill Read node, or an incomplete identity", () => {
    const two = doc(node({}), node({}));
    expect(with_skill(two, "skill", identity)).toBe(two);
    const one = doc(node({}));
    expect(with_skill(one, "skill", { source: "user-unchain", name: "notes" })).toBe(one);
  });

  test("identities are the same only when all three parts are", () => {
    expect(same_identity(identity, { ...identity })).toBe(true);
    expect(same_identity(identity, { ...identity, source_id: "/elsewhere/SKILL.md" })).toBe(false);
    expect(same_identity(identity, null)).toBe(false);
  });

  test("stored inputs can be removed; nothing else changes", () => {
    const rows = [{ name: "x", value: { kind: "literal", value: 1 }, missing: "error" }];
    const start = doc(node({ skill: identity, execution: { inputs: rows, outputs: [{ name: "content", source: { kind: "result", path: ["content"] } }] } }));
    expect(without_inputs(start, "skill").nodes[1].config).toStrictEqual({
      skill: identity, execution: { inputs: [], outputs: [{ name: "content", source: { kind: "result", path: ["content"] } }] },
    });
  });
});

describe("what the panel says is wrong", () => {
  const codes = (node, rows) => skill_read_problems(node, rows).map((problem) => problem.code);
  const rows = read_skill_inventory(INVENTORY);

  test("an unpicked skill is the first thing to say", () => {
    expect(codes(node({}), rows)).toEqual(["skill_missing"]);
  });

  test("a complete, listed identity has nothing to say", () => {
    expect(codes(node({ skill: identity }), rows)).toEqual([]);
  });

  test("an identity the runtime refuses, one not listed now, inputs, and settings the runtime does not read", () => {
    expect(codes(node({ skill: { source: "user-unchain", name: "notes" } }), rows)).toEqual(["skill_incomplete"]);
    expect(codes(node({ skill: { ...identity, revision: "r" } }), rows)).toEqual(["skill_incomplete"]);
    expect(codes(node({ skill: { ...identity, source_id: "/gone/SKILL.md" } }), rows)).toEqual(["skill_not_listed"]);
    expect(codes(node({ skill: { ...identity, source_id: "/gone/SKILL.md" } }), null)).toEqual([]);
    expect(codes(node({ skill: identity, execution: { inputs: [{ name: "x" }], outputs: [] } }), rows)).toEqual(["inputs_present"]);
    expect(codes(node({ skill: identity, preview: "x" }), rows)).toEqual(["unknown_setting"]);
  });
});

test("sources read as where the skill lives, and an unknown one as itself", () => {
  expect(source_label("user-unchain")).toBe("your skills (~/.unchain)");
  expect(source_label("user-agents")).toBe("your skills (~/.agents)");
  expect(source_label("skillpack")).toBe("skill pack");
  expect(source_label("something-new")).toBe("something-new");
});

/* R-352-02: the real store keeps any JSON shape at skill.source — the draft
   has no diagnostic, only preflight refuses it (steps-352/probe/stored-shapes-01)
   — and the canvas draws the node before the author can repair it. A shape
   that is not a source is never turned into a key or a label of one. */
test("a stored source that is not text reads as unreadable, never as a known source and never by throwing", () => {
  const shapes = [{ toString: null }, ["user-unchain"], [{ toString: null }], 42, true, null, undefined, {}, ""];
  shapes.forEach((shape) => {
    expect(() => source_label(shape)).not.toThrow();
    expect(source_label(shape)).toBe("an unreadable source");
  });
  expect(source_label("__proto__")).toBe("__proto__");
  expect(source_label("toString")).toBe("toString");
});
