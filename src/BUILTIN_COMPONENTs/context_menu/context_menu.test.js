import { render, screen, fireEvent } from "@testing-library/react";
import ContextMenu, { measureMenuHeight } from "./context_menu";

const ROW_H = 28;
const SEPARATOR_H = 9;
const PANEL_PADDING_Y = 8;

/* The formula this replaced, kept here so the difference stays visible. */
const old_formula = (items) => items.length * 32;

const rows = (...labels) => labels.map((label) => ({ id: label, label }));
const sep = { type: "separator" };

function open(items, { x = 0, y = 0 } = {}) {
  return render(
    <ContextMenu visible x={x} y={y} items={items} onClose={() => {}} isDark={false} />,
  );
}

function panel() {
  /* The panel is the portalled fixed-position box. */
  return document.querySelector('div[style*="position: fixed"]');
}

describe("measureMenuHeight", () => {
  test("a menu with no separators is rows plus the panel's padding", () => {
    const items = rows("a", "b", "c");
    expect(measureMenuHeight(items)).toBe(3 * ROW_H + PANEL_PADDING_Y);
  });

  test("a separator counts as 9px, not as a row", () => {
    const items = [...rows("a", "b"), sep, ...rows("c")];
    expect(measureMenuHeight(items)).toBe(
      3 * ROW_H + SEPARATOR_H + PANEL_PADDING_Y,
    );
  });

  test("the old formula overstated exactly the menus that use separators", () => {
    const flat = rows("a", "b", "c");
    const separated = [...rows("a", "b"), sep, ...rows("c")];

    /* Without separators the old formula was already wrong, but harmlessly so
     * — it over-reserved by a constant. With separators it is wrong by much
     * more, and that is what moved real menus. */
    expect(old_formula(separated) - measureMenuHeight(separated)).toBeGreaterThan(
      old_formula(flat) - measureMenuHeight(flat),
    );
    expect(measureMenuHeight(separated)).toBeLessThan(old_formula(separated));
  });

  test("an empty or missing list measures only the panel's padding", () => {
    expect(measureMenuHeight([])).toBe(PANEL_PADDING_Y);
    expect(measureMenuHeight(undefined)).toBe(PANEL_PADDING_Y);
  });
});

describe("ContextMenu placement", () => {
  const H = window.innerHeight;

  test("a menu opened with room below starts at the pointer", () => {
    open(rows("a", "b"), { x: 40, y: 40 });
    expect(panel().style.top).toBe("40px");
    expect(panel().style.left).toBe("40px");
  });

  test("a separator-bearing menu opened near the bottom stays on screen", () => {
    const items = [...rows("a", "b"), sep, ...rows("c", "d"), sep, ...rows("e")];
    open(items, { x: 10, y: H - 20 });

    const top = parseFloat(panel().style.top);
    const height = measureMenuHeight(items);
    expect(top + height).toBeLessThanOrEqual(H);

    /* And it is not pushed further up than it needs to be: the old formula
     * would have reserved more room and placed the panel higher. */
    const old_top = Math.min(H - 20, H - old_formula(items) - 8);
    expect(top).toBeGreaterThan(old_top);
  });

  test("a menu wider than the space to the right flips to the left", () => {
    open(rows("a"), { x: window.innerWidth - 4, y: 10 });
    expect(parseFloat(panel().style.left)).toBeLessThan(window.innerWidth - 4);
  });
});

describe("ContextMenu rows", () => {
  test("a trailing value renders next to the label", () => {
    open([{ id: "del", label: "Delete", trail: "⌫" }]);
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("⌫")).toBeInTheDocument();
  });

  test("a disabled row carries its reason in the same slot", () => {
    open([{ id: "del", label: "Delete", disabled: true, trail: "required" }]);
    expect(screen.getByText("required")).toBeInTheDocument();
  });

  test("a row without a trailing value renders none", () => {
    /* The menu portals to document.body, so assert against the screen rather
     * than render()'s container. */
    open([{ id: "a", label: "Rename" }]);
    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(panel().querySelectorAll("span")).not.toHaveLength(0);
    expect(screen.queryByText("⌫")).not.toBeInTheDocument();
  });

  test("Escape closes the menu and never reaches the window (the modal underneath)", () => {
    const onClose = jest.fn();
    const windowSpy = jest.fn();
    window.addEventListener("keydown", windowSpy);
    render(
      <ContextMenu visible x={0} y={0} items={rows("a")} onClose={onClose} isDark={false} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    window.removeEventListener("keydown", windowSpy);
    expect(onClose).toHaveBeenCalled();
    /* A Modal listens on window; stopPropagation at document keeps this
     * keypress from closing it together with the menu. */
    expect(windowSpy).not.toHaveBeenCalled();
  });

  test("nothing renders while hidden", () => {
    render(
      <ContextMenu
        visible={false}
        x={0}
        y={0}
        items={rows("a")}
        onClose={() => {}}
        isDark={false}
      />,
    );
    expect(screen.queryByText("a")).not.toBeInTheDocument();
  });
});
