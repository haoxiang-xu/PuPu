import {
  readThemeSettings,
  writeThemePreset,
  writeThemeCustomColor,
  writeThemeCustom,
  resetThemeSettings,
  clearThemeCustomColor,
} from "./storage";

describe("appearance theme storage", () => {
  beforeEach(() => window.localStorage.clear());

  test("returns default shape when empty", () => {
    expect(readThemeSettings()).toEqual({
      preset: "default",
      custom: { light_mode: {}, dark_mode: {} },
    });
  });

  test("writeThemePreset persists preset and preserves custom", () => {
    writeThemeCustomColor("light_mode", "accent", "#111111");
    writeThemePreset("ocean");
    const t = readThemeSettings();
    expect(t.preset).toBe("ocean");
    expect(t.custom.light_mode.accent).toBe("#111111");
  });

  test("writeThemeCustomColor stores under the right mode", () => {
    writeThemeCustomColor("dark_mode", "background", "#000000");
    expect(readThemeSettings().custom.dark_mode.background).toBe("#000000");
  });

  test("does not clobber other settings sections", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ ui: { side_menu_open: true } }),
    );
    writeThemePreset("warm");
    const root = JSON.parse(window.localStorage.getItem("settings"));
    expect(root.ui.side_menu_open).toBe(true);
    expect(root.appearance.theme.preset).toBe("warm");
  });

  test("writeThemeCustom replaces both modes and preserves preset", () => {
    writeThemePreset("ocean");
    writeThemeCustomColor("light_mode", "accent", "#111111");
    writeThemeCustom({
      light_mode: { background: "#222222" },
      dark_mode: { text: "#eeeeee" },
    });
    const t = readThemeSettings();
    expect(t.preset).toBe("ocean");
    expect(t.custom.light_mode).toEqual({ background: "#222222" });
    expect(t.custom.dark_mode).toEqual({ text: "#eeeeee" });
  });

  test("writeThemeCustom does not clobber other settings sections", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ ui: { side_menu_open: true } }),
    );
    writeThemeCustom({ light_mode: { accent: "#abcdef" }, dark_mode: {} });
    const root = JSON.parse(window.localStorage.getItem("settings"));
    expect(root.ui.side_menu_open).toBe(true);
    expect(root.appearance.theme.custom.light_mode.accent).toBe("#abcdef");
  });

  test("resetThemeSettings clears to default", () => {
    writeThemeCustomColor("light_mode", "accent", "#111111");
    writeThemePreset("ocean");
    resetThemeSettings();
    expect(readThemeSettings()).toEqual({
      preset: "default",
      custom: { light_mode: {}, dark_mode: {} },
    });
  });

  test("clearThemeCustomColor removes the key (back to auto)", () => {
    writeThemeCustomColor("dark_mode", "surface", "#333333");
    const after = clearThemeCustomColor("dark_mode", "surface");
    expect(after.custom.dark_mode.surface).toBeUndefined();
  });

  test("readThemeSettings strips a tier equal to its preset default (auto normalize)", () => {
    resetThemeSettings(); // preset default
    writeThemeCustomColor("dark_mode", "surface", "#1e1e1e"); // == default dark surface
    const read = readThemeSettings();
    expect(read.custom.dark_mode.surface).toBeUndefined();
  });

  test("readThemeSettings keeps a genuinely overridden tier", () => {
    resetThemeSettings();
    writeThemeCustomColor("dark_mode", "surface", "#334455");
    const read = readThemeSettings();
    expect(read.custom.dark_mode.surface).toBe("#334455");
  });
});
