/* The palette's footer row collapses instead of unmounting.
   A model with no effort levels must leave the panel exactly as it was
   before the feature existed — no separator, no band of empty height —
   while a model that has them expands the row smoothly rather than
   snapping the whole dropdown to a new height. */
import { render, screen } from "@testing-library/react";
import { Select } from "./select";

const OPTIONS = [{ value: "a", label: "Alpha" }];

const renderPalette = (palette_footer) => {
  const { container, unmount } = render(
    <Select
      options={OPTIONS}
      value={null}
      set_value={() => {}}
      open
      on_open_change={() => {}}
      variant="palette"
      palette_chip="model"
      palette_rail
      search_placeholder="Search models…"
      palette_footer={palette_footer}
    />,
  );
  // Tooltip renders the dropdown into document.body, not into container.
  const grid = [...document.querySelectorAll("div")].find(
    (d) => d.style.gridTemplateRows === "0fr" || d.style.gridTemplateRows === "1fr",
  );
  return { grid, container, unmount };
};

test("no footer content: the row is collapsed to zero and animatable", () => {
  const { grid } = renderPalette(null);
  expect(grid).toBeTruthy();
  expect(grid.style.gridTemplateRows).toBe("0fr");
  // the separator lives inside the clipped child, so nothing is drawn
  expect(grid.textContent).toBe("");
  expect(grid.style.transition).toContain("grid-template-rows");
});

test("with footer content: the row is open", () => {
  const { grid } = renderPalette(<span>effort row</span>);
  expect(grid.style.gridTemplateRows).toBe("1fr");
  expect(grid.textContent).toContain("effort row");
});
