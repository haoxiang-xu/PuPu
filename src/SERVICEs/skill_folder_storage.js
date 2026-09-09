// Skill/command folder tree storage — issue #232.
//
// Isomorphic to agent_folder_storage.js (Phase 2 S4 of the settings SQLite
// migration, docs/architecture/settings-sqlite-migration-plan.md §3.5): the
// tree is stored WHOLE as one settings namespace, and all SQL-mode reads and
// writes go through settings_repository, which already provides the in-memory
// snapshot, optimistic-update/rollback, and the single FIFO persistence queue.
// No new IPC surface.
//
// Two deliberate differences from the agent store:
//
// 1. No legacy seeding. "skill_folder_tree_v1" is a NEW namespace with no
//    pre-SQL standalone key behind it, so there is nothing to migrate and the
//    one-time seed path is absent rather than stubbed out.
//
// 2. Assignments are never auto-pruned. agent_folder_storage exposes
//    forgetRecipe() for a recipe that goes away; this module deliberately has
//    no equivalent. When a skill pack is updated and a skill disappears, its
//    entry in `commandFolder` is KEPT so that reinstalling the pack puts the
//    command back in the category the user filed it under. That retention IS
//    the mechanism behind #232's "survives skill pack updates" acceptance
//    (BC-001 / SEQ-001 #5-6) — removing a stale entry looks like tidiness and
//    is actually the bug.
//
// BC-001 admission is CLOSED: a stored tree carrying any key outside
// KNOWN_STATE_KEYS is rejected whole rather than partially applied, and the
// caller falls back to the empty tree (which renders as the flat command list
// PuPu shipped before this feature). The schema version lives in the namespace
// NAME, following the agent store's `_v1` convention — a future v2 claims a new
// namespace and leaves this one readable, so a downgrade finds its own tree
// intact instead of a rejected newer one.

import {
  readNamespace,
  replaceNamespace,
  getSettingsPersistenceStatus,
} from "./settings_repository";
import { parseSettingsStorageErrorCode } from "./bridges/settings_storage_bridge";

const STORAGE_KEY = "skill_folder_tree_v1";
const ROOT_ORDER_KEY = "__root__";
const FOLDER_NODE_PREFIX = "folder:";
/* Folders the PLUGIN defines, not the user. A skill pack, a toolkit or an MCP
   server is already a grouping its author named; deriving a folder from that
   is reading their declaration, whereas inventing category names for them
   would be us guessing at an organization they never asked for. Their ids live
   in their own namespace so a derived folder can never collide with a
   user-created one ("sf_..."), and so every writer can tell them apart by
   looking at the id alone. */
const PACK_FOLDER_PREFIX = "pack:";

export const isPackFolderId = (folderId) =>
  typeof folderId === "string" && folderId.startsWith(PACK_FOLDER_PREFIX);

/* A command belongs to a pack folder only when its author declared BOTH the
   owning plugin and that plugin's display name. No name, no folder — falling
   back to the toolkit id would put a slug in front of the user, which is the
   invented label this whole approach exists to avoid. */
const packFolderIdFor = (command) => {
  const toolkitId = command?.sourceToolkitId;
  const label = command?.sourceLabel;
  if (typeof toolkitId !== "string" || !toolkitId) return null;
  if (typeof label !== "string" || !label) return null;
  return `${PACK_FOLDER_PREFIX}${toolkitId}`;
};

/* CLOSED key set (BC-001). Every key is optional on read — absence means
   "default" — but an unrecognized key fails the whole tree. */
const KNOWN_STATE_KEYS = Object.freeze([
  "folders",
  "commandFolder",
  "folderOrder",
  "itemOrder",
]);

// Per-store degradation switch: once a SQL write path is known bad for this
// session, stay on localStorage until the next boot rather than half-adopting.
let sqlDisabledThisSession = false;

const isSqlBacked = () =>
  !sqlDisabledThisSession && getSettingsPersistenceStatus().mode === "sql";

const warnPersistFailed = (error) => {
  const code =
    parseSettingsStorageErrorCode(error) ||
    (error && error.code) ||
    "settings_storage_error";
  // Log carries the store name and error code only — never tree content.
  console.warn("[skill-folder-storage] persist failed:", code);
};

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * CLOSED admission. Returns the tree when it is admissible, or null when it
 * must be rejected — an unknown top-level key, or a known key whose type is
 * wrong. Rejection is whole-tree on purpose: applying the half we recognize
 * would silently discard organization the writer believed it had stored.
 */
