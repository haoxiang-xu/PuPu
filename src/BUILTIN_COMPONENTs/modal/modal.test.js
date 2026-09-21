import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Modal from "./modal";
import { ConfigContext } from "../../CONTAINERs/config/context";

const wrap = (ui) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      {ui}
    </ConfigContext.Provider>,
  );

describe("Modal stacking", () => {
  test("Escape closes only the modal on top", () => {
    const closeLower = jest.fn();
    const closeUpper = jest.fn();
    wrap(
      <>
        <Modal open onClose={closeLower}>
          <div>lower</div>
        </Modal>
        <Modal open onClose={closeUpper}>
          <div>upper</div>
        </Modal>
      </>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(closeUpper).toHaveBeenCalledTimes(1);
    expect(closeLower).not.toHaveBeenCalled();
  });

  test("once the upper one has gone, Escape reaches the lower", () => {
    jest.useFakeTimers();
    const closeLower = jest.fn();
    const closeUpper = jest.fn();
    const Stack = ({ upperOpen }) => (
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <Modal open onClose={closeLower}>
          <div>lower</div>
        </Modal>
        <Modal open={upperOpen} onClose={closeUpper}>
          <div>upper</div>
        </Modal>
      </ConfigContext.Provider>
    );
    const { rerender } = render(<Stack upperOpen />);

    rerender(<Stack upperOpen={false} />);
    // the upper modal stays mounted through its exit animation
    act(() => {
      jest.runAllTimers();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(closeLower).toHaveBeenCalledTimes(1);
    expect(closeUpper).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  test("a single modal still closes on Escape", () => {
    const onClose = jest.fn();
    wrap(
      <Modal open onClose={onClose}>
        <div>only</div>
      </Modal>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Modal fullscreen", () => {
  const themed = { theme: { modal: { border: "1px solid rgba(0, 0, 0, 0.08)" } }, onThemeMode: "light_mode" };

  test("keeps the theme border when windowed", () => {
    render(
      <ConfigContext.Provider value={themed}>
        <Modal open onClose={() => {}}>
          <div>body</div>
        </Modal>
      </ConfigContext.Provider>,
    );
    const panel = screen.getByText("body").parentElement;
    expect(panel.style.border).toBe("1px solid rgba(0, 0, 0, 0.08)");
  });

  test("drops the border when fullscreen so no hairline hugs the window edge", () => {
    render(
      <ConfigContext.Provider value={themed}>
        <Modal open fullscreen onClose={() => {}}>
          <div>body</div>
        </Modal>
      </ConfigContext.Provider>,
    );
    const panel = screen.getByText("body").parentElement;
    expect(panel.style.border).toBe("");
    expect(panel.style.borderRadius).toBe("0");
  });
});
