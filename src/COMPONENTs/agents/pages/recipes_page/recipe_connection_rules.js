/* Returns true if the connection is valid, otherwise a string rejection reason. */

import { is_toolkit_pool_type } from "./recipe_graph";

function port_kind(node, port_id) {
  const p = (node.ports || []).find((x) => x.id === port_id);
  return p ? p.kind : null;
}

function is_port_occupied(edges, node_id, port_id, exclude_edge_id) {
  return edges.some(
    (e) =>
      e.id !== exclude_edge_id &&
      ((e.source_node_id === node_id && e.source_port_id === port_id) ||
        (e.target_node_id === node_id && e.target_port_id === port_id)),
  );
}

export function validate_recipe_connection(source, target, ctx) {
  const { edges = [], exclude_edge_id = null } = ctx || {};

  if (source.node.id === target.node.id) return "Self-loop not allowed";

  const sk = port_kind(source.node, source.port);
  const tk = port_kind(target.node, target.port);
  if (!sk || !tk) return "Unknown port";

  /* Flow pairing: out → in */
  if (sk === "out" && tk === "in") {
    if (is_port_occupied(edges, source.node.id, source.port, exclude_edge_id))
      return "Source already connected";
    if (is_port_occupied(edges, target.node.id, target.port, exclude_edge_id))
      return "Target already connected";
    return true;
  }
  if (sk === "in" && tk === "out") {
    /* allow reversed drag — caller normalizes */
    if (is_port_occupied(edges, source.node.id, source.port, exclude_edge_id))
      return "Source already connected";
    if (is_port_occupied(edges, target.node.id, target.port, exclude_edge_id))
      return "Target already connected";
    return true;
  }

  /* Attach pairing: workflow.attach ↔ plugin.attach
     Multi-connection allowed on attach ports — an agent's attach port can fan
     out to many plugins, and a plugin's attach port can be shared by many
     agents. Only in/out ports are constrained to a single edge. */
  if (sk === "attach" && tk === "attach") {
    const sc = source.node.kind;
    const tc = target.node.kind;
    const one_is_workflow_agent =
      (sc === "workflow" && source.node.type === "agent") ||
      (tc === "workflow" && target.node.type === "agent");
    const one_is_plugin =
      sc === "plugin" ||
      tc === "plugin" ||
      is_toolkit_pool_type(source.node.type) ||
      is_toolkit_pool_type(target.node.type) ||
      source.node.type === "subagent_pool" ||
      target.node.type === "subagent_pool";
    if (!one_is_workflow_agent || !one_is_plugin)
      return "Attach must connect an agent to a plugin";
    return true;
  }

  return "Incompatible port kinds";
}
