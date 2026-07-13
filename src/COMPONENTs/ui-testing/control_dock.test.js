import { fireEvent, render } from "@testing-library/react";
import ControlDock from "./control_dock";

describe("ControlDock", () => {
  test("hands its portal container up on mount", () => {
    const onContainerReady = jest.fn();
    render(
      <ControlDock
        isDark
        pos={null}
        onPosChange={() => {}}
        onContainerReady={onContainerReady}
        hidden={false}
        reclampKey="a"
      />,
    );
    expect(onContainerReady).toHaveBeenCalledWith(expect.any(HTMLElement));
  });

  test("double-clicking the grip requests a reset (null)", () => {
    const onPosChange = jest.fn();
    const { getByTitle } = render(
      <ControlDock
        isDark
        pos={{ x: 120, y: 80 }}
        onPosChange={onPosChange}
        onContainerReady={() => {}}
        hidden={false}
        reclampKey="a"
      />,
    );
    fireEvent.doubleClick(getByTitle(/reset/i));
    expect(onPosChange).toHaveBeenCalledWith(null);
  });

  test("hidden hides the dock", () => {
    const { container } = render(
      <ControlDock
        isDark
        pos={null}
        onPosChange={() => {}}
        onContainerReady={() => {}}
        hidden
        reclampKey="a"
      />,
    );
    expect(container.firstChild).toHaveStyle({ display: "none" });
  });
});
