import { fireEvent, render, screen } from "@testing-library/react";
import PluginListRow from "./plugin_list_row";

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  ToolkitIconFrame: () => <span data-testid="icon" />,
}));

describe("PluginListRow", () => {
  test("renders the name and, when given, the description", () => {
    render(<PluginListRow name="Plan" description="Plan before you build" />);

    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Plan before you build")).toBeInTheDocument();
  });

  test("renders a command chip when a command is given, and omits it otherwise", () => {
    const { rerender } = render(<PluginListRow name="Plan" command="/plan" />);
    expect(screen.getByText("/plan")).toBeInTheDocument();

    rerender(<PluginListRow name="Core" />);
    expect(screen.queryByText("/plan")).not.toBeInTheDocument();
  });

  test("clicking the row calls onOpenDetail", () => {
    const onOpenDetail = jest.fn();
    render(<PluginListRow name="Plan" onOpenDetail={onOpenDetail} />);

    fireEvent.click(screen.getByText("Plan"));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  test("renders the right-slot children", () => {
    render(
      <PluginListRow name="Plan">
        <button>toggle</button>
      </PluginListRow>,
    );

    expect(screen.getByText("toggle")).toBeInTheDocument();
  });

  test("clicking inside the right slot does not also trigger onOpenDetail", () => {
    const onOpenDetail = jest.fn();
    render(
      <PluginListRow name="Plan" onOpenDetail={onOpenDetail}>
        <button>toggle</button>
      </PluginListRow>,
    );

    fireEvent.click(screen.getByText("toggle"));

    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  /* store-final (2026-07-17): the Store page's Skills segment puts the
     command chip BEFORE the name (mockup screen ② `.rnm` order) — off by
     default so every other caller keeps the name-first order. */
  describe("commandFirst", () => {
    test("defaults to name-first order", () => {
      const { container } = render(<PluginListRow name="Plan" command="/plan" />);

      const rnm = container.querySelector('[data-testid="icon"]').nextSibling
        .firstChild;
      expect(rnm.firstChild.textContent).toBe("Plan");
      expect(rnm.lastChild.textContent).toBe("/plan");
    });

    test("when true, renders the command chip before the name", () => {
      const { container } = render(
        <PluginListRow name="Plan" command="/plan" commandFirst />,
      );

      const rnm = container.querySelector('[data-testid="icon"]').nextSibling
        .firstChild;
      expect(rnm.firstChild.textContent).toBe("/plan");
      expect(rnm.lastChild.textContent).toBe("Plan");
    });

    test("with no command, order is irrelevant and only the name renders", () => {
      render(<PluginListRow name="Plan" commandFirst />);

      expect(screen.getByText("Plan")).toBeInTheDocument();
    });
  });
});
