/* Frontend store for user-uploaded Custom MCP icons — Phase 3 dual-mode store.
   Curated Store entries carry their icon in the registry; custom MCP recipes
   don't travel an icon through the backend, so the uploaded image is kept here
   keyed by toolkitId (mcp.custom.*). The icon-resolution layer
   (mcp_toolkit_store.js) consults this so Installed / chat selector / agent
   builder render the uploaded icon instead of the backend's generic glyph.

   Modes (decided once per session, mirroring token_usage/storage.js and
   default_toolkit_store.js):
   - "localStorage" (browser dev / Jest / degraded or pre-Phase-3 Electron):
     the EXACT legacy behavior below — every exported signature and validation
     rule is unchanged, so pre-Phase-3 tests keep passing untouched. Content is
     stored inline (base64 for png, raw text for svg) under the legacy key.
   - "sql" (Electron with the Phase 3 preload bridge): icon FILES live on disk
     under userData/assets/mcp-icons and asset_metadata (settings.db) holds only
     the metadata (plan §3.6). Reads answer from an in-memory mirror that
     hydrates lazily on first use (icons are read on demand, never bootstrapped
     — they can be large); until the mirror is ready a read returns null and the
     icon-resolution layer falls back to the generic mcp glyph (both callers,
     resolveMcpIcon / mcpStoreIconFor, tolerate null). Writes update the mirror
     optimistically and queue a fire-and-forget IPC.

   IMPORTANT content contract: ToolkitIcon renders png `content` as base64 but
   svg `content` as RAW UTF-8 text, so the store round-trips per mime and the
   value returned from getCustomMcpIcon is byte-identical to what was set.

   Per-store legacy migration (Phase 2/3 common contract): on first use, when no
   local marker (or SQL migration meta) shows completion and legacy icons exist,
   the (pre-cleaned) icons are sent through one idempotent, digest-guarded
   transaction. Until it resolves, reads AND writes keep hitting localStorage,
   so a failed migration degrades losslessly.

   Logging: store name and error codes only — never toolkit ids or icon bytes. */

import {
  settingsStorageBridge,
  isMcpIconBridgeAvailable,
  parseSettingsStorageErrorCode,
  getSqlStoreMigrationMeta,
  resetSessionBootstrapSnapshotForTests,
} from "./bridges/settings_storage_bridge";
import { computeSettingsMigrationDigest } from "./settings_repository";

const STORAGE_KEY = "custom_mcp_icons";
export const MCP_ICONS_MIGRATION_MARKER_KEY =
  "pupu.custom_mcp_icons_sql_migration.v1";

const MAX_ENTRIES = 100;
const MAX_CONTENT_LENGTH = 400_000; // ~300KB decoded — keeps localStorage small
// Mirror the main process cap (MCP_ICON_LIMITS.MAX_DECODED_BYTES) so the renderer
// never admits — optimistically into the mirror this session — an icon the main
// process will reject and then silently drop after the next restart.
const MAX_DECODED_BYTES = 300_000;
const MCP_ICONS_MIGRATION_VERSION = 1;

const VALID_MIME = new Set(["image/png", "image/svg+xml"]);

const utf8ByteLength = (str) =>
  typeof TextEncoder !== "undefined"
    ? new TextEncoder().encode(str).length
    : unescape(encodeURIComponent(str)).length;

// png content is base64 whose char length already bounds the decoded bytes
// (400_000 base64 chars ≈ 300_000 bytes, aligned with main); svg content is raw
// UTF-8 text, so its decoded size is the UTF-8 byte length and must be capped to
// the same 300_000-byte main-side limit, not the looser 400_000-char gate.
const iconContentWithinLimit = (mimeType, content) =>
  mimeType === "image/svg+xml"
    ? utf8ByteLength(content) <= MAX_DECODED_BYTES
    : content.length <= MAX_CONTENT_LENGTH;

