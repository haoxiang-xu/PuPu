import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Slider, { GradientSlider } from "./slider";
import { MaterialProvider } from "../material";

jest.mock("../icon/icon", () => ({
  __esModule: true,
  default: () => null,
}));

const renderSlider = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <Slider
        value={0.35}
        set_value={() => {}}
        min={0}
        max={1}
        step={0.05}
        style={{ width: 160 }}
        {...props}
      />
    </ConfigContext.Provider>,
  );

const renderGradient = (props = {}, wrap = (node) => node) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      {wrap(
        <GradientSlider
          value={50}
          set_value={() => {}}
          min={0}
          max={100}
          gradient="linear-gradient(to right, #000000 0%, #ffffff 100%)"
          style={{ width: 200 }}
          {...props}
        />,
      )}
    </ConfigContext.Provider>,
  );

describe("Slider", () => {
  test("formats tooltip text with step precision for decimal sliders", () => {
    renderSlider();

    const slider = screen.getByRole("slider");
    fireEvent.mouseEnter(slider);

    expect(screen.getByText("0.35")).toBeInTheDocument();
  });
});

/* Plain and glass render entirely different thumb DOM: only the glass thumb
   carries a frosted backdrop blur. So the blur is what distinguishes the two
   materials — asserting a color would not, since both read the same tokens. */
describe("GradientSlider material", () => {
  const blurOf = (el) => el.style.backdropFilter || el.style.webkitBackdropFilter;

  test("defaults to plain — no frosted thumb, no provider or prop", () => {
    renderGradient();
    fireEvent.mouseEnter(screen.getByRole("slider", { name: "Gradient slider" }));

    expect(blurOf(screen.getByTestId("gradient-slider-thumb"))).toBeFalsy();
  });

  test('material="glass" gives the thumb a frosted rim on activation', () => {
    renderGradient({ material: "glass" });
    fireEvent.mouseEnter(screen.getByRole("slider", { name: "Gradient slider" }));

    expect(blurOf(screen.getByTestId("gradient-slider-thumb"))).toContain("blur");
  });

  test("inherits glass from a MaterialProvider, and an explicit prop overrides it", () => {
    const wrap = (node) => <MaterialProvider material="glass">{node}</MaterialProvider>;
    const { unmount } = renderGradient({}, wrap);
    expect(blurOf(screen.getByTestId("gradient-slider-thumb"))).toContain("blur");
    unmount();

    renderGradient({ material: "plain" }, wrap);
    expect(blurOf(screen.getByTestId("gradient-slider-thumb"))).toBeFalsy();
  });

  test("an unsupported material falls back to plain rather than blanking", () => {
    renderGradient({ material: "frosted" });

    expect(blurOf(screen.getByTestId("gradient-slider-thumb"))).toBeFalsy();
    expect(
      screen.getByRole("slider", { name: "Gradient slider" }),
    ).toBeInTheDocument();
  });
});

/* A mouse released OUTSIDE the app window never delivers its mouseup: the OS
   hands it to whatever is under the cursor. A drag armed on mousedown alone
   therefore stays live, and the thumb keeps tracking the cursor the moment it
   re-enters — the user has to click again to free it. jsdom has no window
   boundary to leave, so the two signals that survive that trip are what gets
   asserted here: a move that arrives with the button already up, and the blur
   fired when the release lands on another application. */
describe("GradientSlider drag release", () => {
  const startDrag = () => {
    const set = jest.fn();
    renderGradient({ set_value: set });
    const slider = screen.getByRole("slider", { name: "Gradient slider" });
    fireEvent.mouseDown(slider, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 150, buttons: 1 });
    expect(set.mock.calls.length).toBeGreaterThan(0);
    return set;
  };

  test("a move arriving with the button already up ends the drag and moves nothing", () => {
    const set = startDrag();
    const heldCalls = set.mock.calls.length;

    fireEvent.mouseMove(window, { clientX: 40, buttons: 0 });
    expect(set).toHaveBeenCalledTimes(heldCalls);

    fireEvent.mouseMove(window, { clientX: 10, buttons: 1 });
    expect(set).toHaveBeenCalledTimes(heldCalls);
  });

  test("losing the window ends the drag", () => {
    const set = startDrag();
    const heldCalls = set.mock.calls.length;

    fireEvent.blur(window);

    fireEvent.mouseMove(window, { clientX: 10, buttons: 1 });
    expect(set).toHaveBeenCalledTimes(heldCalls);
  });

  test("a normal in-window release still ends the drag", () => {
    const set = startDrag();
    const heldCalls = set.mock.calls.length;

    fireEvent.mouseUp(window);

    fireEvent.mouseMove(window, { clientX: 10, buttons: 1 });
    expect(set).toHaveBeenCalledTimes(heldCalls);
  });

  test("dragging still tracks the cursor while the button is held", () => {
    const set = startDrag();
    const heldCalls = set.mock.calls.length;

    fireEvent.mouseMove(window, { clientX: 20, buttons: 1 });
    expect(set.mock.calls.length).toBeGreaterThan(heldCalls);
  });
});
