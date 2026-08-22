import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import ColorPicker, { ColorPickerPanel } from "../color_picker";
import { ConfigContext } from "../../../CONTAINERs/config/context";

const theme = {
  color: "#CCCCCC",
  backgroundColor: "#0A0A0A",
  colorPicker: {
    backgroundColor: "rgba(20,20,20,0.96)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)",
    inputBackgroundColor: "rgba(255,255,255,0.08)",
  },
  select: {
    dropdown: {
      backgroundColor: "#151515",
      borderRadius: 10,
      boxShadow: "0 14px 24px rgba(0, 0, 0, 0.45)",
    },
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    boxShadow: "none",
    fontSize: 14,
    height: 36,
    outline: {
      onBlur: "none",
      onFocus: "none",
    },
  },
};

const renderWithTheme = (
  node,
  { nextTheme = theme, mode = "dark_mode" } = {},
) =>
  render(
    <ConfigContext.Provider value={{ theme: nextTheme, onThemeMode: mode }}>
      {node}
    </ConfigContext.Provider>,
  );

const setRect = (element, rect) => {
  element.getBoundingClientRect = jest.fn(() => ({
    x: rect.left,
    y: rect.top,
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON: () => {},
  }));
};

const waitForEyedropperIcon = () =>
  waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Pick color from screen" }),
    ).toBeInTheDocument();
  });

