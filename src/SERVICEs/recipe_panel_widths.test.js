import {
  RECIPE_PANEL_LIMITS,
  panelMaxWidth,
  clampPanelWidth,
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

  test("clamps writes at the minimum and rounds to whole pixels", () => {
    writeRecipePanelWidth("list", 20);
    expect(readRecipePanelWidths().list).toBe(RECIPE_PANEL_LIMITS.list.min);

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
      JSON.stringify({ version: 1, list: 260, detail: "x" }),
    );
    expect(readRecipePanelWidths()).toEqual({ list: 260, detail: 300 });
  });

  test("clear removes the record", () => {
    writeRecipePanelWidth("list", 260);
    clearRecipePanelWidths();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(readRecipePanelWidths()).toEqual({ list: 200, detail: 300 });
  });
});

describe("panel width limits are a share of the container", () => {
  test("each panel caps at its own share of the available width", () => {
    // project owner, 2026-09-26: list 35%, detail 50%
    expect(RECIPE_PANEL_LIMITS.list.maxRatio).toBe(0.35);
    expect(RECIPE_PANEL_LIMITS.detail.maxRatio).toBe(0.5);

    expect(panelMaxWidth("list", 1000)).toBe(350);
    expect(panelMaxWidth("detail", 1000)).toBe(500);
  });

  test("a container too narrow for the share still allows the minimum", () => {
    // 35% of 400 is 140, below the list's 200 minimum
    expect(panelMaxWidth("list", 400)).toBe(RECIPE_PANEL_LIMITS.list.min);
    expect(panelMaxWidth("detail", 400)).toBe(RECIPE_PANEL_LIMITS.detail.min);
  });

  test("an unknown or unmeasured container falls back to the minimum", () => {
    expect(panelMaxWidth("list", 0)).toBe(RECIPE_PANEL_LIMITS.list.min);
    expect(panelMaxWidth("list", NaN)).toBe(RECIPE_PANEL_LIMITS.list.min);
    expect(panelMaxWidth("sidebar", 1000)).toBeNull();
  });

  test("clampPanelWidth holds a width inside the container's share", () => {
    expect(clampPanelWidth("list", 800, 1000)).toBe(350);
    expect(clampPanelWidth("list", 300, 1000)).toBe(300);
    expect(clampPanelWidth("list", 10, 1000)).toBe(200);
    expect(clampPanelWidth("detail", 900, 1200)).toBe(600);
  });

  test("a stored width wider than the current container is read back clamped", () => {
    writeRecipePanelWidth("list", 460);
    expect(readRecipePanelWidths().list).toBe(460);
    // the window shrank since: 35% of 800 is 280
    expect(readRecipePanelWidths(800).list).toBe(280);
  });
});
