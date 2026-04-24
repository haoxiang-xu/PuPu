const STORAGE_KEY = "agent_folder_tree_v1";

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
