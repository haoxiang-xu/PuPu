import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import Switch, { PlainSwitch, SWITCH_MATERIALS } from "./switch";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { MaterialProvider } from "../material";

const config = (mode) => ({ onThemeMode: mode, theme: { switch: {} } });

const renderGlass = (props, mode = "light_mode") =>
  render(
    <ConfigContext.Provider value={config(mode)}>
      <Switch material="glass" {...props} />
    </ConfigContext.Provider>,
  );

describe("Switch material dispatch", () => {
  test("exposes plain and glass materials, defaulting to plain", () => {
    expect(Object.keys(SWITCH_MATERIALS).sort()).toEqual(["glass", "plain"]);
    expect(SWITCH_MATERIALS.plain).toBe(PlainSwitch);
    const { container } = render(
      <ConfigContext.Provider value={config("light_mode")}>
        <Switch on set_on={() => {}} style={{ width: 32, height: 18 }} />
      </ConfigContext.Provider>,
    );
    expect(container.querySelector(".mini-ui-switch-track")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  test("a MaterialProvider subtree switches to glass without a prop", () => {
    render(
      <ConfigContext.Provider value={config("light_mode")}>
        <MaterialProvider material="glass">
          <Switch on set_on={() => {}} />
        </MaterialProvider>
      </ConfigContext.Provider>,
    );
    expect(screen.getByRole("switch")).toBeTruthy();
  });

  test("an unsupported material falls back to plain", () => {
    const { container } = render(
      <ConfigContext.Provider value={config("light_mode")}>
        <Switch material="velvet" on set_on={() => {}} />
      </ConfigContext.Provider>,
    );
    expect(container.querySelector(".mini-ui-switch-track")).toBeTruthy();
  });
});

describe("Glass Switch (material='glass')", () => {
  ["light_mode", "dark_mode"].forEach((mode) => {
    test(`renders a role=switch reflecting on/off in ${mode}`, () => {
      const { rerender } = renderGlass({ on: false, set_on: () => {} }, mode);
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
      rerender(
        <ConfigContext.Provider value={config(mode)}>
          <Switch material="glass" on set_on={() => {}} />
        </ConfigContext.Provider>,
      );
      expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    });

    test(`is icon-less in ${mode}`, () => {
      const { container } = renderGlass({ on: true, set_on: () => {} }, mode);
      expect(container.querySelector("svg")).toBeNull();
      expect(container.querySelector(".mini-ui-svg-icon")).toBeNull();
    });
  });

  test("uses the glass default size (60×38) when no size is given", () => {
    renderGlass({ on: false, set_on: () => {} });
    const el = screen.getByRole("switch");
    expect(el.style.width).toBe("60px");
    expect(el.style.height).toBe("38px");
  });

  test("toggles via set_on on click", () => {
    const set_on = jest.fn();
    renderGlass({ on: false, set_on });
    fireEvent.click(screen.getByRole("switch"));
    expect(set_on).toHaveBeenCalledWith(true);
  });

  test("toggles via keyboard (Space)", () => {
    const set_on = jest.fn();
    renderGlass({ on: true, set_on });
    fireEvent.keyDown(screen.getByRole("switch"), { key: " " });
    expect(set_on).toHaveBeenCalledWith(false);
  });

  test("uncontrolled: toggles its own state on click", () => {
    renderGlass({});
    const el = screen.getByRole("switch");
    expect(el).toHaveAttribute("aria-checked", "false");
    fireEvent.click(el);
    expect(el).toHaveAttribute("aria-checked", "true");
  });
});
