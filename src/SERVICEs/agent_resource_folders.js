// Native Agents in the user's Agent folder tree.
//
// The tree itself — folders, their names, nesting and expansion — is the one
// the legacy recipe list always kept in the settings namespace
// "agent_folder_tree_v1" (see agent_folder_storage.js). Folders are shared:
// the author has one set of folders, whichever list draws them.
//
// What differs is how an Agent is placed in it. A legacy recipe was placed by
// its NAME (`recipeFolder`, `itemOrder`); a native Skeleton resource is
// addressed by its ID, and a name is only a label that can be renamed or
// repeated. So native placement lives in two fields of its own,
// `resourceFolder` (id → folder id) and `resourceOrder` (parent → ordered ids
// and folder node ids), beside — never inside — the name-keyed ones. Every
// legacy writer reads the whole tree and writes it back, so these fields
// survive them.
//
// The legacy placement is carried over once: each recipe name that sat in a
// folder is resolved through the store's own legacy alias
// (`/skeleton_resources/resolve`, scope "user:agent_recipes"), never matched
// by display name. The result is recorded in `resourceMigration`; the
// name-keyed source is left exactly as it was.
//
// Tables keyed by resource ids are read without a prototype: `constructor` is
// a valid resource id.

import { deleteFolder, getFolderState, setFolderState } from "./agent_folder_storage";

export const RECIPE_SOURCE_SCOPE = "user:agent_recipes";
export const RESOURCE_MIGRATION_VERSION = 1;

const ROOT_ORDER_KEY = "__root__";
const FOLDER_NODE_PREFIX = "folder:";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function ownTable(value) {
  const table = Object.create(null);
  if (isRecord(value)) {
    Object.keys(value).forEach((key) => {
      table[key] = value[key];
    });
  }
  return table;
}

// Back to a plain object for persistence; JSON keeps every own key.
const plain = (table) => Object.fromEntries(Object.keys(table).map((key) => [key, table[key]]));

export function resourcePlacement(state = getFolderState()) {
  const folders = isRecord(state.folders) ? state.folders : {};
  const order = ownTable(state.resourceOrder);
  Object.keys(order).forEach((key) => {
    if (!Array.isArray(order[key])) delete order[key];
  });
  return {
    folders,
    folderOrder: Array.isArray(state.folderOrder) ? state.folderOrder : [],
    resourceFolder: ownTable(state.resourceFolder),
    resourceOrder: order,
    migrated: isRecord(state.resourceMigration) && state.resourceMigration.version === RESOURCE_MIGRATION_VERSION,
  };
}

export function assignResourceToFolder(resourceId, folderId) {
  const state = getFolderState();
  const table = ownTable(state.resourceFolder);
  if (folderId === null || folderId === undefined) delete table[resourceId];
  else table[resourceId] = folderId;
  return setFolderState({ ...state, resourceFolder: plain(table) });
}

export function forgetResource(resourceId) {
  const state = getFolderState();
  const table = ownTable(state.resourceFolder);
  delete table[resourceId];
  const order = ownTable(state.resourceOrder);
  Object.keys(order).forEach((key) => {
    if (Array.isArray(order[key])) order[key] = order[key].filter((id) => id !== resourceId);
  });
  return setFolderState({ ...state, resourceFolder: plain(table), resourceOrder: plain(order) });
}

const folderIdOf = (nodeId) =>
  typeof nodeId === "string" && nodeId.startsWith(FOLDER_NODE_PREFIX) ? nodeId.slice(FOLDER_NODE_PREFIX.length) : null;

/* After a drag in the native tree. Folder nesting is rebuilt from it (folders
   are shared and the native tree draws all of them); native placement is
   rebuilt from the resource rows; the legacy name-keyed fields are not
   touched. Rows that are not stored Agents (the inline name row) are
   ignored; an unsaved draft is placed by the id it will be saved under. */
export function applyResourceExplorerReorder({ data, root } = {}) {
  const state = getFolderState();
  const previous = isRecord(state.folders) ? state.folders : {};
  const folders = {};
  Object.keys(previous).forEach((id) => {
    folders[id] = previous[id];
  });
  const visited = new Set();
  const resourceFolder = Object.create(null);
  const resourceOrder = Object.create(null);
  const rootFolders = [];

  const visit = (nodeIds, parentFolderId) => {
    const key = parentFolderId || ROOT_ORDER_KEY;
    resourceOrder[key] = [];
    (Array.isArray(nodeIds) ? nodeIds : []).forEach((nodeId) => {
      const node = data && hasOwn(data, nodeId) ? data[nodeId] : null;
      if (!node) return;
      const folderId = folderIdOf(nodeId);
      if (folderId && hasOwn(previous, folderId)) {
        visited.add(folderId);
        folders[folderId] = { ...previous[folderId], parentId: parentFolderId || null, childFolderIds: [] };
        resourceOrder[key].push(`${FOLDER_NODE_PREFIX}${folderId}`);
        if (parentFolderId) folders[parentFolderId].childFolderIds.push(folderId);
        else rootFolders.push(folderId);
        visit(node.children || [], folderId);
        return;
      }
      if ((node.kind === "resource" || node.kind === "draft") && typeof node.resource_id === "string" && node.resource_id) {
        resourceOrder[key].push(node.resource_id);
        if (parentFolderId) resourceFolder[node.resource_id] = parentFolderId;
      }
    });
  };
  visit(root, null);

  const folderOrder = [
    ...rootFolders,
    ...(Array.isArray(state.folderOrder) ? state.folderOrder : []).filter(
      (id) => hasOwn(folders, id) && !visited.has(id) && !folders[id].parentId,
    ),
  ];
  return setFolderState({
    ...state,
    folders,
    folderOrder,
    resourceFolder: plain(resourceFolder),
    resourceOrder: plain(resourceOrder),
  });
}

