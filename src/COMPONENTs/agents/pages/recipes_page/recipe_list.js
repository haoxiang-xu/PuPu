import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import Explorer from "../../../../BUILTIN_COMPONENTs/explorer/explorer";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import {
  getFolderState,
  createFolder as createFolderStore,
  renameFolder,
  deleteFolder,
  assignRecipeToFolder,
  applyAgentExplorerReorder,
  renameRecipeKey,
  forgetRecipe,
} from "../../../../SERVICEs/agent_folder_storage";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { buildRecipeListContextMenuItems } from "./recipe_list_context_menu_items";

/* Header row geometry (list toggle, New). The row sits HEADER_INSET from the
   panel's outer edge (its 1px border plus the padding) on top and left, and
   its controls are HEADER_GAP apart. Every corner in the row is concentric with the
   panel's 10px corner: inner radius = outer radius − inset. */
const PANEL_RADIUS = 10;
const PANEL_BORDER = 1;
const HEADER_INSET = 5;
const HEADER_GAP = 4;
/* 28 puts the row's centerline at the modal's top-strip centerline (6 + 5 +
   14 = 25), so the fullscreen / close buttons line up with it. */
const HEADER_HEIGHT = 28;
const HEADER_ICON = 14;
const HEADER_RADIUS = PANEL_RADIUS - HEADER_INSET;

export const RECIPE_PANEL_HEADER = Object.freeze({
  INSET: HEADER_INSET,
  BORDER: PANEL_BORDER,
  GAP: HEADER_GAP,
  HEIGHT: HEADER_HEIGHT,
  ICON: HEADER_ICON,
  RADIUS: HEADER_RADIUS,
});

const PENDING_AGENT_ID = "__new_agent__";
const ROOT_ORDER_KEY = "__root__";
const FOLDER_NODE_PREFIX = "folder:";

const RenameRow = ({ isDark, prefixIcon, initialValue, onConfirm, onCancel }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const commit = () => onConfirm(inputRef.current?.value ?? "");

  return (
    <div
      data-explorer-drag-disabled="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: 1,
        minWidth: 0,
      }}
    >
      {prefixIcon && (
        <Icon
          src={prefixIcon}
          style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.75 }}
        />
      )}
      <input
        ref={inputRef}
        defaultValue={initialValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => commit()}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "1px 4px",
          border: "none",
          borderBottom: `1.5px solid ${
            isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)"
          }`,
          outline: "none",
          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
          fontSize: 13,
          lineHeight: 1.2,
          borderRadius: "3px 3px 0 0",
        }}
      />
    </div>
  );
};

const ConfirmDeleteModal = ({ open, onClose, onConfirm, label, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 340,
      padding: "24px 24px 18px",
      backgroundColor: isDark ? "var(--pupu-background, #1a1a1a)" : "var(--pupu-background, #ffffff)",
      display: "flex",
      flexDirection: "column",
      borderRadius: 12,
    }}
  >
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        marginBottom: 8,
        color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
      }}
    >
      Delete "{label}"?
    </div>
    <div
      style={{
        fontSize: 12,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)",
        marginBottom: 20,
        lineHeight: 1.5,
      }}
    >
      This cannot be undone.
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 12,
          paddingVertical: 6,
          paddingHorizontal: 14,
          borderRadius: 6,
          opacity: 0.65,
        }}
      />
      <Button
        label="Delete"
        onClick={onConfirm}
        style={{
          fontSize: 12,
          paddingVertical: 6,
          paddingHorizontal: 14,
          borderRadius: 6,
          backgroundColor: isDark
            ? "rgba(220,50,50,0.40)"
            : "rgba(220,50,50,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,50,50,0.58)"
            : "rgba(220,50,50,0.22)",
          color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
        }}
      />
    </div>
  </Modal>
);

