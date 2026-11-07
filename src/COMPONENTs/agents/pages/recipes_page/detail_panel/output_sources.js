import { normalize_node_type } from "../recipe_graph";

/* What a node is allowed to export.
 *
 * An output row used to be a free text box beside a type dropdown, so an author
 * could name a Start output `answer` and get an empty value forever — the
 * runtime only ever fills the entry fields it knows. Outputs are picked from
 * this list instead, and the type comes with the source rather than being
 * chosen separately.
 *
 * Only the sources that exist today are listed. An Agent node's `message` and
 * `context`, and any JSON-schema fields, arrive with #356 — until the runtime
 * can produce them, offering them here would be the same empty-value trap. */

const CHAT_ENTRY_SOURCES = [
  { name: "text", type: "string", description: "The message the user sent" },
  { name: "images", type: "image[]", description: "Images attached to it" },
  { name: "files", type: "file[]", description: "Files attached to it" },
];

const SOURCES_BY_TYPE = {
  start: CHAT_ENTRY_SOURCES,
};

export function output_sources_for(node) {
  if (!node) return [];
  return SOURCES_BY_TYPE[normalize_node_type(node.type)] || [];
}

export function has_fixed_output_sources(node) {
  return output_sources_for(node).length > 0;
}

/* Sources not already exported, so the picker never offers a duplicate. */
export function unused_output_sources(node) {
  const taken = new Set(
    (node?.outputs || []).map((o) => o && o.name).filter(Boolean),
  );
  return output_sources_for(node).filter((s) => !taken.has(s.name));
}

export function output_source(node, name) {
  return output_sources_for(node).find((s) => s.name === name) || null;
}

/* An output row is valid when it names a source this node actually has. Used
 * to mark a row loaded from an older definition that named something else. */
export function is_valid_output_row(node, row) {
  return Boolean(row && output_source(node, row.name));
}
