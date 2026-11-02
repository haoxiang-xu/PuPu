import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Explorer from "../../../../BUILTIN_COMPONENTs/explorer/explorer";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import { subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { createFolder, getFolderState, renameFolder } from "../../../../SERVICEs/agent_folder_storage";
import {
  RECIPE_SOURCE_SCOPE,
  applyResourceExplorerReorder,
  assignResourceToFolder,
  deleteFolderKeepingResources,
  migrateRecipeFoldersToResources,
  resourcePlacement,
} from "../../../../SERVICEs/agent_resource_folders";
import { RenameRow, RECIPE_PANEL_HEADER } from "./recipe_list";
import { buildAgentExplorerMenuItems } from "./agent_explorer_menu_items";
import { new_agent_document, new_workflow_document } from "./skeleton_graph_edits";
import { safe_text } from "./document_values";
import ImportResourceModal from "./import_resource_modal";

/* The Agents side menu: the original explorer, listing native Agents.
 *
 * It replaces two stacked lists — a bare list of Skeleton resources above the
 * legacy recipe explorer — which showed every migrated Agent twice. The look,
 * the folders, inline rename, drag to reorder and the right-click menu are the
 * legacy explorer's; what it lists is the Skeleton store, addressed by
 * resource id and never by name (a name is a label: it is renamed and may
 * repeat).
 *
 * Legacy recipes are migrated into the store when the sidecar starts, so each
 * one already appears here as its own Agent. A recipe the store cannot resolve
 * to a migrated Agent is listed under "Not migrated" and still opens in the
 * old editor, so nothing is stranded. Archived Agents are listed under
 * "Archived" with Restore: the store keeps a migrated or referenced Agent and
 * refuses to delete it, so archiving is how one leaves the list. */

const PENDING_ID = "__pending_agent__";
const ROOT = "__root__";
const FOLDER = "folder:";
const RESOURCE = "resource:";
const DRAFT = "draft:";
const LEGACY = "legacy:";
const ARCHIVED = "archived:";
const LEGACY_GROUP = "group:not-migrated";
const ARCHIVED_GROUP = "group:archived";
const DEFAULT_NAME = "Default";
const MUTED = "#888";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function freshAgentId() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return `agent-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function readItems(answer) {
  const list = Array.isArray(answer) ? answer : isRecord(answer) ? answer.resources : null;
  return (Array.isArray(list) ? list : []).filter(
    (item) => isRecord(item) && typeof item.id === "string" && item.id,
  );
}

const ICON_BUTTON = {
  paddingVertical: (RECIPE_PANEL_HEADER.HEIGHT - RECIPE_PANEL_HEADER.ICON) / 2,
  paddingHorizontal: (RECIPE_PANEL_HEADER.HEIGHT - RECIPE_PANEL_HEADER.ICON) / 2,
  borderRadius: RECIPE_PANEL_HEADER.RADIUS,
  opacity: 0.55,
  WebkitAppRegion: "no-drag",
  content: {
    prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
    icon: { width: RECIPE_PANEL_HEADER.ICON, height: RECIPE_PANEL_HEADER.ICON },
  },
};

function ConfirmModal({ open, title, body, action, onClose, onConfirm, isDark }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{ width: 340, padding: "24px 24px 20px", backgroundColor: isDark ? "#1e1e1e" : "#ffffff" }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)" }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)", marginBottom: 20, lineHeight: 1.5 }}>
        {body}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button label="Cancel" onClick={onClose} style={{ fontSize: 12, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, opacity: 0.65 }} />
        <Button
          label={action}
          onClick={onConfirm}
          style={{
            fontSize: 12,
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 6,
            backgroundColor: isDark ? "rgba(220,50,50,0.40)" : "rgba(220,50,50,0.12)",
            hoverBackgroundColor: isDark ? "rgba(220,50,50,0.58)" : "rgba(220,50,50,0.22)",
            color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
          }}
        />
      </div>
    </Modal>
  );
}

/* Saved order first, then whatever the order does not mention yet. */
function ordered(saved, folderIds, resourceIds) {
  const folderSet = new Set(folderIds.map((id) => `${FOLDER}${id}`));
  const resourceSet = new Set(resourceIds);
  const out = [];
  const used = new Set();
  (Array.isArray(saved) ? saved : []).forEach((entry) => {
    if ((folderSet.has(entry) || resourceSet.has(entry)) && !used.has(entry)) {
      used.add(entry);
      out.push(entry);
    }
  });
  folderIds.forEach((id) => {
    if (!used.has(`${FOLDER}${id}`)) out.push(`${FOLDER}${id}`);
  });
  resourceIds.forEach((id) => {
    if (!used.has(id)) out.push(id);
  });
  return out;
}

export default function AgentExplorer({
  recipes,
  activeId,
  activeLegacyName,
  newDraft,
  activeDirty = false,
  autoSelectDefault = false,
  onSelect,
  onSelectLegacy,
  onCreate,
  onActiveChanged,
  onCollapse,
  isDark,
  headerLeadingPad = 0,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [library, setLibrary] = useState({ status: "loading", items: [], error: null });
  const [loads, setLoads] = useState(0); // successful library reads so far
  const [legacyChecks, setLegacyChecks] = useState({ version: 0 });
  const [folderVersion, setFolderVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [renaming, setRenaming] = useState({ nodeId: null, value: "" });
  const [pending, setPending] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, kind: null, node: null });
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const requestRef = useRef(0);
  const aliveRef = useRef(true);
  const resolvedRef = useRef(new Map()); // legacy name → "migrated" | "missing" | "unknown"
  const migrationRef = useRef(false);
  const autoSelectedRef = useRef(false);

  const refreshFolders = useCallback(() => setFolderVersion((v) => v + 1), []);
  const closeContextMenu = useCallback(() => setContextMenu((c) => ({ ...c, visible: false })), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const folderState = useMemo(() => getFolderState(), [folderVersion]);
  const placement = useMemo(() => resourcePlacement(folderState), [folderState]);

  const resolveAvailable = typeof api?.unchain?.resolveSkeletonResource === "function";

  /* ── the library ─────────────────────────────────────────────── */
  const load = useCallback(async () => {
    const request = ++requestRef.current;
    const method = api && api.unchain && api.unchain.listSkeletonResources;
    if (typeof method !== "function") {
      setLibrary({ status: "unavailable", items: [], error: null });
      return;
    }
    setLibrary((previous) => ({ ...previous, status: previous.status === "ready" ? "ready" : "loading", error: null }));
    try {
      const answer = await method(true);
      if (!aliveRef.current || request !== requestRef.current) return;
      if (isRecord(answer) && answer.error) {
        setLibrary({ status: "failed", items: [], error: answer.error });
        return;
      }
      setLibrary({ status: "ready", items: readItems(answer), error: null });
      setLoads((n) => n + 1);
    } catch (error) {
      if (!aliveRef.current || request !== requestRef.current) return;
      setLibrary({ status: "failed", items: [], error });
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    load();
    const unsubscribe = subscribeSkeletonLibraryRefresh(load);
    return () => {
      aliveRef.current = false;
      requestRef.current += 1;
      unsubscribe();
    };
  }, [load]);

  /* ── which legacy recipes have a migrated Agent ──────────────── */
  const recipeNames = useMemo(
    () => (Array.isArray(recipes) ? recipes : []).map((r) => r && r.name).filter((n) => typeof n === "string" && n),
    [recipes],
  );
  /* Asked only after the library itself answered, and asked again after each
     later answer for every recipe whose check failed: a sidecar that was
     briefly unreachable must not leave a migrated recipe listed twice. */
  useEffect(() => {
    if (!resolveAvailable || loads === 0) return undefined;
    let cancelled = false;
    (async () => {
      for (const name of recipeNames) {
        const known = resolvedRef.current.get(name);
        if (known === "migrated" || known === "missing") continue;
        let verdict;
        try {
          const answer = await api.unchain.resolveSkeletonResource({ legacy_name: name, source_scope: RECIPE_SOURCE_SCOPE });
          verdict = isRecord(answer) && typeof answer.id === "string" && answer.id ? "migrated" : "unknown";
        } catch (error) {
          /* Ambiguous means the store holds several Agents for this recipe:
             it was migrated, and they are in the main tree already. */
          const code = error && error.code;
          verdict = code === "resource_missing" ? "missing" : code === "legacy_name_ambiguous" ? "migrated" : "unknown";
        }
        if (cancelled) return;
        resolvedRef.current.set(name, verdict);
        setLegacyChecks((v) => ({ version: v.version + 1 }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipeNames, resolveAvailable, loads]);

  /* A recipe is listed as not migrated unless the store resolved it. While
     the answer is outstanding it is not shown, so a migrated recipe does not
     flash in twice. With no resolver, or no library to list the migrated
     Agents, nothing can be proven and every recipe stays reachable here. */
  const notMigrated = useMemo(() => {
    if (!resolveAvailable || library.status === "unavailable") return recipeNames;
    return recipeNames.filter((name) => {
      const verdict = resolvedRef.current.get(name);
      return verdict === "missing" || verdict === "unknown";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeNames, resolveAvailable, library.status, legacyChecks]);

  /* ── carry the legacy folders over, once ─────────────────────── */
  useEffect(() => {
    if (library.status !== "ready" || migrationRef.current || placement.migrated || !resolveAvailable) return;
    migrationRef.current = true;
    migrateRecipeFoldersToResources((payload) => api.unchain.resolveSkeletonResource(payload)).then((result) => {
      if (aliveRef.current && result.status === "migrated") refreshFolders();
    });
  }, [library.status, placement.migrated, resolveAvailable, refreshFolders]);

  const active = useMemo(() => library.items.filter((item) => !item.archived), [library.items]);
  const archived = useMemo(() => library.items.filter((item) => item.archived), [library.items]);

  /* With nothing open, open the chat's default Agent: the one active Agent the
     store itself would pick for an unselected chat. */
  useEffect(() => {
    if (!autoSelectDefault || autoSelectedRef.current || library.status !== "ready" || activeId) return;
    autoSelectedRef.current = true;
    const defaults = active.filter((item) => item.kind === "agent" && item.name === DEFAULT_NAME);
    if (defaults.length === 1) onSelect(defaults[0].id);
  }, [autoSelectDefault, library.status, active, activeId, onSelect]);

  const loadedNames = useMemo(() => new Set(library.items.map((item) => item.name)), [library.items]);

  /* ── actions ─────────────────────────────────────────────────── */
  const handleStartRename = useCallback(
    (node) => {
      if (node) setRenaming({ nodeId: node.id, value: node.name || "" });
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const handleConfirmRename = useCallback(
    async (raw) => {
      const next = (raw || "").trim();
      const current = renaming;
      setRenaming({ nodeId: null, value: "" });
      if (!current.nodeId || !next) return;
      if (current.nodeId.startsWith(FOLDER)) {
        renameFolder(current.nodeId.slice(FOLDER.length), next);
        refreshFolders();
        return;
      }
      if (!current.nodeId.startsWith(RESOURCE)) return;
      const id = current.nodeId.slice(RESOURCE.length);
      const item = library.items.find((entry) => entry.id === id);
      if (!item || item.name === next) return;
      try {
        await api.unchain.renameSkeletonResource(id, next, item.edit_token);
        setNotice("");
        if (id === activeId) onActiveChanged?.({ type: "reload", id });
      } catch (error) {
        setNotice(
          error && error.code === "edit_conflict"
            ? `“${safe_text(item.name)}” changed elsewhere, so it was not renamed. The list is up to date now; try again.`
            : `Could not rename “${safe_text(item.name)}”: ${safe_text(error?.message || "the store refused it")}`,
        );
      }
      load();
    },
    [renaming, library.items, activeId, onActiveChanged, refreshFolders, load],
  );

  const handleNewFolder = useCallback(
    (parentId) => {
      const { folderId } = createFolder({ parentId: parentId || null });
      refreshFolders();
      setRenaming({ nodeId: `${FOLDER}${folderId}`, value: "New Folder" });
      closeContextMenu();
    },
    [refreshFolders, closeContextMenu],
  );

  const canCreate = typeof onCreate === "function" && library.status === "ready" &&
    typeof api?.unchain?.saveSkeletonResource === "function";

  /* A new Agent or a new native Workflow (#357 G7): named in place, then
     opened as an unsaved draft of that kind. */
  const handleNewAgent = useCallback(
    (parentId, kind = "agent") => {
      closeContextMenu();
      if (!canCreate) return;
      setPending({ parentId: parentId || null, kind: kind === "workflow" ? "workflow" : "agent" });
    },
    [closeContextMenu, canCreate],
  );
  const handleNewWorkflow = useCallback((parentId) => handleNewAgent(parentId, "workflow"), [handleNewAgent]);

  const handleConfirmNewAgent = useCallback(
    (raw) => {
      const name = (raw || "").trim();
      const context = pending;
      setPending(null);
      if (!name || !context) return;
      let id;
      try {
        id = freshAgentId();
      } catch (_error) {
        setNotice("This Agent could not be created: no random source is available. Nothing was added.");
        return;
      }
      const workflow = context.kind === "workflow";
      if (!(workflow ? new_workflow_document : new_agent_document)({ id, name }).ok) return;
      if (context.parentId) assignResourceToFolder(id, context.parentId);
      refreshFolders();
      setNotice("");
      onCreate(workflow ? { id, name, kind: "workflow" } : { id, name });
    },
    [pending, refreshFolders, onCreate],
  );

  const handleDuplicate = useCallback(
    async (node) => {
      closeContextMenu();
      const item = library.items.find((entry) => entry.id === node.resource_id);
      if (!item) return;
      let name = `${item.name} copy`;
      for (let n = 2; loadedNames.has(name); n += 1) name = `${item.name} copy ${n}`;
      try {
        const id = freshAgentId();
        await api.unchain.duplicateSkeletonResource(item.id, id, name);
        const folderId = placement.resourceFolder[item.id];
        if (folderId) assignResourceToFolder(id, folderId);
        refreshFolders();
        setNotice("");
        await load();
        onSelect(id);
      } catch (error) {
        setNotice(`Could not duplicate “${safe_text(item.name)}”: ${safe_text(error?.message || "the store refused it")}`);
      }
    },
    [closeContextMenu, library.items, loadedNames, placement, refreshFolders, load, onSelect],
  );

  const handleArchive = useCallback((node) => {
    closeContextMenu();
    setConfirm({ open: true, kind: "archive", node });
  }, [closeContextMenu]);

  const handleDeleteFolder = useCallback((node) => {
    closeContextMenu();
    setConfirm({ open: true, kind: "folder", node });
  }, [closeContextMenu]);

  const handleRestore = useCallback(
    async (node) => {
      closeContextMenu();
      const item = library.items.find((entry) => entry.id === node.resource_id);
      if (!item) return;
      try {
        await api.unchain.restoreSkeletonResource(item.id, item.edit_token);
        setNotice("");
        if (item.id === activeId) onActiveChanged?.({ type: "reload", id: item.id });
      } catch (error) {
        setNotice(`Could not restore “${safe_text(item.name)}”: ${safe_text(error?.message || "the store refused it")}`);
      }
      load();
    },
    [closeContextMenu, library.items, activeId, onActiveChanged, load],
  );

  const handleConfirm = useCallback(async () => {
    const { kind, node } = confirm;
    setConfirm({ open: false, kind: null, node: null });
    if (!node) return;
    if (kind === "folder") {
      deleteFolderKeepingResources(node.folder_id);
      refreshFolders();
      return;
    }
    const item = library.items.find((entry) => entry.id === node.resource_id);
    if (!item) return;
    try {
      await api.unchain.archiveSkeletonResource(item.id, item.edit_token);
      setNotice("");
      if (item.id === activeId) onActiveChanged?.({ type: "reload", id: item.id });
    } catch (error) {
      setNotice(`Could not archive “${safe_text(item.name)}”: ${safe_text(error?.message || "the store refused it")}`);
    }
    load();
  }, [confirm, library.items, activeId, onActiveChanged, refreshFolders, load]);

  const handleNodeContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node: storeNode });
  }, []);

  const handleBackgroundContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node: null });
  }, []);

  const handleReorder = useCallback(
    (newData, newRoot) => {
      applyResourceExplorerReorder({ data: newData, root: newRoot });
      refreshFolders();
    },
    [refreshFolders],
  );

  /* ── the main tree: folders and the Agents in them ──────────── */
  const draftRow = newDraft && typeof newDraft.id === "string" && !library.items.some((item) => item.id === newDraft.id)
    ? newDraft : null;

  const { data, root } = useMemo(() => {
    const map = {};
    const folders = placement.folders;
    const byFolder = { [ROOT]: [] };
    Object.keys(folders).forEach((id) => {
      byFolder[id] = [];
    });
    const rows = new Map();
    const place = (resourceId, node) => {
      rows.set(resourceId, node);
      const folderId = placement.resourceFolder[resourceId];
      if (folderId && hasOwn(folders, folderId)) byFolder[folderId].push(resourceId);
      else byFolder[ROOT].push(resourceId);
    };
    active.forEach((item) => {
      const isDefault = item.kind === "agent" && item.name === DEFAULT_NAME;
      place(item.id, {
        id: `${RESOURCE}${item.id}`,
        kind: "resource",
        resource_id: item.id,
        name: item.name,
        label: safe_text(item.name),
        prefix_icon: item.kind === "workflow" ? "flow_chart" : "bot",
        on_click: () => onSelect(item.id),
        on_context_menu: (storeNode, event) =>
          handleNodeContextMenu(
            { ...storeNode, kind: "resource", resource_id: item.id, name: item.name, active: item.id === activeId, is_default: isDefault },
            event,
          ),
      });
    });
    if (draftRow) {
      place(draftRow.id, {
        id: `${DRAFT}${draftRow.id}`,
        kind: "draft",
        resource_id: draftRow.id,
        name: draftRow.name,
        label: safe_text(draftRow.name),
        prefix_icon: draftRow.kind === "workflow" ? "flow_chart" : "bot",
        postfix: "unsaved",
      });
    }
    const pendingNode = () => ({ id: PENDING_ID, kind: "pending", label: "", prefix_icon: pending?.kind === "workflow" ? "flow_chart" : "bot" });
    const children = (parentId) => {
      const folderIds = parentId
        ? (folders[parentId].childFolderIds || []).filter((id) => hasOwn(folders, id))
        : placement.folderOrder.filter((id) => hasOwn(folders, id) && !folders[id].parentId);
      const ids = ordered(placement.resourceOrder[parentId || ROOT], folderIds, byFolder[parentId || ROOT] || []).map((entry) => {
        if (entry.startsWith(FOLDER) && hasOwn(folders, entry.slice(FOLDER.length)) && !rows.has(entry)) {
          const folderId = entry.slice(FOLDER.length);
          const folder = folders[folderId];
          map[entry] = {
            id: entry,
            kind: "folder",
            folder_id: folderId,
            name: folder.name,
            type: "folder",
            label: safe_text(folder.name),
            prefix_icon: "folder_2",
            children: children(folderId),
            on_context_menu: (storeNode, event) =>
              handleNodeContextMenu({ ...storeNode, kind: "folder", folder_id: folderId, name: folder.name }, event),
          };
          return entry;
        }
        const node = rows.get(entry);
        map[node.id] = node;
        return node.id;
      });
      if (pending && pending.parentId === (parentId || null)) {
        map[PENDING_ID] = pendingNode();
        ids.push(PENDING_ID);
      }
      return ids;
    };
    return { data: map, root: children(null) };
  }, [placement, active, draftRow, pending, activeId, onSelect, handleNodeContextMenu]);

  const decorated = useMemo(() => {
    const next = { ...data };
    if (renaming.nodeId && next[renaming.nodeId]) {
      next[renaming.nodeId] = {
        ...next[renaming.nodeId],
        custom_label: (
          <RenameRow isDark={isDark} prefixIcon={null} initialValue={renaming.value}
            onConfirm={handleConfirmRename} onCancel={() => setRenaming({ nodeId: null, value: "" })} />
        ),
      };
    }
    if (pending && next[PENDING_ID]) {
      next[PENDING_ID] = {
        ...next[PENDING_ID],
        custom_label: (
          <RenameRow isDark={isDark} prefixIcon={null} initialValue="" onConfirm={handleConfirmNewAgent} onCancel={() => setPending(null)} />
        ),
      };
    }
    return next;
  }, [data, renaming, pending, isDark, handleConfirmRename, handleConfirmNewAgent]);

  const defaultExpanded = useMemo(() => {
    const ids = [];
    Object.keys(placement.folders).forEach((id) => {
      if (placement.folders[id].expanded !== false) ids.push(`${FOLDER}${id}`);
    });
    return ids;
  }, [placement]);

  /* ── the side groups: not migrated, archived ─────────────────── */
  const side = useMemo(() => {
    const map = {};
    const rootIds = [];
    if (notMigrated.length > 0) {
      map[LEGACY_GROUP] = {
        id: LEGACY_GROUP, type: "folder", label: "Not migrated", prefix_icon: "folder_2",
        children: notMigrated.map((name) => {
          const id = `${LEGACY}${name}`;
          map[id] = {
            id, kind: "legacy", name, label: safe_text(name), prefix_icon: "bot", postfix: "old editor",
            on_click: () => onSelectLegacy(name),
            on_context_menu: (storeNode, event) => handleNodeContextMenu({ ...storeNode, kind: "legacy", name }, event),
          };
          return id;
        }),
      };
      rootIds.push(LEGACY_GROUP);
    }
    if (archived.length > 0) {
      map[ARCHIVED_GROUP] = {
        id: ARCHIVED_GROUP, type: "folder", label: "Archived", prefix_icon: "folder_2",
        children: archived.map((item) => {
          const id = `${ARCHIVED}${item.id}`;
          map[id] = {
            id, kind: "archived", resource_id: item.id, name: item.name, label: safe_text(item.name),
            prefix_icon: item.kind === "workflow" ? "flow_chart" : "bot",
            on_click: () => onSelect(item.id),
            on_context_menu: (storeNode, event) =>
              handleNodeContextMenu({ ...storeNode, kind: "archived", resource_id: item.id, name: item.name }, event),
          };
          return id;
        }),
      };
      rootIds.push(ARCHIVED_GROUP);
    }
    return { data: map, root: rootIds };
  }, [notMigrated, archived, onSelect, onSelectLegacy, handleNodeContextMenu]);

  /* Preserve the delivered list search when the native library replaces the
     legacy list. Search is a flat view only; it never rewrites placement. */
  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return null;
    const rows = Object.entries({ ...decorated, ...side.data }).filter(
      ([id, item]) => id === PENDING_ID ||
        (!Array.isArray(item.children) && typeof item.label === "string" && item.label.toLowerCase().includes(query)),
    );
    return { data: Object.fromEntries(rows), root: rows.map(([id]) => id) };
  }, [decorated, side.data, searchQuery]);

  const menuItems = useMemo(
    () =>
      buildAgentExplorerMenuItems({
        node: contextMenu.node,
        activeDirty,
        onNewAgent: handleNewAgent,
        onNewWorkflow: handleNewWorkflow,
        onNewFolder: handleNewFolder,
        onImport: () => {
          closeContextMenu();
          setImportOpen(true);
        },
        onStartRename: handleStartRename,
        onDuplicate: handleDuplicate,
        onArchive: handleArchive,
        onRestore: handleRestore,
        onDeleteFolder: handleDeleteFolder,
        onOpenLegacy: (node) => {
          closeContextMenu();
          onSelectLegacy(node.name);
        },
      }),
    [contextMenu.node, activeDirty, handleNewAgent, handleNewWorkflow, handleNewFolder, handleStartRename, handleDuplicate,
      handleArchive, handleRestore, handleDeleteFolder, closeContextMenu, onSelectLegacy],
  );

  const activeNodeId = draftRow && activeId === draftRow.id ? `${DRAFT}${activeId}` : activeId ? `${RESOURCE}${activeId}` : undefined;
  const sideActive = activeLegacyName ? `${LEGACY}${activeLegacyName}` : activeId ? `${ARCHIVED}${activeId}` : undefined;
  const caption = { fontSize: 11, color: MUTED, padding: "4px 10px", lineHeight: 1.45 };

  return (
    <div data-testid="agent-explorer" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: `${RECIPE_PANEL_HEADER.INSET - RECIPE_PANEL_HEADER.BORDER}px ${RECIPE_PANEL_HEADER.INSET - RECIPE_PANEL_HEADER.BORDER}px`, gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: RECIPE_PANEL_HEADER.GAP, paddingLeft: headerLeadingPad, marginBottom: 8 }}>
        {onCollapse && (
          <Button prefix_icon="side_menu_close" ariaLabel="Hide agents" onClick={onCollapse} style={{ ...ICON_BUTTON, opacity: 0.5 }} />
        )}
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, userSelect: "none", WebkitUserSelect: "none", flex: 1 }}>
          Agents
        </div>
        <Button prefix_icon="upload" ariaLabel="Import an Agent or Workflow" onClick={() => setImportOpen(true)} style={ICON_BUTTON} />
        <Button prefix_icon="folder_new" ariaLabel="New folder" onClick={() => handleNewFolder(null)} style={ICON_BUTTON} />
        <Button prefix_icon="flow_chart" ariaLabel="New Workflow" disabled={!canCreate} onClick={() => handleNewWorkflow(null)} style={ICON_BUTTON} />
        <Button prefix_icon="add" ariaLabel="New Agent" disabled={!canCreate} onClick={() => handleNewAgent(null)} style={ICON_BUTTON} />
      </div>

      <div style={{ padding: "12px 4px 6px", flexShrink: 0 }}>
        <label style={{ display: "block" }}>
        <span style={{ position: "absolute", width: 1, height: 1, clipPath: "inset(50%)", overflow: "hidden", whiteSpace: "nowrap" }}>{t("side_menu.search")}</span>
        <Input
          prefix_icon="search"
          no_separator
          value={searchQuery}
          set_value={setSearchQuery}
          placeholder={t("side_menu.search")}
          style={{ width: "100%", height: 32, fontSize: 12, borderRadius: 6, color: isDark ? "#CCC" : "#222", boxShadow: "none" }}
        />
        </label>
      </div>

      {library.status === "loading" && <span style={caption}>Loading…</span>}
      {library.status === "failed" && (
        <div data-testid="agent-explorer-failed" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={caption}>
            Could not read the Agent library{library.error?.message ? `: ${safe_text(library.error.message)}` : "."} Nothing here is empty — it could not be read.
          </span>
          <Button label="Try again" onClick={load} style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 3, paddingHorizontal: 8 }} />
        </div>
      )}
      {library.status === "ready" && active.length === 0 && !draftRow && !pending && (
        <span data-testid="agent-explorer-empty" style={caption}>No Agents yet.</span>
      )}
      {notice && <span role="alert" style={{ ...caption, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" }}>{notice}</span>}

      <div className="scrollable" style={{ flex: 1, minHeight: 0, overflowY: "auto" }} onContextMenu={handleBackgroundContextMenu}>
        {filtered && filtered.root.length === 0 && <span style={caption}>No agents found</span>}
        <Explorer
          data={filtered ? filtered.data : decorated}
          root={filtered ? filtered.root : root}
          default_expanded={filtered ? true : defaultExpanded}
          active_node_id={activeNodeId}
          context_menu_node_id={contextMenu.visible ? contextMenu.node?.id : undefined}
          draggable={!filtered}
          on_reorder={handleReorder}
          style={{ width: "100%", fontSize: 13 }}
        />
        {!filtered && side.root.length > 0 && (
          <div data-testid="agent-explorer-side" style={{ marginTop: 10 }}>
            <Explorer
              data={side.data}
              root={side.root}
              default_expanded={notMigrated.length > 0 ? [LEGACY_GROUP] : []}
              active_node_id={sideActive}
              context_menu_node_id={contextMenu.visible ? contextMenu.node?.id : undefined}
              style={{ width: "100%", fontSize: 13 }}
            />
            {notMigrated.length > 0 && (
              <span style={{ ...caption, display: "block" }}>
                Not migrated: recipes the store has no Agent for yet. They open in the old editor; the sidecar log says why they were not migrated.
              </span>
            )}
          </div>
        )}
      </div>

      <ContextMenu visible={contextMenu.visible} x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={closeContextMenu} isDark={isDark} />

      {/* Its own sitting: what it reads and chooses is nothing until Import,
          and closing it voids every answer still on its way. */}
      {importOpen && (
        <ImportResourceModal open={importOpen} isDark={isDark} onClose={() => setImportOpen(false)} />
      )}

      <ConfirmModal
        open={confirm.open}
        isDark={isDark}
        title={confirm.kind === "folder" ? `Delete folder “${safe_text(confirm.node?.name || "")}”?` : `Archive “${safe_text(confirm.node?.name || "")}”?`}
        body={confirm.kind === "folder"
          ? "The folder and the folders inside it are removed. The Agents in them stay and move to the top level."
          : "It leaves this list and new chats can no longer pick it. Anything that already uses it keeps working. Restore it from Archived."}
        action={confirm.kind === "folder" ? "Delete folder" : "Archive"}
        onClose={() => setConfirm({ open: false, kind: null, node: null })}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