function descendants(folders, folderId) {
  const out = new Set();
  const pending = [folderId];
  while (pending.length) {
    const id = pending.pop();
    if (out.has(id) || !hasOwn(folders, id)) continue;
    out.add(id);
    (folders[id].childFolderIds || []).forEach((child) => pending.push(child));
  }
  return out;
}

/* The legacy delete cascades into child folders and puts the recipes inside
   back at the top level. Native Agents get the same: placement into any
   removed folder is dropped, so they appear at the top level rather than
   pointing at a folder that no longer exists. */
export function deleteFolderKeepingResources(folderId) {
  const before = getFolderState();
  const removed = descendants(isRecord(before.folders) ? before.folders : {}, folderId);
  deleteFolder(folderId);
  const state = getFolderState();
  const table = ownTable(state.resourceFolder);
  Object.keys(table).forEach((id) => {
    if (removed.has(table[id])) delete table[id];
  });
  const order = ownTable(state.resourceOrder);
  removed.forEach((id) => delete order[id]);
  Object.keys(order).forEach((key) => {
    if (Array.isArray(order[key])) {
      order[key] = order[key].filter((entry) => !removed.has(folderIdOf(entry)));
    }
  });
  return setFolderState({ ...state, resourceFolder: plain(table), resourceOrder: plain(order) });
}

function placedRecipeNames(state) {
  const names = [];
  const add = (name) => {
    if (typeof name === "string" && name && !name.startsWith(FOLDER_NODE_PREFIX) && !names.includes(name)) names.push(name);
  };
  Object.keys(ownTable(state.recipeFolder)).forEach(add);
  const order = ownTable(state.itemOrder);
  Object.keys(order).forEach((key) => {
    if (Array.isArray(order[key])) order[key].forEach(add);
  });
  return names;
}

/* One pass, then recorded as done. `resolve` is the renderer facade's
   `resolveSkeletonResource`. A name the store cannot place is left out and
   listed: it has no migrated Agent (`resource_missing`, 404), or it aliases
   several and choosing one would be a guess (`legacy_name_ambiguous`, 409).
   Any other failure stops without writing anything, so a later visit tries
   again. */
const UNPLACEABLE = new Set(["resource_missing", "legacy_name_ambiguous"]);
export async function migrateRecipeFoldersToResources(resolve) {
  if (resourcePlacement().migrated) return { status: "already" };
  if (typeof resolve !== "function") return { status: "unavailable" };
  const names = placedRecipeNames(getFolderState());
  const ids = new Map();
  const unresolved = [];
  for (const name of names) {
    let answer;
    try {
      answer = await resolve({ legacy_name: name, source_scope: RECIPE_SOURCE_SCOPE });
    } catch (error) {
      if (error && UNPLACEABLE.has(error.code)) {
        unresolved.push(name);
        continue;
      }
      return { status: "failed", code: (error && error.code) || "resolve_failed" };
    }
    if (isRecord(answer) && typeof answer.id === "string" && answer.id) ids.set(name, answer.id);
    else unresolved.push(name);
  }

  // Re-read: the author may have moved things while the store answered.
  const state = getFolderState();
  if (resourcePlacement(state).migrated) return { status: "already" };
  const resourceFolder = ownTable(state.resourceFolder);
  const recipeFolder = ownTable(state.recipeFolder);
  ids.forEach((id, name) => {
    if (hasOwn(recipeFolder, name) && !(id in resourceFolder)) resourceFolder[id] = recipeFolder[name];
  });
  const resourceOrder = ownTable(state.resourceOrder);
  const itemOrder = ownTable(state.itemOrder);
  Object.keys(itemOrder).forEach((key) => {
    if (!Array.isArray(itemOrder[key]) || Array.isArray(resourceOrder[key])) return;
    resourceOrder[key] = itemOrder[key]
      .map((entry) => (typeof entry === "string" && entry.startsWith(FOLDER_NODE_PREFIX) ? entry : ids.get(entry)))
      .filter((entry) => typeof entry === "string");
  });
  setFolderState({
    ...state,
    resourceFolder: plain(resourceFolder),
    resourceOrder: plain(resourceOrder),
    resourceMigration: { version: RESOURCE_MIGRATION_VERSION, mapped: ids.size, unresolved },
  });
  return { status: "migrated", mapped: ids.size, unresolved };
}
