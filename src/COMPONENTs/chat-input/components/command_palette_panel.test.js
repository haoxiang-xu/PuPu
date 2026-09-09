import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandPalettePanel from "./command_palette_panel";

/* jsdom has no ResizeObserver; the panel measures the pill row with one */
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const items = [
  { name: "/a", description: "a" },
  { name: "/b", description: "b" },
];

const renderPanel = (props = {}) =>
  render(
    <CommandPalettePanel open items={items} activeIndex={0} {...props}>
      <div>pill</div>
    </CommandPalettePanel>,
  );

describe("CommandPalettePanel organize action", () => {
  test("lives in the hint bar, not in the list, and carries its label", () => {
    renderPanel({ onOrganize: () => {}, organizeLabel: "Organize" });

    const action = document.querySelector("[data-command-organize-action]");
    expect(action).not.toBeNull();
    expect(action.textContent).toContain("Organize");
    /* it is NOT a row of the listbox. The morphing panel stays aria-hidden
       until its double-rAF entrance latch flips, so the role query has to
       look through that. */
    const listbox = screen.getByRole("listbox", {
      name: "斜杠命令",
      hidden: true,
    });
    expect(listbox.contains(action)).toBe(false);
  });

  test("re-enables pointer events for itself inside the decorative header", () => {
    renderPanel({ onOrganize: () => {}, organizeLabel: "Organize" });
    const action = document.querySelector("[data-command-organize-action]");
    const wrapper = action.parentElement;
    expect(wrapper.style.pointerEvents).toBe("auto");
  });

  test("mousedown is cancelled so the composer keeps focus; click opens", () => {
    const onOrganize = jest.fn();
    renderPanel({ onOrganize, organizeLabel: "Organize" });
    const action = document.querySelector("[data-command-organize-action]");

    // fireEvent returns false when preventDefault was called
    expect(fireEvent.mouseDown(action, { button: 0 })).toBe(false);
    expect(onOrganize).not.toHaveBeenCalled();

    fireEvent.click(action);
    expect(onOrganize).toHaveBeenCalledTimes(1);
  });

  test("the hints make room for it by dropping esc", () => {
    renderPanel({ onOrganize: () => {}, organizeLabel: "Organize" });
    expect(screen.getByText("COMMANDS · ↑↓ · ⏎")).toBeInTheDocument();
    expect(screen.queryByText(/esc/)).toBeNull();
  });

  test("without a handler there is no action and esc is back", () => {
    renderPanel();
    expect(document.querySelector("[data-command-organize-action]")).toBeNull();
    expect(screen.getByText("COMMANDS · ↑↓ · ⏎ · esc")).toBeInTheDocument();
  });
});
