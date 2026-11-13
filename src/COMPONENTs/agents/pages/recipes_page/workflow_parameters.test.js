import { callee_interface } from "./workflow_call_config";
import { new_workflow_document } from "./skeleton_graph_edits";
import { with_workflow_parameters, workflow_parameters, workflow_signature_problems } from "./workflow_parameters";

const signature = () => ({ type: "object", properties: { city: { type: "string", description: "Destination" }, days: { type: "integer", default: 1 } }, required: ["city"], additionalProperties: false });
const workflow = () => ({ schema_version: 1, kind: "workflow", id: "weather", name: "Weather", input_schema: signature(), nodes: [
  { id: "start", type: "start", config: { execution: { outputs: [{ name: "all", source: { kind: "result", path: [] } }] } } },
  { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
], edges: [] });

test("the caller uses the declared signature even when Start reads the entire object", () => {
  expect(callee_interface(workflow())).toEqual({ readable: true, declared: true, whole: false, outputs: [], inputs: [
    { key: "city", read_as: [], type: "string", required: true, description: "Destination" },
    { key: "days", read_as: [], type: "integer", required: false, default: 1 },
  ] });
});

test("a new Workflow starts with an empty declared signature", () => {
  const created = new_workflow_document({ id: "wf-parameters", name: "Parameters" });
  expect(created.ok).toBe(true);
  expect(created.document.input_schema).toEqual({ type: "object", properties: {}, required: [], additionalProperties: false });
});

test("an invalid declared signature is not replaced by inferred caller input", () => {
  const document = workflow(); document.input_schema = { type: "array" };
  expect(callee_interface(document).readable).toBe(false);
});

test("legacy pinned versions keep their existing inferred interface", () => {
  const document = workflow(); delete document.input_schema;
  expect(callee_interface(document)).toEqual({ readable: true, whole: true, outputs: [], inputs: [] });
});

test("rename updates the Start export and nested references without touching other graph data", () => {
  const doc = workflow();
  doc.nodes[0].config.execution.outputs.push({ name: "city", source: { kind: "result", path: ["city"] } });
  doc.nodes[1].config.execution.inputs.push({ name: "value", missing: "error", value: { kind: "first_present", values: [
    { kind: "ref", node_id: "start", path: ["city"] }, { kind: "literal", value: "fallback" },
  ] } });
  const before = JSON.stringify(doc);
  const rows = workflow_parameters(doc); rows[0] = { ...rows[0], name: "destination" };
  const next = with_workflow_parameters(doc, rows, { from: "city", to: "destination" });
  expect(next.input_schema.required).toEqual(["destination"]);
  expect(next.nodes[0].config.execution.outputs).toContainEqual({ name: "destination", source: { kind: "result", path: ["destination"] } });
  expect(next.nodes[1].config.execution.inputs[0].value.values[0].path).toEqual(["destination"]);
  expect(next.edges).toBe(doc.edges); expect(JSON.stringify(doc)).toBe(before);
});

test("an existing output alias cannot silently become a different parameter", () => {
  const doc = workflow(); doc.nodes[0].config.execution.outputs.push({ name: "city", source: { kind: "result", path: ["days"] } });
  expect(with_workflow_parameters(doc, workflow_parameters(doc))).toBe(doc);
});

test("duplicate and blank renames leave the exact draft intact", () => {
  const doc = workflow(); const rows = workflow_parameters(doc);
  expect(with_workflow_parameters(doc, [{ ...rows[0], name: "days" }, rows[1]], { from: "city", to: "days" })).toBe(doc);
  expect(with_workflow_parameters(doc, [{ ...rows[0], name: "" }, rows[1]])).toBe(doc);
});

test("deletion retains whole-object reads and unrelated aliases", () => {
  const doc = workflow(); doc.nodes[0].config.execution.outputs.push({ name: "alias", source: { kind: "result", path: ["days"] } });
  const next = with_workflow_parameters(doc, workflow_parameters(doc).slice(1));
  expect(next.nodes[0].config.execution.outputs).toContainEqual(doc.nodes[0].config.execution.outputs[0]);
  expect(next.nodes[0].config.execution.outputs).toContainEqual(doc.nodes[0].config.execution.outputs[1]);
  expect(Object.keys(next.input_schema.properties)).toEqual(["days"]);
});

test.each([
  [(s) => { s.extra = true; }, "unknown_field"],
  [(s) => { s.properties.days.default = "one"; }, "invalid_type"],
  [(s) => { s.properties.city.$ref = "https://invalid.example"; }, "unknown_field"],
  [(s) => { s.required.push("city"); }, "duplicate_name"],
])("the editor refuses the same malformed signatures as Core", (mutate, code) => {
  const schema = signature(); mutate(schema);
  expect(workflow_signature_problems(schema).some((error) => error.code === code)).toBe(true);
});
