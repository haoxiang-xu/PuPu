import {
  readThemeSettings,
  writeThemePreset,
  writeThemeCustomColor,
  writeThemeCustom,
  writeThemeDetails,
  resetThemeSettings,
  clearThemeCustomColor,
} from "./storage";
import { getSettingsPersistenceStatus } from "../../../SERVICEs/settings_repository";

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

describe("theme details channel (chipBorder + border tier alpha overrides)", () => {
  beforeEach(() => window.localStorage.clear());

  test("writeThemeDetails persists a details bag", () => {
    writeThemeDetails({ dark_mode: { chipBorder: "#ff0000" } });
    const t = readThemeSettings();
    expect(t.details).toEqual({
      light_mode: {},
      dark_mode: { chipBorder: "#ff0000" },
    });
  });

  test("writeThemeCustomColor preserves an existing details bag", () => {
    writeThemeDetails({ dark_mode: { chipBorder: "#ff0000" } });
    writeThemeCustomColor("light_mode", "accent", "#111111");
    const t = readThemeSettings();
    expect(t.details.dark_mode.chipBorder).toBe("#ff0000");
    expect(t.custom.light_mode.accent).toBe("#111111");
  });

  test("writeThemePreset preserves an existing details bag", () => {
    writeThemeDetails({ light_mode: { chipBorder: "#00ff00" } });
    writeThemePreset("ocean");
    const t = readThemeSettings();
    expect(t.preset).toBe("ocean");
    expect(t.details.light_mode.chipBorder).toBe("#00ff00");
  });

  test("resetThemeSettings clears the details bag (full reset)", () => {
    writeThemeDetails({ dark_mode: { chipBorder: "#ff0000" } });
    resetThemeSettings();
    expect(readThemeSettings().details).toBeUndefined();
  });

  test("readThemeSettings preserves unknown detail keys (forward compat)", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        appearance: {
          theme: {
            preset: "default",
            custom: { light_mode: {}, dark_mode: {} },
            details: { light_mode: { futureKnob: 42 }, dark_mode: {} },
          },
        },
      }),
    );
    expect(readThemeSettings().details.light_mode.futureKnob).toBe(42);
  });

  test("import round-trip: a details bag written via writeThemeDetails survives a read (export uses the same object)", () => {
    writeThemeDetails({
      light_mode: { chipBorder: "#123456", borderAlphaMid: 0.4 },
      dark_mode: { chipBorder: "#654321" },
    });
    const exported = readThemeSettings();
    expect(exported.details.light_mode.chipBorder).toBe("#123456");
    expect(exported.details.light_mode.borderAlphaMid).toBe(0.4);
    expect(exported.details.dark_mode.chipBorder).toBe("#654321");
  });
});

describe("write failures (legacy bare-setItem contract)", () => {
  beforeEach(() => window.localStorage.clear());

  /* The pre-repository writeRoot called localStorage.setItem without
     try/catch: a quota error propagated synchronously out of every
     writeTheme* helper. The repository conversion must keep that contract in
     fallback mode. */
  test("writeThemePreset throws synchronously on a storage write failure", () => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
    try {
      expect(() => writeThemePreset("ocean")).toThrow(
        /localstorage_write_failed/,
      );
    } finally {
      spy.mockRestore();
    }
    expect(getSettingsPersistenceStatus().lastErrorCode).toBe(
      "localstorage_write_failed",
    );
    // the write really was dropped — readback still sees the default
    expect(readThemeSettings().preset).toBe("default");
  });
});
