// Agent/Recipe folder tree storage — Phase 2 S4 of the settings SQLite
// migration (docs/architecture/settings-sqlite-migration-plan.md §3.5).
//
// The tree is stored WHOLE as the settings namespace "agent_folder_tree_v1"
// (no relational split — §3.5 is explicit about that). All SQL-mode reads and
// writes go through settings_repository, which already provides the in-memory
// snapshot, the optimistic-update/rollback semantics, and the single FIFO
// persistence queue — no new IPC surface is needed.
//
// Modes (decided per call via the repository, no local caching):
// - SQL mode (repository mode === "sql"): reads clone the namespace value out
//   of the repository snapshot (fresh object per call, mirroring the legacy
//   fresh-JSON.parse semantics); writes are optimistic + fire-and-forget
//   queued IPC. Persistence failures are logged (store name + error code
//   only, never tree content) and never thrown — identical to the legacy
//   saveRaw try/catch noop.
// - Fallback mode (browser dev / Jest / degraded Electron): the pre-S4 code
//   path, byte-for-byte — standalone localStorage key, silent write failures.
//
// Migration: "agent_folder_tree_v1" is a STANDALONE localStorage key, so the
// Phase 1B settings-root migration never carried it. On first use in SQL mode,
// if the namespace is absent and a parseable legacy tree exists, it is written
// once via replaceNamespace (the namespace mechanism is naturally idempotent —
// once present, no re-seed). The legacy key is preserved read-only. If the
// seed write fails, this store degrades to localStorage for the rest of the
// session (per-store migration contract) and retries next boot.

import {
  readNamespace,
  replaceNamespace,
  getSettingsPersistenceStatus,
} from "./settings_repository";
import { parseSettingsStorageErrorCode } from "./bridges/settings_storage_bridge";

const STORAGE_KEY = "agent_folder_tree_v1";
const ROOT_ORDER_KEY = "__root__";
const FOLDER_NODE_PREFIX = "folder:";

// Sentinel distinguishing "namespace absent" from any storable JSON value.
const NAMESPACE_MISSING = Object.freeze({});

// Session flags for the one-time legacy seed. `legacySeedAttempted` keeps the
// seed from re-running (the optimistic snapshot makes retries pointless while
// it holds); `sqlDisabledThisSession` is the per-store degradation switch —
// a failed seed import must leave legacy localStorage authoritative for the
// whole session (retry next boot), never a half-adopted SQL namespace.
let legacySeedAttempted = false;
let sqlDisabledThisSession = false;

const isSqlBacked = () =>
  !sqlDisabledThisSession && getSettingsPersistenceStatus().mode === "sql";

const warnPersistFailed = (error) => {
  const code =
    parseSettingsStorageErrorCode(error) ||
    (error && error.code) ||
    "settings_storage_error";
  // Log contains the store name and error code only — never tree content.
  console.warn("[agent-folder-storage] persist failed:", code);
};

// Legacy standalone-key read — the pre-S4 loadRaw, unchanged. Also serves as
// the seed source in SQL mode (legacy stays read-only afterwards).
function readLegacyRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (_exc) {
    return null;
  }
}

// One-time first-use migration (SQL mode only). Idempotence comes from the
// namespace itself: once it exists (seeded or user-written), no re-seed.
function seedNamespaceFromLegacy() {
  if (legacySeedAttempted) return;
  legacySeedAttempted = true;
  if (readNamespace(STORAGE_KEY, NAMESPACE_MISSING) !== NAMESPACE_MISSING) {
    return; // already migrated (or already written) — nothing to do
  }
  const legacy = readLegacyRaw();
  if (!legacy) return; // no legacy tree (or unparseable) — nothing to migrate
  replaceNamespace(STORAGE_KEY, legacy).catch((error) => {
    warnPersistFailed(error);
    // Import failed and the repository rolled the namespace back: degrade
    // this store to localStorage for the session so the user keeps seeing
    // the legacy tree; the seed retries on the next boot.
    sqlDisabledThisSession = true;
    console.warn(
      "[agent-folder-storage] legacy seed failed; using localStorage for this session",
    );
  });
}

function loadRaw() {
  if (isSqlBacked()) {
    seedNamespaceFromLegacy();
    if (sqlDisabledThisSession) return readLegacyRaw();
    const value = readNamespace(STORAGE_KEY, null);
    // Same corruption tolerance as the legacy parse: non-object ⇒ null.
    if (!value || typeof value !== "object") return null;
    try {
      // Fresh clone per read — legacy JSON.parse returned a new object every
      // call, and repository snapshot values must never be mutated in place.
      return JSON.parse(JSON.stringify(value));
    } catch (_exc) {
      return null;
    }
  }
  return readLegacyRaw();
}

function saveRaw(state) {
  if (isSqlBacked()) {
    seedNamespaceFromLegacy();
    if (!sqlDisabledThisSession) {
      // Optimistic snapshot update + queued IPC via the repository. Failures
      // roll back inside the repository and are only logged here — the legacy
      // writer swallowed write failures too (never throws to callers).
      replaceNamespace(STORAGE_KEY, state).catch(warnPersistFailed);
      return;
    }
    // Seed just failed synchronously above — fall through to legacy.
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_exc) {
    // noop
  }
}

function defaultState() {
  return { folders: {}, recipeFolder: {}, folderOrder: [] };
}

