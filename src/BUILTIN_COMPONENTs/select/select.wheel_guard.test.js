// src/BUILTIN_COMPONENTs/select/select.wheel_guard.test.js
//
// Regression lock: Select renders its dropdown INLINE (no portal), absolutely
// positioned inside whatever scroll container hosts the Select (e.g. the
// Settings → appearance panel). Wheel input over an OPEN dropdown must never
// chain to that host container — CEO repro: wheel-scrolling over either
// appearance selector also scrolled the settings page behind it.
//
// `overscroll-behavior: contain` on the option list only engages once the
// list actually overflows; with few options (the appearance presets) the
// list never becomes a scroll container, so every wheel tick leaked through.
// select.js now attaches a native, non-passive `wheel` listener (via
// useDropdownWheelGuard in use_select.js) directly on the dropdown panel
// while it's open, blocking (preventDefault + stopPropagation) whenever the
// wheel lands on chrome outside the list, or the list can't consume the
// delta in that direction (not scrollable, or already at the boundary).
import React from "react";
import { render, screen } from "@testing-library/react";
import { Select } from "./select";

jest.mock("../icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src }) {
    return React.createElement("span", { "data-icon": src });
  };
});
jest.mock("../tooltip/tooltip", () => {
  const React = require("react");
  return function MockTooltip({ children, tooltip_component, open }) {
    return React.createElement(
      "div",
      null,
      children,
      open ? tooltip_component : null,
    );
  };
});

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
  { value: "c", label: "Charlie" },
];

const dispatch_wheel = (el, deltaY) => {
  const evt = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
  el.dispatchEvent(evt);
  return evt;
};

const make_scrollable = (el, { scrollHeight, clientHeight, scrollTop }) => {
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    value: scrollHeight,
  });
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    value: clientHeight,
  });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    value: scrollTop,
    writable: true,
  });
};

describe.each([
  ["default variant (Settings → appearance uses this)", {}],
  [
    "palette variant (attach panel uses this)",
    { variant: "palette", palette_chip: "test" },
  ],
])("Select dropdown wheel guard — %s", (_label, extraProps) => {
  const render_open_select = () =>
    render(
      <Select
        options={OPTIONS}
        value="a"
        set_value={() => {}}
        filterable
        filter_mode="panel"
        open
        on_open_change={() => {}}
        {...extraProps}
      />,
    );

  test("wheel over dropdown chrome (outside the list) is always blocked", () => {
    render_open_select();
    const listbox = screen.getByRole("listbox");
    const panel = listbox.parentElement;
    const evt = dispatch_wheel(panel, 100);
    expect(evt.defaultPrevented).toBe(true);
  });

  test("non-scrollable list (few options, jsdom scrollHeight===clientHeight===0): blocked", () => {
    render_open_select();
    const listbox = screen.getByRole("listbox");
    const evt = dispatch_wheel(listbox, 100);
    expect(evt.defaultPrevented).toBe(true);
  });

  test("scrollable list mid-scroll: inner scroll allowed through (not prevented)", () => {
    render_open_select();
    const listbox = screen.getByRole("listbox");
    make_scrollable(listbox, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 100,
    });
    const evt = dispatch_wheel(listbox, 50);
    expect(evt.defaultPrevented).toBe(false);
  });

  test("scrollable list already at the bottom boundary, scrolling further down: blocked", () => {
    render_open_select();
    const listbox = screen.getByRole("listbox");
    make_scrollable(listbox, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 200,
    });
    const evt = dispatch_wheel(listbox, 50);
    expect(evt.defaultPrevented).toBe(true);
  });

  test("scrollable list already at the top boundary, scrolling further up: blocked", () => {
    render_open_select();
    const listbox = screen.getByRole("listbox");
    make_scrollable(listbox, {
      scrollHeight: 300,
      clientHeight: 100,
      scrollTop: 0,
    });
    const evt = dispatch_wheel(listbox, -50);
    expect(evt.defaultPrevented).toBe(true);
  });
});
