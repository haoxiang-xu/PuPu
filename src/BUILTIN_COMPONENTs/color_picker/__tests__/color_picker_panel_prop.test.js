import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ColorPicker from "../color_picker";

const renderPicker = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ onThemeMode: "light_mode", theme: {} }}>
      <ColorPicker default_open {...props} />
    </ConfigContext.Provider>,
  );

describe("ColorPicker panel prop", () => {
  test("defaults to the nordic panel", () => {
    // Note: NordicColorPickerPanel's own root also carries the
    // "color-picker-panel" testid (nordic_color_picker.js), so presence/
    // absence of that testid alone cannot distinguish the two panels.
    // Assert on markers that are exclusive to each panel instead.
    renderPicker();
    expect(screen.getByTestId("nordic-rail")).toBeInTheDocument();
    expect(screen.queryByTestId("color-picker-sv")).toBeNull();
    expect(screen.queryByTestId("color-picker-value-hex")).toBeNull();
  });

  test("panel=rectangular renders the full panel with HEX input", () => {
    renderPicker({ panel: "rectangular" });
    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-sv")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-value-hex")).toBeInTheDocument();
    expect(screen.getByTestId("color-picker-alpha")).toBeInTheDocument();
  });

  test("show_alpha=false hides the alpha row", () => {
    renderPicker({ panel: "rectangular", show_alpha: false });
    expect(screen.getByTestId("color-picker-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("color-picker-alpha")).toBeNull();
  });
});
