import React from "react";
import { act, render } from "@testing-library/react";
import {
  DRILL_TRAIL_RELEASE_MS,
  clearAgentsDrillTrail,
  resetAgentsDrillTrail,
  drillTrailCrumbs,
  getAgentsDrillTrail,
  setAgentsDrillTrail,
  usePublishAgentsDrillTrail,
} from "./agents_drill_trail";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  resetAgentsDrillTrail();
  jest.useRealTimers();
});
const release = () => act(() => { jest.advanceTimersByTime(DRILL_TRAIL_RELEASE_MS); });

test("one editor cannot clear a trail another one published", () => {
  const a = {};
  const b = {};
  setAgentsDrillTrail(a, [{ key: "drill-0", label: "A", depth: null }], jest.fn());
  setAgentsDrillTrail(b, [{ key: "drill-0", label: "B", depth: null }], jest.fn());
  clearAgentsDrillTrail(a);
  release();
  expect(getAgentsDrillTrail().segments[0].label).toBe("B");
  clearAgentsDrillTrail(b);
  release();
  expect(getAgentsDrillTrail()).toBeNull();
});

test("a published trail becomes crumbs: icon and name, and a click on a graph left behind goes back to it", () => {
  const navigate = jest.fn();
  function Editor({ segments }) {
    usePublishAgentsDrillTrail(segments, navigate);
    return null;
  }
  const segments = [
    { key: "drill-0", label: "Reviewer", depth: 0, presentation: null, ariaLabel: "Back to Reviewer" },
    { key: "drill-1", label: "Summarizer", depth: null, icon: "bot", hint: "Esc" },
  ];
  const view = render(<Editor segments={segments} />);
  const crumbs = drillTrailCrumbs(getAgentsDrillTrail());
  expect(crumbs.map((crumb) => [crumb.key, crumb.label, crumb.showLabel])).toEqual([
    ["drill-0", "Reviewer", true],
    ["drill-1", "Summarizer", true],
  ]);
  expect(crumbs[0].presentation).toBeNull();
  expect(crumbs[1].icon).toBe("bot");
  expect(crumbs[1].onClick).toBeUndefined();
  act(() => crumbs[0].onClick());
  expect(navigate).toHaveBeenCalledWith(0);
  /* Nothing drilled is no trail; leaving takes it back. */
  view.rerender(<Editor segments={[]} />);
  release();
  expect(getAgentsDrillTrail()).toBeNull();
  view.rerender(<Editor segments={segments} />);
  view.unmount();
  release();
  expect(getAgentsDrillTrail()).toBeNull();
});

test("switching editors swaps the trail in place: it never passes through no trail", () => {
  const seen = [];
  const unsubscribe = require("./agents_drill_trail").subscribeAgentsDrillTrail(() => {
    const now = getAgentsDrillTrail();
    seen.push(now ? now.segments[0].label : null);
  });
  function Editor({ label }) {
    usePublishAgentsDrillTrail([{ key: "drill-0", label, depth: null }], jest.fn());
    return null;
  }
  /* One Agent's editor unmounts, the next mounts a moment later. */
  const first = render(<Editor label="Explore" />);
  first.unmount();
  act(() => { jest.advanceTimersByTime(30); });
  render(<Editor label="Default" />);
  release();
  expect(seen).toEqual(["Explore", "Default"]);
  unsubscribe();
});

test("a trail nobody replaces leaves after the hold", () => {
  const owner = {};
  setAgentsDrillTrail(owner, [{ key: "drill-0", label: "A", depth: null }], jest.fn());
  clearAgentsDrillTrail(owner);
  expect(getAgentsDrillTrail()).not.toBeNull();
  act(() => { jest.advanceTimersByTime(DRILL_TRAIL_RELEASE_MS - 1); });
  expect(getAgentsDrillTrail()).not.toBeNull();
  act(() => { jest.advanceTimersByTime(1); });
  expect(getAgentsDrillTrail()).toBeNull();
});
