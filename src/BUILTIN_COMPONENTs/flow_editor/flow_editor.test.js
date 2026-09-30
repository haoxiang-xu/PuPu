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

describe("FlowEditor reset_token", () => {
  const viewport_of = (container) =>
    container.querySelector('[data-flow-node-id="start"]').parentElement;

  function mount(props) {
    const nodes = [
      { id: "start", x: 100, y: 50, ports: [] },
      { id: "other", x: 500, y: 400, ports: [] },
    ];
    const utils = render(
      wrap(<FlowEditor nodes={nodes} edges={[]} data-testid="canvas" {...props} />),
    );
    const canvas = utils.getByTestId("canvas");
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
    });
    const start_el = utils.container.querySelector('[data-flow-node-id="start"]');
    Object.defineProperty(start_el, "offsetWidth", { value: 120, configurable: true });
    Object.defineProperty(start_el, "offsetHeight", { value: 60, configurable: true });
    return { ...utils, canvas, nodes };
  }

  test("without a focus node it resets the viewport to the origin", () => {
    const { rerender, container, nodes } = mount({ reset_token: 0 });
    rerender(wrap(<FlowEditor nodes={nodes} edges={[]} data-testid="canvas" reset_token={1} />));
    expect(viewport_of(container).style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });

  test("with reset_focus_node_id it centers that node in the canvas at zoom 1", () => {
    const { rerender, container, nodes } = mount({
      reset_token: 0,
      reset_focus_node_id: "start",
    });
    rerender(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          data-testid="canvas"
          reset_token={1}
          reset_focus_node_id="start"
        />,
      ),
    );
    // canvas 800x600, node at (100,50) sized 120x60 → node center (160,80)
    // → viewport offset (400-160, 300-80) = (240, 220)
    expect(viewport_of(container).style.transform).toBe(
      "translate(240px, 220px) scale(1)",
    );
  });

  test("an unknown focus node falls back to the origin reset", () => {
    const { rerender, container, nodes } = mount({
      reset_token: 0,
      reset_focus_node_id: "missing",
    });
    rerender(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          data-testid="canvas"
          reset_token={1}
          reset_focus_node_id="missing"
        />,
      ),
    );
    expect(viewport_of(container).style.transform).toBe(
      "translate(0px, 0px) scale(1)",
    );
  });
});

describe("FlowEditor right-click reports what was clicked", () => {
  const nodes = [
    {
      id: "a",
      x: 0,
      y: 0,
      deletable: true,
      ports: [{ id: "out", side: "right", kind: "out" }],
    },
    {
      id: "b",
      x: 300,
      y: 0,
      deletable: true,
      ports: [{ id: "in", side: "left", kind: "in" }],
    },
  ];
  const edges = [
    {
      id: "e_1",
      source_node_id: "a",
      source_port_id: "out",
      target_node_id: "b",
      target_port_id: "in",
    },
  ];

  function setup() {
    const on_context_menu = jest.fn();
    const on_select = jest.fn();
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={edges}
          on_context_menu={on_context_menu}
          on_select={on_select}
        />,
      ),
    );
    return { container, on_context_menu, on_select };
  }

  test("right-clicking empty canvas reports the canvas as the target", () => {
    const { container, on_context_menu, on_select } = setup();
    fireEvent.contextMenu(container.firstChild);
    expect(on_context_menu).toHaveBeenCalledTimes(1);
    expect(on_context_menu.mock.calls[0][0].target).toEqual({
      kind: "canvas",
      id: null,
    });
    expect(on_select).not.toHaveBeenCalled();
  });

  test("right-clicking a node reports it and highlights it, without opening its detail page", () => {
    const { container, on_context_menu, on_select } = setup();
    fireEvent.contextMenu(container.querySelector('[data-flow-node-id="b"]'));
    expect(on_context_menu.mock.calls[0][0].target).toEqual({
      kind: "node",
      id: "b",
    });
    /* on_select is what opens the detail page; a right-click asks for a menu,
     * not for the panel. The canvas still highlights the node itself. */
    expect(on_select).not.toHaveBeenCalled();
  });

  test("right-clicking a connection reports that edge", () => {
    const { container, on_context_menu, on_select } = setup();
    fireEvent.contextMenu(container.querySelector('[data-flow-edge-id="e_1"]'));
    expect(on_context_menu.mock.calls[0][0].target).toEqual({
      kind: "edge",
      id: "e_1",
    });
    /* An edge is not a node selection. */
    expect(on_select).not.toHaveBeenCalled();
  });

  test("a right-click still reports canvas coordinates alongside the target", () => {
    const { container, on_context_menu } = setup();
    fireEvent.contextMenu(container.firstChild, { clientX: 120, clientY: 80 });
    const call = on_context_menu.mock.calls[0][0];
    expect(typeof call.canvas_x).toBe("number");
    expect(typeof call.canvas_y).toBe("number");
    expect(call.client_x).toBe(120);
    expect(call.client_y).toBe(80);
  });
});