describe("ColorPickerPanel", () => {
  it("renders the Danish-minimal panel layout by default", async () => {
    renderWithTheme(<ColorPickerPanel value="#3D76C9" set_value={jest.fn()} />);
    await waitForEyedropperIcon();

    const panel = screen.getByTestId("color-picker-panel");
    expect(panel).toBeInTheDocument();
    expect(screen.queryByText("COLOR")).not.toBeInTheDocument();
    /* The panel's fill and border now come from the semantic layer, and jsdom
       drops any value containing var() from the CSSOM — so those two are
       asserted by source scan below instead. Radius and shadow are literals
       and stay assertable here. */
    expect(panel).toHaveStyle({
      borderRadius: "10px",
      boxShadow: "0 14px 24px rgba(0, 0, 0, 0.45)",
    });
    expect(panel.style.paddingRight).toBe("12px");
    expect(panel.style.paddingBottom).toBe("2px");
    const sv = screen.getByTestId("color-picker-sv");
    expect(sv).toBeInTheDocument();
    expect(sv).toHaveStyle({ height: "196px" });
    expect(sv).toHaveStyle({ overflow: "visible" });
    expect(sv).toHaveStyle({ borderRadius: "2px" });
    expect(sv).toHaveStyle({ border: "none" });
    /* the ring colour is a var now, which jsdom drops from the CSSOM; its
       geometry is asserted by source scan below */
    const hueTrack = within(screen.getByTestId("color-picker-hue")).getByTestId(
      "gradient-slider-track",
    );
    const alphaTrack = within(screen.getByTestId("color-picker-alpha")).getByTestId(
      "gradient-slider-track",
    );
    expect(hueTrack).toBeInTheDocument();
    expect(alphaTrack).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pick color from screen" }).style
        .boxShadow,
    ).toBe("");
    expect(screen.getByTestId("color-picker-final-swatch")).toBeInTheDocument();
    for (const textbox of screen.getAllByRole("textbox")) {
      expect(textbox.style.position).toBe("relative");
      expect(textbox.style.zIndex).toBe("1");
    }
    expect(screen.getByTestId("color-picker-hue")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-alpha")).toBeInTheDocument();
    // format is a segmented control: HEX / RGB segments are unique here
    // (default format is HSL, so "HSL" appears twice — segment + value-row
    // label — hence getAllByText for it).
    expect(screen.getByText("HEX")).toBeInTheDocument();
    expect(screen.getByText("RGB")).toBeInTheDocument();
    expect(screen.getAllByText("HSL").length).toBeGreaterThanOrEqual(1);
    // contrast footer is gone
    expect(screen.queryByText("Contrast Ratio")).not.toBeInTheDocument();
  });

  it("emits a valid hex color and keeps the SV thumb inside the rectangular field after an outside drag", async () => {
    const onChange = jest.fn();
    renderWithTheme(<ColorPickerPanel value="#3D76C9" set_value={onChange} />);
    await waitForEyedropperIcon();

    const sv = screen.getByTestId("color-picker-sv");
    setRect(sv, { left: 20, top: 30, width: 294, height: 196 });

    fireEvent.mouseDown(sv, { clientX: 200, clientY: -40 });

    const thumb = screen.getByTestId("color-picker-sv-thumb");
    const point = {
      x: Number(thumb.getAttribute("data-x")),
      y: Number(thumb.getAttribute("data-y")),
    };

    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(294);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(196);
    expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/^#[0-9A-F]{6}$/));
  });

  it("keeps white, black, and fully saturated hue reachable in the rectangular field", async () => {
    const onChange = jest.fn();
    renderWithTheme(<ColorPickerPanel value="#FF0000" set_value={onChange} />);
    await waitForEyedropperIcon();

    const dragSv = (clientX, clientY) => {
      const sv = screen.getByTestId("color-picker-sv");
      setRect(sv, { left: 0, top: 0, width: 294, height: 196 });
      fireEvent.mouseDown(sv, { clientX, clientY });
    };

    dragSv(0, 0);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#FFFFFF"));
    fireEvent.mouseUp(window);

    dragSv(0, 196);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#000000"));
    fireEvent.mouseUp(window);

    dragSv(294, 0);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("#FF0000"));
  });

  it("commits HSL inputs to the right hex", async () => {
    const onChange = jest.fn();
    renderWithTheme(<ColorPickerPanel value="#3D76C9" set_value={onChange} />);
    await waitForEyedropperIcon();

    const [hueInput, satInput, lightInput] = screen.getAllByRole("textbox");

    fireEvent.change(hueInput, { target: { value: "0" } });
    fireEvent.keyDown(hueInput, { key: "Enter" });
    fireEvent.change(satInput, { target: { value: "100" } });
    fireEvent.keyDown(satInput, { key: "Enter" });
    fireEvent.change(lightInput, { target: { value: "50" } });
    fireEvent.keyDown(lightInput, { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith("#FF0000");
  });

  it("switches the value row to R/G/B when the format segment changes", async () => {
    renderWithTheme(<ColorPickerPanel value="#3D76C9" set_value={jest.fn()} />);
    await waitForEyedropperIcon();

    // default format is HSL → h/s/l fields exist
    expect(screen.getByTestId("color-picker-value-h")).toBeInTheDocument();

    fireEvent.click(screen.getByText("RGB"));

    expect(screen.getByTestId("color-picker-value-r")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-value-g")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-value-b")).toBeInTheDocument();
  });

  /* The SV square still draws a plain white ring. The hue and alpha sliders
     moved to the glass material, where that job is done by a frosted rim
     (plus a white ring around the colour core) instead of a flat border —
     same intent, different mark: the thumb must read against whatever hue
     sits under it. */
  it("keeps the thumb reading white in light mode — plain ring on SV, frosted rim on the sliders", async () => {
    renderWithTheme(<ColorPickerPanel value="#3D76C9" set_value={jest.fn()} />, {
      nextTheme: { ...theme, color: "#222222", backgroundColor: "#FFFFFF" },
      mode: "light_mode",
    });
    await waitForEyedropperIcon();

    expect(
      screen.getByTestId("color-picker-sv-thumb").style.border.toLowerCase(),
    ).toBe(
      "2.5px solid #ffffff",
    );
    for (const row of ["color-picker-hue", "color-picker-alpha"]) {
      const thumb = within(screen.getByTestId(row)).getByTestId(
        "gradient-slider-thumb",
      );
      expect(thumb.style.border.toLowerCase()).toBe(
        "1px solid rgba(255,255,255,0.55)",
      );
      expect(
        thumb.style.backdropFilter || thumb.style.webkitBackdropFilter,
      ).toContain("blur");
    }
  });
});

