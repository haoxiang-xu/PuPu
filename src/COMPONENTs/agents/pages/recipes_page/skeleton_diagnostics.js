/* Pointing a problem at the row that caused it.
 *
 * Two different checks answer with this shape, and they are not the same check:
 *
 *   - `POST /skeleton_resources/diagnose` is the DRAFT check, and it is about
 *     graph structure only — one start, one end, an agent graph has an agent,
 *     attach ports and endpoints, a flow output where one is required. Its
 *     paths stop at `["document","nodes",2]` or `["document","edges",1,"kind"]`
 *     and never enter a node's config. A draft with a malformed binding passes
 *     it.
 *   - `POST /skeleton_resources/<id>/preflight` is the Run/Publish check, and
 *     that one does read the bindings, through `_validate_all`. Its paths reach
 *     `["document","nodes",2,"config","execution","inputs",0,"value"]`.
 *
 * So a row-level problem arrives from preflight, never from the draft check,
 * and the builder's own mirror is what catches a malformed binding in between.
 * A path this build cannot place is kept and shown at the node level rather
 * than dropped — an unreadable problem is still a problem, and swallowing it
 * would read as "nothing is wrong". */

import {
  BINDINGS_CONFIG_KEY,
  EXECUTION_CONFIG_KEY,
  OUTPUT_MAPPINGS_CONFIG_KEY,
} from "./skeleton_document";

const SECTION_BY_KEY = {
  [BINDINGS_CONFIG_KEY]: "inputs",
  [OUTPUT_MAPPINGS_CONFIG_KEY]: "outputs",
};

export function normalize_diagnostic(entry) {
  if (!entry || typeof entry !== "object") return null;
  const path = Array.isArray(entry.path) ? entry.path : [];
  return {
    code: typeof entry.code === "string" ? entry.code : "unknown",
    message: typeof entry.message === "string" ? entry.message : "",
    path,
  };
}

export function normalize_diagnostics(list) {
  return (Array.isArray(list) ? list : []).map(normalize_diagnostic).filter(Boolean);
}

/* The node a diagnostic lands on, resolved through the document because the
 * path carries a position and the panel works in node ids. */
export function diagnostic_target(diagnostic, document) {
  const path = (diagnostic && diagnostic.path) || [];
  const target = { node_id: null, section: null, row: null, field: null };
  if (path[0] !== "document" || path[1] !== "nodes") return target;

  const nodes = (document && document.nodes) || [];
  const node = nodes[path[2]];
  if (!node || typeof node.id !== "string") return target;
  target.node_id = node.id;

  if (path[3] !== "config" || path[4] !== EXECUTION_CONFIG_KEY) return target;
  const section = SECTION_BY_KEY[path[5]];
  if (!section) return target;
  target.section = section;

  if (typeof path[6] === "number") target.row = path[6];
  if (typeof path[7] === "string") target.field = path[7];
  return target;
}

export function diagnostics_for_node(diagnostics, document, node_id) {
  return normalize_diagnostics(diagnostics).filter(
    (item) => diagnostic_target(item, document).node_id === node_id,
  );
}

export function diagnostics_for_row(diagnostics, document, node_id, section, row) {
  return normalize_diagnostics(diagnostics).filter((item) => {
    const target = diagnostic_target(item, document);
    return (
      target.node_id === node_id && target.section === section && target.row === row
    );
  });
}

/* Everything that could not be placed on a row: a document-level problem, a
 * node-level one, or a path shape this build does not know. Shown at the top of
 * the panel so nothing is silently invisible. */
export function unplaced_diagnostics(diagnostics, document) {
  return normalize_diagnostics(diagnostics).filter((item) => {
    const target = diagnostic_target(item, document);
    return target.row === null;
  });
}

export function has_diagnostics(diagnostics) {
  return normalize_diagnostics(diagnostics).length > 0;
}
