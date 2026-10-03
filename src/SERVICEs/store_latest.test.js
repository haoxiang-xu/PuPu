import { admitAddedAt, latestItems, relativeDayLabel, todayIso } from "./store_latest";
import {
  clearMcpStoreEntriesCache,
  listMcpStoreEntries,
  setMcpStoreEntriesCache,
} from "./mcp_toolkit_store";

const TODAY = "2026-10-03";
const entry = (id, addedAt, extra = {}) => ({
  id,
  toolkitId: `mcp.${id}`,
  toolkitName: id,
  status: "available",
  addedAt,
  ...extra,
});
const pack = (id, reviewedAt) => ({ id, title: id, review: { reviewedAt } });

describe("admitAddedAt", () => {
  test("keeps a real ISO calendar date", () => {
    expect(admitAddedAt("2026-09-22", TODAY)).toBe("2026-09-22");
  });

  test.each([
    ["an impossible day", "2026-02-30"],
    ["a short year", "26-09-22"],
    ["slashes", "2026/09/22"],
    ["an unpadded month", "2026-9-22"],
    ["a number", 20260922],
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(admitAddedAt(value, TODAY)).toBe("");
  });

  test("rejects a date after today, but keeps today itself", () => {
    expect(admitAddedAt("2026-10-04", TODAY)).toBe("");
    expect(admitAddedAt(TODAY, TODAY)).toBe(TODAY);
  });
});

describe("latestItems", () => {
  test("puts the newest first, across entries and packs", () => {
    const rows = latestItems({
      entries: [entry("old", "2026-06-06"), entry("new", "2026-09-22")],
      packs: [pack("middle", "2026-07-18")],
      today: TODAY,
      limit: 3,
    });

    expect(rows.map((row) => row.name)).toEqual(["new", "middle", "old"]);
    expect(rows.map((row) => row.kind)).toEqual(["entry", "pack", "entry"]);
  });

  test("orders two items added the same day by name, every time", () => {
    const first = latestItems({
      entries: [entry("Notion", "2026-09-22")],
      packs: [pack("Humanizer", "2026-09-22")],
      today: TODAY,
    });
    const second = latestItems({
      entries: [entry("Notion", "2026-09-22")],
      packs: [pack("Humanizer", "2026-09-22")].reverse(),
      today: TODAY,
    });

    expect(first.map((row) => row.name)).toEqual(["Humanizer", "Notion"]);
    expect(second.map((row) => row.name)).toEqual(["Humanizer", "Notion"]);
  });

  test("leaves out what cannot be got: needs_review, deprecated and coming_soon", () => {
    const rows = latestItems({
      entries: [
        entry("review", "2026-09-30", { status: "needs_review" }),
        entry("gone", "2026-09-29", { status: "deprecated" }),
        entry("flagged", "2026-09-28", { deprecated: true }),
        entry("soon", "2026-09-27", { status: "coming_soon" }),
        entry("ok", "2026-09-01"),
      ],
      today: TODAY,
    });

    expect(rows.map((row) => row.name)).toEqual(["ok"]);
  });

  test("an undated, malformed or future item is simply not listed", () => {
    const rows = latestItems({
      entries: [
        entry("undated", undefined),
        entry("bad", "2026-02-30"),
        entry("future", "2099-01-01"),
        entry("ok", "2026-09-01"),
      ],
      packs: [{ id: "no-review", title: "no-review" }],
      today: TODAY,
    });

    expect(rows.map((row) => row.name)).toEqual(["ok"]);
  });

  test("respects the limit", () => {
    const rows = latestItems({
      entries: [entry("a", "2026-09-01"), entry("b", "2026-09-02"), entry("c", "2026-09-03")],
      today: TODAY,
      limit: 2,
    });

    expect(rows.map((row) => row.name)).toEqual(["c", "b"]);
  });

  test("an old sidecar that sends no dates leaves only the packs", () => {
    const rows = latestItems({
      entries: [{ id: "a", toolkitName: "a", status: "available" }],
      packs: [pack("p", "2026-09-22")],
      today: TODAY,
    });

    expect(rows.map((row) => row.kind)).toEqual(["pack"]);
  });

  test("when the sidecar returns nothing, the static registry fallback is still dated", () => {
    setMcpStoreEntriesCache({ entries: [] });
    try {
      const rows = latestItems({ entries: listMcpStoreEntries(), packs: [], today: TODAY });

      expect(rows.length).toBe(3);
      expect(rows[0].item.id).toBe("workspace.zotero-readonly");
      rows.forEach((row) => expect(row.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/));
    } finally {
      clearMcpStoreEntriesCache();
    }
  });
});

describe("relativeDayLabel", () => {
  test.each([
    ["2026-10-03", "today"],
    ["2026-10-02", "yesterday"],
    ["2026-09-22", "11 days ago"],
    ["2026-09-13", "3 weeks ago"],
    ["2026-07-25", "2 months ago"],
  ])("%s reads as %s", (iso, expected) => {
    expect(relativeDayLabel(iso, TODAY, "en")).toBe(expected);
  });

  test("speaks the app's locale", () => {
    expect(relativeDayLabel("2026-09-22", TODAY, "zh-CN")).toBe("11天前");
  });

  test("falls back to English on a locale Intl cannot use", () => {
    expect(relativeDayLabel("2026-09-22", TODAY, "not a locale")).toBe("11 days ago");
  });

  test("an inadmissible date has no label", () => {
    expect(relativeDayLabel("2026-02-30", TODAY, "en")).toBe("");
  });
});

describe("todayIso", () => {
  test("formats the local calendar day", () => {
    expect(todayIso(new Date(2026, 9, 3, 23, 59))).toBe("2026-10-03");
  });
});