/* A valid file-toolkit-icon as ToolkitIcon expects: { type:"file", content, mimeType }. */
const isValidIcon = (icon) =>
  Boolean(
    icon &&
      icon.type === "file" &&
      typeof icon.content === "string" &&
      icon.content &&
      VALID_MIME.has(icon.mimeType) &&
      iconContentWithinLimit(icon.mimeType, icon.content),
  );

const isCustomToolkitId = (toolkitId) =>
  typeof toolkitId === "string" && toolkitId.startsWith("mcp.custom.");

/* ─────────────────────────── legacy (localStorage) ───────────────────────── */

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return raw && typeof raw === "object" ? raw : {};
  } catch (_) {
    return {};
  }
};

const writeStore = (store) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (_) {
    // quota exceeded — silent
  }
};

const legacyGet = (toolkitId) => {
  const icon = readStore()[toolkitId];
  return isValidIcon(icon) ? icon : null;
};

const legacySet = (toolkitId, icon) => {
  const store = readStore();
  if (
    !Object.prototype.hasOwnProperty.call(store, toolkitId) &&
    Object.keys(store).length >= MAX_ENTRIES
  ) {
    return; // cap reached — don't grow unbounded
  }
  store[toolkitId] = {
    type: "file",
    content: icon.content,
    mimeType: icon.mimeType,
  };
  writeStore(store);
};

const legacyRemove = (toolkitId) => {
  const store = readStore();
  if (Object.prototype.hasOwnProperty.call(store, toolkitId)) {
    delete store[toolkitId];
    writeStore(store);
  }
};

/* ───────────────────────────── SQL mode machinery ───────────────────────── */

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

// { mime, content } (bridge shape) → { type:"file", content, mimeType } (icon).
const bridgeIconToRendererIcon = (icon) => {
  if (!isObject(icon)) return null;
  const rendererIcon = {
    type: "file",
    content: icon.content,
    mimeType: icon.mime,
  };
  return isValidIcon(rendererIcon) ? rendererIcon : null;
};

const readMigrationMarker = () => {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(MCP_ICONS_MIGRATION_MARKER_KEY) || "null",
    );
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeMigrationMarker = (digest, completedAt) => {
  try {
    window.localStorage.setItem(
      MCP_ICONS_MIGRATION_MARKER_KEY,
      JSON.stringify({
        digest: digest || null,
        completedAt: completedAt || Date.now(),
      }),
    );
  } catch {
    // best-effort; SQL meta (mcp_icons_migration_state) stays authoritative
  }
};

// The complete desired icon state from legacy localStorage, converted to the
// migration payload shape { [toolkitId]: { mime, content } }. Only valid custom
// icons travel — invalid entries are pre-dropped (the main process drops too).
const buildLegacyMigrationIcons = () => {
  const store = readStore();
  const icons = {};
  for (const [toolkitId, icon] of Object.entries(store)) {
    if (!isCustomToolkitId(toolkitId) || !isValidIcon(icon)) continue;
    icons[toolkitId] = { mime: icon.mimeType, content: icon.content };
  }
  return icons;
};

let state = null;
let settingsQuitBarrierActive = false;

const createInitialState = () => ({
  mode: "localStorage", // "sql" | "localStorage"
  degraded: false,
  lastErrorCode: null,
  migrated: false, // SQL is the authority (migration complete or unneeded)
  // Null prototype: toolkit ids are arbitrary strings — always own keys.
  mirror: Object.create(null), // owner -> { type:"file", content, mimeType }
  hydrated: false, // mirror reflects SQL content
  hydrating: false,
  hydratePromise: null,
  // Keys touched by an optimistic write while a hydrate is in flight — hydrate
  // must not clobber them with older SQL data.
  dirtyKeys: new Set(),
  pendingWrites: 0,
  queueTail: Promise.resolve(),
});

