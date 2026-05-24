const STORAGE_KEY = "agent_folder_tree_v1";
const ROOT_ORDER_KEY = "__root__";
const FOLDER_NODE_PREFIX = "folder:";

function loadRaw() {
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

function saveRaw(state) {
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
