/* palette_tree: the pill follows the pointer onto a folder row. The
   keyboard's highlight only names options, so the tree is told which row
   the pointer is on; an option hovered or an arrow key hands it back. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Select } from "./select";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];

test("a hovered folder holds the pill until the highlight moves", () => {
  let last = null;
  render(
    <Select
      options={OPTIONS}
      value="a"
      set_value={() => {}}
      open
      on_open_change={() => {}}
      variant="palette"
      palette_tree={(args) => {
        last = args;
        return (
          <div>
            <div data-testid="folder" onMouseEnter={() => args.on_hover_row("folder:x")}>Folder</div>
            {OPTIONS.map((o) => <div key={o.value}>{args.render_option(o)}</div>)}
          </div>
        );
      }}
    />,
  );
  expect(last.highlighted_value).toBe("a");
  act(() => last.on_hover_row("folder:x"));
  expect(last.highlighted_value).toBe("folder:x");
  /* back onto the very option that was highlighted: the pill comes back */
  fireEvent.mouseEnter(screen.getAllByRole("option", { hidden: true })[0]);
  expect(last.highlighted_value).toBe("a");
  act(() => last.on_hover_row("folder:x"));
  /* an arrow key moves the highlight: the folder lets go */
  fireEvent.keyDown(screen.getByRole("listbox", { hidden: true }).parentElement, { key: "ArrowDown" });
  expect(last.highlighted_value).toBe("b");
});

test("a tree that reports no rows: the pointer off the options shows no pill", () => {
  let last = null;
  render(
    <Select
      options={OPTIONS}
      value="a"
      set_value={() => {}}
      open
      on_open_change={() => {}}
      variant="palette"
      palette_tree={(args) => {
        last = args;
        return (
          <div>
            <div data-testid="folder">Folder</div>
            {OPTIONS.map((o) => <div key={o.value}>{args.render_option(o)}</div>)}
          </div>
        );
      }}
    />,
  );
  fireEvent.mouseOver(screen.getByTestId("folder"));
  expect(last.highlighted_value).toBe(null);
});
