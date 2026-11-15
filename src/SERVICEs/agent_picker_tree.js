// The chat's Agent picker as a tree: the author's Agent folders, the way the
// Agents page arranges them, holding the Agents the picker offers.
//
// The folders, their nesting and the Agents' places in them are the Agents
// page's own (`resourcePlacement`, keyed by resource id); the picker only
// reads them. What it leaves out is what it cannot offer: Workflows and
// archived Agents are not chat Agents, so a folder holding nothing pickable is
// not drawn at all.
//
// The output is the shape CommandTree / Explorer read: a flat node map and
// the root ids. An Agent node's id IS its picker value, so the Select's
// keyboard and the tree's highlight address the same row by the same key;
// picker values are prefixed (`skeleton:`, `legacy:`) or the default
// sentinel, so none can collide with a `folder:` id.

import { resourcePlacement } from "./agent_resource_folders";

export const AGENT_PICKER_FOLDER_PREFIX = "folder:";
const ROOT_ORDER_KEY = "__root__";

const hasOwn = (value, key) =>
  value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);

/* Saved order first, then whatever the save does not mention — the same rule
   the Agents page's explorer applies, so both lists come out in one order. */
function ordered(saved, folderEntries, resourceIds) {
  const known = new Set([...folderEntries, ...resourceIds]);
  const used = new Set();
  const out = [];
  (Array.isArray(saved) ? saved : []).forEach((entry) => {
    if (known.has(entry) && !used.has(entry)) {
      used.add(entry);
      out.push(entry);
    }
  });
  [...folderEntries, ...resourceIds].forEach((entry) => {
    if (!used.has(entry)) {
      used.add(entry);
      out.push(entry);
    }
  });
  return out;
}

/**
 * @param choices  [{ value, label, resourceId?, pinned? }] in the picker's
 *                 own order. `resourceId` places a native Agent in its
 *                 folder; anything without one (the default, a legacy
 *                 Recipe, an unavailable choice) sits at the top level.
 *                 `pinned` keeps a choice first (the default Agent).
 * @param placement resourcePlacement(...) — read from storage when absent.
 * @returns { data, root, values } — `values` is every Agent value in
 *          all-folders-open order.
 */
export function buildAgentPickerTree({ choices = [], placement } = {}) {
  const place = placement || resourcePlacement();
  const folders = place.folders || {};
  const data = {};
  const byResource = new Map();
  const loose = [];
  const pinned = [];

  (Array.isArray(choices) ? choices : []).forEach((choice) => {
    if (!choice || typeof choice.value !== "string" || !choice.value) return;
    if (hasOwn(data, choice.value)) return;
    data[choice.value] = {
      id: choice.value,
      label: choice.label,
      type: "file",
      kind: "agent",
      option: choice,
    };
    if (choice.pinned) pinned.push(choice.value);
    else if (typeof choice.resourceId === "string" && choice.resourceId) byResource.set(choice.resourceId, choice.value);
    else loose.push(choice.value);
  });

  const inFolder = new Map();
  const rootResources = [];
  byResource.forEach((value, resourceId) => {
    const folderId = place.resourceFolder ? place.resourceFolder[resourceId] : undefined;
    if (folderId && hasOwn(folders, folderId)) {
      if (!inFolder.has(folderId)) inFolder.set(folderId, []);
      inFolder.get(folderId).push(resourceId);
    } else {
      rootResources.push(resourceId);
    }
  });

  const seen = new Set();
  const levelOf = (parentId) => {
    const folderIds = parentId
      ? (folders[parentId].childFolderIds || []).filter((id) => hasOwn(folders, id))
      : (place.folderOrder || []).filter((id) => hasOwn(folders, id) && !folders[id].parentId);
    const resourceIds = parentId ? inFolder.get(parentId) || [] : rootResources;
    const saved = place.resourceOrder ? place.resourceOrder[parentId || ROOT_ORDER_KEY] : undefined;
    const ids = [];
    ordered(
      saved,
      folderIds.map((id) => `${AGENT_PICKER_FOLDER_PREFIX}${id}`),
      resourceIds,
    ).forEach((entry) => {
      if (entry.startsWith(AGENT_PICKER_FOLDER_PREFIX) && !byResource.has(entry)) {
        const folderId = entry.slice(AGENT_PICKER_FOLDER_PREFIX.length);
        if (seen.has(folderId)) return; // a cycle in a hand-edited tree
        seen.add(folderId);
        const children = levelOf(folderId);
        if (children.length === 0) return;
        data[entry] = {
          id: entry,
          label: folders[folderId].name,
          type: "folder",
          kind: "folder",
          folderId,
          children,
        };
        ids.push(entry);
        return;
      }
      const value = byResource.get(entry);
      if (value) ids.push(value);
    });
    return ids;
  };

  const root = [...pinned, ...levelOf(null), ...loose];
  const values = [];
  const walk = (ids) =>
    ids.forEach((id) => {
      const node = data[id];
      if (!node) return;
      if (node.kind === "folder") walk(node.children);
      else values.push(id);
    });
  walk(root);
  Object.keys(data).forEach((id) => {
    if (data[id].kind === "agent" && !values.includes(id)) delete data[id];
  });
  return { data, root, values };
}
