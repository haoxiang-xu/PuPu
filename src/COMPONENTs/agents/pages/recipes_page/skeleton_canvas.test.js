import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import { readSkeletonLayout } from "../../../../SERVICEs/skeleton_layout";

let lastProps = null;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    lastProps = props;
    return (
      <div data-testid="flow-editor">
        {(props.nodes || []).map((n) => (
          <div key={n.id} data-testid={`node-${n.id}`} data-x={n.x} data-y={n.y}>
            <button type="button" onClick={() => props.on_select(n.id)}>
              {n.id}
            </button>
            {props.render_node(n)}
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            props.on_nodes_change(
              (props.nodes || []).map((n) => (n.id === "a1" ? { ...n, x: 777, y: 42 } : n)),
            )
          }
        >
          drag-a1
        </button>
      </div>
    );
  },
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const flow = (id, a, b) => ({
  id, kind: "flow", source_node_id: a, source_port_id: "out",
  target_node_id: b, target_port_id: "in",
});
const doc = () => ({
  schema_version: 1, kind: "agent", id: "r", name: "r",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "a1", type: "agent", config: {} },
    { id: "end", type: "end", config: {} },
  ],
  edges: [flow("e1", "start", "a1"), flow("e2", "a1", "end")],
});

const show = (document = doc(), onSelectNode = () => {}) =>
  render(
    <ConfigContext.Provider value={cfg}>
      <SkeletonCanvas
        resourceId="r"
        document={document}
        onSelectNode={onSelectNode}
        isDark={false}
      />
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  window.localStorage.clear();
  lastProps = null;
});

describe("the graph is drawn from the document plus a separate layout", () => {
  test("every node gets a place without the document carrying one", () => {
    const d = doc();
    show(d);
    expect(screen.getByTestId("node-start").getAttribute("data-x")).toBeTruthy();
    /* And the document still has no coordinate anywhere in it. */
    expect(JSON.stringify(d)).not.toMatch(/"x"|"y"/);
  });

  test("the nodes carry the ports the editor needs", () => {
    show();
    const a1 = lastProps.nodes.find((n) => n.id === "a1");
    expect(a1.ports.map((p) => p.id).sort()).toEqual(["attach_bot", "attach_top", "in", "out"]);
  });

  test("clicking a node tells the page, which is what opens the panel", () => {
    const onSelectNode = jest.fn();
    const { getByTestId } = show(doc(), onSelectNode);
    fireEvent.click(within(getByTestId("node-a1")).getByRole("button"));
    expect(onSelectNode).toHaveBeenCalledWith("a1");
  });

  test("a node type this build cannot draw still appears", () => {
    const d = doc();
    d.nodes.push({ id: "c1", type: "code", config: {} });
    show(d);
    expect(screen.getByTestId("node-c1").textContent).toMatch(/code/);
  });
});

describe("moving a node moves the drawing and nothing else", () => {
  test("a drag is written to the layout service", () => {
    show();
    fireEvent.click(screen.getByText("drag-a1"));
    expect(readSkeletonLayout("r", doc()).nodes.a1).toEqual({ x: 777, y: 42 });
  });

  test("the document is not touched by a drag", () => {
    /* The guarantee is structural: the canvas is given no way to change the
     * document, so this cannot regress by someone wiring one up here. */
    const d = doc();
    const before = JSON.stringify(d);
    show(d);
    fireEvent.click(screen.getByText("drag-a1"));
    expect(JSON.stringify(d)).toBe(before);
  });

  test("no change callback for the graph is passed to the editor at all", () => {
    show();
    expect(lastProps.on_edges_change).toBeUndefined();
    expect(lastProps.on_connect).toBeUndefined();
    /* And the Delete key has nothing to act on. */
    expect(lastProps.nodes.every((n) => n.deletable === false)).toBe(true);
  });

  test("a remembered position is used on the next open", () => {
    const first = show();
    fireEvent.click(screen.getByText("drag-a1"));
    first.unmount();
    const again = show();
    expect(again.getByTestId("node-a1").getAttribute("data-x")).toBe("777");
  });

  test("a remembered viewport is restored", () => {
    const { unmount } = show();
    lastProps.viewport_out_ref.current = { x: 30, y: -10, zoom: 1.25 };
    fireEvent.mouseUp(screen.getByTestId("skeleton-canvas"));
    unmount();
    show();
    expect(lastProps.restore_viewport).toMatchObject({ x: 30, y: -10, zoom: 1.25 });
  });
});

describe("a dropped node stays where it was dropped", () => {
  test("a re-render after a drag does not snap it back", () => {
    /* The projection is memoized; without the drag being part of what it
     * depends on, the next render for any other reason hands the editor the
     * position the node was dragged FROM. */
    const d = doc();
    const { rerender, getByTestId } = show(d);
    fireEvent.click(screen.getByText("drag-a1"));
    rerender(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "dark_mode" }}>
        <SkeletonCanvas resourceId="r" document={d} onSelectNode={() => {}} isDark />
      </ConfigContext.Provider>,
    );
    expect(getByTestId("node-a1").getAttribute("data-x")).toBe("777");
  });
});
