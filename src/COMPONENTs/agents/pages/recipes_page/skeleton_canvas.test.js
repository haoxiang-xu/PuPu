import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import {
  ENVELOPE_ROWS,
  LOOKUP_ROWS,
} from "./skeleton_drill_replacement_capture";
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

describe("a zoom survives closing the canvas", () => {
  /* Zooming is a wheel gesture and never produces a mouseup, so persisting on
   * mouseup alone remembered every pan and no zoom at all. */
  test("a wheel zoom is remembered", () => {
    const first = show();
    lastProps.viewport_out_ref.current = { x: 0, y: 0, zoom: 2.5 };
    fireEvent.wheel(screen.getByTestId("skeleton-canvas"), { deltaY: -120 });
    first.unmount();
    show();
    expect(lastProps.restore_viewport).toMatchObject({ zoom: 2.5 });
  });

  test("leaving the canvas remembers wherever it was left", () => {
    /* Whatever gesture moved it, closing the page is the last chance to keep
     * it. */
    const first = show();
    lastProps.viewport_out_ref.current = { x: 5, y: 6, zoom: 1.75 };
    first.unmount();
    show();
    expect(lastProps.restore_viewport).toMatchObject({ x: 5, y: 6, zoom: 1.75 });
  });

  test("a pan is still remembered", () => {
    const first = show();
    lastProps.viewport_out_ref.current = { x: 40, y: -12, zoom: 1 };
    fireEvent.mouseUp(screen.getByTestId("skeleton-canvas"));
    first.unmount();
    show();
    expect(lastProps.restore_viewport).toMatchObject({ x: 40, y: -12 });
  });
});

describe("opening a subagent from the pool node", () => {
  /* The pool node is drawn for two models of graph. A Skeleton node carries
     its entries in `config`, which is what this canvas passes; the legacy
     recipe canvas passes a node whose entries sit on `node.subagents`. Reading
     the wrong one is not a blank row — it is a pool that says it has no
     subagents while holding two. */
  const entry = (over) => ({
    id: "e1",
    name: "Summarizer",
    description: "",
    source: { kind: "agent_ref", agent_id: "sum" },
    allowed_modes: ["delegate"],
    output_mode: "summary",
    memory_policy: "ephemeral",
    parallel_safe: true,
    allowed_tools: null,
    disabled_tools: [],
    ...over,
  });

  const with_pool = (config) => {
    const d = doc();
    d.nodes.push({ id: "pool", type: "subagent_pool", config });
    d.edges.push({
      id: "attach", kind: "attach", source_node_id: "pool",
      source_port_id: "attach_top", target_node_id: "a1",
      target_port_id: "attach_bot",
    });
    return d;
  };

  const open = jest.fn();
  const draw = (document) =>
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonCanvas
          resourceId="r"
          document={document}
          onSelectNode={() => {}}
          onOpenSubagent={open}
          isDark={false}
        />
      </ConfigContext.Provider>,
    );

  beforeEach(() => open.mockReset());

  test("a Skeleton pool draws the entries it actually holds", () => {
    draw(
      with_pool({
        subagents: [
          entry(),
          entry({
            id: "e2",
            name: "Shortener",
            source: {
              kind: "embedded",
              /* A whole document: a stub with no `nodes` is not a graph the
                 store would take, and not one this canvas could draw. */
              document: { schema_version: 1, kind: "agent", id: "embedded-pool-1", name: "Shortener", nodes: [], edges: [] },
            },
          }),
        ],
      }),
    );
    const pool = screen.getByTestId("node-pool");
    expect(within(pool).getByText("2 subagents")).toBeInTheDocument();
    expect(within(pool).getByTestId("pool-node-row-0").textContent).toMatch(
      /Summarizer.*Referenced/,
    );
    expect(within(pool).getByTestId("pool-node-row-1").textContent).toMatch(
      /Shortener.*Embedded/,
    );
  });

  test("double-clicking a row asks the page to open it, naming the pool and the entry", () => {
    draw(with_pool({ subagents: [entry()] }));
    fireEvent.doubleClick(screen.getByTestId("pool-node-row-0"));
    expect(open).toHaveBeenCalledWith({
      pool_node_id: "pool",
      entry_id: "e1",
      /* The position too: an entry id is unique in a pool the store will run,
         and a draft it accepts can hold two entries with one id. The row the
         author clicked is the one that opens. */
      entry_index: 0,
      reason: null,
    });
  });

  test("a row that cannot be opened answers too, with the reason", () => {
    draw(with_pool({ subagents: [entry({ source: { kind: "graph" } })] }));
    fireEvent.doubleClick(screen.getByTestId("pool-node-row-0"));
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0].reason).toMatch(/agent_ref and embedded/);
  });

  test("a legacy pool draws its subagents and says they are converted first", () => {
    draw(
      with_pool({
        legacy_fields: { subagents: [{ kind: "recipe_ref", recipe_name: "Summarizer" }] },
      }),
    );
    const pool = screen.getByTestId("node-pool");
    expect(within(pool).getByTestId("pool-node-row-0").textContent).toMatch(
      /Summarizer.*Legacy/,
    );
    fireEvent.doubleClick(within(pool).getByTestId("pool-node-row-0"));
    expect(open.mock.calls[0][0].reason).toMatch(/Convert it first/);
  });
});

