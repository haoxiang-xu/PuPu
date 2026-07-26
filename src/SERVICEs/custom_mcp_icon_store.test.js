import {
  getCustomMcpIcon,
  setCustomMcpIcon,
  removeCustomMcpIcon,
  isCustomMcpIconSqlBacked,
  flushCustomMcpIconWrites,
  resetCustomMcpIconStoreForTests,
  MCP_ICONS_MIGRATION_MARKER_KEY,
} from "./custom_mcp_icon_store";

const pngIcon = { type: "file", content: "aGVsbG8=", mimeType: "image/png" };
const svgIcon = {
  type: "file",
  content: "<svg></svg>",
  mimeType: "image/svg+xml",
};

afterEach(() => {
  resetCustomMcpIconStoreForTests();
  delete window.settingsStorageAPI;
  window.localStorage.clear();
});

// ─────────────────────────── fallback (localStorage) ────────────────────────
// The legacy behavior is unchanged in fallback mode (no bridge → browser dev /
// Jest / pre-Phase-3 preload). These are the pre-Phase-3 tests, verbatim.

describe("custom_mcp_icon_store — fallback (localStorage) mode", () => {
  beforeEach(() => window.localStorage.clear());

  test("stores and reads a png icon by custom toolkitId", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toEqual(pngIcon);
  });

  test("stores an svg icon", () => {
    setCustomMcpIcon("mcp.custom.svg-test", svgIcon);
    expect(getCustomMcpIcon("mcp.custom.svg-test")).toEqual(svgIcon);
  });

  test("ignores non-custom toolkitIds", () => {
    setCustomMcpIcon("mcp.memory.memory", pngIcon);
    expect(getCustomMcpIcon("mcp.memory.memory")).toBeNull();
  });

  test("ignores invalid icon shapes", () => {
    setCustomMcpIcon("mcp.custom.bad", { type: "builtin", name: "server" });
    setCustomMcpIcon("mcp.custom.bad2", {
      type: "file",
      content: "x",
      mimeType: "image/gif",
    });
    expect(getCustomMcpIcon("mcp.custom.bad")).toBeNull();
    expect(getCustomMcpIcon("mcp.custom.bad2")).toBeNull();
  });

  test("returns null for unknown id", () => {
    expect(getCustomMcpIcon("mcp.custom.missing")).toBeNull();
  });

  test("rejects an svg over the main-side 300KB decoded-byte cap", () => {
    // A 350K-char svg is raw UTF-8 text (bytes ≈ chars), so it exceeds the
    // main process's 300_000-byte limit even though it is under the 400_000-char
    // gate — the renderer must reject it up front rather than optimistically
    // admit an icon the main process will drop after the next restart.
    const bigSvg = {
      type: "file",
      content: `<svg>${"a".repeat(350_000)}</svg>`,
      mimeType: "image/svg+xml",
    };
    setCustomMcpIcon("mcp.custom.big-svg", bigSvg);
    expect(getCustomMcpIcon("mcp.custom.big-svg")).toBeNull();
  });

  test("accepts a png at the 400K base64-char cap (unchanged legacy limit)", () => {
    const maxPng = {
      type: "file",
      content: "a".repeat(400_000),
      mimeType: "image/png",
    };
    setCustomMcpIcon("mcp.custom.max-png", maxPng);
    expect(getCustomMcpIcon("mcp.custom.max-png")).toEqual(maxPng);
  });

  test("removes a stored icon", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    removeCustomMcpIcon("mcp.custom.local-test");
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
  });

  test("passing null removes the entry", () => {
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    setCustomMcpIcon("mcp.custom.local-test", null);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
  });

  test("survives corrupted storage", () => {
    window.localStorage.setItem("custom_mcp_icons", "not json{");
    expect(getCustomMcpIcon("mcp.custom.local-test")).toBeNull();
    setCustomMcpIcon("mcp.custom.local-test", pngIcon);
    expect(getCustomMcpIcon("mcp.custom.local-test")).toEqual(pngIcon);
  });

  test("is not SQL-backed without the bridge", () => {
    expect(isCustomMcpIconSqlBacked()).toBe(false);
  });
});

// ─────────────────────────────── SQL mode ───────────────────────────────────

