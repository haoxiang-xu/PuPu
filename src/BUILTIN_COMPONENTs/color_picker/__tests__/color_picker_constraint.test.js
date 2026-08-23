import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../color_picker";

const renderPicker = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ onThemeMode: "dark_mode", theme: {} }}>
      <ColorPicker default_open panel="rectangular" show_alpha={false} {...props} />
    </ConfigContext.Provider>,
  );

const DARK_SHELL = {
  bands: [[0, 0.1]],
  hint: "Dark shell — light colors blocked",
};

describe("ColorPicker constraint prop", () => {
  test("is inert by default — no overlay, no LIMIT row", () => {
    renderPicker();
    expect(screen.queryByTestId("color-picker-blocked-region")).toBeNull();
    expect(screen.queryByTestId("color-picker-limit-hint")).toBeNull();
  });

  test("renders the blocked region and the limit hint when constrained", () => {
    renderPicker({ constraint: DARK_SHELL });
    expect(screen.getByTestId("color-picker-blocked-region")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-limit-hint")).toHaveTextContent(
      "Dark shell",
    );
  });

  test("an illegal typed hex is corrected on commit and the change is disclosed", () => {
    const onCommit = jest.fn();
    renderPicker({ constraint: DARK_SHELL, onCommit, value: "#121212" });

    const input = screen
      .getByTestId("color-picker-value-hex")
      .querySelector("input");
    fireEvent.change(input, { target: { value: "#ffffff" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalled();
    const committed = onCommit.mock.calls.at(-1)[0];
    expect(committed.toLowerCase()).not.toBe("#ffffff");

    /* the correction must be visible, never silent */
    expect(screen.getByTestId("color-picker-limit-hint")).toHaveTextContent(
      /Adjusted to/i,
    );
  });

  test("a legal typed hex commits untouched and shows no correction notice", () => {
    const onCommit = jest.fn();
    renderPicker({ constraint: DARK_SHELL, onCommit, value: "#121212" });

    const input = screen
      .getByTestId("color-picker-value-hex")
      .querySelector("input");
    fireEvent.change(input, { target: { value: "#0a0a0a" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onCommit).toHaveBeenCalledWith("#0a0a0a");
    expect(screen.getByTestId("color-picker-limit-hint")).toHaveTextContent(
      "Dark shell",
    );
  });
});

describe("ColorPicker size prop", () => {
  test("compact shrinks the trigger without touching the default", () => {
    const { unmount } = render(
      <ConfigContext.Provider value={{ onThemeMode: "dark_mode", theme: {} }}>
        <ColorPicker value="#121212" size="compact" />
      </ConfigContext.Provider>,
    );
    const compactHex = screen.getByText("#121212");
    expect(compactHex).toHaveStyle({ fontSize: "11px" });
    unmount();

    render(
      <ConfigContext.Provider value={{ onThemeMode: "dark_mode", theme: {} }}>
        <ColorPicker value="#121212" />
      </ConfigContext.Provider>,
    );
    expect(screen.getByText("#121212")).toHaveStyle({ fontSize: "13px" });
  });
});