function admitState(value) {
  if (!isPlainObject(value)) return null;

  for (const key of Object.keys(value)) {
    if (!KNOWN_STATE_KEYS.includes(key)) {
      console.warn(
        "[skill-folder-storage] rejecting stored tree: unknown key",
        key,
      );
      return null;
    }
  }

  const { folders, commandFolder, folderOrder, itemOrder } = value;
  if (folders !== undefined && !isPlainObject(folders)) return null;
  if (commandFolder !== undefined && !isPlainObject(commandFolder)) return null;
  if (folderOrder !== undefined && !Array.isArray(folderOrder)) return null;
  if (itemOrder !== undefined && !isPlainObject(itemOrder)) return null;

  return {
    folders: folders || {},
    commandFolder: commandFolder || {},
    folderOrder: folderOrder || [],
    itemOrder: itemOrder || {},
  };
}

function readFallbackRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return admitState(JSON.parse(raw));
  } catch (_exc) {
    return null;
  }
}

function loadRaw() {
  if (isSqlBacked()) {
    const value = readNamespace(STORAGE_KEY, null);
    const admitted = admitState(value);
    if (!admitted) return null;
    try {
      // Fresh clone per read: repository snapshot values must never be
      // mutated in place, and callers here mutate freely before saving.
      return JSON.parse(JSON.stringify(admitted));
    } catch (_exc) {
      return null;
    }
  }
  return readFallbackRaw();
}

function saveRaw(state) {
  if (isSqlBacked()) {
    // Optimistic snapshot update + queued IPC via the repository. Failures
    // roll back inside the repository and are only logged here — this writer
    // never throws to callers (same contract as agent_folder_storage).
    replaceNamespace(STORAGE_KEY, state).catch(warnPersistFailed);
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_exc) {
    // noop — a failed write leaves the in-memory state authoritative for
    // this session, exactly as the agent store behaves.
  }
}

function defaultState() {
  return { folders: {}, commandFolder: {}, folderOrder: [], itemOrder: {} };
}

export function getSkillFolderState() {
  return loadRaw() || defaultState();
}

export function setSkillFolderState(next) {
  saveRaw(next);
  return next;
}

