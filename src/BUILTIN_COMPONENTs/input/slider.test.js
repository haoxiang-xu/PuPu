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

/* A pointerdown handler that calls preventDefault suppresses the whole
   compatibility mouse sequence for that pointer — no mousedown, and no
   mousemove or mouseup either. A drag loop listening only for mousemove
   therefore receives the press, jumps to it, and then never hears the
   cursor again until the release ends it: the thumb looks frozen and the
   gesture "drops" instantly. The pointer stream is the one that survives,
   which is why the color picker's SV square (pointermove-based) never had
   this and the sliders did. */
describe("GradientSlider tracks the pointer stream, not just compat mouse events", () => {
  /* jsdom implements no PointerEvent, and RTL's fireEvent.pointerMove then
     degrades to a bare Event carrying neither clientX nor buttons — the drag
     would read as broken for a reason that does not exist in a browser. A
     MouseEvent under a pointer type name is the faithful stand-in: PointerEvent
     extends MouseEvent, so clientX/buttons are exactly the fields the handler
     reads, and the type string is what the listener is keyed on. */
  const pointer = (node, type, init) =>
    fireEvent(
      node,
      new MouseEvent(type, { bubbles: true, cancelable: true, ...init }),
    );

  const startPointerDrag = () => {
    const set = jest.fn();
    renderGradient({ set_value: set });
    const slider = screen.getByRole("slider", { name: "Gradient slider" });
    pointer(slider, "pointerdown", { clientX: 100, buttons: 1 });
    set.mockClear();
    return set;
  };

  test("a pointerdown-initiated drag follows pointermove", () => {
    const set = startPointerDrag();

    pointer(window, "pointermove", { clientX: 150, buttons: 1 });
    expect(set).toHaveBeenCalled();

    const calls = set.mock.calls.length;
    pointer(window, "pointermove", { clientX: 40, buttons: 1 });
    expect(set.mock.calls.length).toBeGreaterThan(calls);
  });

  test("pointerup ends it, and a later pointermove no longer moves the value", () => {
    const set = startPointerDrag();
    pointer(window, "pointermove", { clientX: 150, buttons: 1 });
    pointer(window, "pointerup", {});

    const settled = set.mock.calls.length;
    pointer(window, "pointermove", { clientX: 20, buttons: 1 });
    expect(set).toHaveBeenCalledTimes(settled);
  });

  test("a pointermove that arrives with the button already up ends the drag", () => {
    const set = startPointerDrag();
    pointer(window, "pointermove", { clientX: 150, buttons: 1 });

    const held = set.mock.calls.length;
    pointer(window, "pointermove", { clientX: 40, buttons: 0 });
    expect(set).toHaveBeenCalledTimes(held);

    pointer(window, "pointermove", { clientX: 20, buttons: 1 });
    expect(set).toHaveBeenCalledTimes(held);
  });
});

/* Ported from mini_ui's "Linear Slider glass material" suite: the PuPu port
   had left Slider plain-only, so material="glass" fell back to plain. */