export function getFolderState() {
  return loadRaw() || defaultState();
}

export function setFolderState(next) {
  saveRaw(next);
  return next;
}

export function createFolder({ name, parentId = null } = {}) {
  const state = getFolderState();
  const id = `f_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  state.folders[id] = {
    id,
    name: name || "New Folder",
    parentId,
    childFolderIds: [],
    expanded: true,
  };
  if (parentId && state.folders[parentId]) {
    state.folders[parentId].childFolderIds.push(id);
  } else {
    state.folderOrder.push(id);
  }
  saveRaw(state);
  return { state, folderId: id };
}

export function renameFolder(folderId, nextName) {
  const state = getFolderState();
  if (!state.folders[folderId]) return state;
  state.folders[folderId].name = nextName;
  saveRaw(state);
  return state;
}

export function deleteFolder(folderId) {
  const state = getFolderState();
  const folder = state.folders[folderId];
  if (!folder) return state;

  // Orphan any recipes whose folder is being removed.
  Object.keys(state.recipeFolder).forEach((name) => {
    if (state.recipeFolder[name] === folderId) {
      delete state.recipeFolder[name];
    }
  });

  // Cascade into child folders first.
  const childIds = [...folder.childFolderIds];
  childIds.forEach((childId) => {
    deleteFolder(childId);
  });

  const refreshed = getFolderState();
  const refreshedFolder = refreshed.folders[folderId];
  if (refreshedFolder) {
    if (refreshedFolder.parentId && refreshed.folders[refreshedFolder.parentId]) {
      const parent = refreshed.folders[refreshedFolder.parentId];
      parent.childFolderIds = parent.childFolderIds.filter((id) => id !== folderId);
    } else {
      refreshed.folderOrder = refreshed.folderOrder.filter((id) => id !== folderId);
    }
    delete refreshed.folders[folderId];
  }
  saveRaw(refreshed);
  return refreshed;
}

export function toggleFolderExpanded(folderId) {
  const state = getFolderState();
  const folder = state.folders[folderId];
  if (!folder) return state;
  folder.expanded = !folder.expanded;
  saveRaw(state);
  return state;
}

export function assignRecipeToFolder(recipeName, folderId) {
  const state = getFolderState();
  if (folderId === null) {
    delete state.recipeFolder[recipeName];
  } else {
    state.recipeFolder[recipeName] = folderId;
  }
  saveRaw(state);
  return state;
}

export function renameRecipeKey(oldName, newName) {
  const state = getFolderState();
  if (state.recipeFolder[oldName] !== undefined) {
    state.recipeFolder[newName] = state.recipeFolder[oldName];
    delete state.recipeFolder[oldName];
    saveRaw(state);
  }
  return state;
}

export function forgetRecipe(recipeName) {
  const state = getFolderState();
  if (state.recipeFolder[recipeName] !== undefined) {
    delete state.recipeFolder[recipeName];
    saveRaw(state);
  }
  return state;
}

function folderIdFromExplorerNodeId(nodeId) {
  return typeof nodeId === "string" && nodeId.startsWith(FOLDER_NODE_PREFIX)
    ? nodeId.slice(FOLDER_NODE_PREFIX.length)
    : null;
}

function isRecipeNode(node) {
  return node?.kind === "recipe" || node?.type === "file";
}

export function applyAgentExplorerReorder({ data, root } = {}) {
  const state = getFolderState();
  const previousFolders = state.folders || {};
  const folders = {};
  const recipeFolder = {};
  const itemOrder = {};
  const folderOrder = [];

  Object.entries(previousFolders).forEach(([folderId, folder]) => {
    folders[folderId] = { ...folder, childFolderIds: [] };
  });

  const visit = (nodeIds, parentFolderId = null) => {
    const orderKey = parentFolderId || ROOT_ORDER_KEY;
    itemOrder[orderKey] = [];

    (Array.isArray(nodeIds) ? nodeIds : []).forEach((nodeId) => {
      const node = data?.[nodeId];
      if (!node) return;

      const folderId = folderIdFromExplorerNodeId(nodeId);
      if (folderId && previousFolders[folderId]) {
        folders[folderId] = {
          ...previousFolders[folderId],
          parentId: parentFolderId,
          childFolderIds: [],
        };
        itemOrder[orderKey].push(`${FOLDER_NODE_PREFIX}${folderId}`);
        if (parentFolderId && folders[parentFolderId]) {
          folders[parentFolderId].childFolderIds.push(folderId);
        } else {
          folderOrder.push(folderId);
        }
        visit(node.children || [], folderId);
        return;
      }

      if (!isRecipeNode(node)) return;
      const recipeName =
        typeof node.name === "string" && node.name ? node.name : nodeId;
      if (!recipeName || recipeName.startsWith(FOLDER_NODE_PREFIX)) return;
      itemOrder[orderKey].push(recipeName);
      if (parentFolderId) {
        recipeFolder[recipeName] = parentFolderId;
      }
    });
  };

  visit(root, null);

  return setFolderState({
    ...state,
    folders,
    recipeFolder,
    folderOrder,
    itemOrder,
  });
}

// Test-only: reset the one-time seed / degradation flags so the next call
// re-evaluates the mode and migration from scratch.
export function resetAgentFolderStorageForTests() {
  legacySeedAttempted = false;
  sqlDisabledThisSession = false;
}
