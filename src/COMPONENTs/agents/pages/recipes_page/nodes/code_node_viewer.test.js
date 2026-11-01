/* eslint-disable testing-library/no-node-access -- the Tooltip trigger and bubble are read off the real engine's DOM. */
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import CodeNode from "./code_node";
import { managed_path, sha256_text } from "../managed_code_sources";
import { Z } from "../../../../../BUILTIN_COMPONENTs/layer/z_layers";

/* #357 AC-04, the Code node's read-only viewer, on the real Button and the
 * real Tooltip engine — nothing between them is replaced. The packaged App
 * showed a hover that never opened it (run 41273700851): the engine, in
 * controlled mode with click enabled, never reports a hover. Every way in
 * and out is driven the way a pointer drives it: enter the trigger, enter
 * the bubble, move the mouse over the window, click, Escape, press the node.
 *
 * jsdom has no layout, so each rect the engine measures is given here: the
 * trigger at the top-left, the bubble to its right, empty canvas far away. */

const TEXT = "def main(input, context):\n    rows = input[\"rows\"]\n    total = len(rows)\n    return {\"rows\": total}\n";
const SHA = sha256_text(TEXT);
const NODE = {
  id: "score",
  type: "code",
  config: {
    execution: { inputs: [], outputs: [] },
    code: { source: { kind: "file", path: managed_path(SHA) }, environment_profile_id: "builtin", timeout_ms: 5000, max_result_bytes: 4096, max_log_bytes: 4096, result_schema: null },
  },
};

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) });
const TRIGGER = rect(0, 0, 20, 20);
const BUBBLE = rect(40, 0, 440, 300);
const FAR = { clientX: 900, clientY: 700 };

let original;
beforeAll(() => {
  original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function measured() {
    if (this.getAttribute && this.getAttribute("role") === "tooltip") return BUBBLE;
    if (this.firstElementChild && this.firstElementChild.getAttribute && this.firstElementChild.getAttribute("aria-label") === "View the code of score") return TRIGGER;
    return rect(0, 0, 0, 0);
  };
});
afterAll(() => {
  Element.prototype.getBoundingClientRect = original;
});
afterEach(() => {
  jest.useRealTimers();
});

const onOpenNode = jest.fn();
const show = (props = {}) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <CodeNode node={NODE} isDark={false} onOpenNode={onOpenNode} sources={{ [SHA]: TEXT }} {...props} />
  </ConfigContext.Provider>,
);
const node = () => screen.getByTestId("code-node-score");
const button = () => screen.getByRole("button", { name: "View the code of score" });
/* The Tooltip's own trigger box: the element that carries its pointer handlers. */
const trigger = () => button().parentElement;
const bubble = () => document.querySelector('[role="tooltip"]');
const isOpen = () => node().getAttribute("data-viewer-open") === "true";
/* The engine waits open_delay / close_delay (80ms) before it reports. */
const settle = () => act(() => { jest.advanceTimersByTime(200); });

/* The pointer leaving the button: the box around it sees the leave, then the
   window sees the move away. */
const leaveButton = () => {
  fireEvent.mouseLeave(screen.getByTestId("code-node-score-expand"));
  fireEvent.mouseMove(window, FAR);
  settle();
};
const hoverButton = () => {
  fireEvent.mouseEnter(node());
  fireEvent.mouseMove(window, { clientX: 10, clientY: 10 });
  fireEvent.mouseEnter(trigger());
  settle();
};

beforeEach(() => {
  jest.useFakeTimers();
  onOpenNode.mockReset();
});

test("hovering the expand button opens the read-only viewer, with no press", () => {
  show();
  expect(isOpen()).toBe(false);
  hoverButton();
  expect(isOpen()).toBe(true);
  expect(screen.getByTestId("code-node-score-viewer")).toHaveTextContent("Read-only · 4 lines");
});

test("moving from the button into the viewer keeps it open; leaving both closes it", () => {
  show();
  hoverButton();
  expect(isOpen()).toBe(true);
  fireEvent.mouseEnter(bubble());
  fireEvent.mouseMove(window, { clientX: 200, clientY: 120 });
  settle();
  expect(isOpen()).toBe(true);
  fireEvent.mouseMove(window, FAR);
  settle();
  expect(isOpen()).toBe(false);
});

test("a click pins it: the pointer leaving no longer closes it; a second click unpins", () => {
  show();
  hoverButton();
  fireEvent.click(button());
  settle();
  expect(isOpen()).toBe(true);
  fireEvent.mouseMove(window, FAR);
  settle();
  expect(isOpen()).toBe(true);
  fireEvent.mouseEnter(trigger());
  fireEvent.click(button());
  fireEvent.mouseMove(window, FAR);
  settle();
  expect(isOpen()).toBe(false);
});

test("Escape closes the viewer and goes no further", () => {
  const outer = jest.fn();
  window.addEventListener("keydown", outer);
  try {
    show();
    hoverButton();
    fireEvent.click(button());
    settle();
    expect(isOpen()).toBe(true);
    fireEvent.keyDown(document.activeElement || document.body, { key: "Escape" });
    settle();
    expect(isOpen()).toBe(false);
    /* The Agents modal listens on window; the viewer was the top layer. */
    expect(outer).not.toHaveBeenCalled();
    /* The pointer is still on the button: closed stays closed until it
       leaves and comes back. */
    fireEvent.mouseMove(window, { clientX: 10, clientY: 10 });
    settle();
    expect(isOpen()).toBe(false);
    leaveButton();
    hoverButton();
    expect(isOpen()).toBe(true);
    leaveButton();
    expect(isOpen()).toBe(false);
    /* With nothing open, Escape is not the node's to take. */
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(outer).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener("keydown", outer);
  }
});

test("a press on the node closes it and a hover cannot reopen it until the button is released", () => {
  show();
  hoverButton();
  expect(isOpen()).toBe(true);
  fireEvent.mouseDown(screen.getByTestId("code-node-score-block"), { button: 0 });
  settle();
  expect(isOpen()).toBe(false);
  fireEvent.mouseMove(window, FAR);
  hoverButton();
  expect(isOpen()).toBe(false);
  fireEvent.click(button());
  settle();
  expect(isOpen()).toBe(false);
  fireEvent.mouseUp(window);
  /* Released with the pointer still there: no reopening by itself. */
  settle();
  expect(isOpen()).toBe(false);
  leaveButton();
  hoverButton();
  expect(isOpen()).toBe(true);
});

test("below half zoom there is no block and no button to hover", () => {
  show({ lowZoom: true });
  expect(screen.queryByTestId("code-node-score-block")).toBeNull();
  expect(screen.queryByRole("button", { name: "View the code of score" })).toBeNull();
  expect(node()).toHaveTextContent("Code · builtin");
});

test("the viewer opened by hover sits on the popover layer", () => {
  show();
  hoverButton();
  expect(bubble().style.zIndex).toBe(String(Z.POPOVER));
  expect(bubble().style.zIndex).not.toBe(String(Z.TOOLTIP));
});
