import { validate_recipe_connection } from "./recipe_connection_rules";

const agent = (id = "a1") => ({
  id,
  type: "agent",
  kind: "workflow",
  ports: [
    { id: "in", side: "left", kind: "in" },
    { id: "out", side: "right", kind: "out" },
    { id: "attach_top", side: "top", kind: "attach" },
    { id: "attach_bot", side: "bottom", kind: "attach" },
  ],
});
const start = () => ({
  id: "start",
  type: "start",
  kind: "workflow",
  ports: [{ id: "out", side: "right", kind: "out" }],
});
const end = () => ({
  id: "end",
  type: "end",
  kind: "workflow",
  ports: [{ id: "in", side: "left", kind: "in" }],
});
const tp = (id = "tp1") => ({
  id,
  type: "toolpool",
  kind: "plugin",
  ports: [
    { id: "attach_top", side: "top", kind: "attach" },
    { id: "attach_bot", side: "bottom", kind: "attach" },
  ],
});

describe("validate_recipe_connection", () => {
  const ctx = (edges = [], exclude_edge_id = null) => ({ edges, exclude_edge_id });

  test("allows out → in between workflow nodes", () => {
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: agent(), port: "in" },
        ctx(),
      ),
    ).toBe(true);
  });

  test("rejects out → out", () => {
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: agent(), port: "out" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("rejects self-loop", () => {
    const a = agent();
    expect(
      validate_recipe_connection(
        { node: a, port: "out" },
        { node: a, port: "in" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("allows agent attach ↔ plugin attach", () => {
    expect(
      validate_recipe_connection(
        { node: agent(), port: "attach_top" },
        { node: tp(), port: "attach_bot" },
        ctx(),
      ),
    ).toBe(true);
  });

  test("rejects workflow→workflow attach pairing", () => {
    const a = agent("a1");
    const b = agent("a2");
    expect(
      validate_recipe_connection(
        { node: a, port: "attach_top" },
        { node: b, port: "attach_bot" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("rejects plugin↔plugin attach pairing", () => {
    expect(
      validate_recipe_connection(
        { node: tp("tp1"), port: "attach_top" },
        { node: tp("tp2"), port: "attach_bot" },
        ctx(),
      ),
    ).not.toBe(true);
  });

  test("allows multiple plugins on the same agent attach port", () => {
    const a = agent();
    const existing = [
      {
        id: "e_attach_1",
        source_node_id: a.id,
        source_port_id: "attach_top",
        target_node_id: "tp1",
        target_port_id: "attach_bot",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: a, port: "attach_top" },
        { node: tp("tp2"), port: "attach_bot" },
        ctx(existing),
      ),
    ).toBe(true);
  });

  test("allows multiple agents on the same plugin attach port", () => {
    const plugin = tp();
    const existing = [
      {
        id: "e_attach_1",
        source_node_id: "a1",
        source_port_id: "attach_top",
        target_node_id: plugin.id,
        target_port_id: "attach_bot",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: agent("a2"), port: "attach_top" },
        { node: plugin, port: "attach_bot" },
        ctx(existing),
      ),
    ).toBe(true);
  });

  test("rejects second edge on single-connection port", () => {
    const existing = [
      {
        id: "e1",
        source_node_id: "start",
        source_port_id: "out",
        target_node_id: "a1",
        target_port_id: "in",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: end(), port: "in" },
        ctx(existing),
      ),
    ).not.toBe(true);
  });

  test("allows reconnect — existing edge is exempted", () => {
    const existing = [
      {
        id: "e1",
        source_node_id: "start",
        source_port_id: "out",
        target_node_id: "a1",
        target_port_id: "in",
      },
    ];
    expect(
      validate_recipe_connection(
        { node: start(), port: "out" },
        { node: end(), port: "in" },
        ctx(existing, "e1"),
      ),
    ).toBe(true);
  });
});