// In-memory fake of the main-process asset store, wired through
// window.settingsStorageAPI so the renderer store enters "sql" mode.
const installSqlBackend = ({
  initialIcons = {},
  migrationState = "complete",
  migrateImpl,
} = {}) => {
  const store = new Map(Object.entries(initialIcons)); // owner -> { mime, content }
  const api = {
    bootstrap: jest.fn(() => ({
      available: true,
      degraded: false,
      schemaVersion: 2,
      migration: { state: "complete" },
      namespaces: {},
      revisions: {},
      storeMigrations: {
        mcpIcons: {
          state: migrationState,
          version: migrationState === "complete" ? 1 : null,
          digest: migrationState === "complete" ? "seed-digest" : null,
          migratedAt: migrationState === "complete" ? 111 : null,
        },
      },
    })),
    migrateLegacy: jest.fn(() => Promise.resolve({ status: "complete" })),
    setNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    deleteNamespace: jest.fn(() => Promise.resolve({ ok: true })),
    getMcpIconAsset: jest.fn((toolkitId) =>
      Promise.resolve({
        ok: true,
        icon: store.has(toolkitId) ? { ...store.get(toolkitId) } : null,
      }),
    ),
    setMcpIconAsset: jest.fn((toolkitId, icon) => {
      store.set(toolkitId, { mime: icon.mime, content: icon.content });
      return Promise.resolve({ ok: true, toolkitId });
    }),
    deleteMcpIconAsset: jest.fn((toolkitId) => {
      const deleted = store.delete(toolkitId);
      return Promise.resolve({ ok: true, deleted });
    }),
    listMcpIconOwners: jest.fn(() =>
      Promise.resolve({
        ok: true,
        owners: [...store.keys()].map((toolkitId) => ({
          toolkitId,
          mime: store.get(toolkitId).mime,
        })),
      }),
    ),
    migrateMcpIconsLegacy:
      migrateImpl ||
      jest.fn((payload) => {
        for (const [id, v] of Object.entries(payload.icons || {})) {
          store.set(id, { mime: v.mime, content: v.content });
        }
        return Promise.resolve({
          status: "complete",
          digest: "new-digest",
          migratedAt: 222,
          importedCount: Object.keys(payload.icons || {}).length,
          droppedEntries: 0,
        });
      }),
  };
  window.settingsStorageAPI = api;
  return { api, store };
};

