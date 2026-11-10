import { result_roots_for } from "./skeleton_result_roots";

const t = (key) => `TRANSLATED:${key}`;
test.each([
  { type: "agent", config: { kernel: { json_schema: { type: "object", properties: { "agents.raw {x}": {} } } } } },
  { type: "code", config: {} },
  { type: "workflow_call", config: {} },
  { type: "start", config: {} },
])("output inventory forwards only presentation for $type", (node) => {
  const before = JSON.stringify(node);
  const english = result_roots_for(node);
  const translated = result_roots_for(node, t);
  expect({ ...translated, reason: english.reason }).toEqual(english);
  expect(translated.reason).toMatch(/^TRANSLATED:/);
  expect(JSON.stringify(node)).toBe(before);
});
test("closed and unknown result inventories never acquire translated roots or fabricated reasons", () => {
  for (const type of ["tool_call", "skill_read", "constructor", "__proto__", "agents.raw {x}"]) {
    const node = { type };
    expect(result_roots_for(node, t)).toEqual(result_roots_for(node));
  }
});
