import {
  CATEGORY_IDS,
  PUPU_OFFICIAL_ID,
  categoryCounts,
  orderedCategories,
  matchesCategory,
} from "./store_categories";
import registry from "./mcp_toolkit_registry.json";

const entry = (id, storeCategory) => ({ id, storeCategory });

describe("categoryCounts", () => {
  test("counts entries, packs and builtins into their categories", () => {
    const counts = categoryCounts({
      entries: [entry("a", "dev"), entry("b", "dev"), entry("c", "workspace")],
      packs: [entry("p1", "dev")],
      builtins: [entry("core"), entry("plan")],
    });

    expect(counts.dev).toBe(3);
    expect(counts.workspace).toBe(1);
    expect(counts[PUPU_OFFICIAL_ID]).toBe(2);
  });

  test("an item with no category is counted in no category", () => {
    const counts = categoryCounts({ entries: [entry("a"), entry("b", "dev")] });

    expect(counts.dev).toBe(1);
    expect(Object.values(counts).reduce((n, v) => n + v, 0)).toBe(1);
  });

  test("an unknown category value is treated as absent, not as a new category", () => {
    const counts = categoryCounts({ entries: [entry("a", "nonsense"), entry("b", 42)] });

    expect(counts.nonsense).toBeUndefined();
    expect(Object.keys(counts)).toHaveLength(0);
  });

  test("a registry entry carries its subject as `category`, and is counted by it", () => {
    // The shipped registry has no storeCategory at all; only packs and, later,
    // catalog toolkits do. Reading storeCategory alone would count every
    // registry entry as uncategorized and leave the rail showing only packs.
    const counts = categoryCounts({
      entries: [{ id: "a", category: "dev" }, { id: "b", category: "dev" }],
    });

    expect(counts.dev).toBe(2);
  });

  test("storeCategory wins when an item carries both", () => {
    const counts = categoryCounts({
      entries: [{ id: "a", category: "dev", storeCategory: "workspace" }],
    });

    expect(counts.workspace).toBe(1);
    expect(counts.dev).toBeUndefined();
  });

  test("the real registry's listable entries all land in a known category", () => {
    const listable = registry.entries.filter((e) => e.status !== "needs_review");
    const counts = categoryCounts({ entries: listable });
    const counted = Object.values(counts).reduce((n, v) => n + v, 0);

    expect(counted).toBe(listable.length);
  });
});

describe("orderedCategories", () => {
  test("pins PuPu Official first, then sorts the rest by count descending", () => {
    const ordered = orderedCategories({
      dev: 8,
      [PUPU_OFFICIAL_ID]: 4,
      workspace: 5,
      memory: 1,
    });

    expect(ordered.slice(0, 4).map((row) => row.id)).toEqual([
      PUPU_OFFICIAL_ID,
      "dev",
      "workspace",
      "memory",
    ]);
  });

  test("keeps an empty subject category, with its zero count (owner decision, 2026-09-29)", () => {
    // Communication is the live case: nothing in it is installable today.
    const ordered = orderedCategories({ dev: 2, memory: 1 });

    expect(ordered).toHaveLength(CATEGORY_IDS.length);
    expect(ordered.find((row) => row.id === "communication")).toEqual({
      id: "communication",
      count: 0,
    });
  });

  test("empty categories sort after every non-empty one", () => {
    const ordered = orderedCategories({ dev: 2, memory: 1 });
    const counts = ordered.map((row) => row.count);

    expect(counts).toEqual([...counts].sort((a, b) => b - a));
  });

  test("breaks a count tie by id, so the rail never reorders between renders", () => {
    const first = orderedCategories({ devops: 3, browser: 3 });
    const second = orderedCategories({ browser: 3, devops: 3 });

    expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));
    expect(first.slice(0, 2).map((row) => row.id)).toEqual(["browser", "devops"]);
  });

  test("leaves PuPu Official out when nothing is in it — it is provenance, not a subject", () => {
    const ordered = orderedCategories({ dev: 1, [PUPU_OFFICIAL_ID]: 0 });

    expect(ordered.map((row) => row.id)).not.toContain(PUPU_OFFICIAL_ID);
  });

  test("ignores an id it does not know", () => {
    const ordered = orderedCategories({ dev: 1, nonsense: 9 });

    expect(ordered.map((row) => row.id)).not.toContain("nonsense");
  });
});

describe("matchesCategory", () => {
  test("every item matches All", () => {
    expect(matchesCategory(entry("a", "dev"), "all")).toBe(true);
    expect(matchesCategory(entry("b"), "all")).toBe(true);
  });

  test("an item matches only its own category", () => {
    expect(matchesCategory(entry("a", "dev"), "dev")).toBe(true);
    expect(matchesCategory(entry("a", "dev"), "workspace")).toBe(false);
  });

  test("an uncategorized item matches All and nothing else", () => {
    expect(matchesCategory(entry("a"), "all")).toBe(true);
    expect(matchesCategory(entry("a"), "dev")).toBe(false);
  });

  test("a registry entry matches its `category`", () => {
    expect(matchesCategory({ id: "a", category: "browser" }, "browser")).toBe(true);
    expect(matchesCategory({ id: "a", category: "browser" }, "dev")).toBe(false);
  });
});

describe("CATEGORY_IDS", () => {
  test("covers the seven subject categories the registry declares", () => {
    expect([...CATEGORY_IDS].sort()).toEqual([
      "browser",
      "communication",
      "dev",
      "devops",
      "memory",
      "productivity",
      "workspace",
    ]);
  });

  test("matches the registry's own declared categories, minus the All pseudo-category", () => {
    const declared = registry.categories.filter((id) => id !== "all").sort();

    expect([...CATEGORY_IDS].sort()).toEqual(declared);
  });
});
