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

describe("Switch thumb shadow stays in sync with the thumb's motion", () => {
  /* Force the engine path where ShadowSurface WOULD detach the shadow into an anchored SVG
     sibling (Chromium + anchor positioning). A thumb's shadow must stay native on the moving
     element itself, so no detached layer may appear for any material. */
  const withCompositedShadows = (fn) => {
    const ua = navigator.userAgent, css = window.CSS, Resize = window.ResizeObserver;
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome/144.0" });
    window.CSS = { supports: () => true };
    window.ResizeObserver = class { observe() {} disconnect() {} };
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 50, top: 50, right: 90, bottom: 90, width: 40, height: 40 });
    jest.spyOn(window, "getComputedStyle").mockImplementation((node) => ({
      boxShadow: node.style.boxShadow, opacity: "1", transform: "none",
      overflowX: "visible", overflowY: "visible", borderTopLeftRadius: "50%",
      borderTopRightRadius: "50%", borderBottomRightRadius: "50%", borderBottomLeftRadius: "50%",
      getPropertyValue: () => "",
    }));
    try { fn(); } finally {
      jest.restoreAllMocks();
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
      window.CSS = css; window.ResizeObserver = Resize;
    }
  };

  test.each(["glass", "plain"])("%s thumb paints its shadow natively on the animated element", (material) => {
    withCompositedShadows(() => {
      const { container, unmount } = render(
        <ConfigContext.Provider value={config("light_mode")}>
          <Switch material={material} on={false} set_on={() => {}} style={{ width: 60, height: 32 }} />
        </ConfigContext.Provider>,
      );
      expect(container.querySelector("svg[aria-hidden='true'] filter")).toBeNull();
      const thumb = material === "glass"
        ? screen.getByRole("switch").lastElementChild
        : container.querySelector(".mini-ui-switch-thumb");
      expect(thumb.style.boxShadow).toMatch(/rgba\(0, ?0, ?0/);
      expect(thumb.style.transition).not.toBe("");
      unmount();
    });
  });
});