describe("Slider glass material", () => {
  const renderGlass = (props = {}) =>
    renderSlider({
      material: "glass",
      value: 0,
      min: 0,
      max: 100,
      step: 1,
      style: { width: 200 },
      ...props,
    });

  test('material="glass" gives the thumb a frosted rim and still maps x→value', () => {
    const onChange = jest.fn();
    renderGlass({ set_value: onChange });

    const thumb = screen.getByTestId("slider-thumb");
    expect(thumb.style.backdropFilter || thumb.style.webkitBackdropFilter).toContain("blur");

    const el = screen.getByRole("slider");
    el.getBoundingClientRect = jest.fn(() => ({
      left: 10, right: 210, top: 0, bottom: 32, width: 200, height: 32, x: 10, y: 0, toJSON: () => {},
    }));
    // glass insets the travel by the 10px cap radius on each end: 200 - 20 =
    // 180 usable, so the midpoint of the rail (clientX 110) is value 50.
    fireEvent.mouseDown(el, { clientX: 110 });
    expect(onChange).toHaveBeenLastCalledWith(50);
    fireEvent.mouseUp(window);
  });

  test("collapses the glass progress fill to zero at the minimum value", () => {
    const atMin = renderGlass();
    expect(screen.getByTestId("slider-progress").style.width).toBe("0px");
    atMin.unmount();

    renderGlass({ value: 50 });
    const width = screen.getByTestId("slider-progress").style.width;
    expect(parseFloat(width)).toBeGreaterThan(0);
  });

  test("at rest the glass channel runs notch to notch; on wake it grows to the full-width groove", () => {
    renderGlass({ value: 40 });
    const track = screen.getByTestId("slider-track");
    const progress = screen.getByTestId("slider-progress");
    // rest: the line is exactly as long as the longest progress can be — it
    // starts on the first notch (cap inset 10) and ends on the last (190),
    // so a full progress and the line coincide instead of the line running
    // one cap past the end.
    expect(track.style.left).toBe("10px");
    expect(track.style.width).toBe("180px");
    expect(track.style.height).toBe("3px");
    expect(progress.style.left).toBe("10px");
    // 40% of the 180px travel
    expect(progress.style.width).toBe("72px");

    fireEvent.mouseEnter(screen.getByRole("slider"));
    // wake: the channel is the full-width groove whose caps are concentric
    // with the thumb at either end
    expect(track.style.left).toBe("0px");
    expect(track.style.width).toBe("200px");
    expect(track.style.height).toBe("20px");
  });

  test("awake, the glass progress ends ON the thumb's centre — the frosted ring lets the fill show through, so a fill running past the centre read as an off-centre indicator", () => {
    renderGlass({ value: 40 });
    fireEvent.mouseEnter(screen.getByRole("slider"));
    const progress = screen.getByTestId("slider-progress");
    const thumb = screen.getByTestId("slider-thumb");
    // thumb centre = 10 + 0.4 * 180 = 82; the fill's left cap is centred on
    // the first notch (10 - 4), and its right edge is the thumb's centre
    expect(thumb.style.left).toBe("82px");
    expect(progress.style.left).toBe("6px");
    expect(parseFloat(progress.style.left) + parseFloat(progress.style.width)).toBe(82);
  });

  test("a full glass progress at rest is exactly the channel", () => {
    renderGlass({ value: 100 });
    const track = screen.getByTestId("slider-track");
    const progress = screen.getByTestId("slider-progress");
    expect(progress.style.left).toBe(track.style.left);
    expect(progress.style.width).toBe(track.style.width);
  });

  test("glass keeps the snap marks visible on the channel", () => {
    renderGlass({ value: 50, marks: [0, 25, 50, 75, 100] });
    // every notch, the one under the thumb included (see the "marks at the
    // current value" suite for why glass differs from plain here)
    expect(screen.getAllByTestId("slider-mark")).toHaveLength(5);
  });

  test("glass hides the centre label; the value rides the tooltip instead", () => {
    renderGlass({ value: 40, label_format: (v) => `${v} units` });
    expect(screen.queryByText("40 units")).toBeNull();
  });

  test("an explicit activeColor tints the glass progress", () => {
    renderGlass({ value: 50, style: { width: 200, activeColor: "rgb(1, 2, 3)" } });
    expect(screen.getByTestId("slider-progress").style.background).toContain("rgb(1, 2, 3)");
  });
});

/* Ported from mini_ui: a slider may size itself from its container instead of
   a fixed pixel width, so a host never has to measure on the slider's behalf
   (a stale hand-off width draws the thumb and marks on one scale while the
   pointer is hit-tested on another). */
describe("Slider fluid width", () => {
  const withOffsetWidth = (width, run) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        return width;
      },
    });
    try {
      run();
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "offsetWidth", descriptor);
    }
  };

  test('style.width "100%" makes the rail fluid and lays marks out on the measured width', () => {
    withOffsetWidth(200, () => {
      renderSlider({
        material: "glass",
        value: 50,
        min: 0,
        max: 100,
        step: 25,
        marks: [0, 25, 50, 75, 100],
        style: { width: "100%" },
      });
      const rail = screen.getByRole("slider");
      expect(rail.style.width).toBe("100%");
      // glass: 10px cap inset on each end → 180px of travel; the 75 mark sits
      // at 10 + 0.75 * 180 = 145 on a 200px rail
      const marks = screen.getAllByTestId("slider-mark").map((m) => m.style.left);
      expect(marks).toEqual(["10px", "55px", "100px", "145px", "190px"]);
      expect(screen.getByTestId("slider-thumb").style.left).toBe("100px");
    });
  });

  test("a numeric width still pins the rail exactly as before", () => {
    withOffsetWidth(999, () => {
      renderSlider({ value: 0.5, style: { width: 160 } });
      expect(screen.getByRole("slider").style.width).toBe("160px");
      expect(screen.getByText("50%")).toBeInTheDocument();
    });
  });

  test("the glass progress at rest ends on the current notch, not past it", () => {
    withOffsetWidth(200, () => {
      renderSlider({
        material: "glass",
        value: 75,
        min: 0,
        max: 100,
        step: 25,
        marks: [0, 25, 50, 75, 100],
        style: { width: "100%" },
      });
      // thumb centre = 10 + 0.75 * 180 = 145; the resting fill starts on the
      // first notch (10) and ends there
      const progress = screen.getByTestId("slider-progress");
      expect(progress.style.left).toBe("10px");
      expect(progress.style.width).toBe("135px");
    });
  });
});