// Single FIFO queue (migration first, then writes in order) — same pattern as
// default_toolkit_store.js.
const enqueue = (s, op) => {
  s.pendingWrites += 1;
  const opPromise = s.queueTail.then(() => op());
  s.queueTail = opPromise.then(
    () => {
      s.pendingWrites -= 1;
    },
    () => {
      s.pendingWrites -= 1;
    },
  );
  opPromise.catch(() => {});
  return opPromise;
};

const degradeToFallback = (s, errorCode) => {
  s.mode = "localStorage";
  s.degraded = true;
  if (errorCode) s.lastErrorCode = errorCode;
  s.mirror = Object.create(null);
  s.hydrated = false;
};

// Lazy content hydrate: list owners then read each icon on demand. Runs once
// per session; an optimistic write during the flight (dirtyKeys) always wins.
// A failure leaves the store hydrated-but-partial (icons that failed to load
// show the generic glyph) rather than retrying on every render.
const startHydrate = (s) => {
  if (s.hydrated || s.hydrating) return s.hydratePromise || Promise.resolve();
  s.hydrating = true;
  s.hydratePromise = (async () => {
    try {
      const listed = await settingsStorageBridge.listMcpIconOwners();
      if (state !== s || s.mode !== "sql") return;
      const owners =
        listed && Array.isArray(listed.owners) ? listed.owners : [];
      for (const owner of owners) {
        const toolkitId = owner && owner.toolkitId;
        if (!isCustomToolkitId(toolkitId) || s.dirtyKeys.has(toolkitId)) {
          continue;
        }
        try {
          const res = await settingsStorageBridge.getMcpIconAsset(toolkitId);
          if (state !== s || s.mode !== "sql") return;
          if (s.dirtyKeys.has(toolkitId)) continue;
          const icon = res ? bridgeIconToRendererIcon(res.icon) : null;
          if (icon) s.mirror[toolkitId] = icon;
        } catch (_error) {
          // Skip this one; its icon stays absent (generic glyph).
        }
      }
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[custom-mcp-icon-store] hydrate failed:", code);
    } finally {
      if (state === s) {
        s.hydrated = true;
        s.hydrating = false;
      }
    }
  })();
  return s.hydratePromise;
};

const runMcpIconsMigration = async (s, icons) => {
  if (state !== s) return;
  const payloadBase = {
    migrationVersion: MCP_ICONS_MIGRATION_VERSION,
    icons,
  };
  let digest = null;
  try {
    digest = await computeSettingsMigrationDigest(payloadBase);
  } catch {
    digest = null; // main recomputes; a missing claimed digest is safe
  }
  const payload = digest ? { ...payloadBase, digest } : payloadBase;
  try {
    const result = await settingsStorageBridge.migrateMcpIconsLegacy(payload);
    if (state !== s) return;
    const status = result ? result.status : undefined;
    if (
      status === "complete" ||
      status === "already-complete" ||
      status === "refused-stale-digest"
    ) {
      if (status !== "refused-stale-digest") {
        writeMigrationMarker(result.digest || digest, result.migratedAt);
      } else {
        // SQL already migrated from different legacy data — SQL stays the
        // authority; no marker (mirrors the Phase 1B/2 ruling).
        console.warn(
          "[custom-mcp-icon-store] legacy migration refused (stale digest); " +
            "SQL stays authoritative",
        );
      }
      s.migrated = true;
      // SQL is now the authority: re-hydrate the mirror from it. Do NOT wipe
      // the mirror — it only ever holds this session's optimistic writes
      // (never a legacy seed; init leaves it empty and pre-migration reads go
      // straight to legacy), and migration just flushed those writes into SQL.
      // Wiping them here stranded any icon uploaded during the migration window
      // permanently: dirtyKeys is add-only, so the post-migration hydrate below
      // skips those keys (dirtyKeys.has) and never restores what the wipe
      // removed, leaving the icon showing the generic glyph for the whole
      // session despite being persisted. Keeping the mirror preserves optimistic
      // sets, keeps removes deleted, and lets hydrate fill in every other owner.
      s.hydrated = false;
      startHydrate(s);
      if (status === "complete" && result.droppedEntries > 0) {
        console.warn(
          `[custom-mcp-icon-store] migration dropped ${result.droppedEntries} ` +
            "invalid entrie(s)",
        );
      }
    } else {
      // Unknown resolution = unknown migration outcome; staying in SQL mode
      // could make a partial store look authoritative later (§11B.2-1).
      console.warn(
        "[custom-mcp-icon-store] legacy migration returned an unknown status; " +
          "degrading to localStorage fallback",
      );
      degradeToFallback(s, "migration_unknown_status");
    }
  } catch (error) {
    if (state !== s) return;
    const code =
      parseSettingsStorageErrorCode(error) || "settings_storage_error";
    console.warn("[custom-mcp-icon-store] legacy migration failed:", code);
    degradeToFallback(s, code);
  }
};

