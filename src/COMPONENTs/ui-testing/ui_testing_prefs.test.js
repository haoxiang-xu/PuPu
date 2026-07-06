import { loadPrefs, savePrefs } from "./ui_testing_prefs";

const KEY = "pupu.uiTesting.prefs";

describe("ui_testing_prefs", () => {
  beforeEach(() => localStorage.clear());

  test("returns defaults when nothing is stored", () => {
    expect(loadPrefs()).toEqual({
      dockPos: null,
      navCollapsed: false,
      fullscreen: false,
    });
  });

  test("round-trips a saved prefs object", () => {
    savePrefs({ dockPos: { x: 40, y: 12 }, navCollapsed: true, fullscreen: true });
    expect(loadPrefs()).toEqual({
      dockPos: { x: 40, y: 12 },
      navCollapsed: true,
      fullscreen: true,
    });
  });

  test("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem(KEY, "{not valid json");
    expect(loadPrefs()).toEqual({
      dockPos: null,
      navCollapsed: false,
      fullscreen: false,
    });
  });

  test("drops an invalid dockPos shape", () => {
    localStorage.setItem(KEY, JSON.stringify({ dockPos: { x: "nope" }, navCollapsed: true }));
    expect(loadPrefs()).toEqual({
      dockPos: null,
      navCollapsed: true,
      fullscreen: false,
    });
  });
});
