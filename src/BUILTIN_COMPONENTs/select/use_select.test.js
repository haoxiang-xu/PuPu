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

/* Drives the real select_option so close-on-select semantics are asserted
   against the hook that owns them, not against a component-level fake. */
const SelectHarness = ({ keep_open_on_select, set_value, on_open_change }) => {
  const { select_option } = useSelect({
    options: OPTIONS,
    value: "second",
    open: true,
    set_value,
    on_open_change,
    keep_open_on_select,
  });

  return (
    <div>
      {OPTIONS.map((option) => (
        <button key={option.value} onClick={() => select_option(option)}>
          {option.label}
        </button>
      ))}
    </div>
  );
};

describe("useSelect keep_open_on_select", () => {
  const pick = (label) =>
    fireEvent.click(screen.getByRole("button", { name: label }));

  test("closes on pick by default — unchanged historical behaviour", () => {
    const on_open_change = jest.fn();
    const set_value = jest.fn();
    render(
      <SelectHarness set_value={set_value} on_open_change={on_open_change} />,
    );

    pick("First");
    expect(set_value).toHaveBeenCalledWith("first", expect.anything());
    expect(on_open_change).toHaveBeenCalledWith(false);
  });

  test("a true predicate keeps the panel open while still committing the value", () => {
    const on_open_change = jest.fn();
    const set_value = jest.fn();
    render(
      <SelectHarness
        keep_open_on_select={() => true}
        set_value={set_value}
        on_open_change={on_open_change}
      />,
    );

    pick("First");
    expect(set_value).toHaveBeenCalledWith("first", expect.anything());
    expect(on_open_change).not.toHaveBeenCalled();
  });

  test("the predicate is consulted per option", () => {
    const on_open_change = jest.fn();
    render(
      <SelectHarness
        keep_open_on_select={(option) => option.value === "first"}
        set_value={() => {}}
        on_open_change={on_open_change}
      />,
    );

    pick("First");
    expect(on_open_change).not.toHaveBeenCalled();

    pick("Third");
    expect(on_open_change).toHaveBeenCalledWith(false);
  });

  test("a non-true predicate result closes — only an explicit true pins open", () => {
    const on_open_change = jest.fn();
    render(
      <SelectHarness
        keep_open_on_select={() => "yes"}
        set_value={() => {}}
        on_open_change={on_open_change}
      />,
    );

    pick("First");
    expect(on_open_change).toHaveBeenCalledWith(false);
  });
});

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