describe("custom_mcp_icon_store — SQL mode", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    if (console.warn.mockRestore) console.warn.mockRestore();
  });

  test("is SQL-backed when the bridge is available", () => {
    installSqlBackend();
    expect(isCustomMcpIconSqlBacked()).toBe(true);
  });

  test("read before the mirror hydrates returns null, then serves the icon", async () => {
    // Already-migrated backend already holding an icon, no legacy data.
    installSqlBackend({
      initialIcons: {
        "mcp.custom.seeded": { mime: "image/png", content: "aGVsbG8=" },
      },
    });
    // First synchronous read triggers a lazy hydrate — mirror not ready yet.
    expect(getCustomMcpIcon("mcp.custom.seeded")).toBeNull();
    await flushCustomMcpIconWrites();
    // After hydration the icon is served, round-tripped to the renderer shape.
    expect(getCustomMcpIcon("mcp.custom.seeded")).toEqual({
      type: "file",
      content: "aGVsbG8=",
      mimeType: "image/png",
    });
  });

  test("svg content round-trips as raw text through the mirror", async () => {
    installSqlBackend({
      initialIcons: {
        "mcp.custom.svg": { mime: "image/svg+xml", content: "<svg></svg>" },
      },
    });
    getCustomMcpIcon("mcp.custom.svg");
    await flushCustomMcpIconWrites();
    expect(getCustomMcpIcon("mcp.custom.svg")).toEqual(svgIcon);
  });

  test("set writes through to the bridge and reads optimistically", async () => {
    const { api, store } = installSqlBackend();
    setCustomMcpIcon("mcp.custom.new", pngIcon);
    // Optimistic mirror serves the icon before the IPC settles.
    expect(getCustomMcpIcon("mcp.custom.new")).toEqual(pngIcon);
    await flushCustomMcpIconWrites();
    expect(api.setMcpIconAsset).toHaveBeenCalledWith("mcp.custom.new", {
      mime: "image/png",
      content: "aGVsbG8=",
    });
    expect(store.get("mcp.custom.new")).toEqual({
      mime: "image/png",
      content: "aGVsbG8=",
    });
  });

  test("remove deletes through the bridge and clears the mirror", async () => {
    const { api, store } = installSqlBackend({
      initialIcons: {
        "mcp.custom.gone": { mime: "image/png", content: "aGVsbG8=" },
      },
    });
    // Hydrate so the mirror knows about it first.
    getCustomMcpIcon("mcp.custom.gone");
    await flushCustomMcpIconWrites();
    removeCustomMcpIcon("mcp.custom.gone");
    expect(getCustomMcpIcon("mcp.custom.gone")).toBeNull();
    await flushCustomMcpIconWrites();
    expect(api.deleteMcpIconAsset).toHaveBeenCalledWith("mcp.custom.gone");
    expect(store.has("mcp.custom.gone")).toBe(false);
  });

  test("non-custom toolkitIds are still ignored in SQL mode", () => {
    const { api } = installSqlBackend();
    setCustomMcpIcon("mcp.memory.memory", pngIcon);
    expect(getCustomMcpIcon("mcp.memory.memory")).toBeNull();
    expect(api.setMcpIconAsset).not.toHaveBeenCalled();
  });

  test("first-use migration sends legacy icons and writes the marker", async () => {
    // Legacy icons present, SQL migration not yet complete → migrate on init.
    window.localStorage.setItem(
      "custom_mcp_icons",
      JSON.stringify({
        "mcp.custom.legacy": {
          type: "file",
          content: "aGVsbG8=",
          mimeType: "image/png",
        },
      }),
    );
    const { api, store } = installSqlBackend({ migrationState: "not_started" });
    // Trigger init (any call).
    getCustomMcpIcon("mcp.custom.legacy");
    await flushCustomMcpIconWrites();
    expect(api.migrateMcpIconsLegacy).toHaveBeenCalledTimes(1);
    const payload = api.migrateMcpIconsLegacy.mock.calls[0][0];
    expect(payload.migrationVersion).toBe(1);
    expect(payload.icons).toEqual({
      "mcp.custom.legacy": { mime: "image/png", content: "aGVsbG8=" },
    });
    expect(store.get("mcp.custom.legacy")).toEqual({
      mime: "image/png",
      content: "aGVsbG8=",
    });
    // Marker written locally.
    expect(
      JSON.parse(
        window.localStorage.getItem(MCP_ICONS_MIGRATION_MARKER_KEY) || "null",
      ),
    ).not.toBeNull();
    // Post-migration read serves the icon from the re-hydrated mirror.
    expect(getCustomMcpIcon("mcp.custom.legacy")).toEqual({
      type: "file",
      content: "aGVsbG8=",
      mimeType: "image/png",
    });
  });

  test("a failed migration degrades to localStorage (icons still served)", async () => {
    window.localStorage.setItem(
      "custom_mcp_icons",
      JSON.stringify({
        "mcp.custom.legacy": {
          type: "file",
          content: "aGVsbG8=",
          mimeType: "image/png",
        },
      }),
    );
    installSqlBackend({
      migrationState: "not_started",
      migrateImpl: jest.fn(() =>
        Promise.reject(new Error("[value_too_large] boom")),
      ),
    });
    // Trigger init + migration.
    getCustomMcpIcon("mcp.custom.legacy");
    await flushCustomMcpIconWrites();
    // Degraded to fallback: legacy localStorage still serves the icon.
    expect(isCustomMcpIconSqlBacked()).toBe(false);
    expect(getCustomMcpIcon("mcp.custom.legacy")).toEqual({
      type: "file",
      content: "aGVsbG8=",
      mimeType: "image/png",
    });
  });

  test("an icon SET as the first store touch during a pending migration survives the post-migration re-hydrate", async () => {
    // Legacy data present → a migration is queued on init. But the FIRST store
    // interaction is a SET (e.g. installing a custom MCP with an uploaded icon),
    // before any read has hydrated the mirror. Regression: the post-migration
    // re-hydrate used to wipe the mirror while dirtyKeys (add-only) kept the
    // just-uploaded key skipped, so the icon rendered the generic glyph for the
    // whole session despite being persisted.
    window.localStorage.setItem(
      "custom_mcp_icons",
      JSON.stringify({
        "mcp.custom.old": {
          type: "file",
          content: "aGVsbG8=",
          mimeType: "image/png",
        },
      }),
    );
    const { store } = installSqlBackend({ migrationState: "not_started" });
    // First touch is a SET of a brand-new icon (no prior read/hydrate).
    setCustomMcpIcon("mcp.custom.fresh", pngIcon);
    // Optimistic mirror serves it immediately.
    expect(getCustomMcpIcon("mcp.custom.fresh")).toEqual(pngIcon);
    await flushCustomMcpIconWrites();
    // Persisted to SQL (via the migration and/or the queued set).
    expect(store.has("mcp.custom.fresh")).toBe(true);
    // Still served after the migration re-hydrate — not stranded by the reset.
    expect(getCustomMcpIcon("mcp.custom.fresh")).toEqual(pngIcon);
  });

  test("SQL migration already complete (marker lost) restores the marker without re-migrating", async () => {
    window.localStorage.setItem(
      "custom_mcp_icons",
      JSON.stringify({
        "mcp.custom.legacy": {
          type: "file",
          content: "aGVsbG8=",
          mimeType: "image/png",
        },
      }),
    );
    // SQL says complete, no local marker → do NOT re-migrate; restore marker.
    const { api } = installSqlBackend({
      migrationState: "complete",
      initialIcons: {
        "mcp.custom.legacy": { mime: "image/png", content: "aGVsbG8=" },
      },
    });
    getCustomMcpIcon("mcp.custom.legacy");
    await flushCustomMcpIconWrites();
    expect(api.migrateMcpIconsLegacy).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.localStorage.getItem(MCP_ICONS_MIGRATION_MARKER_KEY) || "null",
      ),
    ).not.toBeNull();
  });
});
