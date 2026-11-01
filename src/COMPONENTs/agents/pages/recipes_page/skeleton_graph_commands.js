import { add_node, connect_nodes, delete_edge, delete_node } from "./skeleton_graph_edits";

/* The canvas reports intent, never a replacement drawing array. Each command
 * is atomic against the latest graph; a refusal returns the original object,
 * including when a temporary deletion was needed to validate a reconnect. */
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.length > 0;
const own = (v, key) => Object.prototype.hasOwnProperty.call(v, key);
const accept = (document) => ({ ok: true, document, problem: null });
const refuse = (document, message, code = "invalid_command") => ({ ok: false, document, problem: { code, message } });
const shape = (v, keys) => record(v) && Object.keys(v).length === keys.length && keys.every((key) => own(v, key));
const ENDPOINTS = ["source_node_id", "source_port_id", "target_node_id", "target_port_id"];
const ATTACH = new Set(["attach_top", "attach_bot"]);

function normalized(connection) {
  if (!shape(connection, ENDPOINTS) || !ENDPOINTS.every((key) => text(connection[key]))) return null;
  const { source_node_id: from, source_port_id: out, target_node_id: to, target_port_id: into } = connection;
  if (ATTACH.has(out) && ATTACH.has(into)) return { ...connection, kind: "attach" };
  if (ATTACH.has(out) || ATTACH.has(into)) return null;
  /* Every flow edge arrives at `in`; what it leaves through depends on the
     node (`out`, `true`/`false`, a case id, `default`), and whether that
     outlet exists is the core's question, not this adapter's. */
  if (into === "in" && out !== "in") return { ...connection, kind: "flow" };
  if (out === "in" && into !== "in") return {
    kind: "flow", source_node_id: to, source_port_id: into, target_node_id: from, target_port_id: out,
  };
  return null;
}

function remove(graph, nodeIds, edgeIds) {
  let next = graph;
  for (const id of new Set(edgeIds)) {
    const result = delete_edge(next, id);
    if (!result.ok) return { ...result, document: graph };
    next = result.document;
  }
  for (const id of new Set(nodeIds)) {
    const result = delete_node(next, id);
    if (!result.ok) return { ...result, document: graph };
    next = result.document;
  }
  return accept(next);
}

export function apply_graph_command(graph, command) {
  if (!record(command) || !record(graph) || graph.schema_version !== 1 || (graph.kind !== "agent" && graph.kind !== "workflow") ||
      !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return refuse(graph, "This graph cannot be edited here.");
  }
  if (command.type === "add_node" && shape(command, ["type", "node_type"])) {
    return add_node(graph, { type: command.node_type });
  }
  if (command.type === "delete" && shape(command, ["type", "node_ids", "edge_ids"]) &&
      Array.isArray(command.node_ids) && Array.isArray(command.edge_ids) &&
      command.node_ids.every(text) && command.edge_ids.every(text)) {
    return remove(graph, command.node_ids, command.edge_ids);
  }
  if (command.type === "disconnect" && shape(command, ["type", "node_id"]) && text(command.node_id)) {
    if (graph.nodes.filter((node) => record(node) && node.id === command.node_id).length !== 1) {
      return refuse(graph, "The selected node is missing or its id is shared by another node.");
    }
    const edges = graph.edges.filter((edge) => record(edge) &&
      (edge.source_node_id === command.node_id || edge.target_node_id === command.node_id));
    if (!edges.every((edge) => text(edge.id))) return refuse(graph, "A connection has no usable id.");
    return remove(graph, [], edges.map((edge) => edge.id));
  }
  if (command.type === "connect" && shape(command, ["type", "connection"])) {
    const next = normalized(command.connection);
    return next ? connect_nodes(graph, next) : refuse(graph, "Connect an outlet to an inlet, or two attachment ports.");
  }
  if (command.type === "reconnect" && shape(command, ["type", "edge_id", "connection"]) && text(command.edge_id)) {
    const next = normalized(command.connection);
    if (!next) return refuse(graph, "Connection unchanged. Drop its end on a compatible port.");
    const removed = delete_edge(graph, command.edge_id);
    if (!removed.ok) return removed;
    const connected = connect_nodes(removed.document, { ...next, id: command.edge_id });
    if (!connected.ok) return { ...connected, document: graph };
    const replacement = connected.document.edges.find((edge) => edge.id === command.edge_id);
    return accept({ ...graph, edges: graph.edges.map((edge) => edge.id === command.edge_id ? { ...edge, ...replacement } : edge) });
  }
  return refuse(graph, "This edit is not supported.");
}
