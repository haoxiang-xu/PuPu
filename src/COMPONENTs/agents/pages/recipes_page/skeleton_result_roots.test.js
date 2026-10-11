import { result_roots_for } from "./skeleton_result_roots";
import { CAPTURED_RESULT_ROOTS } from "./skeleton_result_roots_capture";

const node = (type, kernel) => ({
  id: "n",
  type,
  config: kernel ? { execution: {}, kernel } : { execution: {} },
});

describe("the inventory is the runtime's, not a guess", () => {
  test("an Agent's roots are the keys the runtime admits", () => {
    expect(result_roots_for(node("agent")).roots.slice().sort()).toEqual(
      CAPTURED_RESULT_ROOTS.admitted_sets.agent,
    );
  });

  test("a Tool Call's roots are the keys it returns", () => {
    expect(result_roots_for(node("tool_call")).roots.slice().sort()).toEqual(
      CAPTURED_RESULT_ROOTS.admitted_sets.tool_call,
    );
  });

  test("a Skill Read's roots are what is published, not what is produced", () => {
    /* The raw result carries `_skeleton_skill`; publication strips it. */
    expect(result_roots_for(node("skill_read")).roots.slice().sort()).toEqual(
      CAPTURED_RESULT_ROOTS.admitted_sets.skill_read_public,
    );
    expect(CAPTURED_RESULT_ROOTS.admitted_sets.skill_read_raw).toContain(
      "_skeleton_skill",
    );
    expect(result_roots_for(node("skill_read")).roots).not.toContain(
      "_skeleton_skill",
    );
  });

  test("every root the inventory offers really exports a value", () => {
    const exported = new Set(
      CAPTURED_RESULT_ROOTS.map_controls
        .filter((control) => control.exported && control.path.length === 1)
        .map((control) => control.path[0]),
    );
    ["agent", "tool_call", "skill_read"].forEach((type) => {
      result_roots_for(node(type)).roots.forEach((root) => {
        expect(exported.has(root)).toBe(true);
      });
    });
  });

  test("every root the runtime refused is absent from the inventory", () => {
    const refused = CAPTURED_RESULT_ROOTS.map_controls.filter(
      (control) => !control.exported && typeof control.path[0] === "string",
    );
    expect(refused.length).toBeGreaterThan(0);
    const offered = new Set(
      ["agent", "tool_call", "skill_read"].flatMap(
        (type) => result_roots_for(node(type)).roots,
      ),
    );
    refused.forEach((control) => {
      expect(offered.has(control.path[0])).toBe(false);
    });
  });
});

describe("what is genuinely not knowable, and why", () => {
  test.each([
    ["code", /its own source returns/i],
    ["workflow_call", /its own document/i],
    ["start", /called from different places/i],
  ])("%s gives a reason rather than a shrug", (type, pattern) => {
    const roots = result_roots_for(node(type));
    expect(roots.known).toBe(false);
    expect(roots.roots).toEqual([]);
    expect(roots.reason).toMatch(pattern);
  });

  test("an unknown node type is treated as unknowable, not as empty", () => {
    const roots = result_roots_for(node("something_new"));
    expect(roots.known).toBe(false);
  });

  test("a missing node does not throw", () => {
    expect(() => result_roots_for(null)).not.toThrow();
    expect(result_roots_for(null).known).toBe(false);
  });
});

describe("a loaded output schema adds its fields", () => {
  const schema = (properties) => ({ json_schema: { type: "object", properties } });

  test("the schema's properties join the two built-ins", () => {
    expect(
      result_roots_for(node("agent", schema({ score: {}, label: {} }))).roots,
    ).toEqual(["message", "context", "score", "label"]);
  });

  test("a schema is only read for an Agent", () => {
    expect(result_roots_for(node("tool_call", schema({ score: {} }))).roots).toEqual([
      "result",
      "ok",
      "error",
    ]);
  });

  test.each([
    ["no schema", { json_schema: null }],
    ["a schema with no properties", { json_schema: { type: "object" } }],
    ["properties that are not an object", { json_schema: { properties: "nope" } }],
    ["a schema that is not an object", { json_schema: "nope" }],
  ])("%s leaves the built-ins alone", (_label, kernel) => {
    expect(result_roots_for(node("agent", kernel)).roots).toEqual([
      "message",
      "context",
    ]);
  });

  test("a schema cannot shadow a built-in twice over", () => {
    /* `validate_output_schema` keeps these reserved at the effective root, so
       this should not arrive — if it does, the root is still offered once. */
    expect(
      result_roots_for(node("agent", schema({ message: {} }))).roots,
    ).toEqual(["message", "context"]);
  });
});
