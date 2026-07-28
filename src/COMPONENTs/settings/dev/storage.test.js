import {
  isDevSettingsAvailable,
  readDevSettings,
  writeDevSettings,
} from "./storage";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("settings/dev storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    delete window.runtime;
  });

  describe("isDevSettingsAvailable", () => {
    test("is false outside development builds", () => {
      window.runtime = { isElectron: true };
      expect(isDevSettingsAvailable()).toBe(false);
    });

    test("is false in development without the Electron runtime marker", () => {
      process.env.NODE_ENV = "development";
      delete window.runtime;
      expect(isDevSettingsAvailable()).toBe(false);

      window.runtime = { isElectron: false };
      expect(isDevSettingsAvailable()).toBe(false);
    });

    test("is true only in development inside Electron", () => {
      process.env.NODE_ENV = "development";
      window.runtime = { isElectron: true };
      expect(isDevSettingsAvailable()).toBe(true);
    });
  });

  describe("readDevSettings", () => {
    test("returns defaults when nothing is stored", () => {
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: false });
    });

    test("returns defaults when the settings JSON is corrupted", () => {
      window.localStorage.setItem("settings", "{not valid json");
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: false });
    });

    test("returns defaults when the dev section is not an object", () => {
      window.localStorage.setItem(
        "settings",
        JSON.stringify({ dev: ["nope"] }),
      );
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: false });
    });

    test("coerces non-boolean stored values to false", () => {
      window.localStorage.setItem(
        "settings",
        JSON.stringify({ dev: { chrome_terminal_enabled: "true" } }),
      );
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: false });
    });

    test("reads a persisted true back", () => {
      window.localStorage.setItem(
        "settings",
        JSON.stringify({ dev: { chrome_terminal_enabled: true } }),
      );
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: true });
    });
  });

  describe("writeDevSettings", () => {
    test("persists the toggle under settings.dev and reads back", () => {
      expect(writeDevSettings({ chrome_terminal_enabled: true })).toEqual({
        chrome_terminal_enabled: true,
      });
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: true });

      expect(writeDevSettings({ chrome_terminal_enabled: false })).toEqual({
        chrome_terminal_enabled: false,
      });
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: false });
    });

    test("preserves sibling settings sections and unknown dev keys", () => {
      window.localStorage.setItem(
        "settings",
        JSON.stringify({
          appearance: { theme: "dark_mode" },
          dev: { future_dev_key: "keep-me" },
        }),
      );

      writeDevSettings({ chrome_terminal_enabled: true });

      expect(
        JSON.parse(window.localStorage.getItem("settings") || "{}"),
      ).toEqual({
        appearance: { theme: "dark_mode" },
        dev: {
          future_dev_key: "keep-me",
          chrome_terminal_enabled: true,
        },
      });
    });

    test("ignores unrelated patch keys and coerces non-boolean values", () => {
      expect(
        writeDevSettings({
          chrome_terminal_enabled: "yes",
          unrelated_key: true,
        }),
      ).toEqual({ chrome_terminal_enabled: false });

      const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
      expect(root.dev).toEqual({ chrome_terminal_enabled: false });
      expect(root.dev.unrelated_key).toBeUndefined();
    });

    test("an empty patch leaves the stored value unchanged", () => {
      writeDevSettings({ chrome_terminal_enabled: true });
      expect(writeDevSettings({})).toEqual({ chrome_terminal_enabled: true });
      expect(readDevSettings()).toEqual({ chrome_terminal_enabled: true });
    });

    test("repairs a corrupted settings root on write", () => {
      window.localStorage.setItem("settings", "{not valid json");

      expect(writeDevSettings({ chrome_terminal_enabled: true })).toEqual({
        chrome_terminal_enabled: true,
      });
      expect(
        JSON.parse(window.localStorage.getItem("settings") || "{}"),
      ).toEqual({ dev: { chrome_terminal_enabled: true } });
    });
  });
});
