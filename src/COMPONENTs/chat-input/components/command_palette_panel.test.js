import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandPalettePanel from "./command_palette_panel";
import { commandListHeight } from "./command_menu";

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

describe("CommandPalettePanel list scrolling", () => {
  /* The panel, not the menu, is the scroll host. PuPu's scrollbar is the
     overlay thumb that `.scrollable` attaches to a container's parent, and
     its track is laid out here against the panel's own frame: it starts
     where the 22px corner begins and stops the same distance short of the
     bottom. Boxed inside the panel with its own inset, the menu could only
     ever run the thumb from the corner to the hint bar. */
  test("the list slot is the scroll host and carries PuPu's overlay scrollbar", () => {
    renderPanel();
    const host = document.querySelector("[data-command-list-scroll]");
    expect(host).not.toBeNull();
    expect(host.classList.contains("scrollable")).toBe(true);
    expect(host.style.overflowY).toBe("auto");
    expect(host.style.maxHeight).toBe(
      `${commandListHeight({ rowCount: items.length, bare: true })}px`,
    );
  });

  test("the thumb's track starts where the corner begins and keeps the same room at the bottom", () => {
    renderPanel();
    const host = document.querySelector("[data-command-list-scroll]");
    // 22px radius, and the slot sits 1px inside the panel's border
    expect(host.getAttribute("data-sb-edge")).toBe("21");
    // same inset from the wall as the Select palette's thumb
    expect(host.getAttribute("data-sb-wall")).toBe("2");
  });

  test("the menu inside no longer scrolls on its own", () => {
    renderPanel();
    const listbox = screen.getByRole("listbox", {
      name: "斜杠命令",
      hidden: true,
    });
    expect(listbox.classList.contains("scrollable")).toBe(false);
    expect(listbox.style.maxHeight).toBe("");
    expect(listbox.style.overflowY).toBe("");
  });
});

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
