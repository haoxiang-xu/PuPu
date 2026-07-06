import { render, screen } from "@testing-library/react";
import { TestDockContext } from "./test_dock_context";
import TestControls from "./test_controls";

describe("TestControls", () => {
  test("portals children into the dock element and registers on mount", () => {
    const dockEl = document.createElement("div");
    document.body.appendChild(dockEl);
    const registerControls = jest.fn();

    const { unmount } = render(
      <TestDockContext.Provider value={{ dockEl, registerControls }}>
        <TestControls>
          <button>run scenario</button>
        </TestControls>
      </TestDockContext.Provider>,
    );

    expect(dockEl).toContainElement(screen.getByText("run scenario"));
    expect(registerControls).toHaveBeenCalledWith(true);

    unmount();
    expect(registerControls).toHaveBeenCalledWith(false);
  });

  test("renders nothing when there is no dock element", () => {
    const { container } = render(
      <TestDockContext.Provider value={{ dockEl: null, registerControls: jest.fn() }}>
        <TestControls>
          <button>hidden</button>
        </TestControls>
      </TestDockContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("hidden")).toBeNull();
  });

  test("renders nothing when there is no provider", () => {
    const { container } = render(
      <TestControls>
        <button>orphan</button>
      </TestControls>,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
