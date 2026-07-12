// Regression: large minimap jumps remap the bounded rail in one paint.
// The rejected glide/rAF interpolation must not return.
import { render } from "@testing-library/react";
import MessageMinimap from "./components/message_minimap";

const msg = (id, role) => ({ id, role, content: "x".repeat(80) });

let rafQueue = [];
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

beforeEach(() => {
  rafQueue = [];
  window.requestAnimationFrame = (callback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  };
  window.cancelAnimationFrame = () => {};
});

afterEach(() => {
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  document.body.innerHTML = "";
});

const flushFrame = () => {
  const queued = rafQueue;
  rafQueue = [];
  queued.forEach((callback) => callback());
};

const setup = () => {
  const host = document.createElement("div");
  Object.defineProperty(host, "clientHeight", {
    value: 400,
    configurable: true,
  });
  Object.defineProperty(host, "scrollHeight", {
    value: 3000,
    configurable: true,
  });
  host.scrollTop = 0;
  document.body.appendChild(host);

  const messages = Array.from({ length: 30 }, (_, index) =>
    msg(`m${index}`, index % 2 ? "assistant" : "user"),
  );
  const nodeMap = new Map();
  messages.forEach((_, index) => {
    nodeMap.set(index, {
      offsetTop: index * 100,
      offsetHeight: 100,
    });
  });

  const props = {
    messagesRef: { current: host },
    messageNodeRefs: { current: nodeMap },
    messages,
    safeVisibleStart: 0,
    scrollToMessageIndex: jest.fn(() => true),
    bottomViewportInset: 0,
    isDark: true,
    isStreaming: false,
  };
  const utils = render(<MessageMinimap {...props} />);
  return { host, props, ...utils };
};

const hiddenAbove = (container) => {
  const text = container.querySelector("[data-mm-count-top]").textContent;
  return text ? parseInt(text.replace(/[^\d]/g, ""), 10) : 0;
};

test("large jumps remap the minimap window in one paint", () => {
  const { host, container } = setup();
  flushFrame();
  expect(hiddenAbove(container)).toBe(0);

  host.scrollTop = 2500;
  host.dispatchEvent(new Event("scroll"));
  flushFrame();

  expect(hiddenAbove(container)).toBe(20);
  expect(rafQueue).toHaveLength(0);
});

test("effect reinitialization cannot restart a rejected glide", () => {
  const { host, container, props, rerender } = setup();
  flushFrame();

  host.scrollTop = 2500;
  host.dispatchEvent(new Event("scroll"));
  flushFrame();
  expect(hiddenAbove(container)).toBe(20);

  rerender(<MessageMinimap {...props} safeVisibleStart={7} />);
  expect(hiddenAbove(container)).toBe(20);
  expect(rafQueue).toHaveLength(0);
});

test("adjacent scrolling remains immediate", () => {
  const { host, container } = setup();
  flushFrame();

  host.scrollTop = 400;
  host.dispatchEvent(new Event("scroll"));
  flushFrame();

  expect(hiddenAbove(container)).toBe(1);
  expect(rafQueue).toHaveLength(0);
});