export default function RecipeList({
  recipes,
  activeName,
  onSelect,
  onListChange,
  onCollapse,
  isDark,
  headerLeadingPad = 0,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [folderVersion, setFolderVersion] = useState(0);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [renaming, setRenaming] = useState({ nodeId: null, value: "" });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, node: null });
  const [pendingAgent, setPendingAgent] = useState(null);

  const mutedColor = "#888";
  const refreshFolders = useCallback(() => setFolderVersion((v) => v + 1), []);
  const closeContextMenu = useCallback(
    () => setContextMenu((c) => ({ ...c, visible: false })),
    [],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const folderState = useMemo(() => getFolderState(), [folderVersion]);

  const refreshRecipes = useCallback(async () => {
    const { recipes: updated } = await api.unchain.listRecipes();
    onListChange(updated);
    return updated;
  }, [onListChange]);

  const handleStartRename = useCallback(
    (node) => {
      if (!node) return;
      if (node.kind === "recipe") {
        setRenaming({ nodeId: node.id, value: node.name });
      } else if (node.kind === "folder") {
        setRenaming({ nodeId: node.id, value: node.name });
      }
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const handleCancelRename = useCallback(() => {
    setRenaming({ nodeId: null, value: "" });
  }, []);

  const handleConfirmRename = useCallback(
    async (rawValue) => {
      const nextName = (rawValue || "").trim();
      const current = renaming;
      setRenaming({ nodeId: null, value: "" });
      if (!current.nodeId || !nextName) return;

      if (current.nodeId.startsWith("folder:")) {
        const folderId = current.nodeId.slice("folder:".length);
        renameFolder(folderId, nextName);
        refreshFolders();
        return;
      }

      const oldName = current.nodeId;
      if (nextName === oldName) return;
      try {
        await api.unchain.renameRecipe(oldName, nextName);
        renameRecipeKey(oldName, nextName);
        refreshFolders();
        await refreshRecipes();
        if (activeName === oldName) onSelect(nextName);
      } catch (exc) {
        console.error("renameRecipe failed", exc);
      }
    },
    [renaming, refreshFolders, refreshRecipes, activeName, onSelect],
  );

  const handleNewFolder = useCallback(
    (parentId) => {
      const { folderId } = createFolderStore({ parentId: parentId || null });
      refreshFolders();
      setRenaming({ nodeId: `folder:${folderId}`, value: "New Folder" });
      closeContextMenu();
    },
    [refreshFolders, closeContextMenu],
  );

  const handleNewAgent = useCallback(
    (parentId) => {
      setPendingAgent({ parentId: parentId || null });
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const handleConfirmNewAgent = useCallback(
    async (rawValue) => {
      const name = (rawValue || "").trim();
      const ctx = pendingAgent;
      setPendingAgent(null);
      if (!name) return;
      if (recipes.some((r) => r.name === name)) return;

      const payload = {
        name,
        description: "",
        model: null,
        max_iterations: null,
        agent: { prompt_format: "soul", prompt: "" },
        toolkits: [],
        subagent_pool: [],
      };
      try {
        await api.unchain.saveRecipe(payload);
        if (ctx?.parentId) {
          assignRecipeToFolder(name, ctx.parentId);
          refreshFolders();
        }
        await refreshRecipes();
        onSelect(name);
      } catch (exc) {
        console.error("createRecipe failed", exc);
      }
    },
    [pendingAgent, recipes, refreshFolders, refreshRecipes, onSelect],
  );

  const handleDuplicate = useCallback(
    async (srcName) => {
      closeContextMenu();
      const existing = new Set(recipes.map((r) => r.name));
      let nextName = `${srcName} copy`;
      let i = 2;
      while (existing.has(nextName)) {
        nextName = `${srcName} copy ${i++}`;
      }
      try {
        await api.unchain.duplicateRecipe(srcName, nextName);
        const folderId = folderState.recipeFolder[srcName];
        if (folderId) {
          assignRecipeToFolder(nextName, folderId);
          refreshFolders();
        }
        await refreshRecipes();
        onSelect(nextName);
      } catch (exc) {
        console.error("duplicateRecipe failed", exc);
      }
    },
    [recipes, folderState, refreshFolders, refreshRecipes, onSelect, closeContextMenu],
  );

  const handleRequestDelete = useCallback(
    (node) => {
      if (node?.kind === "recipe" && node.name === "Default") {
        closeContextMenu();
        return;
      }
      setConfirmDelete({ open: true, node });
      closeContextMenu();
    },
    [closeContextMenu],
  );

  const handleConfirmDelete = useCallback(async () => {
    const node = confirmDelete.node;
    setConfirmDelete({ open: false, node: null });
    if (!node) return;

    if (node.kind === "folder") {
      const folderId = node.id.slice("folder:".length);
      deleteFolder(folderId);
      refreshFolders();
      return;
    }

    if (node.kind === "recipe") {
      try {
        await api.unchain.deleteRecipe(node.name);
        forgetRecipe(node.name);
        refreshFolders();
        const updated = await refreshRecipes();
        if (activeName === node.name) {
          onSelect(updated.length > 0 ? updated[0].name : null);
        }
      } catch (exc) {
        console.error("deleteRecipe failed", exc);
      }
    }
  }, [confirmDelete, refreshFolders, refreshRecipes, activeName, onSelect]);

  const handleNodeContextMenu = useCallback((storeNode, event) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      node: storeNode,
    });
  }, []);

  const handleBackgroundContextMenu = useCallback((event) => {
    event.preventDefault();
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, node: null });
  }, []);

  const handleReorder = useCallback(
    (newData, newRoot) => {
      applyAgentExplorerReorder({ data: newData, root: newRoot });
      refreshFolders();
    },
    [refreshFolders],
  );

  /* ── build explorer data ─────────────────────────────────── */
  const { data, root } = useMemo(() => {
    const map = {};
    const folders = folderState.folders || {};
    const recipeFolder = folderState.recipeFolder || {};
    const folderOrder = folderState.folderOrder || [];

    const recipesByFolder = { __root__: [] };
    Object.keys(folders).forEach((fid) => {
      recipesByFolder[fid] = [];
    });
    recipes.forEach((r) => {
      const fid = recipeFolder[r.name];
      if (fid && folders[fid]) {
        recipesByFolder[fid].push(r.name);
      } else {
        recipesByFolder.__root__.push(r.name);
      }
    });

    const orderChildren = (parentId, folderIds, recipeNames) => {
      const savedOrder = folderState.itemOrder?.[parentId || ROOT_ORDER_KEY];
      const folderSet = new Set(folderIds.map((fid) => `${FOLDER_NODE_PREFIX}${fid}`));
      const recipeSet = new Set(recipeNames);
      const usedFolders = new Set();
      const usedRecipes = new Set();
      const ordered = [];

      if (Array.isArray(savedOrder)) {
        savedOrder.forEach((id) => {
          if (folderSet.has(id)) {
            const folderId = id.slice(FOLDER_NODE_PREFIX.length);
            ordered.push({ type: "folder", id: folderId });
            usedFolders.add(folderId);
            return;
          }
          if (recipeSet.has(id)) {
            ordered.push({ type: "recipe", id });
            usedRecipes.add(id);
          }
        });
      }

      folderIds.forEach((folderId) => {
        if (!usedFolders.has(folderId)) {
          ordered.push({ type: "folder", id: folderId });
        }
      });
      recipeNames.forEach((name) => {
        if (!usedRecipes.has(name)) {
          ordered.push({ type: "recipe", id: name });
        }
      });

      return ordered;
    };

    const buildRecipeNode = (name) => ({
      id: name,
      kind: "recipe",
      name,
      label: name,
      prefix_icon: "bot",
      on_click: () => onSelect(name),
      on_context_menu: (storeNode, event) =>
        handleNodeContextMenu({ ...storeNode, kind: "recipe", name }, event),
    });

    const buildFolderNode = (fid) => {
      const folder = folders[fid];
      const childFolderIds = folder.childFolderIds || [];
      const children = orderChildren(
        fid,
        childFolderIds.filter((cid) => folders[cid]),
        recipesByFolder[fid] || [],
      ).map((child) => {
        if (child.type === "folder") {
          map[`${FOLDER_NODE_PREFIX}${child.id}`] = buildFolderNode(child.id);
          return `${FOLDER_NODE_PREFIX}${child.id}`;
        }
        map[child.id] = buildRecipeNode(child.id);
        return child.id;
      });
      if (pendingAgent && pendingAgent.parentId === fid) {
        map[PENDING_AGENT_ID] = buildPendingAgentNode();
        children.push(PENDING_AGENT_ID);
      }
      return {
        id: `folder:${fid}`,
        kind: "folder",
        name: folder.name,
        type: "folder",
        label: folder.name,
        prefix_icon: "folder_2",
        children,
        on_context_menu: (storeNode, event) =>
          handleNodeContextMenu(
            { ...storeNode, kind: "folder", name: folder.name },
            event,
          ),
      };
    };

    const buildPendingAgentNode = () => ({
      id: PENDING_AGENT_ID,
      kind: "recipe_pending",
      label: "",
      prefix_icon: "bot",
    });

    const rootIds = [];
    orderChildren(
      null,
      folderOrder.filter((fid) => folders[fid]),
      recipesByFolder.__root__ || [],
    ).forEach((child) => {
      if (child.type === "folder") {
        map[`${FOLDER_NODE_PREFIX}${child.id}`] = buildFolderNode(child.id);
        rootIds.push(`${FOLDER_NODE_PREFIX}${child.id}`);
        return;
      }
      map[child.id] = buildRecipeNode(child.id);
      rootIds.push(child.id);
    });
    if (pendingAgent && !pendingAgent.parentId) {
      map[PENDING_AGENT_ID] = buildPendingAgentNode();
      rootIds.push(PENDING_AGENT_ID);
    }

    return { data: map, root: rootIds };
  }, [
    recipes,
    folderState,
    pendingAgent,
    onSelect,
    handleNodeContextMenu,
  ]);

  /* ── decorate data: rename rows + pending agent row ──────── */
  const decoratedData = useMemo(() => {
    const next = { ...data };

    if (renaming.nodeId && next[renaming.nodeId]) {
      const node = next[renaming.nodeId];
      next[renaming.nodeId] = {
        ...node,
        custom_label: (
          <RenameRow
            isDark={isDark}
            prefixIcon={null}
            initialValue={renaming.value}
            onConfirm={handleConfirmRename}
            onCancel={handleCancelRename}
          />
        ),
      };
    }

    if (pendingAgent && next[PENDING_AGENT_ID]) {
      next[PENDING_AGENT_ID] = {
        ...next[PENDING_AGENT_ID],
        custom_label: (
          <RenameRow
            isDark={isDark}
            prefixIcon={null}
            initialValue=""
            onConfirm={handleConfirmNewAgent}
            onCancel={() => setPendingAgent(null)}
          />
        ),
      };
    }

    return next;
  }, [
    data,
    renaming,
    pendingAgent,
    isDark,
    handleConfirmRename,
    handleCancelRename,
    handleConfirmNewAgent,
  ]);

  /* ── auto-expand folders that contain pending agent / renaming node ── */
  const defaultExpanded = useMemo(() => {
    const ids = [];
    const folders = folderState.folders || {};
    Object.keys(folders).forEach((fid) => {
      if (folders[fid].expanded !== false) ids.push(`folder:${fid}`);
    });
    return ids;
  }, [folderState]);

  const headerButtonStyle = {
    paddingVertical: (HEADER_HEIGHT - HEADER_ICON) / 2,
    paddingHorizontal: (HEADER_HEIGHT - HEADER_ICON) / 2,
    borderRadius: HEADER_RADIUS,
    opacity: 0.55,
    flexShrink: 0,
    WebkitAppRegion: "no-drag",
    content: {
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
      icon: { width: HEADER_ICON, height: HEADER_ICON },
    },
  };

  /* ── search: flat list of matching agents, folders dropped ── */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    const matchData = {};
    const matchRoot = [];
    Object.entries(decoratedData).forEach(([id, node]) => {
      if (node.kind === "recipe" && node.name.toLowerCase().includes(q)) {
        matchData[id] = node;
        matchRoot.push(id);
      }
    });
    return { data: matchData, root: matchRoot };
  }, [decoratedData, searchQuery]);

  const contextMenuItems = useMemo(
    () =>
      buildRecipeListContextMenuItems({
        node: contextMenu.node,
        onNewAgent: handleNewAgent,
        onNewFolder: handleNewFolder,
        onStartRename: handleStartRename,
        onDelete: handleRequestDelete,
        onDuplicate: handleDuplicate,
      }),
    [
      contextMenu.node,
      handleNewAgent,
      handleNewFolder,
      handleStartRename,
      handleRequestDelete,
      handleDuplicate,
    ],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: `${HEADER_INSET - PANEL_BORDER}px ${
          HEADER_INSET - PANEL_BORDER
        }px 10px`,
        gap: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: HEADER_GAP,
          flexShrink: 0,
          /* Clears macOS's traffic lights on the same line instead of
             dropping below them. */
          paddingLeft: headerLeadingPad,
        }}
      >
        {onCollapse && (
          <Button
            prefix_icon="side_menu_close"
            ariaLabel="Hide agents"
            onClick={onCollapse}
            style={headerButtonStyle}
          />
        )}
        <Button
          prefix_icon="add"
          ariaLabel="New"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setSearchQuery("");
            setContextMenu({
              visible: true,
              x: rect.left,
              y: rect.bottom + 4,
              node: null,
            });
          }}
          style={headerButtonStyle}
        />
      </div>
      {/* Same box as the root side menu's search: on its own row below the
          buttons, 8px in like the list, with room above and below. */}
      <div style={{ padding: "12px 4px 6px", flexShrink: 0 }}>
        <Input
          prefix_icon="search"
          no_separator
          value={searchQuery}
          set_value={setSearchQuery}
          placeholder={t("side_menu.search")}
          postfix_component={
            searchQuery ? (
              <div
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchQuery("");
                }}
              >
                <Icon
                  src="delete_input"
                  style={{ width: 18, height: 18 }}
                  color={isDark ? "#CCC" : "#444"}
                />
              </div>
            ) : undefined
          }
          style={{
            fontSize: 12,
            width: "100%",
            height: 32,
            borderRadius: 6,
            WebkitAppRegion: "no-drag",
            color: isDark ? "#CCC" : "#222",
            outline: {
              onFocus: isDark
                ? "1px solid rgba(255,255,255,0.18)"
                : "1px solid rgba(0,0,0,0.18)",
              onBlur: isDark
                ? "1px solid rgba(255,255,255,0.06)"
                : "1px solid rgba(0,0,0,0.08)",
            },
            boxShadow: "none",
          }}
        />
      </div>
      <div
        style={{
          padding: "4px 8px 6px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          color: mutedColor,
          userSelect: "none",
          WebkitUserSelect: "none",
          flexShrink: 0,
        }}
      >
        Agents
      </div>

      <div
        className="scrollable"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 4px",
        }}
        onContextMenu={handleBackgroundContextMenu}
      >
        {filtered && filtered.root.length === 0 ? (
          <div
            style={{
              padding: "12px 4px",
              fontSize: 12,
              color: mutedColor,
              userSelect: "none",
            }}
          >
            No agents found
          </div>
        ) : (
          <Explorer
            data={filtered ? filtered.data : decoratedData}
            root={filtered ? filtered.root : root}
            default_expanded={filtered ? true : defaultExpanded}
            active_node_id={activeName}
            context_menu_node_id={
              contextMenu.visible ? contextMenu.node?.id : undefined
            }
            draggable={!filtered}
            on_reorder={handleReorder}
            style={{ width: "100%", fontSize: 13 }}
          />
        )}
      </div>

      <ContextMenu
        visible={contextMenu.visible}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={closeContextMenu}
        isDark={isDark}
      />

      <ConfirmDeleteModal
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, node: null })}
        onConfirm={handleConfirmDelete}
        label={confirmDelete.node?.name || ""}
        isDark={isDark}
      />
    </div>
  );
}
