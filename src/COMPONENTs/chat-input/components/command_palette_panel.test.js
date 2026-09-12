import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import CommandPalettePanel from "./command_palette_panel";
import { commandListCapHeight } from "./command_menu";

/* jsdom has no ResizeObserver and no layout; the panel measures the pill row
   and the list host with one. The stub records every observer so a test can
   feed it a size by hand, the way the browser would after layout. */
const observers = [];
beforeAll(() => {
  global.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      this.targets = new Set();
      observers.push(this);
    }
    observe(el) {
      this.targets.add(el);
    }
    unobserve(el) {
      this.targets.delete(el);
    }
    disconnect() {
      this.targets.clear();
    }
  };
});
beforeEach(() => {
  observers.length = 0;
});

/* Simulate layout: tell every observer watching `el` that it is `height` tall. */
const resizeTo = (el, height) => {
  act(() => {
    observers
      .filter((ro) => ro.targets.has(el))
      .forEach((ro) => ro.callback([{ target: el, contentRect: { height } }]));
  });
};

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
    /* A fixed cap, not the row count: the host is content-sized below it
       and scrolls above it, so its height is the rows' own — including
       every frame of a folder's collapse animation. */
    expect(host.style.maxHeight).toBe(
      `${commandListCapHeight({ bare: true })}px`,
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

describe("CommandPalettePanel frame follows the rows", () => {
  /* A folder collapsing is Explorer's own 280ms height animation on the
     rows. The panel's frame used to ease to a height computed from the new
     ROW COUNT — a second, differently-timed motion — while the scroll host's
     cap snapped: rows were chopped off at once and the frame drifted down
     after them (86px of empty panel at the worst frame). Now the frame is
     measured from the host every frame and, once the open morph has
     settled, changes without a transition of its own: one motion, the rows'. */
  const hostOf = () => document.querySelector("[data-command-list-scroll]");
  const panelOf = () =>
    hostOf().parentElement.parentElement.parentElement;
  const HEADER = 40 + 6 * 2; // pill fallback height + bleed on both sides

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const openAndSettle = () => {
    renderPanel();
    act(() => jest.advanceTimersByTime(50)); // double-rAF entrance latch
    act(() => jest.advanceTimersByTime(300)); // open morph (40ms delay + 210ms)
  };

  test("the frame's height is header plus the host's measured height", () => {
    openAndSettle();
    resizeTo(hostOf(), 203);
    expect(panelOf().style.height).toBe(`${HEADER + 203}px`);
    resizeTo(hostOf(), 231);
    expect(panelOf().style.height).toBe(`${HEADER + 231}px`);
  });

  test("once the open morph has settled, height changes carry no transition of their own", () => {
    openAndSettle();
    resizeTo(hostOf(), 203);
    expect(panelOf().style.transition).not.toMatch(/height/);
  });

  test("the open morph itself still eases the height", () => {
    renderPanel();
    act(() => jest.advanceTimersByTime(50)); // entered, morph in flight
    resizeTo(hostOf(), 203);
    expect(panelOf().style.transition).toMatch(/height 210ms/);
    expect(panelOf().style.height).toBe(`${HEADER + 203}px`);
  });

  test("the scrollbar's mount is a content-sized wrapper, not the reveal clip", () => {
    /* PuPu's overlay scrollbar observes the scroll host AND its parent. When
       that parent was the reveal clip — whose size follows the panel's — the
       frame's per-frame height change resized it inside the same observer
       pass, and the browser threw "ResizeObserver loop completed with
       undelivered notifications" on every frame of a fold (10 per collapse
       in-app). The wrapper is sized by its content alone, so nothing the
       frame does re-fires an observer at a shallower depth. */
    openAndSettle();
    const wrapper = hostOf().parentElement;
    const clip = wrapper.parentElement;
    expect(wrapper.style.overflow).toBe("");
    expect(wrapper.style.minHeight).toBe("");
    expect(wrapper.style.height).toBe("");
    expect(clip.style.overflow).toBe("hidden");
    // React writes a zero without a unit
    expect(parseFloat(clip.style.minHeight) || 0).toBe(0);
  });

  test("closed, the frame is the header alone whatever the host measured", () => {
    const { rerender } = renderPanel();
    resizeTo(hostOf(), 203);
    rerender(
      <CommandPalettePanel open={false} items={items} activeIndex={0}>
        <div>pill</div>
      </CommandPalettePanel>,
    );
    expect(panelOf().style.height).toBe(`${HEADER}px`);
    expect(panelOf().style.transition).toMatch(/height 150ms/);
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
