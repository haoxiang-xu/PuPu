/* BFS backwards along flow edges to collect upstream-reachable node outputs. */

import { normalize_node_type } from "./recipe_graph";

export function compute_variable_scope(current_node_id, nodes, edges) {
  const by_id = new Map(nodes.map((n) => [n.id, n]));

  const incoming_flow = new Map();
  edges.forEach((e) => {
    if (e.kind !== "flow") return;
    if (!incoming_flow.has(e.target_node_id))
      incoming_flow.set(e.target_node_id, []);
    incoming_flow.get(e.target_node_id).push(e.source_node_id);
  });

  const visited = new Set();
  const upstream = [];
  const queue = [...(incoming_flow.get(current_node_id) || [])];

  while (queue.length > 0) {
    const id = queue.shift();
    if (visited.has(id) || id === current_node_id) continue;
    visited.add(id);
    upstream.push(id);
    const parents = incoming_flow.get(id) || [];
    parents.forEach((p) => queue.push(p));
  }

  const scope = [];
  upstream.forEach((node_id) => {
    const n = by_id.get(node_id);
    if (!n) return;
    const outs = n.outputs || [];
    outs.forEach((o) =>
      scope.push({
        node_id: n.id,
        field: o.name,
        type: o.type,
        source_type: normalize_node_type(n.type),
      }),
    );
  });
  return scope;
}