const ensureInit = () => {
  if (state) return state;
  const s = createInitialState();
  state = s;
  if (!isMcpIconBridgeAvailable()) {
    // Browser dev / Jest / pre-Phase-3 preload: legacy behavior, not degraded.
    return s;
  }
  s.mode = "sql";
  const hasLegacyData =
    typeof window !== "undefined" &&
    window.localStorage &&
    window.localStorage.getItem(STORAGE_KEY) != null;
  // Migration trigger consults BOTH sides. When the bootstrap snapshot carries
  // the per-store SQL migration meta, that state is the authority: a marker can
  // outlive a reset/replaced settings.db (stale marker → re-migrate), and SQL
  // already complete with a lost marker just restores the marker. A null meta
  // (older main process) falls back to marker-only behavior.
  const sqlMeta = getSqlStoreMigrationMeta("mcpIcons");
  const sqlMigrated = sqlMeta !== null && sqlMeta.state === "complete";
  const shouldMigrate =
    hasLegacyData &&
    (sqlMeta !== null ? !sqlMigrated : !readMigrationMarker());
  if (shouldMigrate) {
    // Pre-migration: legacy stays authoritative (reads + write-through) until
    // the queued migration resolves.
    s.migrated = false;
    enqueue(s, () => runMcpIconsMigration(s, buildLegacyMigrationIcons()));
  } else {
    s.migrated = true;
    if (sqlMigrated && !readMigrationMarker()) {
      writeMigrationMarker(sqlMeta.digest, sqlMeta.migratedAt);
    }
    // Mirror stays empty until the first read triggers a lazy hydrate.
  }
  return s;
};

// Optimistic write into the mirror + queued IPC. During migration (pre-
// authority) the write also goes through to legacy so a failed migration keeps
// every icon.
const commitIconWrite = (s, toolkitId, icon) => {
  s.mirror[toolkitId] = icon;
  s.dirtyKeys.add(toolkitId);
  if (!s.migrated) legacySet(toolkitId, icon);
  enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      legacySet(toolkitId, icon);
      return;
    }
    try {
      await settingsStorageBridge.setMcpIconAsset(toolkitId, {
        mime: icon.mimeType,
        content: icon.content,
      });
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[custom-mcp-icon-store] set persist failed:", code);
    }
  });
};

const commitIconRemove = (s, toolkitId) => {
  delete s.mirror[toolkitId];
  s.dirtyKeys.add(toolkitId);
  if (!s.migrated) legacyRemove(toolkitId);
  enqueue(s, async () => {
    if (state !== s) return;
    if (s.mode !== "sql") {
      legacyRemove(toolkitId);
      return;
    }
    try {
      await settingsStorageBridge.deleteMcpIconAsset(toolkitId);
    } catch (error) {
      const code =
        parseSettingsStorageErrorCode(error) || "settings_storage_error";
      s.lastErrorCode = code;
      console.warn("[custom-mcp-icon-store] delete persist failed:", code);
    }
  });
};

/* ───────────────────────────── public surface ───────────────────────────── */

