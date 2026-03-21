import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Slider from "./slider";

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

describe("Slider", () => {
  test("formats tooltip text with step precision for decimal sliders", () => {
    renderSlider();

    const slider = screen.getByRole("slider");
    fireEvent.mouseEnter(slider);

    expect(screen.getByText("0.35")).toBeInTheDocument();
  });
});
