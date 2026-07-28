import { isSetupComplete, markSetupComplete } from "./init_setup_storage";

describe("init setup storage", () => {
  beforeEach(() => window.localStorage.clear());

  test("isSetupComplete is false when nothing is persisted", () => {
    expect(isSetupComplete()).toBe(false);
  });

  test("isSetupComplete is false when app section exists without the flag", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ app: { other_key: 1 } }),
    );
    expect(isSetupComplete()).toBe(false);
  });

  test("markSetupComplete persists settings.app.setup_completed and reads back", () => {
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.app.setup_completed).toBe(true);
  });

  test("markSetupComplete preserves other settings sections and app keys", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        ui: { side_menu_open: true },
        app: { other_key: "keep" },
      }),
    );
    markSetupComplete();
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.ui.side_menu_open).toBe(true);
    expect(root.app.other_key).toBe("keep");
    expect(root.app.setup_completed).toBe(true);
  });

  test("corrupt settings JSON reads as not complete", () => {
    window.localStorage.setItem("settings", "{not json");
    expect(isSetupComplete()).toBe(false);
  });

  test("markSetupComplete repairs a corrupt settings root", () => {
    window.localStorage.setItem("settings", "{not json");
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.app.setup_completed).toBe(true);
  });

  test("marking twice stays complete and idempotent", () => {
    markSetupComplete();
    markSetupComplete();
    expect(isSetupComplete()).toBe(true);
  });
});
