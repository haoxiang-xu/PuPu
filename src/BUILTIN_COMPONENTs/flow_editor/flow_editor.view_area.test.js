import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FlowEditor } from "./flow_editor";
import { visible_area_center, viewport_centering_node } from "./utils";

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const config = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={config}>{ui}</ConfigContext.Provider>;
const RECT = { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 };
const NODES = [
  { id: "start", x: 100, y: 50, ports: [] },
  { id: "other", x: 500, y: 400, ports: [] },
];
const transform_of = (container) =>
  container.querySelector('[data-flow-node-id="start"]').parentElement.style.transform;

function mount(props) {
  const utils = render(wrap(<FlowEditor nodes={NODES} edges={[]} data-testid="canvas" {...props} />));
  const canvas = utils.getByTestId("canvas");
  canvas.getBoundingClientRect = () => RECT;
  const size = (id, w, h) => {
    const el = utils.container.querySelector(`[data-flow-node-id="${id}"]`);
    Object.defineProperty(el, "offsetWidth", { value: w, configurable: true });
    Object.defineProperty(el, "offsetHeight", { value: h, configurable: true });
  };
  size("start", 120, 60);
  size("other", 100, 40);
  const again = (next) => utils.rerender(wrap(<FlowEditor nodes={NODES} edges={[]} data-testid="canvas" {...next} />));
  return { ...utils, canvas, again };
}

describe("the visible area's middle", () => {
  test("is the canvas middle without panels", () => {
    expect(visible_area_center(800, 600, null)).toEqual({ x: 400, y: 300 });
  });
  test("is the middle of what the panels leave", () => {
    expect(visible_area_center(800, 600, { left: 200, right: 100 })).toEqual({ x: 450, y: 300 });
    expect(visible_area_center(800, 600, { top: 40, bottom: 80 })).toEqual({ x: 400, y: 280 });
  });
  test("ignores insets that are not a size, and panels that leave nothing", () => {
    expect(visible_area_center(800, 600, { left: -50, right: NaN })).toEqual({ x: 400, y: 300 });
    expect(visible_area_center(800, 600, { left: 500, right: 400 })).toEqual({ x: 400, y: 300 });
  });
  test("puts a node's middle on it at the given zoom", () => {
    expect(viewport_centering_node({ x: 500, y: 400 }, { width: 100, height: 40 }, { x: 450, y: 300 }, 0.5))
      .toEqual({ x: 175, y: 90, zoom: 0.5 });
  });
});

describe("Go to start centers between the side menus", () => {
  test("with a view area, the Start node lands in the middle of it, at zoom 1", () => {
    const { again, container } = mount({ reset_token: 0, reset_focus_node_id: "start" });
    again({ reset_token: 1, reset_focus_node_id: "start", view_area: { left: 200, right: 100 } });
    // visible middle (450, 300); node middle (160, 80) → (290, 220)
    expect(transform_of(container)).toBe("translate(290px, 220px) scale(1)");
  });

  test("the view area is asked at the moment of centering, with the canvas rect", () => {
    const view_area = jest.fn(() => ({ left: 300, right: 0 }));
    const { again, container } = mount({ reset_token: 0, reset_focus_node_id: "start", view_area });
    view_area.mockClear();
    again({ reset_token: 1, reset_focus_node_id: "start", view_area });
    expect(view_area).toHaveBeenCalledWith(RECT);
    // visible middle (550, 300) → (390, 220)
    expect(transform_of(container)).toBe("translate(390px, 220px) scale(1)");
  });
});

describe("following a node", () => {
  let frames;
  let now;
  beforeEach(() => {
    frames = [];
    now = 0;
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames[id - 1] = null;
    });
    jest.spyOn(performance, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());
  const flush = (to) => {
    now = to;
    const due = frames;
    frames = [];
    due.forEach((cb) => cb && cb(now));
  };
  const zoomed = { x: 0, y: 0, zoom: 0.5, token: "r" };

  test("glides to the middle of the visible area and keeps the zoom", () => {
    const view_area = () => ({ left: 200, right: 100 });
    const { again, container } = mount({ restore_viewport: zoomed, view_area });
    expect(transform_of(container)).toBe("translate(0px, 0px) scale(0.5)");
    again({ restore_viewport: zoomed, view_area, follow_node_id: "other" });
    flush(160);
    const mid = transform_of(container);
    expect(mid).not.toBe("translate(0px, 0px) scale(0.5)");
    expect(mid).not.toBe("translate(175px, 90px) scale(0.5)");
    flush(400);
    expect(transform_of(container)).toBe("translate(175px, 90px) scale(0.5)");
    expect(frames.filter(Boolean)).toHaveLength(0);
  });

  test("moves on when the followed node changes", () => {
    const view_area = () => ({ left: 200, right: 100 });
    const { again, container } = mount({ restore_viewport: zoomed, view_area });
    again({ restore_viewport: zoomed, view_area, follow_node_id: "other" });
    flush(1000);
    expect(transform_of(container)).toBe("translate(175px, 90px) scale(0.5)");
    again({ restore_viewport: zoomed, view_area, follow_node_id: "start" });
    flush(2000);
    // node middle (160, 80) at 0.5 → (450-80, 300-40)
    expect(transform_of(container)).toBe("translate(370px, 260px) scale(0.5)");
  });

  test("a press on the canvas stops the glide where it is", () => {
    const { again, container, canvas } = mount({ restore_viewport: zoomed });
    again({ restore_viewport: zoomed, follow_node_id: "other" });
    flush(100);
    const stopped = transform_of(container);
    fireEvent.mouseDown(canvas, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(window, { clientX: 10, clientY: 10 });
    flush(1000);
    expect(transform_of(container)).toBe(stopped);
  });

  test("no node to follow leaves the viewport alone", () => {
    const { again, container } = mount({ restore_viewport: zoomed });
    again({ restore_viewport: zoomed, follow_node_id: null });
    again({ restore_viewport: zoomed, follow_node_id: "missing" });
    flush(1000);
    expect(transform_of(container)).toBe("translate(0px, 0px) scale(0.5)");
  });
});
