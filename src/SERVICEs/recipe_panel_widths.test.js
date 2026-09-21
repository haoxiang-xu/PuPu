import {
  RECIPE_PANEL_LIMITS,
  readRecipePanelWidths,
  writeRecipePanelWidth,
  clearRecipePanelWidths,
} from "./recipe_panel_widths";

const STORAGE_KEY = "recipe_panel_widths";

describe("recipe_panel_widths", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("defaults to the panel minimums when nothing is stored", () => {
    expect(readRecipePanelWidths()).toEqual({
      list: RECIPE_PANEL_LIMITS.list.min,
      detail: RECIPE_PANEL_LIMITS.detail.min,
    });
    expect(RECIPE_PANEL_LIMITS.list.min).toBe(200);
    expect(RECIPE_PANEL_LIMITS.detail.min).toBe(300);
  });

  test("round-trips one panel width without touching the other", () => {
    writeRecipePanelWidth("list", 260);
    expect(readRecipePanelWidths()).toEqual({ list: 260, detail: 300 });

    writeRecipePanelWidth("detail", 420);
    expect(readRecipePanelWidths()).toEqual({ list: 260, detail: 420 });
  });

  test("clamps writes into [min, max] and rounds to whole pixels", () => {
    writeRecipePanelWidth("list", 20);
    writeRecipePanelWidth("detail", 5000);
    expect(readRecipePanelWidths()).toEqual({
      list: RECIPE_PANEL_LIMITS.list.min,
      detail: RECIPE_PANEL_LIMITS.detail.max,
    });

    writeRecipePanelWidth("list", 233.7);
    expect(readRecipePanelWidths().list).toBe(234);
  });

  test("ignores unknown panels and non-numeric widths", () => {
    writeRecipePanelWidth("sidebar", 300);
    writeRecipePanelWidth("list", "260");
    writeRecipePanelWidth("detail", NaN);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("corrupted or wrong-version records read back as defaults", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readRecipePanelWidths()).toEqual({ list: 200, detail: 300 });

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, list: 260, detail: 420 }),
    );
    expect(readRecipePanelWidths()).toEqual({ list: 200, detail: 300 });

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, list: 9999, detail: "x" }),
    );
    expect(readRecipePanelWidths()).toEqual({
      list: RECIPE_PANEL_LIMITS.list.max,
      detail: 300,
    });
  });

  test("clear removes the record", () => {
    writeRecipePanelWidth("list", 260);
    clearRecipePanelWidths();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readRecipePanelWidths()).toEqual({ list: 200, detail: 300 });
  });
});