describe("the drawing is given the node, not everything beside it", () => {
  /* The review's second residual. A stored node is closed to `{id, type,
     config}` — `ENVELOPE_ROWS` below is the store refusing every other key —
     and this canvas used to spread the stored node into the node it hands the
     drawings, which read a node's own `label` and `model`. An embedded child
     saved with `label: {"toString": null}`, which the real store stores and
     reads back verbatim, then threw "Objects are not valid as a React child"
     before anything was drawn. */

  const stored_child = (name) => {
    const row = ENVELOPE_ROWS.find((item) => item.case === name);
    return JSON.parse(row.entries)[0].source.document;
  };

  test("the store refuses every one of these keys, so none of them is the graph", () => {
    const refused = (name) => ENVELOPE_ROWS.find((row) => row.case === name);
    /* On a parent, the save itself is refused; inside an embedded child the
       draft saves unchecked and Run refuses the key. */
    expect(refused("parent_node_label_text").save_refused.code).toBe("unknown_field");
    ["child_node_label_unreadable", "child_node_label_text",
     "child_node_model_unreadable", "child_node_override_unreadable",
     "child_node_position"].forEach((name) => {
      const row = refused(name);
      expect([name, row.saved, row.round_trip, row.draft_diagnostics]).toEqual([
        name, true, true, [],
      ]);
      expect([name, row.run.code, row.run.path[row.run.path.length - 1]]).toEqual([
        name, "unknown_field", name.split("_")[2] === "position" ? "x" : name.split("_")[2],
      ]);
    });
  });

  test("a child whose label cannot become text is drawn, by its id", () => {
    const child = stored_child("child_node_label_unreadable");
    const agent = child.nodes.find((node) => node.type === "agent");
    expect(agent.label).toEqual({ toString: null });
    show(child);
    /* It draws at all — this threw — and it draws the node's own name, which
       for a Skeleton node is its id. (The editor's mock prints the id once
       itself, above whatever the drawing prints, so the drawing's own copy is
       the second.) */
    const drawn = within(screen.getByTestId("node-agent"));
    expect(drawn.getAllByText("agent")).toHaveLength(2);
    expect(screen.getByTestId("node-agent").textContent).not.toMatch(/unreadable/);
    /* And the drawing was never handed the key. */
    expect("label" in lastProps.nodes.find((node) => node.id === "agent")).toBe(false);
    /* The stored document still holds it, untouched. */
    expect(child.nodes.find((node) => node.type === "agent").label).toEqual({
      toString: null,
    });
  });

  test("a label that IS text is not drawn either, because it is not the node's", () => {
    const child = stored_child("child_node_label_text");
    expect(child.nodes.find((node) => node.type === "agent").label).toBe("Child label");
    show(child);
    const drawn = within(screen.getByTestId("node-agent"));
    expect(drawn.getAllByText("agent")).toHaveLength(2);
    expect(drawn.queryByText("Child label")).toBeNull();
  });

  test("the model beside it is the same read and is covered with it", () => {
    ["child_node_model_unreadable", "child_node_override_unreadable"].forEach((name) => {
      const child = stored_child(name);
      const { unmount } = show(child);
      const node = screen.getByTestId("node-agent");
      expect(within(node).getAllByText("agent")).toHaveLength(2);
      expect([name, node.textContent.includes("unreadable")]).toEqual([name, false]);
      unmount();
    });
  });

  test("what the node really holds still reaches the drawing", () => {
    /* The projection is not a filter on content: `config` is what a pool's
       rows are drawn from, and a graph drawn without it would be a pool
       saying it has no subagents while holding two. */
    const document = doc();
    document.nodes.push({
      id: "pool",
      type: "subagent_pool",
      label: { toString: null },
      config: {
        subagents: [
          {
            id: "e1",
            name: "Shortener",
            source: { kind: "agent_ref", agent_id: "sum" },
          },
        ],
      },
    });
    show(document);
    const pool = screen.getByTestId("node-pool");
    expect(within(pool).getByText("1 subagent")).toBeInTheDocument();
    expect(within(pool).getByTestId("pool-node-row-0").textContent).toMatch(
      /Shortener.*Referenced/,
    );
  });

  test("a toolkit count is a count, whatever was stored where it was read", () => {
    const document = doc();
    document.nodes.push({
      id: "tools",
      type: "toolkit_pool",
      toolkits: { length: { toString: null } },
      config: {},
    });
    show(document);
    expect(within(screen.getByTestId("node-tools")).getByText(/0 toolkits/)).toBeInTheDocument();
  });

  test("a type the schema does not name is given no ports rather than a prototype", () => {
    /* The same class as the panel's identity table, one table further along:
       `ports_for_type` reads `FIXED_PORTS[type]` as a plain key, and a draft
       can hold `type: "__proto__"` — stored verbatim by the real store,
       refused at Run with `unknown_variant`. That read answers
       `Object.prototype`, which is an object, so it was handed to the editor
       as the port list and the editor's `ports.forEach` threw. The catalog's
       own read is shared with the legacy canvas and is left alone; this canvas
       asks it only about a type the schema names. */
    expect(LOOKUP_ROWS.find((row) => row.case === "node_type_proto").run.code).toBe(
      "unknown_variant",
    );
    const document = doc();
    document.nodes.push({ id: "odd", type: "__proto__", config: {} });
    document.nodes.push({ id: "odder", type: "constructor", config: {} });
    show(document);
    ["odd", "odder"].forEach((id) => {
      const node = lastProps.nodes.find((item) => item.id === id);
      expect([id, Array.isArray(node.ports)]).toEqual([id, true]);
      expect([id, node.ports]).toEqual([id, []]);
      /* Which is what the editor does with them. */
      expect(() => node.ports.forEach(() => {})).not.toThrow();
    });
    /* A type it does name still gets its ports. */
    expect(lastProps.nodes.find((node) => node.id === "a1").ports.length).toBe(4);
    /* And the node is still drawn, by its own type. */
    expect(screen.getByTestId("node-odd").textContent).toMatch(/__proto__/);
  });

  test("a value INSIDE the envelope is not withheld — that is the author's to fix", () => {
    /* The line stays where the store draws it: `config.kernel.profile.model`
       holding junk is a value problem, `invalid_value` at Run, and the graph
       opens and draws so the author can fix it. */
    const row = ENVELOPE_ROWS.find((item) => item.case === "child_kernel_model_unreadable");
    expect([row.saved, row.run.code]).toEqual([true, "invalid_value"]);
    const child = stored_child("child_kernel_model_unreadable");
    show(child);
    expect(screen.getByTestId("node-agent")).toBeInTheDocument();
  });
});