describe("ColorPicker", () => {
  it("opens the Nordic Rail popover from the trigger", async () => {
    renderWithTheme(<ColorPicker default_value="#E67E22" />);

    expect(screen.getByText("#E67E22")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: "Open color picker" });
    expect(trigger.style.boxShadow).toBe("");
    expect(trigger.style.background).toBe("transparent");

    fireEvent.click(trigger);
    // the Nordic panel is rendered into a body portal; wait for it to mount
    await screen.findByTestId("color-picker-panel");

    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.queryByText("COLOR")).not.toBeInTheDocument();
    // Nordic readout swatch + CUSTOM disclosure are the panel's anchors
    expect(screen.getByTestId("color-picker-final-swatch")).toBeInTheDocument();
    expect(screen.getByText("CUSTOM")).toBeInTheDocument();
    // the old rectangular panel's SV field / format segments are gone
    expect(screen.queryByTestId("color-picker-sv")).not.toBeInTheDocument();
  });

  it("renders the popup in a fixed body portal outside clipped containers", async () => {
    renderWithTheme(
      <div
        data-testid="clipped-color-picker-host"
        style={{ overflow: "hidden", width: 160, height: 48 }}
      >
        <ColorPicker default_value="#E67E22" />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: "Open color picker" });
    setRect(screen.getByTestId("color-picker-trigger-anchor"), {
      left: 500,
      top: 100,
      width: 120,
      height: 36,
    });

    fireEvent.click(trigger);
    await screen.findByTestId("color-picker-panel");

    const popover = screen.getByTestId("color-picker-popover");
    expect(
      within(screen.getByTestId("clipped-color-picker-host")).queryByTestId(
        "color-picker-popover",
      ),
    ).not.toBeInTheDocument();
    expect(popover).toHaveStyle({
      position: "fixed",
      left: "500px",
      top: "144px",
    });
  });

  it("stays open when the panel content itself is pressed", async () => {
    renderWithTheme(<ColorPicker default_value="#E67E22" />);

    fireEvent.click(screen.getByRole("button", { name: "Open color picker" }));
    const panel = await screen.findByTestId("color-picker-panel");

    // the whole Nordic panel is content (content_ref wraps the root), so
    // pressing it must NOT dismiss — only an outside / blocker press does
    fireEvent.pointerDown(panel);

    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
  });

  it("uses a full-screen blocker to close only the picker above a modal", async () => {
    const onModalClose = jest.fn();

    renderWithTheme(
      <div
        data-testid="modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onModalClose();
          }
        }}
      >
        <ColorPicker default_value="#E67E22" />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open color picker" }));
    await screen.findByTestId("color-picker-panel");

    const blocker = screen.getByTestId("color-picker-event-blocker");
    expect(blocker).toHaveStyle({
      position: "fixed",
      width: "100%",
      height: "100%",
    });
    expect(blocker.style.inset).toBe("0");
    expect(blocker.style.zIndex).toBe("9999");

    fireEvent.mouseDown(blocker);
    fireEvent.mouseUp(blocker);
    fireEvent.click(blocker);

    await waitFor(() => {
      expect(screen.queryByTestId("color-picker-panel")).not.toBeInTheDocument();
    });
    expect(onModalClose).not.toHaveBeenCalled();
  });
});

/* The one panel whose job is choosing colours must not be the one panel that
   ignores them. Its palette used to be fixed black/white pairs plus a read of
   the JS theme, so it neither followed a custom palette nor moved during a
   live preview. jsdom drops var() from the CSSOM, so this is a source scan —
   same remedy as container.test.js and title_bar.test.js. */
describe("color_picker.js paints from the semantic layer", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "..", "color_picker.js"),
    "utf8",
  );
  const palette = src.slice(src.indexOf("const C = {"), src.indexOf("};", src.indexOf("const C = {")));

  test("a popover sits on the surface layer, not on background", () => {
    expect(palette).toMatch(/panel: "var\(--pupu-surface\)"/);
  });

  test("strokes take the border family", () => {
    for (const key of ["hairline", "rowLine", "line"]) {
      expect(palette).toMatch(new RegExp(`${key}: "var\\(--pupu-border\\)"`));
    }
  });

  /* All three are ALPHAS of the label colour, never the standalone
     "Muted text" root — that root is its own colour and would leave these
     captions sitting still while the label moved. */
  test("label, caption and value take three distinct steps of the label ladder", () => {
    expect(palette).toMatch(/text: "var\(--pupu-text\)"/);
    expect(palette).toMatch(/muted: "var\(--pupu-text-faint\)"/);
    expect(palette).toMatch(/value: "var\(--pupu-text-secondary\)"/);
    expect(palette).not.toMatch(/var\(--pupu-text-muted\)/);
  });

  test("no neutral black/white pair is left, shadows excepted", () => {
    /* Shadows are cast light rather than a themed surface, so they keep their
       black base — every other neutral pair had to go. */
    const withoutShadows = palette
      .split("\n")
      .filter((line) => !/\d+px \d+px/.test(line))
      .join("\n");
    expect(withoutShadows).not.toMatch(/rgba\(255,\s*255,\s*255/);
    expect(withoutShadows).not.toMatch(/rgba\(0,\s*0,\s*0/);
  });

  test("the hairline rings keep their 1px / 2px geometry", () => {
    expect(src).toContain("0 0 0 1px ${C.hairline}");
    expect(src).toMatch(/gradientTrackBorderWidth: 2/);
  });

  /* The thumb ring is a contrast device against whatever hue sits under it.
     If it followed the palette it would vanish on a light theme. */
  test("the thumb ring stays white on purpose", () => {
    expect(palette).toMatch(/thumbBorder: "#FFFFFF"/);
  });
});
