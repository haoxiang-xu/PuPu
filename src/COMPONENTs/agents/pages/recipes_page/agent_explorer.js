import { agentMessage, renderAgentMessage } from "./agents_i18n";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Explorer from "../../../../BUILTIN_COMPONENTs/explorer/explorer";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import { emitSkeletonLibraryRefresh, subscribeSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { createFolder, getFolderState, renameFolder } from "../../../../SERVICEs/agent_folder_storage";
import {
  applyResourceExplorerReorder,
  assignResourceToFolder,
  deleteFolderKeepingResources,
  forgetResource,
  migrateRecipeFoldersToResources,
  resourcePlacement,
} from "../../../../SERVICEs/agent_resource_folders";
import { RenameRow, RECIPE_PANEL_HEADER, HEADER_ICON_BUTTON } from "./recipe_list";
import { buildAgentExplorerMenuItems } from "./agent_explorer_menu_items";
import { new_agent_document, new_workflow_document } from "./skeleton_graph_edits";
import { safe_text } from "./document_values";
import { useAgentsSidebarSearch } from "../../../../SERVICEs/agents_sidebar_search";
import ImportResourceModal from "./import_resource_modal";
import AgentAvatar from "../../agent_avatar";
import AgentIconPicker from "../../agent_icon_picker";
import { PRESENTATION_SUPPORTED, usePresentationCapability } from "../../use_presentation_capability";
import { normalize_presentation, presentation_to_store, set_presentation } from "../../../../SERVICEs/agent_resource_icons";
import { writeResourcePresentation } from "../../../../SERVICEs/agent_resource_presentation_store";
import { load_resource, save_draft } from "./skeleton_resources";
import { toast } from "../../../../SERVICEs/toast";

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
 * one already appears here as its own Agent; this list shows only the store.
 * (Their folder placement is carried over once, by alias.) Resources,
 * including historical archived entries, leave the library through Delete. */

const PENDING_ID = "__pending_agent__";
const ROOT = "__root__";
const FOLDER = "folder:";
const RESOURCE = "resource:";
const DRAFT = "draft:";
const ARCHIVED = "archived:";
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

const ICON_BUTTON = HEADER_ICON_BUTTON;

/* An Agent row's mark: its own icon from the stored summary, or the default
   bot when the summary has none (an older resource, a draft), always in the
   row's text colour. Workflows keep the flow glyph. */
function avatarFor(item, overrides) {
  if (!item || item.kind === "workflow") return undefined;
  const id = typeof item.id === "string" ? item.id : "";
  /* A choice made here shows at once, before the store has answered; it is
     dropped again if the write fails, or once the re-read carries it. */
  const presentation = overrides && hasOwn(overrides, id)
    ? overrides[id]
    : isRecord(item.presentation) ? item.presentation : null;
  return (size) => (
    /* No tile in the list: the row's own icon, in the row's colour. */
    <AgentAvatar variant="glyph" presentation={presentation} size={size} glyphScale={1}
      testid={`agent-explorer-avatar-${id}`} />
  );
}

function ConfirmModal({ open, title, body, action, onClose, onConfirm, isDark }) {
  const { t } = useTranslation();
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
        <Button label={t("agents.explorer.cancel")} onClick={onClose} style={{ fontSize: 12, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 6, opacity: 0.65 }} />
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

/* A side-menu action that failed is said once, as a toast, not as a line
   pushed on top of the tree. The toast holds the message itself, not its
   English rendering, so it re-translates with the window's language for as
   long as it is shown. A later action of the menu replaces it, and a success
   withdraws it. */
function AgentToastText({ message }) {
  const { t } = useTranslation();
  return renderAgentMessage(message, t);
}

/* Rename and Duplicate rewrite the stored resource through the v2 aggregate,
   the way the editor saves it. The graph-only v1 verbs refuse any resource
   that owns Code text (`source_api_required`), and every resource the editor
   has saved is such a resource — Default included — so they cannot be used
   here. The Code text read with the graph goes back with it unchanged. */
async function rewrite_resource(resource_id, change, expected_edit_token) {
  const loaded = await load_resource(resource_id);
  if (!loaded.ok) throw loaded.error;
  const saved = await save_draft(change(loaded.data.document), expected_edit_token, loaded.data.managed_sources);
  if (!saved.ok) throw saved.error;
  return saved.data;
}

/* `recipes`, `activeLegacyName` and `onSelectLegacy` are still passed by the
   page and are ignored: legacy recipes are not listed here. */
export default function AgentExplorer({
  activeId,
  newDraft,
  activeDirty = false,
  autoSelectDefault = false,
  onSelect,
  onCreate,
  onActiveChanged,
  onCollapse,
  isDark,
  headerLeadingPad = 0,
  /* Docked in the app side menu: the section title with its actions, under
     the side menu's own search field — the chat pane's "Chats" title
     spacing. */
  docked = false,
  onBack,
  /* Drilled into a subagent: picking another Agent here would drop the
     parent's unsaved frame, so the list and its actions sit out (the search
     and the way back stay usable). */
  locked = false,
}) {
  const { t } = useTranslation();
  /* Docked, the side menu's own search field (which stays put while its
     panes slide) searches this list; floating, the list has its own. */
  const [localQuery, setLocalQuery] = useState("");
  const [sharedQuery, setSharedQuery] = useAgentsSidebarSearch();
  const searchQuery = docked ? sharedQuery : localQuery;
  const setSearchQuery = docked ? setSharedQuery : setLocalQuery;
  const [library, setLibrary] = useState({ status: "loading", items: [], error: null });
  const [folderVersion, setFolderVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [renaming, setRenaming] = useState({ nodeId: null, value: "" });
  const [pending, setPending] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, kind: null, node: null });
  const [importOpen, setImportOpen] = useState(false);
  const noticeToastRef = useRef(null);
  const setNotice = useCallback((message) => {
    if (noticeToastRef.current) toast.dismiss(noticeToastRef.current);
    noticeToastRef.current = null;
    if (!message) return;
    noticeToastRef.current = toast.error(<AgentToastText message={message} />, {
      dedupeKey: `agent-explorer:${renderAgentMessage(message)}`,
    });
  }, []);
  /* "Change icon…" on a row: the picker at the menu's position, for one
     stored Agent. `value` is what was last chosen, shown until the library
     re-read carries it. */
  const [iconPicker, setIconPicker] = useState({ open: false, x: 0, y: 0, resourceId: null, value: null });
  /* Choices written from here and not yet read back, by resource id. */
  const [presentationOverrides, setPresentationOverrides] = useState(() => Object.create(null));
  /* An Agent's icon is editable only on a runtime that stores it; otherwise
     (or while that is being asked) there is no "Change icon…" at all. */
  const iconsEditable = usePresentationCapability(true) === PRESENTATION_SUPPORTED;
  const requestRef = useRef(0);
  const aliveRef = useRef(true);
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
      const items = readItems(answer);
      setLibrary({ status: "ready", items, error: null });
      /* A choice made here is dropped once the store reads it back. */
      setPresentationOverrides((current) => {
        const ids = Object.keys(current);
        if (ids.length === 0) return current;
        const copy = Object.assign(Object.create(null), current);
        ids.forEach((id) => {
          const row = items.find((entry) => entry.id === id);
          const read = row ? normalize_presentation(row.presentation) : null;
          if (JSON.stringify(read) === JSON.stringify(copy[id])) delete copy[id];
        });
        return Object.keys(copy).length === ids.length ? current : copy;
      });
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
        await rewrite_resource(id, (document) => ({ ...document, name: next }), item.edit_token);
        setNotice("");
        if (id === activeId) onActiveChanged?.({ type: "reload", id });
        return; // the save announced itself; the listing re-reads on that
      } catch (error) {
        setNotice(
          error && error.code === "edit_conflict"
            ? agentMessage("agents.explorer.rename_conflict", { name: safe_text(item.name) })
            : agentMessage("agents.explorer.rename_failed", {
                name: safe_text(item.name),
                message: error?.message ? safe_text(error.message) : agentMessage("agents.explorer.store_refused"),
              }),
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
        setNotice(agentMessage("agents.explorer.create_no_random"));
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
        await rewrite_resource(item.id, (document) => ({ ...document, id, name }), null);
        const folderId = placement.resourceFolder[item.id];
        if (folderId) assignResourceToFolder(id, folderId);
        refreshFolders();
        setNotice("");
        await load();
        onSelect(id);
      } catch (error) {
        setNotice(agentMessage("agents.explorer.duplicate_failed", {
          name: safe_text(item.name),
          message: error?.message ? safe_text(error.message) : agentMessage("agents.explorer.store_refused"),
        }));
      }
    },
    [closeContextMenu, library.items, loadedNames, placement, refreshFolders, load, onSelect],
  );

  const handleChangeIcon = useCallback((node) => {
    const x = contextMenu.x;
    const y = contextMenu.y;
    closeContextMenu();
    const item = library.items.find((entry) => entry.id === node.resource_id);
    if (!item) return;
    setIconPicker({ open: true, x, y, resourceId: item.id, value: isRecord(item.presentation) ? item.presentation : null });
  }, [contextMenu.x, contextMenu.y, closeContextMenu, library.items]);

  /* Saved at once: the row and the picker show the choice immediately, and
     both go back to what is stored, with a toast, if the write fails. Writes
     are numbered per resource so a slow, failed earlier write cannot roll
     back a later choice. */
  const presentationWrites = useRef(Object.create(null));
  const handlePresentationChange = useCallback(async (next) => {
    const id = iconPicker.resourceId;
    if (!id) return;
    const item = library.items.find((entry) => entry.id === id);
    const stored = item && isRecord(item.presentation) ? item.presentation : null;
    const value = presentation_to_store(next);
    const ticket = (presentationWrites.current[id] || 0) + 1;
    presentationWrites.current[id] = ticket;
    setIconPicker((current) => (current.resourceId === id ? { ...current, value } : current));
    setPresentationOverrides((current) => Object.assign(Object.create(null), current, { [id]: value }));
    const answer = await set_presentation(id, value, { write: writeResourcePresentation });
    if (!aliveRef.current || presentationWrites.current[id] !== ticket) return;
    if (!answer.ok) {
      setPresentationOverrides((current) => {
        const copy = Object.assign(Object.create(null), current);
        delete copy[id];
        return copy;
      });
      setIconPicker((current) => (current.resourceId === id ? { ...current, value: stored } : current));
      /* One plain message for every cause; the cause is for developers. */
      console.warn("[agent-icons] icon write refused:", answer.code || "unknown");
      setNotice(agentMessage("agents.explorer.icon_failed", { name: safe_text(item ? item.name : id) }));
      return;
    }
    setNotice("");
    if (id === activeId) onActiveChanged?.({ type: "reload", id });
    /* The writer's save announces the library refresh; read again here too,
       so a writer that does not still ends on what is stored. */
    load();
  }, [iconPicker.resourceId, library.items, activeId, onActiveChanged, setNotice, load]);

  const closeIconPicker = useCallback(() => setIconPicker((current) => ({ ...current, open: false })), []);

  const handleDeleteResource = useCallback((node) => {
    closeContextMenu();
    setConfirm({ open: true, kind: "resource", node });
  }, [closeContextMenu]);

  const handleDeleteFolder = useCallback((node) => {
    closeContextMenu();
    setConfirm({ open: true, kind: "folder", node });
  }, [closeContextMenu]);

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
      await api.unchain.deleteSkeletonResource(item.id, item.edit_token);
      forgetResource(item.id);
      refreshFolders();
      setNotice("");
      onActiveChanged?.({ type: "deleted", id: item.id });
      emitSkeletonLibraryRefresh({ reason: "resource_deleted", resource_id: item.id });
    } catch (error) {
      setNotice(agentMessage("agents.explorer.delete_failed", {
        name: safe_text(item.name),
        message: error?.message ? safe_text(error.message) : agentMessage("agents.explorer.store_refused"),
      }));
    }
    load();
  }, [confirm, library.items, onActiveChanged, refreshFolders, load]);

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
        prefix_icon: item.kind === "workflow" ? "workflow" : "bot",
        prefix_render: avatarFor(item, presentationOverrides),
        on_click: () => onSelect(item.id),
        on_context_menu: (storeNode, event) =>
          handleNodeContextMenu(
            { ...storeNode, kind: "resource", resource_id: item.id, resource_kind: item.kind, name: item.name, active: item.id === activeId, is_default: isDefault },
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
        prefix_icon: draftRow.kind === "workflow" ? "workflow" : "bot",
        prefix_render: avatarFor(draftRow, presentationOverrides),
        postfix: t("agents.explorer.unsaved"),
      });
    }
    const pendingNode = () => ({ id: PENDING_ID, kind: "pending", label: "", prefix_icon: pending?.kind === "workflow" ? "workflow" : "bot" });
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
  }, [placement, active, draftRow, pending, activeId, onSelect, handleNodeContextMenu, t, presentationOverrides]);

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

  /* ── the side group: archived ─────────────────────────────────── */
  const side = useMemo(() => {
    const map = {};
    const rootIds = [];
    if (archived.length > 0) {
      map[ARCHIVED_GROUP] = {
        id: ARCHIVED_GROUP, type: "folder", label: t("agents.explorer.archived"), prefix_icon: "folder_2",
        children: archived.map((item) => {
          const id = `${ARCHIVED}${item.id}`;
          map[id] = {
            id, kind: "archived", resource_id: item.id, name: item.name, label: safe_text(item.name),
            prefix_icon: item.kind === "workflow" ? "workflow" : "bot",
            prefix_render: avatarFor(item, presentationOverrides),
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
  }, [archived, onSelect, handleNodeContextMenu, t, presentationOverrides]);

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
        onChangeIcon: iconsEditable ? handleChangeIcon : undefined,
        onDeleteResource: handleDeleteResource,
        onDeleteFolder: handleDeleteFolder,
      }, t),
    [contextMenu.node, activeDirty, handleNewAgent, handleNewWorkflow, handleNewFolder, handleStartRename, handleDuplicate,
      handleChangeIcon, iconsEditable, handleDeleteResource, handleDeleteFolder, closeContextMenu, t],
  );

  const activeNodeId = draftRow && activeId === draftRow.id ? `${DRAFT}${activeId}` : activeId ? `${RESOURCE}${activeId}` : undefined;
  const sideActive = activeId ? `${ARCHIVED}${activeId}` : undefined;
  const caption = { fontSize: 11, color: MUTED, padding: "4px 10px", lineHeight: 1.45 };

  const actionButtons = (
    <>
      <Button prefix_icon="upload" ariaLabel={t("agents.explorer.import")} onClick={() => setImportOpen(true)} style={ICON_BUTTON} />
      <Button prefix_icon="folder_new" ariaLabel={t("agents.explorer.new_folder")} onClick={() => handleNewFolder(null)} style={ICON_BUTTON} />
      <Button prefix_icon="workflow" ariaLabel={t("agents.explorer.new_workflow")} disabled={!canCreate} onClick={() => handleNewWorkflow(null)} style={ICON_BUTTON} />
      <Button prefix_icon="add" ariaLabel={t("agents.explorer.new_agent")} disabled={!canCreate} onClick={() => handleNewAgent(null)} style={ICON_BUTTON} />
    </>
  );
  const searchField = (
    <Input
      prefix_icon="search"
      no_separator
      value={searchQuery}
      set_value={setSearchQuery}
      placeholder={t("side_menu.search")}
      style={{ width: "100%", height: 32, fontSize: 12, borderRadius: 6, color: isDark ? "#CCC" : "#222", boxShadow: "none" }}
    />
  );
  const searchLabel = (
    <span style={{ position: "absolute", width: 1, height: 1, clipPath: "inset(50%)", overflow: "hidden", whiteSpace: "nowrap" }}>{t("side_menu.search")}</span>
  );

  return (
    <div data-testid="agent-explorer" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, padding: docked ? 0 : `${RECIPE_PANEL_HEADER.INSET - RECIPE_PANEL_HEADER.BORDER}px ${RECIPE_PANEL_HEADER.INSET - RECIPE_PANEL_HEADER.BORDER}px`, gap: docked ? 0 : 2 }}>
      {docked ? (
        <>
          {onBack && (
            <Button
              prefix_icon="arrow_left"
              label={t("side_menu.chats")}
              onClick={onBack}
              /* A small way back, sized to its label, not a full nav row. */
              style={{ alignSelf: "flex-start", fontSize: 12, padding: "3px 8px 3px 4px", borderRadius: 6, marginBottom: 4, WebkitAppRegion: "no-drag", iconSize: 14, flexShrink: 0, opacity: 0.75 }}
            />
          )}
          {/* No search field of its own: the side menu's, above both
              panes, searches this list while the Agents pane is open. */}
          <div data-testid="agent-explorer-section-title" aria-hidden={locked ? true : undefined} style={{ display: "flex", alignItems: "center", gap: RECIPE_PANEL_HEADER.GAP, padding: "4px 0 6px 4px", flexShrink: 0, opacity: locked ? 0.35 : 1, pointerEvents: locked ? "none" : undefined, transition: "opacity 0.25s ease" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "1.5px", color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.9)", opacity: 0.35, userSelect: "none", WebkitUserSelect: "none", flex: 1 }}>
              {t("agents.explorer.agents")}
            </div>
            {actionButtons}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: RECIPE_PANEL_HEADER.GAP, paddingLeft: headerLeadingPad, marginBottom: 8 }}>
            {onCollapse && (
              <Button prefix_icon="side_menu_close" ariaLabel={t("agents.explorer.hide_agents")} onClick={onCollapse} style={{ ...ICON_BUTTON, opacity: 0.5 }} />
            )}
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: MUTED, userSelect: "none", WebkitUserSelect: "none", flex: 1 }}>
              {t("agents.explorer.agents")}
            </div>
            {actionButtons}
          </div>

          <div style={{ padding: "12px 4px 6px", flexShrink: 0 }}>
            <label style={{ display: "block" }}>
              {searchLabel}
              {searchField}
            </label>
          </div>
        </>
      )}

      {library.status === "loading" && <span style={caption}>{t("agents.explorer.loading")}</span>}
      {library.status === "failed" && (
        <div data-testid="agent-explorer-failed" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={caption}>
            {library.error?.message
              ? t("agents.explorer.library_read_failed_detail", { message: safe_text(library.error.message) })
              : t("agents.explorer.library_read_failed")}
          </span>
          <Button label={t("agents.explorer.try_again")} onClick={load} style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 3, paddingHorizontal: 8 }} />
        </div>
      )}
      {library.status === "ready" && active.length === 0 && !draftRow && !pending && (
        <span data-testid="agent-explorer-empty" style={caption}>{t("agents.explorer.empty")}</span>
      )}

      <div className="scrollable" data-testid="agent-explorer-list" aria-hidden={locked ? true : undefined} style={{ flex: 1, minHeight: 0, overflowY: "auto", opacity: locked ? 0.35 : 1, pointerEvents: locked ? "none" : undefined, transition: "opacity 0.25s ease" }} onContextMenu={handleBackgroundContextMenu}>
        {filtered && filtered.root.length === 0 && <span style={caption}>{t("agents.explorer.no_results")}</span>}
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
              default_expanded={[]}
              active_node_id={sideActive}
              context_menu_node_id={contextMenu.visible ? contextMenu.node?.id : undefined}
              style={{ width: "100%", fontSize: 13 }}
            />
          </div>
        )}
      </div>

      <ContextMenu visible={contextMenu.visible} x={contextMenu.x} y={contextMenu.y} items={menuItems} onClose={closeContextMenu} isDark={isDark} />

      <AgentIconPicker
        open={iconPicker.open}
        anchor={{ x: iconPicker.x, y: iconPicker.y }}
        value={iconPicker.value}
        onChange={handlePresentationChange}
        onClose={closeIconPicker}
        isDark={isDark}
        testid="agent-explorer-icon-picker"
      />

      {/* Its own sitting: what it reads and chooses is nothing until Import,
          and closing it voids every answer still on its way. */}
      {importOpen && (
        <ImportResourceModal open={importOpen} isDark={isDark} onClose={() => setImportOpen(false)} />
      )}

      <ConfirmModal
        open={confirm.open}
        isDark={isDark}
        title={confirm.kind === "folder"
          ? t("agents.explorer.delete_folder_title", { name: safe_text(confirm.node?.name || "") })
          : t("agents.explorer.delete_title", { name: safe_text(confirm.node?.name || "") })}
        body={confirm.kind === "folder"
          ? t("agents.explorer.delete_folder_description")
          : t("agents.explorer.delete_description")}
        action={confirm.kind === "folder" ? t("agents.explorer.delete_folder") : t("agents.explorer.delete")}
        onClose={() => setConfirm({ open: false, kind: null, node: null })}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