describe("Home centers this graph's own Start", () => {
  const sub = () => ({
    schema_version: 1, kind: "agent", id: "child", name: "Shortener",
    nodes: [
      /* A sub-graph need not name its start node `start`. */
      { id: "entry", type: "start", config: {} },
      { id: "k", type: "agent", config: {} },
    ],
    edges: [flow("e1", "entry", "k")],
  });

  test("the node it centers is found by type, not by name", () => {
    show(sub());
    expect(lastProps.reset_focus_node_id).toBe("entry");
  });

  test("the control asks for it", () => {
    show(sub());
    const before = lastProps.reset_token;
    fireEvent.click(screen.getByLabelText("Center this graph"));
    expect(lastProps.reset_token).toBe(before + 1);
  });

  test("so does the key the acceptance names", () => {
    show(sub());
    const before = lastProps.reset_token;
    fireEvent.keyDown(document, { key: "Home" });
    expect(lastProps.reset_token).toBe(before + 1);
  });

  test("but not while a field has the caret", () => {
    show(sub());
    const before = lastProps.reset_token;
    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(document, { key: "Home" });
    expect(lastProps.reset_token).toBe(before);
    field.remove();
  });
});

describe("one drawing per graph", () => {
  /* The canvas holds drawing state — the positions it has handed out, the
     viewport it was left at — and all of it belongs to ONE graph. The page
     keeps this component in place and changes which graph it draws, so the
     state has to be bound to the graph's identity rather than to the
     component's lifetime. Reproduced in the acceptance-8 review: a parent and
     an embedded child with a node id in common drew each other's positions,
     and dragging in the parent afterwards wrote the child's coordinate into
     the parent's layout.

     Being a separate component keyed by that identity is what makes it true
     of the editor FlowEditor keeps inside it as well, which no prop can
     reset. */
  const other = () => ({
    schema_version: 1, kind: "agent", id: "child", name: "Child",
    /* The same node ids as `doc()`: that is the whole hazard. */
    nodes: [
      { id: "start", type: "start", config: {} },
      { id: "a1", type: "agent", config: {} },
      { id: "end", type: "end", config: {} },
    ],
    edges: [flow("e1", "start", "a1"), flow("e2", "a1", "end")],
  });

  const draw = (resourceId, document) => (
    <ConfigContext.Provider value={cfg}>
      <SkeletonCanvas
        resourceId={resourceId}
        document={document}
        onSelectNode={() => {}}
        isDark={false}
      />
    </ConfigContext.Provider>
  );

  test("a graph is drawn where IT was left, not where the last one was", () => {
    const parent = doc();
    const { rerender, getByTestId } = render(draw("r", parent));
    fireEvent.click(screen.getByText("drag-a1"));
    expect(getByTestId("node-a1").getAttribute("data-x")).toBe("777");
    rerender(draw("child-key", other()));
    const moved = getByTestId("node-a1").getAttribute("data-x");
    expect(moved).not.toBe("777");
    /* And the one that was dragged is still where it was dragged to. */
    rerender(draw("r", parent));
    expect(getByTestId("node-a1").getAttribute("data-x")).toBe("777");
  });

  test("a drag writes to the graph being drawn and to nothing else", () => {
    const parent = doc();
    const { rerender } = render(draw("r", parent));
    rerender(draw("child-key", other()));
    fireEvent.click(screen.getByText("drag-a1"));
    expect(readSkeletonLayout("child-key", other()).nodes.a1).toEqual({ x: 777, y: 42 });
    const stored = JSON.parse(window.localStorage.getItem("skeleton_layout"));
    /* Not one position under the parent's key. (It does have a record: the
       instance that was drawing it wrote the viewport it was left at on the
       way out, which is the point of the next test.) */
    expect((stored.resources.r || {}).nodes).toBeUndefined();
  });

  test("the viewport it was left at is kept under the graph it belonged to", () => {
    const parent = doc();
    const { rerender } = render(draw("r", parent));
    lastProps.viewport_out_ref.current = { x: 11, y: 12, zoom: 1.5 };
    rerender(draw("child-key", other()));
    /* Written on the way out, under the id the panning happened in — not
       under the graph that is open now. */
    expect(readSkeletonLayout("r", parent).viewport).toMatchObject({
      x: 11, y: 12, zoom: 1.5,
    });
    expect(readSkeletonLayout("child-key", other()).viewport).toBeNull();
    /* And the new graph does not start out restoring the old one's. */
    expect(lastProps.restore_viewport).toBeUndefined();
  });

  test("coming back restores the viewport that graph was left at", () => {
    const parent = doc();
    const { rerender } = render(draw("r", parent));
    lastProps.viewport_out_ref.current = { x: 11, y: 12, zoom: 1.5 };
    rerender(draw("child-key", other()));
    rerender(draw("r", parent));
    expect(lastProps.restore_viewport).toMatchObject({ x: 11, y: 12, zoom: 1.5 });
  });
});
