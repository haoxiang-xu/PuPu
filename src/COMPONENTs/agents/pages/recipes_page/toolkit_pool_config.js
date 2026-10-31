import { python_strip } from "./kernel_config";

const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
const exact = (v) => typeof v === "string" && v.length > 0 && python_strip(v) === v;
const shape = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every((key) => own(v, key));

/* Presence, not truthiness: the host reads legacy_fields when present even
   if it is malformed. A drawing must not fall back to shadow native fields. */
export function node_toolkit_refs(node) {
  const config = node?.config;
  if (!record(config)) return undefined;
  if (own(config, "legacy_fields")) return record(config.legacy_fields) ? config.legacy_fields.toolkits : undefined;
  return config.toolkits;
}

/* Directory metadata is extensible; identities and the list we consume are
   not guessed. A malformed reply never becomes an apparently empty library. */
export function read_toolkit_catalog(payload) {
  const refuse = () => { throw new Error("The tool library reply could not be read."); };
  if (!record(payload) || !Array.isArray(payload.toolkits)) return refuse();
  const ids = new Set();
  payload.toolkits.forEach((row) => {
    if (!record(row) || !exact(row.toolkitId) || ids.has(row.toolkitId) || !Array.isArray(row.tools)) return refuse();
    ids.add(row.toolkitId);
    for (const key of ["toolkitName", "toolkitDescription", "source"]) {
      if (own(row, key) && typeof row[key] !== "string") return refuse();
    }
    if (own(row, "hidden") && typeof row.hidden !== "boolean") return refuse();
    const names = new Set();
    row.tools.forEach((tool) => {
      if (!record(tool) || !exact(tool.name) || names.has(tool.name)) return refuse();
      names.add(tool.name);
      for (const key of ["title", "description"]) {
        if (own(tool, key) && typeof tool[key] !== "string") return refuse();
      }
    });
  });
  return payload.toolkits;
}

/* Structural feedback only. Host-owned alias/availability/workspace/model
   resolution and collisions between attached pools are checked when run. */
export function toolkit_pool_problems(config) {
  if (!record(config)) return ["Toolkit Pool configuration must be an object."];
  const problems = [];
  if (!shape(config, ["toolkits", "merge_with_user_selected"])) problems.push("Toolkit Pool needs only toolkits and merge_with_user_selected.");
  if (typeof config.merge_with_user_selected !== "boolean") problems.push("Include chat-selected toolkits must be on or off.");
  if (!Array.isArray(config.toolkits)) return [...problems, "The stored toolkit list must be a list."];
  const ids = new Set();
  config.toolkits.forEach((entry, index) => {
    const prefix = `Toolkit ${index + 1}: `;
    if (!record(entry)) { problems.push(prefix + "the entry must be an object."); return; }
    if (!shape(entry, ["id", "enabled_tools"])) problems.push(prefix + "needs only id and enabled_tools.");
    if (!exact(entry.id)) problems.push(prefix + "id must be an exact non-empty string.");
    else if (ids.has(entry.id)) problems.push(prefix + "the toolkit is included more than once.");
    else ids.add(entry.id);
    if (entry.enabled_tools === null) return;
    if (!Array.isArray(entry.enabled_tools)) { problems.push(prefix + "choose all tools or a list of tool names."); return; }
    const names = new Set();
    entry.enabled_tools.forEach((name) => {
      if (!exact(name)) problems.push(prefix + "tool names must be exact non-empty strings.");
      else if (names.has(name)) problems.push(prefix + "a tool name is included more than once.");
      else names.add(name);
    });
  });
  return problems;
}

export function with_toolkit_config(document, nodeId, config) {
  if (!record(document) || document.kind !== "agent" || document.schema_version !== 1 || !Array.isArray(document.nodes) || !record(config)) return document;
  const found = document.nodes.filter((node) => record(node) && node.id === nodeId);
  if (found.length !== 1 || found[0].type !== "toolkit_pool" || !record(found[0].config) || own(found[0].config, "legacy_fields") || found[0].config === config) return document;
  return { ...document, nodes: document.nodes.map((node) => node === found[0] ? { ...node, config } : node) };
}
