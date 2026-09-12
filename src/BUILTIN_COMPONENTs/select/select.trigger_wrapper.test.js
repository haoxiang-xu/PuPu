/* A custom trigger inside a full-width host (a menu row) must be able to
   stretch to that host: the Tooltip wrapper around the trigger is inline-flex
   and would otherwise shrink the row to its content. */
import { render, screen } from "@testing-library/react";
import { Select } from "./select";

const OPTIONS = [{ value: "a", label: "Alpha" }];

test("trigger_wrapper_style reaches the wrapper around a custom trigger", () => {
  render(
    <Select
      options={OPTIONS}
      value={[]}
      set_value={() => {}}
      multi
      variant="palette"
      search_placeholder="Search plugins..."
      custom_trigger={<div data-testid="my-trigger">row</div>}
      trigger_wrapper_style={{ width: "100%", display: "flex" }}
    />,
  );
  const wrapper = screen.getByTestId("my-trigger").parentElement;
  expect(wrapper.style.width).toBe("100%");
  expect(wrapper.style.display).toBe("flex");
});

test("without it the wrapper keeps its inline-flex default", () => {
  render(
    <Select
      options={OPTIONS}
      value={[]}
      set_value={() => {}}
      multi
      variant="palette"
      search_placeholder="Search plugins..."
      custom_trigger={<div data-testid="my-trigger">row</div>}
    />,
  );
  const wrapper = screen.getByTestId("my-trigger").parentElement;
  expect(wrapper.style.display).toBe("inline-flex");
});
