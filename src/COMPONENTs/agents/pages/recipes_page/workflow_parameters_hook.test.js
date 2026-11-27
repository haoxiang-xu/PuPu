import { seed_hook_workflow } from "./detail_panel/hook_workflow_source";
import { new_workflow_document } from "./skeleton_graph_edits";
import { start_context_for_view } from "./start_context";

test.each(["before_tool_call", "after_tool_call"])("a new %s Hook keeps its system-owned input contract", (event) => {
  const entry = { id: "guard", event };
  const seed = seed_hook_workflow(entry, "parent");
  expect(seed.kind).toBe("workflow");
  expect(Object.prototype.hasOwnProperty.call(seed, "input_schema")).toBe(false);
  expect(seed.nodes.map((node) => node.type)).toEqual(["start", "end"]);
  if (process.env.WP_HOOK_CAPTURE) {
    require("fs").writeFileSync(`${process.env.WP_HOOK_CAPTURE}/${event}.json`, JSON.stringify(seed, null, 2) + "\n");
  }
});

test("standalone Workflow parameters stay closed and Hook context is only a view property", () => {
  const made = new_workflow_document({ id: "function", name: "Function" }).document;
  const before = JSON.stringify(made);
  expect(made.input_schema).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
  expect(start_context_for_view([{ member: "hooks" }], [], made).caller).toBe("hook");
  expect(start_context_for_view([], [], made).caller).toBeUndefined();
  expect(start_context_for_view([{ member: "unknown" }], [], made).caller).toBeUndefined();
  expect(JSON.stringify(made)).toBe(before);
});
