import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FlowEditor } from "./flow_editor";

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const config = { theme: {}, onThemeMode: "light_mode" };

function wrap(ui) {
  return <ConfigContext.Provider value={config}>{ui}</ConfigContext.Provider>;
}

describe("FlowEditor validate_connection", () => {
  test("renders nodes without calling on_connect when no drag occurs", () => {
    const on_connect = jest.fn();
    const nodes = [
      {
        id: "a",
        x: 0,
        y: 0,
        ports: [{ id: "out", side: "right", kind: "out" }],
      },
      {
        id: "b",
        x: 200,
        y: 0,
        ports: [{ id: "in", side: "left", kind: "in" }],
      },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_connect={on_connect}
          validate_connection={() => "rejected"}
        />,
      ),
    );
    expect(container.querySelector('[data-flow-node-id="a"]')).toBeTruthy();
    expect(container.querySelector('[data-flow-node-id="b"]')).toBeTruthy();
    expect(on_connect).not.toHaveBeenCalled();
  });
});

describe("FlowEditor delete key respects node.deletable", () => {
  test("deletable node is removed on Delete", () => {
    const on_nodes_change = jest.fn();
    const on_edges_change = jest.fn();
    const nodes = [
      { id: "start", x: 0, y: 0, deletable: false, ports: [] },
      { id: "a", x: 200, y: 0, deletable: true, ports: [] },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_nodes_change={on_nodes_change}
          on_edges_change={on_edges_change}
        />,
      ),
    );
    const aEl = container.querySelector('[data-flow-node-id="a"]');
    fireEvent.mouseDown(aEl, { button: 0 });
    fireEvent.mouseUp(aEl);
    fireEvent.keyDown(window, { code: "Delete" });
    expect(on_nodes_change).toHaveBeenCalled();
    const calls = on_nodes_change.mock.calls;
    const kept = calls[calls.length - 1][0];
    expect(kept.find((n) => n.id === "start")).toBeTruthy();
    expect(kept.find((n) => n.id === "a")).toBeFalsy();
  });

  test("undeletable node stays after Delete", () => {
    const on_nodes_change = jest.fn();
    const nodes = [{ id: "start", x: 0, y: 0, deletable: false, ports: [] }];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_nodes_change={on_nodes_change}
        />,
      ),
    );
    const el = container.querySelector('[data-flow-node-id="start"]');
    fireEvent.mouseDown(el, { button: 0 });
    fireEvent.mouseUp(el);
    fireEvent.keyDown(window, { code: "Delete" });
    if (on_nodes_change.mock.calls.length > 0) {
      const next = on_nodes_change.mock.calls[0][0];
      expect(next.find((n) => n.id === "start")).toBeTruthy();
    }
  });
});

describe("FlowEditor edge × button", () => {
  test("renders × button group on edge", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(<FlowEditor nodes={nodes} edges={edges} on_edges_change={() => {}} />),
    );
    expect(container.querySelector('[data-edge-delete-btn="e1"]')).toBeTruthy();
  });

  test("click on × button removes the edge", () => {
    const on_edges_change = jest.fn();
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={edges}
          on_edges_change={on_edges_change}
        />,
      ),
    );
    const btn = container.querySelector('[data-edge-delete-btn="e1"]');
    fireEvent.click(btn);
    expect(on_edges_change).toHaveBeenCalledWith([]);
  });
});

describe("FlowEditor edge endpoint reconnect smoke", () => {
  test("renders without crash when edge exists", () => {
    const nodes = [
      { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
      { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
    ];
    const edges = [
      {
        id: "e1",
        source_node_id: "a",
        source_port_id: "out",
        target_node_id: "b",
        target_port_id: "in",
      },
    ];
    const { container } = render(
      wrap(
        <FlowEditor nodes={nodes} edges={edges} on_edges_change={() => {}} />,
      ),
    );
    expect(container).toBeTruthy();
  });
});
