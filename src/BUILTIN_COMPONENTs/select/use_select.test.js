import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import useSelect from "./use_select";

const OPTIONS = [
  { value: "first", label: "First" },
  { value: "second", label: "Second" },
  { value: "third", label: "Third" },
];

const HookHarness = () => {
  const {
    highlightedIndex,
    setHighlightedIndexFromHover,
    flatSelectable,
  } = useSelect({
    options: OPTIONS,
    value: "second",
    open: true,
    filterable: true,
    filter_mode: "panel",
  });

  return (
    <div>
      <div data-testid="highlighted-index">{String(highlightedIndex)}</div>
      <div data-testid="flat-count">{String(flatSelectable.length)}</div>
      <button onClick={() => setHighlightedIndexFromHover(0)}>
        hover first option
      </button>
    </div>
  );
};

describe("useSelect", () => {
  test("single select keeps hovered highlight instead of snapping back to the selected option", async () => {
    render(<HookHarness />);

    await waitFor(() =>
      expect(screen.getByTestId("highlighted-index")).toHaveTextContent("1"),
    );
    expect(screen.getByTestId("flat-count")).toHaveTextContent("3");

    fireEvent.click(screen.getByRole("button", { name: /hover first option/i }));

    await waitFor(() =>
      expect(screen.getByTestId("highlighted-index")).toHaveTextContent("0"),
    );
  });
});
