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

const renderWithTheme = (node) =>
  render(
    <ConfigContext.Provider value={{ theme, onThemeMode: "dark_mode" }}>
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

    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.getByText("COLOR")).toBeInTheDocument();
    const sv = screen.getByTestId("color-picker-sv");
    expect(sv).toBeInTheDocument();
    expect(sv).toHaveStyle({ height: "196px" });
    expect(sv).toHaveStyle({ overflow: "visible" });
    expect(sv).toHaveStyle({ border: "none" });
    expect(sv.style.boxShadow).toBe("0 0 0 1px rgba(255,255,255,0.09)");
    const hueTrack = within(screen.getByTestId("color-picker-hue")).getByTestId(
      "gradient-slider-track",
    );
    const alphaTrack = within(screen.getByTestId("color-picker-alpha")).getByTestId(
      "gradient-slider-track",
    );
    expect(hueTrack.style.boxShadow).toContain(
      "0 0 0 2px rgba(255,255,255,0.09)",
    );
    expect(alphaTrack.style.boxShadow).toContain(
      "0 0 0 2px rgba(255,255,255,0.09)",
    );
    expect(
      screen.getByRole("button", { name: "Pick color from screen" }).style
        .boxShadow,
    ).toBe("");
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
});

describe("ColorPicker", () => {
  it("opens the redesigned popover from the trigger", async () => {
    renderWithTheme(<ColorPicker default_value="#E67E22" />);

    expect(screen.getByText("#E67E22")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open color picker" }));
    await waitForEyedropperIcon();

    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.getByText("COLOR")).toBeInTheDocument();
  });
});
