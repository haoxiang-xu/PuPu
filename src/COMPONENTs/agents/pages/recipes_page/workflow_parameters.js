/* Workflow function signatures. This is an editor mirror; Core owns admission. */
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
// Python str.strip(), as used by the producer; FEFF is a real name, 0085 is not.
const SPACE = new Set([9, 10, 11, 12, 13, 28, 29, 30, 31, 32, 133, 160, 5760,
  8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288]);
const named = (value) => typeof value === "string" && Array.from(value).some((char) => !SPACE.has(char.codePointAt(0)));
export const PARAMETER_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
export const empty_workflow_signature = () => ({ type: "object", properties: {}, required: [], additionalProperties: false });

export function parameter_type_matches(value, type) {
  if (type === undefined) return true;
  switch (type) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && Number.isFinite(value);
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "object": return record(value);
    case "array": return Array.isArray(value);
    case "null": return value === null;
    default: return false;
  }
}

export function workflow_signature_problems(schema) {
  const errors = [];
  const error = (code, path) => errors.push({ code, path: ["input_schema", ...path] });
  if (!record(schema)) return [{ code: "invalid_type", path: ["input_schema"] }];
  for (const key of Object.keys(schema)) {
    if (!["type", "properties", "required", "additionalProperties", "description"].includes(key)) error("unknown_field", [key]);
  }
  for (const key of ["type", "properties", "required", "additionalProperties"]) {
    if (!own(schema, key)) error("missing_field", [key]);
  }
  if (schema.type !== "object") error("invalid_value", ["type"]);
  if (schema.additionalProperties !== false) error("invalid_value", ["additionalProperties"]);
  if (own(schema, "description") && typeof schema.description !== "string") error("invalid_type", ["description"]);
  if (!record(schema.properties) || !Array.isArray(schema.required)) {
    if (!record(schema.properties)) error("invalid_type", ["properties"]);
    if (!Array.isArray(schema.required)) error("invalid_type", ["required"]);
    return errors;
  }
  const seen = new Set();
  schema.required.forEach((name, index) => {
    if (typeof name !== "string") error("invalid_type", ["required", index]);
    else if (seen.has(name)) error("duplicate_name", ["required", index]);
    else if (!own(schema.properties, name)) error("missing_value", ["required", index]);
    seen.add(name);
  });
  Object.entries(schema.properties).forEach(([name, field]) => {
    const at = ["properties", name];
    if (!named(name)) error("invalid_value", at);
    if (!record(field)) { error("invalid_type", at); return; }
    Object.keys(field).filter((key) => !["type", "description", "default"].includes(key)).forEach((key) => error("unknown_field", [...at, key]));
    if (own(field, "type") && !PARAMETER_TYPES.includes(field.type)) error("invalid_type", [...at, "type"]);
    if (own(field, "description") && typeof field.description !== "string") error("invalid_type", [...at, "description"]);
    if (seen.has(name) && own(field, "default")) error("invalid_value", [...at, "default"]);
    if (!seen.has(name) && !own(field, "default")) error("missing_field", [...at, "default"]);
    if (own(field, "default") && !parameter_type_matches(field.default, field.type)) error("invalid_type", [...at, "default"]);
  });
  return errors;
}

export function workflow_parameters(document) {
  if (own(document, "input_schema")) {
    const schema = document.input_schema;
    if (!record(schema) || !record(schema.properties) || !Array.isArray(schema.required)) return null;
    return Object.entries(schema.properties).map(([name, field]) => ({ name, field, required: schema.required.includes(name) }));
  }
  /* Read-only inference for an old draft. Merely opening it never upgrades it. */
  const start = document?.nodes?.find((node) => node?.type === "start");
  const names = new Set();
  for (const output of start?.config?.execution?.outputs || []) {
    if (output?.source?.kind === "result" && Array.isArray(output.source.path) && typeof output.source.path[0] === "string") names.add(output.source.path[0]);
  }
  return [...names].map((name) => ({ name, field: {}, required: true }));
}

function rename_ref(value, startId, oldName, name) {
  if (!record(value)) return value;
  if (value.kind === "ref" && value.node_id === startId && Array.isArray(value.path) && value.path[0] === oldName) {
    return { ...value, path: [name, ...value.path.slice(1)] };
  }
  if (value.kind === "first_present" && Array.isArray(value.values)) return { ...value, values: value.values.map((item) => rename_ref(item, startId, oldName, name)) };
  return value;
}

export function with_workflow_parameters(document, rows, rename) {
  if (document?.kind !== "workflow" || !Array.isArray(rows) || !Array.isArray(document.nodes)) return document;
  const starts = document.nodes.filter((node) => node?.type === "start");
  if (starts.length !== 1 || !rows.every((row) => named(row.name) && record(row.field)) || new Set(rows.map((row) => row.name)).size !== rows.length) return document;
  const start = starts[0];
  const previous = workflow_parameters(document);
  if (!previous) return document;
  const names = rows.map((row) => row.name);
  const removed = previous.map((row) => row.name).filter((name) => !names.includes(name));
  const renamed = new Set();
  const outputs = (start.config?.execution?.outputs || []).flatMap((output) => {
    const source = output?.source;
    if (source?.kind !== "result" || !Array.isArray(source.path) || source.path.length === 0) return [output];
    const key = source.path[0];
    if (rename && key === rename.from) {
      const name = output.name === rename.from ? rename.to : output.name;
      if (name !== output.name) renamed.add(output.name);
      return [{ ...output, name, source: { ...source, path: [rename.to, ...source.path.slice(1)] } }];
    }
    return removed.includes(key) ? [] : [output];
  });
  for (const name of names) {
    const matching = outputs.filter((output) => output?.name === name);
    if (matching.length && (matching.length !== 1 || matching[0].source?.kind !== "result"
      || matching[0].source.path?.length !== 1 || matching[0].source.path[0] !== name)) return document;
    if (!matching.length) outputs.push({ name, source: { kind: "result", path: [name] } });
  }
  if (new Set(outputs.map((output) => output?.name)).size !== outputs.length) return document;
  const input_schema = { ...empty_workflow_signature(),
    ...(typeof document.input_schema?.description === "string" ? { description: document.input_schema.description } : {}),
    properties: Object.fromEntries(rows.map((row) => [row.name, row.field])), required: rows.filter((row) => row.required).map((row) => row.name) };
  return { ...document, input_schema, nodes: document.nodes.map((node) => {
    if (node === start) return { ...node, config: { ...node.config, execution: { ...node.config.execution, outputs } } };
    const inputs = node.config?.execution?.inputs;
    if (!rename || !renamed.size || !Array.isArray(inputs)) return node;
    return { ...node, config: { ...node.config, execution: { ...node.config.execution, inputs: inputs.map((binding) => (
      record(binding) ? { ...binding, value: rename_ref(binding.value, start.id, rename.from, rename.to) } : binding
    )) } } };
  }) };
}
