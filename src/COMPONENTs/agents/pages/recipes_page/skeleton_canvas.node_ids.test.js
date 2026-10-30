import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import { NODE_ID_ROWS } from "./skeleton_node_id_capture";
import { readSkeletonLayout } from "../../../../SERVICEs/skeleton_layout";

/* Drawing a graph whose node ids are ordinary strings the store runs.
 *
 * The **real** FlowEditor, not the double the rest of this canvas's tests
 * use: the whole fault was in what the editor does with an id as a property
 * name, and a double has no tables. Every document here came out of the real
 * store and was executed by the installed runtime — `NODE_ID_ROWS`, whose
 * header says how — so nothing is wrong with any of them.
 *
 * Measured before the fix, with this same component and this same editor:
 * `map[edge.source_node_id].add is not a function` before anything was drawn,
 * and with the editor doubled to get past it, a node at `x: undefined` whose
 * drag to (501, 502) left the stored layout holding every other node. */

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const cfg = { theme: {}, onThemeMode: "light_mode" };
const row = (name) => NODE_ID_ROWS.find((item) => item.case === name);
const document_of = (name) => JSON.parse(row(name).document);

const draw = (document) =>
  render(
    <ConfigContext.Provider value={cfg}>
      <SkeletonCanvas
        resourceId={document.id}
        document={document}
        onSelectNode={() => {}}
        isDark={false}
      />
    </ConfigContext.Provider>,
  );

const node_element = (container, id) =>
  container.querySelector(`[data-flow-node-id="${id}"]`);

const place_of = (element) => ({
  x: Number.parseFloat(element.style.left),
  y: Number.parseFloat(element.style.top),
});

/* A real drag: press, move past the threshold, release. The editor reports the
   new place to the canvas, which writes it to the layout service. */
function drag(element, by) {
  fireEvent.mouseDown(element, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.mouseMove(window, { clientX: by.x, clientY: by.y });
  fireEvent.mouseUp(window, { clientX: by.x, clientY: by.y });
}

beforeEach(() => window.localStorage.clear());

describe("a node id that names a member of every object", () => {
  test("the capture is the store's and the runtime's, not this editor's", () => {
    NODE_ID_ROWS.forEach((item) => {
      expect([item.case, item.saved, item.round_trip, item.preflight.ok]).toEqual([
        item.case,
        true,
        true,
        true,
      ]);
      expect([item.case, item.execution.outputs]).toEqual([
        item.case,
        { message: "Same valid input" },
      ]);
    });
  });

  test("every one of them draws in the real editor, with finite coordinates", () => {
    NODE_ID_ROWS.forEach((item) => {
      const document = JSON.parse(item.document);
      const { container, unmount } = draw(document);
      const drawn = node_element(container, item.start_id);
      expect([item.case, !!drawn]).toEqual([item.case, true]);
      const at = place_of(drawn);
      expect([item.case, Number.isFinite(at.x), Number.isFinite(at.y)]).toEqual([
        item.case,
        true,
        true,
      ]);
      /* And the End beside it, so the edge between them had both ends. */
      expect([item.case, !!node_element(container, "end")]).toEqual([item.case, true]);
      unmount();
    });
  });

  test("dragging it is remembered, and reopening the graph keeps the place", () => {
    const document = document_of("proto");
    const first = draw(document);
    const before = place_of(node_element(first.container, "__proto__"));
    const end_before = place_of(node_element(first.container, "end"));
    drag(node_element(first.container, "__proto__"), { x: 120, y: 60 });

    /* The layout service holds it under that id, as its own key. */
    const stored = readSkeletonLayout(document.id, document).nodes;
    expect(Object.prototype.hasOwnProperty.call(stored, "__proto__")).toBe(true);
    expect(stored["__proto__"]).toEqual({ x: before.x + 120, y: before.y + 60 });

    /* And the graph opens where it was left. */
    first.unmount();
    const second = draw(document);
    expect(place_of(node_element(second.container, "__proto__"))).toEqual({
      x: before.x + 120,
      y: before.y + 60,
    });
    /* The node beside it did not move. */
    expect(place_of(node_element(second.container, "end"))).toEqual(end_before);
  });

  test("an ordinary id behaves exactly as it did", () => {
    const document = document_of("normal");
    const first = draw(document);
    const before = place_of(node_element(first.container, "start"));
    expect(before).toEqual({ x: 80, y: 80 });
    drag(node_element(first.container, "start"), { x: 120, y: 60 });
    expect(readSkeletonLayout(document.id, document).nodes.start).toEqual({
      x: 200,
      y: 140,
    });
    first.unmount();
    const second = draw(document);
    expect(place_of(node_element(second.container, "start"))).toEqual({
      x: 200,
      y: 140,
    });
  });

  test("the two are laid out and remembered apart from each other", () => {
    /* One resource's drawing is not another's, and the ids that collide on a
       prototype are the ones most likely to be confused. */
    const proto = document_of("proto");
    const normal = document_of("normal");
    const a = draw(proto);
    drag(node_element(a.container, "__proto__"), { x: 10, y: 10 });
    a.unmount();
    const b = draw(normal);
    expect(place_of(node_element(b.container, "start"))).toEqual({ x: 80, y: 80 });
    expect(
      readSkeletonLayout(proto.id, proto).nodes["__proto__"],
    ).toEqual({ x: 90, y: 90 });
  });

  test("none of it reaches the document, which is what the runtime runs", () => {
    const document = document_of("proto");
    const before = JSON.stringify(document);
    const { container } = draw(document);
    drag(node_element(container, "__proto__"), { x: 77, y: 33 });
    expect(JSON.stringify(document)).toBe(before);
    /* Including the ids and the edge that addresses the node by id — the
       same bytes the store saved and the runtime executed. */
    expect(document.nodes.map((node) => node.id)).toEqual(["__proto__", "end"]);
    expect(document.edges[0].source_node_id).toBe("__proto__");
  });
});
