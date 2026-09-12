import {
  ATTACH_PANEL_LAYOUT_NAMESPACE,
  DEFAULT_ATTACH_PANEL_LAYOUT,
  MOVABLE_ATTACH_WIDGETS,
  moveAttachWidget,
  normalizeAttachPanelLayout,
  readAttachPanelLayout,
  setAttachWidgetHidden,
  subscribeAttachPanelLayout,
  writeAttachPanelLayout,
} from "./attach_panel_layout";
import {
  readNamespace,
  resetSettingsRepositoryForTests,
} from "./settings_repository";

describe("attach_panel_layout", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
  });

  /* the edit tests start from everything visible, so what they tuck is
     what shows up in `hidden` */
  const ALL_VISIBLE = { version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: [] };

  test("the default order is today's row order; a first launch shows the ring, plugins and workspace and tucks the rest", () => {
    expect(MOVABLE_ATTACH_WIDGETS).toEqual([
      "context_composition",
      "attach",
      "screenshot",
      "tools",
      "workspace",
      "link",
    ]);
    expect(DEFAULT_ATTACH_PANEL_LAYOUT).toEqual({
      version: 1,
      order: MOVABLE_ATTACH_WIDGETS,
      hidden: ["attach", "screenshot", "link"],
    });
    /* no record yet → the default; the row reads context_composition, tools, workspace */
    expect(readAttachPanelLayout()).toEqual(DEFAULT_ATTACH_PANEL_LAYOUT);
    const row = readAttachPanelLayout().order.filter((id) => !readAttachPanelLayout().hidden.includes(id));
    expect(row).toEqual(["context_composition", "tools", "workspace"]);
    /* a record that says "nothing tucked" is honoured — the default is for the first launch only */
    writeAttachPanelLayout(ALL_VISIBLE);
    expect(readAttachPanelLayout().hidden).toEqual([]);
  });

  test("normalize drops unknown ids, de-duplicates, and appends widgets the record never knew about", () => {
    // a record written before `link` existed, with a stray id and a repeat
    const normalized = normalizeAttachPanelLayout({
      version: 1,
      order: ["tools", "bogus", "attach", "tools", "context_composition"],
      hidden: ["tools", "bogus", "never-in-order"],
    });
    expect(normalized).toEqual({
      version: 1,
      order: ["tools", "attach", "context_composition", "screenshot", "workspace", "link"],
      hidden: ["tools"],
    });
  });

  test("anything unusable reads as the default, never throws", () => {
    expect(normalizeAttachPanelLayout(null)).toEqual(DEFAULT_ATTACH_PANEL_LAYOUT);
    expect(normalizeAttachPanelLayout("x")).toEqual(DEFAULT_ATTACH_PANEL_LAYOUT);
    expect(normalizeAttachPanelLayout({ version: 2, order: ["attach"] })).toEqual(
      DEFAULT_ATTACH_PANEL_LAYOUT,
    );
    expect(normalizeAttachPanelLayout({ version: 1, order: "attach", hidden: 3 })).toEqual(
      DEFAULT_ATTACH_PANEL_LAYOUT,
    );
  });

  test("write round-trips through the settings repository under its own namespace", () => {
    writeAttachPanelLayout({
      version: 1,
      order: ["screenshot", "attach", "context_composition", "tools", "workspace", "link"],
      hidden: ["link", "workspace"],
    });
    expect(readNamespace(ATTACH_PANEL_LAYOUT_NAMESPACE, null)).toEqual({
      version: 1,
      order: ["screenshot", "attach", "context_composition", "tools", "workspace", "link"],
      hidden: ["link", "workspace"],
    });
    expect(readAttachPanelLayout().hidden).toEqual(["link", "workspace"]);
  });

  test("moveAttachWidget places a widget at an index and keeps every other widget's relative order", () => {
    const layout = DEFAULT_ATTACH_PANEL_LAYOUT;
    expect(moveAttachWidget(layout, "workspace", 0).order).toEqual([
      "workspace", "context_composition", "attach", "screenshot", "tools", "link",
    ]);
    expect(moveAttachWidget(layout, "context_composition", 5).order).toEqual([
      "attach", "screenshot", "tools", "workspace", "link", "context_composition",
    ]);
    // out-of-range clamps; unknown id is a no-op
    expect(moveAttachWidget(layout, "attach", 99).order[5]).toBe("attach");
    expect(moveAttachWidget(layout, "bogus", 0)).toEqual(layout);
    // the input is never mutated
    expect(layout.order).toEqual(MOVABLE_ATTACH_WIDGETS);
  });

  test("setAttachWidgetHidden tucks and untucks without touching the order", () => {
    const tucked = setAttachWidgetHidden(ALL_VISIBLE, "link", true);
    expect(tucked.hidden).toEqual(["link"]);
    expect(tucked.order).toEqual(MOVABLE_ATTACH_WIDGETS);
    const twice = setAttachWidgetHidden(tucked, "link", true);
    expect(twice.hidden).toEqual(["link"]);
    expect(setAttachWidgetHidden(twice, "link", false).hidden).toEqual([]);
    expect(setAttachWidgetHidden(twice, "bogus", true)).toEqual(twice);
  });

  test("subscribers hear a write of this namespace only", () => {
    const heard = [];
    const unsubscribe = subscribeAttachPanelLayout((layout) => heard.push(layout.hidden));
    writeAttachPanelLayout(setAttachWidgetHidden(ALL_VISIBLE, "screenshot", true));
    expect(heard).toEqual([["screenshot"]]);
    unsubscribe();
    writeAttachPanelLayout(ALL_VISIBLE);
    expect(heard).toHaveLength(1);
  });
});
