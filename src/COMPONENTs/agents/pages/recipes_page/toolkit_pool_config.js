import { python_strip } from "./kernel_config";
import { agentEnglishText } from "./agents_i18n";

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
export function toolkit_pool_problems(config, t = agentEnglishText) {
  if (!record(config)) return [t("agents.toolkit.config_object")];
  const problems = [];
  const configKeys = own(config, "workflow_tools") ? ["toolkits", "merge_with_user_selected", "workflow_tools"] : ["toolkits", "merge_with_user_selected"];
  if (!shape(config, configKeys)) problems.push(t("agents.toolkit.config_shape"));
  if (typeof config.merge_with_user_selected !== "boolean") problems.push(t("agents.toolkit.merge_boolean"));
  if (!Array.isArray(config.toolkits)) return [...problems, t("agents.toolkit.list_required")];
  const ids = new Set();
  config.toolkits.forEach((entry, index) => {
    if (!record(entry)) { problems.push(t("agents.toolkit.entry_object", { index: index + 1 })); return; }
    if (!shape(entry, ["id", "enabled_tools"])) problems.push(t("agents.toolkit.entry_shape", { index: index + 1 }));
    if (!exact(entry.id)) problems.push(t("agents.toolkit.entry_id", { index: index + 1 }));
    else if (ids.has(entry.id)) problems.push(t("agents.toolkit.entry_duplicate", { index: index + 1 }));
    else ids.add(entry.id);
    if (entry.enabled_tools === null) return;
    if (!Array.isArray(entry.enabled_tools)) { problems.push(t("agents.toolkit.entry_selection", { index: index + 1 })); return; }
    const names = new Set();
    entry.enabled_tools.forEach((name) => {
      if (!exact(name)) problems.push(t("agents.toolkit.entry_tool_name", { index: index + 1 }));
      else if (names.has(name)) problems.push(t("agents.toolkit.entry_tool_duplicate", { index: index + 1 }));
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
