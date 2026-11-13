/* eslint-disable testing-library/no-node-access, testing-library/no-container -- the frame, its height and the tabs are read off the drawn DOM. */
import React from "react";
import { act, render } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import PuzzleShape from "./puzzle_shape";
import { SIZE_MOTION_EVENT, step_spring } from "./use_node_size_motion";
import { NODE_MOTION_MOUNT_GRACE_MS, NODE_SPRING, NODE_SPRING_SETTLE } from "./node_metrics";

/* jsdom lays nothing out: the content box's height is whatever the test says,
   the observer and the frame clock are driven by hand. */
let content_height = 0;
let clock = 0;
let frames = [];
let observers = [];
let reduced = false;
const original_offset = Object.getOwnPropertyDescriptor(window.HTMLElement.prototype, "offsetHeight");
const original_ro = global.ResizeObserver;
const original_raf = global.requestAnimationFrame;
const original_caf = global.cancelAnimationFrame;
const original_mm = window.matchMedia;

beforeEach(() => {
  content_height = 100;
  clock = 0;
  frames = [];
  observers = [];
  reduced = false;
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.hasAttribute && this.hasAttribute("data-puzzle-content") ? content_height : 0;
    },
  });
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  global.cancelAnimationFrame = () => {
    frames = [];
  };
  window.matchMedia = (query) => ({
    matches: query.includes("reduce") ? reduced : false,
    addEventListener() {},
    removeEventListener() {},
  });
  jest.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  if (original_offset) Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", original_offset);
  global.ResizeObserver = original_ro;
  global.requestAnimationFrame = original_raf;
  global.cancelAnimationFrame = original_caf;
  window.matchMedia = original_mm;
  jest.restoreAllMocks();
});

const config = { theme: {}, onThemeMode: "light_mode" };
const mount = (props = {}) =>
  render(
    <ConfigContext.Provider value={config}>
      <PuzzleShape tabs={[{ side: "right", y: 27 }]} cutouts={["left"]} anchor={27} isDark={false} {...props}>
        <div>content</div>
      </PuzzleShape>
    </ConfigContext.Provider>,
  );
const frame_of = (container) => container.querySelector("[data-puzzle-frame]");
const resize = (height) => {
  content_height = height;
  act(() => observers.forEach((o) => o.callback([])));
};
/* Run queued frames 1/60 s apart; returns the frame's height after each. */
const run_frames = (container, limit = 200) => {
  const heights = [];
  let guard = 0;
  while (frames.length && guard < limit) {
    const queue = frames;
    frames = [];
    clock += 1000 / 60;
    const time = clock;
    act(() => queue.forEach((callback) => callback(time)));
    heights.push(parseFloat(frame_of(container).style.height));
    guard += 1;
  }
  return heights;
};

describe("node size motion", () => {
  test("no animation on mount: the frame is pinned at the measured height, nothing scheduled", () => {
    const { container } = mount();
    expect(frame_of(container).style.height).toBe("100px");
    expect(frame_of(container).hasAttribute("data-size-motion")).toBe(false);
    expect(frames).toHaveLength(0);
  });

  test("a change inside the mount grace (graph load, fonts) lands instantly", () => {
    const { container } = mount();
    clock = NODE_MOTION_MOUNT_GRACE_MS - 1;
    resize(160);
    const heights = run_frames(container);
    expect(heights).toEqual([160]);
    expect(frame_of(container).hasAttribute("data-size-motion")).toBe(false);
  });

  test("growth after mount springs through intermediate heights, overshoots a few px, ends exactly on target", () => {
    const { container } = mount();
    const events = [];
    container.addEventListener(SIZE_MOTION_EVENT, (event) => events.push(event.detail.running));
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    resize(126);
    expect(frame_of(container).getAttribute("data-size-motion")).toBe("running");
    const heights = run_frames(container);
    expect(heights.length).toBeGreaterThan(8);
    expect(heights.some((h) => h > 100 && h < 126)).toBe(true);
    const peak = Math.max(...heights);
    expect(peak).toBeGreaterThan(126);
    expect(peak).toBeLessThan(126 + 4);
    expect(heights[heights.length - 1]).toBe(126);
    expect(frame_of(container).style.height).toBe("126px");
    expect(frame_of(container).hasAttribute("data-size-motion")).toBe(false);
    expect(events).toEqual([true, false]);
    /* settles in roughly a third of a second */
    expect(heights.length).toBeLessThan(30);
  });

  test("a re-render that grows the content starts the spring in that commit, frame still at the old height", () => {
    const view = mount();
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    content_height = 152;
    view.rerender(
      <ConfigContext.Provider value={config}>
        <PuzzleShape tabs={[{ side: "right", y: 27 }, { side: "right", y: 139 }]} cutouts={["left"]} anchor={27} isDark={false}>
          <div>content</div>
        </PuzzleShape>
      </ConfigContext.Provider>,
    );
    const frame = frame_of(view.container);
    expect(frame.style.height).toBe("100px");
    expect(frame.getAttribute("data-size-motion")).toBe("running");
    expect(frame.style.clipPath).toContain("inset(");
    /* the new outlet's bump is held inside the body while it grows */
    const tabs = view.container.querySelectorAll("[data-puzzle-tab]");
    expect(tabs[1].getAttribute("data-tab-clamped")).toBe("true");
    const heights = run_frames(view.container);
    expect(heights[heights.length - 1]).toBe(152);
    expect(frame.style.clipPath).toBe("");
  });

  test("shrinking settles without dipping below the new height", () => {
    const { container } = mount();
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    resize(60);
    const heights = run_frames(container);
    expect(heights.some((h) => h > 60 && h < 100)).toBe(true);
    expect(Math.min(...heights)).toBe(60);
    expect(heights[heights.length - 1]).toBe(60);
  });

  test("prefers-reduced-motion: every change is instant", () => {
    reduced = true;
    const { container } = mount();
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    resize(152);
    expect(frame_of(container).hasAttribute("data-size-motion")).toBe(false);
    expect(run_frames(container)).toEqual([152]);
  });

  test("tabs sit on their anchor at rest and ride inside the body only while it moves", () => {
    const { container } = mount();
    const tab = () => container.querySelector("[data-puzzle-tab]");
    expect(tab().style.top).toBe("27px");
    expect(tab().getAttribute("data-tab-y")).toBe("27px");
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    resize(140);
    expect(tab().getAttribute("data-tab-clamped")).toBe("true");
    run_frames(container);
    expect(tab().style.top).toBe("27px");
    expect(tab().hasAttribute("data-tab-clamped")).toBe(false);
  });

  test("hidden (0 px) forgets the baseline: the next height is a first measurement, not a spring", () => {
    const { container } = mount();
    clock = NODE_MOTION_MOUNT_GRACE_MS + 10;
    resize(0);
    expect(frame_of(container).style.height).toBe("");
    resize(180);
    expect(frame_of(container).style.height).toBe("180px");
    expect(frames).toHaveLength(0);
  });

  test("the spring constants are underdamped for growth and not for settling", () => {
    const zeta = (s) => s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    expect(zeta(NODE_SPRING)).toBeGreaterThan(0.5);
    expect(zeta(NODE_SPRING)).toBeLessThan(0.8);
    expect(zeta(NODE_SPRING_SETTLE)).toBeGreaterThanOrEqual(1);
    const settled = step_spring({ value: 126.1, velocity: 0, target: 126 }, NODE_SPRING, 1 / 60);
    expect(settled).toEqual({ value: 126, velocity: 0, settled: true });
  });
});
