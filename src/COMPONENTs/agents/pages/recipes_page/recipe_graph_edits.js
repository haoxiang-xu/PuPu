import { ports_for_type } from "./recipe_node_catalog";

/* Pure graph edits behind the context menus.
 *
 * "Insert node after…" and "Insert node here…" promise wiring, not just a node
 * dropped near the click — so the splice lives here as plain functions the
 * canvas calls and the tests exercise directly. Every function returns the next
 * recipe, or null when the edit would not mean anything, and never mutates its
 * input. */

function port_kind_of(node, port_id) {
  const port = ports_for_type(node?.type).find((p) => p.id === port_id);
  return port ? port.kind : null;
}

function node_by_id(recipe, node_id) {
  return recipe?.nodes?.find((n) => n.id === node_id) || null;
}

/* An edge is attach wiring when either endpoint is an attach port; `kind` is
 * carried on edges the canvas created, but a loaded recipe may predate it, so
 * the ports are the authority. */
export function edge_is_attach(recipe, edge) {
  if (!edge) return false;
  if (edge.kind === "attach" || edge.kind === "flow") return edge.kind === "attach";
  const src = node_by_id(recipe, edge.source_node_id);
  const tgt = node_by_id(recipe, edge.target_node_id);
  return (
    port_kind_of(src, edge.source_port_id) === "attach" ||
    port_kind_of(tgt, edge.target_port_id) === "attach"
  );
}

/* A node can sit in the flow only if it has both an in and an out port. */
export function is_flow_step_type(node_type) {
  const ports = ports_for_type(node_type);
  return ports.some((p) => p.kind === "in") && ports.some((p) => p.kind === "out");
}

function next_edge_ids(recipe, count) {
  const taken = new Set(recipe.edges.map((e) => e.id));
  const ids = [];
  let i = 1;
  while (ids.length < count) {
    const id = `e_${i}`;
    if (!taken.has(id)) {
      taken.add(id);
      ids.push(id);
    }
    i += 1;
  }
  return ids;
}

/* Split an existing flow connection: source → node → target. The outer ends
 * keep the ports the old edge used; the inner ends are the new node's own
 * in / out. Returns null for an attach connection, an unknown edge, or a node
 * that cannot sit in the flow. */
export function insert_node_into_edge(recipe, edge_id, node) {
  if (!recipe || !node || !is_flow_step_type(node.type)) return null;
  const edge = recipe.edges.find((e) => e.id === edge_id);
  if (!edge || edge_is_attach(recipe, edge)) return null;

  const [id_in, id_out] = next_edge_ids(recipe, 2);
  const before = {
    id: id_in,
    source_node_id: edge.source_node_id,
    source_port_id: edge.source_port_id,
    target_node_id: node.id,
    target_port_id: "in",
    kind: "flow",
  };
  const after = {
    id: id_out,
    source_node_id: node.id,
    source_port_id: "out",
    target_node_id: edge.target_node_id,
    target_port_id: edge.target_port_id,
    kind: "flow",
  };
  return {
    ...recipe,
    nodes: [...recipe.nodes, node],
    edges: [...recipe.edges.filter((e) => e.id !== edge_id), before, after],
  };
}

/* Insert directly after a node: splice into its outgoing flow connection when
 * it has one, otherwise just connect node-after-node at the end of the chain.
 * Returns null when the anchor has no out port or the node cannot sit in the
 * flow. */
export function insert_node_after(recipe, after_id, node) {
  if (!recipe || !node || !is_flow_step_type(node.type)) return null;
  const anchor = node_by_id(recipe, after_id);
  if (!anchor) return null;
  if (!ports_for_type(anchor.type).some((p) => p.kind === "out")) return null;

  const out_edge = recipe.edges.find(
    (e) =>
      e.source_node_id === after_id &&
      port_kind_of(anchor, e.source_port_id) === "out",
  );
  if (out_edge) return insert_node_into_edge(recipe, out_edge.id, node);

  const [id] = next_edge_ids(recipe, 1);
  return {
    ...recipe,
    nodes: [...recipe.nodes, node],
    edges: [
      ...recipe.edges,
      {
        id,
        source_node_id: after_id,
        source_port_id: "out",
        target_node_id: node.id,
        target_port_id: "in",
        kind: "flow",
      },
    ],
  };
}