export function createSkillFolder({ name, parentId = null } = {}) {
  const state = getSkillFolderState();
  const id = `sf_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  state.folders[id] = {
    id,
    name: name || "New Category",
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

export function renameSkillFolder(folderId, nextName) {
  const state = getSkillFolderState();
  if (!state.folders[folderId]) return state;
  state.folders[folderId].name = nextName;
  saveRaw(state);
  return state;
}

/**
 * Delete a folder and every folder under it. Commands filed into any removed
 * folder become unfiled (their assignment is dropped) — that is a user-driven
 * deletion, not the pack-update pruning this module refuses to do.
 */
export function deleteSkillFolder(folderId) {
  const state = getSkillFolderState();
  if (!state.folders[folderId]) return state;

  const doomed = [];
  const collect = (id) => {
    const folder = state.folders[id];
    if (!folder) return;
    doomed.push(id);
    (folder.childFolderIds || []).forEach(collect);
  };
  collect(folderId);
  const doomedSet = new Set(doomed);

  Object.keys(state.commandFolder).forEach((commandName) => {
    if (doomedSet.has(state.commandFolder[commandName])) {
      delete state.commandFolder[commandName];
    }
  });

  const root = state.folders[folderId];
  const parent = root.parentId ? state.folders[root.parentId] : null;
  if (parent) {
    parent.childFolderIds = (parent.childFolderIds || []).filter(
      (id) => id !== folderId,
    );
  } else {
    state.folderOrder = state.folderOrder.filter((id) => id !== folderId);
  }

  doomed.forEach((id) => {
    delete state.folders[id];
  });

  Object.keys(state.itemOrder).forEach((orderKey) => {
    if (doomedSet.has(orderKey)) {
      delete state.itemOrder[orderKey];
      return;
    }
    state.itemOrder[orderKey] = state.itemOrder[orderKey].filter(
      (nodeId) =>
        !(
          typeof nodeId === "string" &&
          nodeId.startsWith(FOLDER_NODE_PREFIX) &&
          doomedSet.has(nodeId.slice(FOLDER_NODE_PREFIX.length))
        ),
    );
  });

  saveRaw(state);
  return state;
}

export function toggleSkillFolderExpanded(folderId) {
  const state = getSkillFolderState();
  const folder = state.folders[folderId];
  if (!folder) return state;
  folder.expanded = !folder.expanded;
  saveRaw(state);
  return state;
}

/**
 * File a command into a folder, or pass folderId === null to return it to the
 * unfiled set. This is the only path that removes an assignment — nothing in
 * this module drops one because the command stopped being registered.
 */
export function assignCommandToFolder(commandName, folderId) {
  const state = getSkillFolderState();
  if (folderId === null) {
    delete state.commandFolder[commandName];
  } else {
    state.commandFolder[commandName] = folderId;
  }
  saveRaw(state);
  return state;
}

function folderIdFromExplorerNodeId(nodeId) {
  return typeof nodeId === "string" && nodeId.startsWith(FOLDER_NODE_PREFIX)
    ? nodeId.slice(FOLDER_NODE_PREFIX.length)
    : null;
}

function isCommandNode(node) {
  return node?.kind === "command" || node?.type === "file";
}

/**
 * Turn an Explorer drop result `{ data, root }` back into persisted state:
 * folder parentage, per-level item order, and command assignments are all
 * re-derived from the tree the user is looking at.
 *
 * Commands that are not present in `data` keep their stored assignment — the
 * tree only ever renders currently-registered commands, so absence here means
 * "not installed right now", never "the user unfiled it".
 *
 * Callers MUST pass the unfiltered tree. Explorer's on_reorder hands back its
 * whole store (collapsed folders included, since collapse is view-only), so
 * the organizer satisfies this by construction; a search-filtered tree would
 * rebuild each rendered level's order from a subset and drop the rest.
 */
export function applySkillExplorerReorder({ data, root } = {}) {
  const state = getSkillFolderState();
  const previousFolders = state.folders || {};
  const folders = {};
  const commandFolder = { ...state.commandFolder };
  const itemOrder = {};
  const folderOrder = [];
  const seenCommands = new Set();

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

      /* A pack folder is re-derived from the catalog on every projection, so
         it is never written into `folders` — only its POSITION is the user's
         to keep. It also always sits at the top level: nesting it would mean
         storing parentage for something we do not store at all. */
      if (folderId && isPackFolderId(folderId)) {
        itemOrder[orderKey].push(`${FOLDER_NODE_PREFIX}${folderId}`);
        if (!folderOrder.includes(folderId)) folderOrder.push(folderId);
        visit(node.children || [], folderId);
        return;
      }

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

      if (!isCommandNode(node)) return;
      const commandName =
        typeof node.commandName === "string" && node.commandName
          ? node.commandName
          : nodeId;
      if (!commandName || commandName.startsWith(FOLDER_NODE_PREFIX)) return;
      itemOrder[orderKey].push(commandName);
      seenCommands.add(commandName);
      /* null, not delete. Absence now means "the user has never moved this,
         use the folder its plugin declares"; a command dragged out to the top
         level has to be able to SAY so, or the next projection would file it
         straight back into its pack. */
      commandFolder[commandName] = parentFolderId || null;
    });
  };

  visit(root, null);

  /* Preserve the stored order of every level the caller did not render. The
     `/` panel and the organizer both render the whole tree, but a filtered
     view renders a subset — rebuilding itemOrder from a filtered tree must
     not silently drop the levels that were filtered away. */
  Object.keys(state.itemOrder || {}).forEach((orderKey) => {
    if (itemOrder[orderKey]) return;
    itemOrder[orderKey] = state.itemOrder[orderKey];
  });

  return setSkillFolderState({
    folders,
    commandFolder,
    folderOrder,
    itemOrder,
  });
}

/**
 * PURE projection — takes state, touches no storage, so it unit-tests without
 * the settings bridge harness. Both the `/` palette and the organizer preview
 * build their tree through this one function; two independent projections is
 * exactly the drift #232's chosen layout exists to prevent.
 *
 * @param commands  registry items: { name, description, icon, sourceLabel, ... }
 * @param state     a tree from getSkillFolderState()
 * @returns { data, root, unfiled } — Explorer's flat node map, the ordered
 *          root key list, and the command names not filed anywhere (the
 *          organizer's left column reads this; they also appear at root level
 *          in `root`, because that is where the palette actually shows them).
 */
export function buildCommandTree({ commands = [], state } = {}) {
  const tree = state || defaultState();
  const folders = tree.folders || {};
  const commandFolder = tree.commandFolder || {};
  const itemOrder = tree.itemOrder || {};
  const folderOrder = tree.folderOrder || [];

  const byName = new Map();
  commands.forEach((command) => {
    if (command && typeof command.name === "string" && command.name) {
      byName.set(command.name, command);
    }
  });

  const data = {};

  byName.forEach((command, name) => {
    data[name] = {
      id: name,
      label: name,
      type: "file",
      kind: "command",
      commandName: name,
      command,
    };
  });

  /* The folder set is the user's stored folders PLUS one per plugin that
     declared its skills — derived fresh every projection, never written back,
     so uninstalling a plugin removes its folder and reinstalling brings it
     back with the author's current name. */
  const allFolders = { ...folders };
  byName.forEach((command) => {
    const packId = packFolderIdFor(command);
    if (!packId || allFolders[packId]) return;
    allFolders[packId] = {
      id: packId,
      name: command.sourceLabel,
      parentId: null,
      childFolderIds: [],
      derived: true,
    };
  });

  Object.values(allFolders).forEach((folder) => {
    data[`${FOLDER_NODE_PREFIX}${folder.id}`] = {
      id: `${FOLDER_NODE_PREFIX}${folder.id}`,
      label: folder.name,
      type: "folder",
      kind: "folder",
      folderId: folder.id,
      derived: !!folder.derived,
      children: [],
    };
  });

  /* Where each command sits, in precedence order:
       stored id   — the user moved it there
       stored null — the user moved it to the top level, deliberately
       absent      — never touched, so its plugin's folder decides
     The null case is why assignments are written rather than deleted: without
     it, "absent" would have to mean both "never touched" and "at root", and
     dragging a skill out of its pack would undo itself on the next render. */
  const membersOf = new Map();
  const push = (levelKey, name) => {
    if (!membersOf.has(levelKey)) membersOf.set(levelKey, []);
    membersOf.get(levelKey).push(name);
  };
  byName.forEach((command, name) => {
    const stored = Object.prototype.hasOwnProperty.call(commandFolder, name)
      ? commandFolder[name]
      : undefined;
    if (stored === null) {
      push(ROOT_ORDER_KEY, name);
      return;
    }
    if (typeof stored === "string" && allFolders[stored]) {
      push(stored, name);
      return;
    }
    /* Either untouched, or filed into a folder that no longer exists (the
       category was deleted, or a pack was uninstalled and its folder went
       with it) — fall back to the plugin's folder, then to root. */
    const packId = packFolderIdFor(command);
    push(packId && allFolders[packId] ? packId : ROOT_ORDER_KEY, name);
  });

  /* Root folders are derived from parentage, not from folderOrder alone:
     folderOrder is an ORDERING, and a folder missing from it (a pack folder on
     first run, or one orphaned by an older write) must still be rendered. */
  const rootFolderIds = () => {
    const all = Object.keys(allFolders).filter(
      (id) => !allFolders[id].parentId,
    );
    const named = folderOrder.filter((id) => all.includes(id));
    return named.concat(all.filter((id) => !named.includes(id)));
  };

  const childFolderIdsOf = (parentId) =>
    parentId === null
      ? rootFolderIds()
      : (allFolders[parentId]?.childFolderIds || []).filter(
          (id) => allFolders[id],
        );

  /* Stored order wins for everything it names; anything it does not name —
     a newly installed skill, a newly created folder — appends at the end so
     an addition never reshuffles what the user already arranged. */
  const orderLevel = (parentId) => {
    const levelKey = parentId || ROOT_ORDER_KEY;
    const wantFolders = childFolderIdsOf(parentId).map(
      (id) => `${FOLDER_NODE_PREFIX}${id}`,
    );
    const wantCommands = membersOf.get(levelKey) || [];
    const want = new Set([...wantFolders, ...wantCommands]);

    const ordered = [];
    (itemOrder[levelKey] || []).forEach((nodeId) => {
      if (want.has(nodeId)) {
        ordered.push(nodeId);
        want.delete(nodeId);
      }
    });
    wantFolders.forEach((nodeId) => {
      if (want.has(nodeId)) {
        ordered.push(nodeId);
        want.delete(nodeId);
      }
    });
    wantCommands.forEach((nodeId) => {
      if (want.has(nodeId)) {
        ordered.push(nodeId);
        want.delete(nodeId);
      }
    });
    return ordered;
  };

  /* `visited` guards against a cycle in stored folder parentage. The writers
     here never create one, but this projection also runs against whatever is
     already on disk, and a cycle would otherwise be an infinite recursion at
     render time. Dropping the back-edge rather than merely stopping at it also
     keeps every folder node id unique across the tree, which is what Explorer
     assumes when it flattens for hit-testing. */
  const visited = new Set();
  const fill = (parentId) => {
    const ordered = [];
    orderLevel(parentId).forEach((nodeId) => {
      const folderId = folderIdFromExplorerNodeId(nodeId);
      if (!folderId || !allFolders[folderId]) {
        ordered.push(nodeId);
        return;
      }
      if (visited.has(folderId)) return;
      visited.add(folderId);
      ordered.push(nodeId);
      data[nodeId].children = fill(folderId);
    });
    return ordered;
  };

  const root = fill(null);
  /* Unfiled = the commands sitting at root level, in the order the palette
     actually renders them, so the organizer's left column and the preview's
     root section never disagree about sequence. */
  const unfiled = root.filter((nodeId) => data[nodeId]?.kind === "command");
  return { data, root, unfiled };
}

// Test-only: reset the per-session degradation switch so the next call
// re-evaluates the persistence mode from scratch.
export function resetSkillFolderStorageForTests() {
  sqlDisabledThisSession = false;
}
