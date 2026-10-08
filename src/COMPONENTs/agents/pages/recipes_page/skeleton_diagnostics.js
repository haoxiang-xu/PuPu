/* Pointing a problem at the place that caused it.
 *
 * `POST /skeleton_resources/diagnose` is the draft check, and since the
 * runtime's CP17 repair it answers about both the graph and each node's IO, so
 * one reply can carry all three depths at once — verified on 2026-10-07
 * against the real SQLite store:
 *
 *   end_count             ["document","nodes"]
 *   flow_output_required  ["document","nodes",1]
 *   unknown_field         ["document","nodes",1,"config","execution","inputs",0,"default"]
 *
 * It reports a binding problem even on an Agent whose Kernel is not configured
 * yet, which preflight cannot do — preflight rejects the unfinished Kernel
 * first. Preflight remains the strict Run/Publish gate and produces the same
 * path shapes; the builder's own mirror stays an immediate authoring aid
 * rather than the only source.
 *
 * (Before that repair the draft check was graph structure only and returned
 * `[]` for every binding problem. Anything still saying so is out of date.)
 *
 * A path this build cannot place is kept and shown with the rest rather than
 * dropped — an unreadable problem is still a problem, and swallowing it would
 * read as "nothing is wrong". */

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

/* ── Routing, as a partition ─────────────────────────────────────────────
 *
 * Filtering lost things. A problem is shown by whichever predicate matches it,
 * and a problem no predicate matched — a graph-level path with no node in it,
 * an edge, a shape this build does not know, a row index past the rows that
 * actually exist — was shown by none of them and simply disappeared. A panel
 * with nothing on it then reads as a draft with nothing wrong, which is the
 * worst possible way to be wrong about this.
 *
 * So the routing is a partition: every diagnostic lands in exactly one bucket,
 * and the buckets together are the whole input. A row only claims one when
 * that row is actually rendered; everything else falls back to the node, and
 * everything with no node of its own falls back to the graph. */

function in_range(count, row) {
  return typeof row === "number" && row >= 0 && row < count;
}

export function route_diagnostics(diagnostics, document, options) {
  const node_id = (options && options.node_id) || null;
  const counts = (options && options.row_counts) || {};
  const inputs = Math.max(0, counts.inputs || 0);
  const outputs = Math.max(0, counts.outputs || 0);

  const rows = {
    inputs: Array.from({ length: inputs }, () => []),
    outputs: Array.from({ length: outputs }, () => []),
  };
  const node = [];
  const elsewhere = [];

  normalize_diagnostics(diagnostics).forEach((item) => {
    const target = diagnostic_target(item, document);
    if (target.node_id !== node_id || !node_id) {
      elsewhere.push(item);
      return;
    }
    const bucket = target.section && rows[target.section];
    if (bucket && in_range(bucket.length, target.row)) {
      bucket[target.row].push(item);
      return;
    }
    /* It belongs to this node but to no row that exists — a section this build
       does not render, or an index past the rows there are. */
    node.push(item);
  });

  return { rows, node, elsewhere, row_counts: { inputs, outputs } };
}

/* Where a diagnostic belongs, in words, so the fallback can say it rather than
 * printing a path at the author. */
export function diagnostic_location_label(diagnostic, document) {
  const path = (diagnostic && diagnostic.path) || [];
  const nodes = (document && document.nodes) || [];
  const edges = (document && document.edges) || [];
  if (path[0] === "document" && path[1] === "nodes" && typeof path[2] === "number") {
    const node = nodes[path[2]];
    return node && node.id ? `Node ${node.id}` : `Node ${path[2]}`;
  }
  if (path[0] === "document" && path[1] === "edges" && typeof path[2] === "number") {
    const edge = edges[path[2]];
    return edge && edge.id ? `Edge ${edge.id}` : `Edge ${path[2]}`;
  }
  return "This graph";
}
