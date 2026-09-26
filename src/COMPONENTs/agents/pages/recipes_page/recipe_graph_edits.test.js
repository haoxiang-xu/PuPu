import {
  edge_is_attach,
  insert_node_after,
  insert_node_into_edge,
  is_flow_step_type,
} from "./recipe_graph_edits";
import { build_node, ports_for_type } from "./recipe_node_catalog";
import { validate_recipe_connection } from "./recipe_connection_rules";
import { TOOLKIT_POOL_TYPE } from "./recipe_graph";

const flow_edge = (id, src, tgt) => ({
  id,
  source_node_id: src,
  source_port_id: "out",
  target_node_id: tgt,
  target_port_id: "in",
  kind: "flow",
});

function chain() {
  /* start → agent_1 → end, plus a pool attached to agent_1 */
  return {
    nodes: [
      { id: "start", type: "start", deletable: false, x: 0, y: 0 },
      build_node("agent", { id: "agent_1", x: 300, y: 0 }),
      { id: "end", type: "end", deletable: false, x: 600, y: 0 },
      build_node(TOOLKIT_POOL_TYPE, { id: "tp_1", x: 300, y: 200 }),
    ],
    edges: [
      flow_edge("e_1", "start", "agent_1"),
      flow_edge("e_2", "agent_1", "end"),
      {
        id: "e_3",
        source_node_id: "agent_1",
        source_port_id: "attach_bot",
        target_node_id: "tp_1",
        target_port_id: "attach_top",
        kind: "attach",
      },
    ],
  };
}

const fresh_agent = (id) => build_node("agent", { id, x: 450, y: 40 });

describe("is_flow_step_type", () => {
  test("an agent sits in the flow, a pool does not, start and end are ends", () => {
    expect(is_flow_step_type("agent")).toBe(true);
    expect(is_flow_step_type(TOOLKIT_POOL_TYPE)).toBe(false);
    expect(is_flow_step_type("start")).toBe(false);
    expect(is_flow_step_type("end")).toBe(false);
  });
});

describe("edge_is_attach", () => {
  test("reads the kind when present and the ports when it is not", () => {
    const r = chain();
    expect(edge_is_attach(r, r.edges[0])).toBe(false);
    expect(edge_is_attach(r, r.edges[2])).toBe(true);

    const legacy = { ...r.edges[2] };
    delete legacy.kind;
    expect(edge_is_attach(r, legacy)).toBe(true);
    const legacy_flow = { ...r.edges[0] };
    delete legacy_flow.kind;
    expect(edge_is_attach(r, legacy_flow)).toBe(false);
  });
});

describe("insert_node_into_edge", () => {
  test("splits one connection into two and keeps the outer ports", () => {
    const r = chain();
    const next = insert_node_into_edge(r, "e_2", fresh_agent("agent_2"));
    expect(next.nodes.map((n) => n.id)).toContain("agent_2");
    expect(next.edges.find((e) => e.id === "e_2")).toBeUndefined();

    const incoming = next.edges.find((e) => e.target_node_id === "agent_2");
    const outgoing = next.edges.find((e) => e.source_node_id === "agent_2");
    expect(incoming).toMatchObject({
      source_node_id: "agent_1",
      source_port_id: "out",
      target_port_id: "in",
      kind: "flow",
    });
    expect(outgoing).toMatchObject({
      source_port_id: "out",
      target_node_id: "end",
      target_port_id: "in",
      kind: "flow",
    });
    expect(incoming.id).not.toBe(outgoing.id);
    expect(new Set(next.edges.map((e) => e.id)).size).toBe(next.edges.length);
  });

  test("both new connections pass the existing connection rules", () => {
    const r = chain();
    const next = insert_node_into_edge(r, "e_2", fresh_agent("agent_2"));
    const with_ports = (id) => {
      const n = next.nodes.find((x) => x.id === id);
      return { ...n, ports: ports_for_type(n.type) };
    };
    const others = (id) => next.edges.filter((e) => e.id !== id);
    const incoming = next.edges.find((e) => e.target_node_id === "agent_2");
    const outgoing = next.edges.find((e) => e.source_node_id === "agent_2");
    expect(
      validate_recipe_connection(
        { node: with_ports("agent_1"), port: "out" },
        { node: with_ports("agent_2"), port: "in" },
        { edges: others(incoming.id) },
      ),
    ).toBe(true);
    expect(
      validate_recipe_connection(
        { node: with_ports("agent_2"), port: "out" },
        { node: with_ports("end"), port: "in" },
        { edges: others(outgoing.id) },
      ),
    ).toBe(true);
  });

  test("refuses an attach connection, an unknown edge and a node that cannot sit in the flow", () => {
    const r = chain();
    expect(insert_node_into_edge(r, "e_3", fresh_agent("agent_2"))).toBeNull();
    expect(insert_node_into_edge(r, "e_99", fresh_agent("agent_2"))).toBeNull();
    expect(
      insert_node_into_edge(r, "e_2", build_node(TOOLKIT_POOL_TYPE, { id: "tp_2", x: 0, y: 0 })),
    ).toBeNull();
    /* and the refusals left the input untouched */
    expect(r.edges).toHaveLength(3);
    expect(r.nodes).toHaveLength(4);
  });
});

describe("insert_node_after", () => {
  test("splices into the anchor's outgoing connection when it has one", () => {
    const r = chain();
    const next = insert_node_after(r, "agent_1", fresh_agent("agent_2"));
    expect(next.edges.find((e) => e.id === "e_2")).toBeUndefined();
    expect(
      next.edges.find(
        (e) => e.source_node_id === "agent_1" && e.target_node_id === "agent_2",
      ),
    ).toBeTruthy();
    expect(
      next.edges.find(
        (e) => e.source_node_id === "agent_2" && e.target_node_id === "end",
      ),
    ).toBeTruthy();
  });

  test("appends a single connection when the anchor's out port is free", () => {
    const r = chain();
    r.edges = r.edges.filter((e) => e.id !== "e_2");
    const next = insert_node_after(r, "agent_1", fresh_agent("agent_2"));
    const added = next.edges.filter((e) => !r.edges.some((o) => o.id === e.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      source_node_id: "agent_1",
      source_port_id: "out",
      target_node_id: "agent_2",
      target_port_id: "in",
      kind: "flow",
    });
  });

  test("the attach wiring never counts as the outgoing connection", () => {
    const r = chain();
    r.edges = r.edges.filter((e) => e.id !== "e_2");
    /* agent_1 still has its attach edge e_3; inserting after it must not touch it */
    const next = insert_node_after(r, "agent_1", fresh_agent("agent_2"));
    expect(next.edges.find((e) => e.id === "e_3")).toBeTruthy();
  });

  test("refuses an anchor without an out port and a node that cannot sit in the flow", () => {
    const r = chain();
    expect(insert_node_after(r, "end", fresh_agent("agent_2"))).toBeNull();
    expect(insert_node_after(r, "tp_1", fresh_agent("agent_2"))).toBeNull();
    expect(insert_node_after(r, "nope", fresh_agent("agent_2"))).toBeNull();
    expect(
      insert_node_after(r, "agent_1", build_node(TOOLKIT_POOL_TYPE, { id: "tp_2", x: 0, y: 0 })),
    ).toBeNull();
  });
});
