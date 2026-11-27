/* The transport validates one response. This layer fences its time and the
 * frozen graph identity against the observation already on this canvas.
 * Equality here is semantic JSON comparison, not Python canonical hashing. */
function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}

const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const rejected = (run, error) => ({ ok: false, run, error });
const IDENTITY = ["owner_chat_id", "execution_id", "generation_id", "root_run_id", "resource_id", "definition_digest", "launch_manifest_digest"];
const GRAPH_IDENTITY = ["attempt_id", "parent_graph_id", "caller_node_id", "call_stack", "definition_digest", "document"];
const GRAPH_RECORD = ["status", "paused", "root_committed", "error", "skipped_edges"];

/* A later Context receipt may resolve a wait before the graph is resumed.
 * It cannot rewrite the durable graph record that still has the same cursor.
 * Keep the exception limited to the producer's derived receipt phases. */
function same_record_nodes(before, after) {
  if (before.length !== after.length) return false;
  const nodes = new Map(after.map((node) => [node.node_id, node]));
  return before.every((old) => {
    const next = nodes.get(old.node_id);
    if (!next) return false;
    if (same(old, next)) return true;
    const { state: oldState, phase: oldPhase, ...oldIdentity } = old;
    const { state: nextState, phase: nextPhase, ...nextIdentity } = next;
    return same(oldIdentity, nextIdentity) && typeof old.interaction_id === "string" &&
      ["waiting", "waiting_approval"].includes(oldState) && nextState === "waiting" &&
      ["awaiting_approval", "awaiting_input", "waiting_for_child"].includes(oldPhase) &&
      ["receipt_recorded", "receipt_recorded_upstream"].includes(nextPhase);
  });
}

export function accept_run_observation(previous, next, scope) {
  if (next === null) return previous === null ? { ok: true, run: null } : rejected(previous, "run_disappeared");
  if (["owner_chat_id", "execution_id", "resource_id", "root_run_id"].some((key) =>
    Object.prototype.hasOwnProperty.call(scope, key) && next[key] !== scope[key])) {
    return rejected(previous, "run_scope_mismatch");
  }
  if (!previous) return { ok: true, run: next };
  if (IDENTITY.some((key) => next[key] !== previous[key])) return rejected(previous, "run_identity_changed");
  if (next.high_watermark < previous.high_watermark) return rejected(previous, "older_observation");
  if (next.high_watermark === previous.high_watermark && !same(next, previous)) return rejected(previous, "observation_conflict");
  const graphs = new Map(next.graphs.map((graph) => [graph.graph_id, graph]));
  for (const before of previous.graphs) {
    const after = graphs.get(before.graph_id);
    if (!after) return rejected(previous, "graph_disappeared");
    if (GRAPH_IDENTITY.some((key) => !same(after[key], before[key]))) return rejected(previous, "frozen_graph_changed");
    if (after.revision < before.revision || after.store_seq < before.store_seq) return rejected(previous, "older_graph");
    if (after.revision === before.revision && (after.event_id !== before.event_id || after.store_seq !== before.store_seq)) {
      return rejected(previous, "graph_revision_conflict");
    }
    if (after.revision === before.revision && (GRAPH_RECORD.some((key) => !same(after[key], before[key])) ||
        !same_record_nodes(before.nodes, after.nodes))) return rejected(previous, "graph_record_conflict");
  }
  return { ok: true, run: next };
}

export function observation_finished(run) {
  if (!run || run.graphs.length === 0) return false;
  const terminal = new Set(["completed", "failed", "cancelled", "outcome_unknown"]);
  const root = run.graphs[0];
  return terminal.has(root.status) && (root.status !== "completed" || root.root_committed) &&
    run.graphs.every((graph) => terminal.has(graph.status));
}
