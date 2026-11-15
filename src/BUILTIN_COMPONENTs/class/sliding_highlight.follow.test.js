import React, { useRef } from "react";
import { act, render } from "@testing-library/react";
import SlidingHighlight from "./sliding_highlight";

/* A folder above the highlighted row folds over 280ms. Neither the index nor
   measureKey changes while it does, so the pill has to follow the row by
   itself — the bug was a pill measured once at the toggle and left a row
   away from the pointer. jsdom has no layout: offsetTop comes off a data
   attribute, and ResizeObserver is a fake whose callbacks the test fires. */
let observers = [];
const savedRO = window.ResizeObserver;
const savedTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
const savedParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

beforeAll(() => {
  window.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(el) { this.targets.push(el); }
    disconnect() { observers = observers.filter((o) => o !== this); }
  };
  Object.defineProperty(HTMLElement.prototype, "offsetTop", {
    configurable: true,
    get() { return Number(this.getAttribute("data-offset-top") || 0); },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      let node = this.parentElement;
      while (node && !node.hasAttribute("data-positioned")) node = node.parentElement;
      return node;
    },
  });
});

afterAll(() => {
  window.ResizeObserver = savedRO;
  if (savedTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", savedTop);
  if (savedParent) Object.defineProperty(HTMLElement.prototype, "offsetParent", savedParent);
});

const Fixture = () => {
  const refs = useRef([]);
  return (
    <div data-positioned>
      <SlidingHighlight refs={refs} index={0} color="red" borderRadius={14} measureKey="k" />
      <div data-testid="row" data-offset-top="190" ref={(el) => { refs.current[0] = el; }} />
    </div>
  );
};

test("the pill follows its row when the rows move under it", () => {
  const { container, getByTestId } = render(<Fixture />);
  const pill = container.querySelector('span[aria-hidden="true"]');
  expect(pill.style.transform).toBe("translate(0px, 190px)");

  /* the folder above folds: the row ends up 28px higher, host resizes */
  getByTestId("row").setAttribute("data-offset-top", "162");
  act(() => observers.forEach((o) => o.cb([])));
  expect(pill.style.transform).toBe("translate(0px, 162px)");
  /* following a moving row snaps, it does not slide behind it */
  expect(pill.style.transition).toBe("none");
});