/* Returns the stored file-icon for a custom toolkitId, or null. Synchronous.
   In SQL mode, a read before the lazy content mirror is ready returns null —
   the icon-resolution layer falls back to the generic mcp glyph and the icon
   appears on a later render once hydration completes. */
export function getCustomMcpIcon(toolkitId) {
  if (!isCustomToolkitId(toolkitId)) return null;
  const s = ensureInit();
  if (s.mode === "localStorage") {
    return legacyGet(toolkitId);
  }
  if (!s.migrated) {
    // Migration pending — legacy stays authoritative.
    return legacyGet(toolkitId);
  }
  if (!s.hydrated) {
    startHydrate(s);
    // Mirror may already hold optimistic writes from this session.
    return isValidIcon(s.mirror[toolkitId]) ? s.mirror[toolkitId] : null;
  }
  return isValidIcon(s.mirror[toolkitId]) ? s.mirror[toolkitId] : null;
}

/* Persists an uploaded icon for a custom toolkitId. Invalid icons are ignored.
   Passing a nullish icon removes any existing entry. */
export function setCustomMcpIcon(toolkitId, icon) {
  if (settingsQuitBarrierActive) return;
  if (!isCustomToolkitId(toolkitId)) return;
  if (icon == null) {
    removeCustomMcpIcon(toolkitId);
    return;
  }
  if (!isValidIcon(icon)) return;
  const s = ensureInit();
  if (s.mode === "localStorage") {
    legacySet(toolkitId, icon);
    return;
  }
  // Entry-cap parity with the legacy store (main enforces its own cap too).
  const isNewOwner = !Object.prototype.hasOwnProperty.call(
    s.mirror,
    toolkitId,
  );
  if (isNewOwner && Object.keys(s.mirror).length >= MAX_ENTRIES) {
    return;
  }
  const normalizedIcon = {
    type: "file",
    content: icon.content,
    mimeType: icon.mimeType,
  };
  commitIconWrite(s, toolkitId, normalizedIcon);
}

/* Drops the stored icon for a custom toolkitId (called on delete). */
export function removeCustomMcpIcon(toolkitId) {
  if (settingsQuitBarrierActive) return;
  if (!isCustomToolkitId(toolkitId)) return;
  const s = ensureInit();
  if (s.mode === "localStorage") {
    legacyRemove(toolkitId);
    return;
  }
  commitIconRemove(s, toolkitId);
}

/* True when this session persists custom MCP icons to SQL (Electron, Phase 3+). */
export function isCustomMcpIconSqlBacked() {
  return ensureInit().mode === "sql";
}

/* Resolve when every queued icon operation (migration, hydrate, writes) has
   settled (tests/QA). */
export async function flushCustomMcpIconWrites() {
  const s = ensureInit();
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
  if (state === s && s.hydratePromise) {
    await s.hydratePromise;
  }
}

/**
 * Stop admitting icon mutations synchronously, then wait until the existing
 * FIFO settle-tail is stable. A rejected icon IPC is already code-only logged
 * by its operation; this boundary guarantees it settled before teardown, not
 * that a rejected write became durable.
 *
 * Deliberately never calls ensureInit(): an unused icon store has no accepted
 * write to drain. A later read may still start a retryable legacy migration or
 * read-only hydrate, but legacy remains durable until migration commits.
 */
export async function beginCustomMcpIconQuitDrain() {
  settingsQuitBarrierActive = true;
  const s = state;
  if (!s) return;
  let tail;
  do {
    tail = s.queueTail;
    await tail;
  } while (state === s && tail !== s.queueTail);
}

export function endCustomMcpIconQuitDrain() {
  settingsQuitBarrierActive = false;
}

/* Test-only: drop module state so the next call re-runs init. */
export function resetCustomMcpIconStoreForTests() {
  state = null;
  settingsQuitBarrierActive = false;
  resetSessionBootstrapSnapshotForTests();
}