describe("FlowEditor select_all_token contract", () => {
  const nodes = [
    { id: "start", x: 0, y: 0, deletable: false, ports: [] },
    { id: "a", x: 200, y: 0, deletable: true, ports: [] },
    { id: "b", x: 400, y: 0, deletable: true, ports: [] },
  ];

  test("undefined stays inert: nothing is selected on mount, Delete removes nothing", () => {
    const on_nodes_change = jest.fn();
    render(
      wrap(
        <FlowEditor nodes={nodes} edges={[]} on_nodes_change={on_nodes_change} />,
      ),
    );
    fireEvent.keyDown(window, { code: "Delete" });
    expect(on_nodes_change).not.toHaveBeenCalled();
  });

  test("bumping the token selects every node; Delete still respects deletable", () => {
    const on_nodes_change = jest.fn();
    const ui = (token) =>
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_nodes_change={on_nodes_change}
          select_all_token={token}
        />,
      );
    const { rerender } = render(ui(undefined));
    rerender(ui(1));
    fireEvent.keyDown(window, { code: "Delete" });
    expect(on_nodes_change).toHaveBeenCalledTimes(1);
    const kept = on_nodes_change.mock.calls[0][0].map((n) => n.id);
    expect(kept).toEqual(["start"]);
  });
});

describe("FlowEditor right-click during a gesture", () => {
  const nodes = [
    {
      id: "a",
      x: 0,
      y: 0,
      deletable: true,
      ports: [{ id: "out", side: "right", kind: "out" }],
    },
  ];

  test("a right-click while dragging a node opens no menu", () => {
    const on_context_menu = jest.fn();
    const { container } = render(
      wrap(
        <FlowEditor nodes={nodes} edges={[]} on_context_menu={on_context_menu} />,
      ),
    );
    const node = container.querySelector('[data-flow-node-id="a"]');

    /* Start a drag, then press the other button mid-gesture. */
    fireEvent.mouseDown(node, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 60, clientY: 40 });
    fireEvent.contextMenu(node);
    expect(on_context_menu).not.toHaveBeenCalled();

    /* Once the gesture ends the menu works again. */
    fireEvent.mouseUp(window, { clientX: 60, clientY: 40 });
    fireEvent.contextMenu(node);
    expect(on_context_menu).toHaveBeenCalledTimes(1);
  });

  test("a right-click while panning the canvas opens no menu", () => {
    const on_context_menu = jest.fn();
    const { container } = render(
      wrap(
        <FlowEditor nodes={nodes} edges={[]} on_context_menu={on_context_menu} />,
      ),
    );
    const canvas = container.firstChild;
    fireEvent.mouseDown(canvas, { button: 1, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(window, { clientX: 80, clientY: 80 });
    fireEvent.contextMenu(canvas);
    expect(on_context_menu).not.toHaveBeenCalled();
  });
});

describe("dragging a node is not a request to open it", () => {
  const nodes = [
    { id: "a", x: 10, y: 20, ports: [] },
    { id: "b", x: 200, y: 20, ports: [] },
  ];

  function setup() {
    const on_select = jest.fn();
    const on_nodes_change = jest.fn();
    const { container } = render(
      wrap(
        <FlowEditor
          nodes={nodes}
          edges={[]}
          on_select={on_select}
          on_nodes_change={on_nodes_change}
        />,
      ),
    );
    const node = container.querySelector('[data-flow-node-id="a"]');
    return { container, node, on_select, on_nodes_change };
  }

  const press = (node, x, y) =>
    fireEvent.mouseDown(node, { clientX: x, clientY: y, button: 0 });
  const move = (x, y) =>
    fireEvent.mouseMove(window, { clientX: x, clientY: y });
  const release = (x, y) =>
    fireEvent.mouseUp(window, { clientX: x, clientY: y });

  test("a press alone does not open the detail page", () => {
    /* `on_select` is what opens it, and at mousedown nobody knows yet whether
     * this is a click or the start of a drag. */
    const { node, on_select } = setup();
    press(node, 0, 0);
    expect(on_select).not.toHaveBeenCalled();
  });

  test("a drag opens nothing, and commits the new position", () => {
    const { node, on_select, on_nodes_change } = setup();
    press(node, 0, 0);
    move(60, 40);
    release(60, 40);
    expect(on_select).not.toHaveBeenCalled();
    expect(on_nodes_change).toHaveBeenCalled();
  });

  test("a click opens the node on release", () => {
    const { node, on_select } = setup();
    press(node, 0, 0);
    release(0, 0);
    expect(on_select).toHaveBeenCalledWith("a");
  });

  test("a click writes nothing, so looking at a node is not an edit", () => {
    /* An unchanged position reported back still marked the graph dirty and
     * pushed an undo step. */
    const { node, on_nodes_change } = setup();
    press(node, 0, 0);
    release(0, 0);
    expect(on_nodes_change).not.toHaveBeenCalled();
  });

  test("a tremor within the threshold is still a click", () => {
    const { node, on_select, on_nodes_change } = setup();
    press(node, 0, 0);
    move(1, 1);
    move(2, 0);
    release(2, 0);
    expect(on_select).toHaveBeenCalledWith("a");
    expect(on_nodes_change).not.toHaveBeenCalled();
  });

  test("once past the threshold it stays a drag, even back at the start", () => {
    /* Returning to where the press began does not turn a drag back into a
     * click; the node has been moved around in the meantime. */
    const { node, on_select, on_nodes_change } = setup();
    press(node, 0, 0);
    move(80, 0);
    move(0, 0);
    release(0, 0);
    expect(on_select).not.toHaveBeenCalled();
    expect(on_nodes_change).toHaveBeenCalled();
  });

  test("the node is highlighted from the press, before anything opens", () => {
    /* The canvas's own selection is immediate, so the press is visibly on this
     * node; it is the detail page that waits. */
    const { node } = setup();
    press(node, 0, 0);
    move(60, 40);
    expect(node.style.cursor).toBe("grabbing");
  });
});