describe("Slider fluid width wrapper", () => {
  test("a fluid rail's wrapper is block-level and full width, so a percentage can resolve", () => {
    renderSlider({ value: 0.5, style: { width: "100%" } });
    const rail = screen.getByRole("slider");
    const wrapper = rail.parentElement;
    expect(wrapper.style.width).toBe("100%");
    expect(wrapper.style.display).toBe("flex");
  });

  test("a pinned rail keeps its inline-flex wrapper", () => {
    renderSlider({ value: 0.5, style: { width: 160 } });
    const wrapper = screen.getByRole("slider").parentElement;
    expect(wrapper.style.display).toBe("inline-flex");
    expect(wrapper.style.width).toBe("");
  });
});

/* Glass geometry scales from the channel (mini_ui's 20px channel / 28px ring
   / 8px progress), so a host with a shallower slot keeps the same look at a
   smaller size instead of overflowing its clip. */
describe("Slider glass geometry", () => {
  const glassProps = (extra = {}) => ({
    material: "glass",
    value: 50,
    min: 0,
    max: 100,
    step: 25,
    marks: [0, 25, 50, 75, 100],
    style: { width: 200 },
    ...extra,
  });

  test("the press scale is mini_ui's 1.18 for glass, 1.35 for plain", () => {
    const glass = renderSlider(glassProps());
    fireEvent.mouseEnter(screen.getByRole("slider"));
    fireEvent.mouseDown(screen.getByRole("slider"), { clientX: 0 });
    expect(screen.getByTestId("slider-thumb").style.transform).toContain("scale(1.18)");
    fireEvent.mouseUp(window);
    glass.unmount();

    renderSlider({ value: 0.5, style: { width: 160 }, show_tooltip: false });
    fireEvent.mouseEnter(screen.getByRole("slider"));
    fireEvent.mouseDown(screen.getByRole("slider"), { clientX: 0 });
    // plain: with no tooltip the thumb is the rail's last child
    const rail = screen.getByRole("slider");
    const plainThumb = rail.lastElementChild;
    expect(plainThumb.style.transform).toContain("scale(1.35)");
    fireEvent.mouseUp(window);
  });

  test("channelHeight, thumbSize and pressScale scale the whole glass geometry", () => {
    renderSlider(glassProps({ style: { width: 200, channelHeight: 16, thumbSize: 24, pressScale: 1.15 } }));
    const rail = screen.getByRole("slider");
    // cap radius = channel / 2 = 8 → travel 184; the 25 mark sits at 8 + 46
    expect(screen.getAllByTestId("slider-mark").map((m) => m.style.left)).toEqual([
      "8px", "54px", "100px", "146px", "192px",
    ]);
    const thumb = screen.getByTestId("slider-thumb");
    expect(thumb.style.width).toBe("24px");
    fireEvent.mouseEnter(rail);
    expect(screen.getByTestId("slider-track").style.height).toBe("16px");
    // progress keeps mini_ui's 0.4 ratio to the channel
    expect(screen.getByTestId("slider-progress").style.height).toBe("6px");
    fireEvent.mouseDown(rail, { clientX: 0 });
    expect(thumb.style.transform).toContain("scale(1.15)");
    fireEvent.mouseUp(window);
  });

  test("defaults stay mini_ui's: 20px channel, 28px ring, 8px progress", () => {
    renderSlider(glassProps());
    fireEvent.mouseEnter(screen.getByRole("slider"));
    expect(screen.getByTestId("slider-track").style.height).toBe("20px");
    expect(screen.getByTestId("slider-thumb").style.width).toBe("28px");
    expect(screen.getByTestId("slider-progress").style.height).toBe("8px");
  });
});

describe("Slider glass marks at the current value", () => {
  test("glass draws the mark under the current value too, so a resting rail still shows every notch", () => {
    renderSlider({
      material: "glass",
      value: 0,
      min: 0,
      max: 5,
      step: 1,
      marks: [0, 1, 2, 3, 4, 5],
      style: { width: 200 },
    });
    // plain hides the mark under the thumb because its value label sits
    // there; glass has no label at rest and the thumb is hidden, so the
    // first notch would otherwise vanish whenever it is the value.
    expect(screen.getAllByTestId("slider-mark")).toHaveLength(6);
  });

  test("plain still leaves the mark under the value out", () => {
    renderSlider({
      value: 0,
      min: 0,
      max: 5,
      step: 1,
      marks: [0, 1, 2, 3, 4, 5],
      style: { width: 200 },
    });
    expect(screen.getAllByTestId("slider-mark")).toHaveLength(5);
  });
});
