import { canvas_view_insets, detail_panel_inner_edge, DETAIL_INSET, PANEL_INSET } from "./canvas_chrome";
import { active_run_node_ids, next_followed_run_node } from "./skeleton_canvas";

const rect = { left: 0, right: 1200, top: 0, bottom: 800, width: 1200, height: 800 };
const box = (right) => ({ getBoundingClientRect: () => ({ left: 0, right, top: 0, bottom: 800 }) });

describe("how far the side menus reach over the canvas", () => {
  test("both closed: nothing", () => {
    expect(canvas_view_insets(rect, {})).toEqual({ left: 0, right: 0 });
  });
  test("each menu's inner edge, in canvas pixels", () => {
    expect(canvas_view_insets(rect, { leftEdge: 320, rightEdge: 1200 - 8 - 360 })).toEqual({ left: 320, right: 368 });
  });
  test("a canvas that starts past the left menu is not covered by it", () => {
    expect(canvas_view_insets({ ...rect, left: 400, right: 1600 }, { leftEdge: 320 })).toEqual({ left: 0, right: 0 });
  });
  test("the docked right menu sits one ring inside the window anchor", () => {
    expect(detail_panel_inner_edge({ dockSlot: box(1200), container: box(999), width: 360, minWidth: 300 }))
      .toBe(1200 - DETAIL_INSET - 360);
  });
  test("floating, it sits PANEL_INSET inside its page, never narrower than its minimum", () => {
    expect(detail_panel_inner_edge({ dockSlot: null, container: box(1000), width: 200, minWidth: 300 }))
      .toBe(1000 - PANEL_INSET - 300);
  });
  test("nothing to measure: no edge", () => {
    expect(detail_panel_inner_edge({ dockSlot: null, container: null, width: 300 })).toBeNull();
  });
});

describe("which running node the canvas follows", () => {
  const states = (pairs) => new Map(pairs.map(([id, state]) => [id, { node_id: id, state }]));
  test("running and waiting nodes are where the run is; pools are not steps", () => {
    const run = states([["start", "succeeded"], ["a", "running"], ["pool", "running"], ["b", "waiting_approval"], ["c", "pending"]]);
    expect(active_run_node_ids(run, new Set(["pool"]))).toEqual(["a", "b"]);
  });
  test("the node the run has just reached is followed", () => {
    expect(next_followed_run_node(["a"], [], null)).toBe("a");
    expect(next_followed_run_node(["b"], ["a"], "a")).toBe("b");
  });
  test("a node still active stays followed while another keeps going", () => {
    expect(next_followed_run_node(["a", "b"], ["a", "b"], "a")).toBe("a");
  });
  test("of several reached at once, the last in run order", () => {
    expect(next_followed_run_node(["a", "b", "c"], ["a"], "a")).toBe("c");
  });
  test("a finished run follows nothing", () => {
    expect(next_followed_run_node([], ["a"], "a")).toBeNull();
  });
});
