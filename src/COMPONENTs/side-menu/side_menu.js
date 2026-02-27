import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

import Button from "../../BUILTIN_COMPONENTs/input/button";
import Explorer from "../../BUILTIN_COMPONENTs/explorer/explorer";
import { SettingsModal } from "../settings/settings_modal";
import {
  applyExplorerReorder,
  bootstrapChatsStore,
  buildExplorerFromTree,
  createChatInSelectedContext,
  deleteTreeNodeCascade,
  getChatsStore,
  renameTreeNode,
  selectTreeNode,
  subscribeChatsStore,
} from "../../SERVICEs/chat_storage";
import {
  ConfirmDeleteModal,
  ContextMenu,
  RenameRow,
} from "./side_menu_components";
import { sideMenuChatTreeAPI } from "./side_menu_api";
import { getRuntimePlatform } from "./side_menu_utils";
import { buildSideMenuContextMenuItems } from "./side_menu_context_menu_items";

export { sideMenuChatTreeAPI };

const SideMenu = () => {
  const { theme, onFragment, setOnFragment, onThemeMode } =
    useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [chatStore, setChatStore] = useState(() => bootstrapChatsStore().store);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });
  const [clipboard, setClipboard] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState({
    open: false,
    node: null,
  });
  const [renaming, setRenaming] = useState({ nodeId: null, value: "" });

  const platform = getRuntimePlatform();
  const isDarwin = platform === "darwin";
  const sideMenuBackgroundColor = isDark
    ? "#151515"
    : "rgb(245, 245, 245)";

  const selectedNodeId = chatStore?.tree?.selectedNodeId || null;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (windowWidth < 1000 && onFragment === "side_menu") {
      console.log("Window width < 1000, side menu in overlay mode");
    }
  }, [windowWidth, onFragment]);

  useEffect(() => {
    setChatStore(getChatsStore());
    const unsubscribe = subscribeChatsStore((nextStore) => {
      setChatStore(nextStore);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => {};
    }

    window.pupuChatTreeAPI = sideMenuChatTreeAPI;
    return () => {
      if (window.pupuChatTreeAPI === sideMenuChatTreeAPI) {
        delete window.pupuChatTreeAPI;
      }
    };
  }, []);

  const handleSelectNode = useCallback((nodeId) => {
    const next = selectTreeNode({ nodeId }, { source: "side-menu" });
    setChatStore(next);
  }, []);

  const handleReorder = useCallback((newData, newRoot) => {
    const next = applyExplorerReorder(
      {
        data: newData,
        root: newRoot,
      },
      { source: "side-menu" },
    );
    setChatStore(next);
  }, []);

  const closeContextMenu = useCallback(
    () => setContextMenu((c) => ({ ...c, visible: false })),
    [],
  );

  const handleContextMenu = useCallback((storeNode, event) => {
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
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      node: null,
    });
  }, []);

  const handleStartRename = useCallback(
    (storeNode) => {
      const label =
        chatStore?.chatsById?.[storeNode.chatId]?.title ||
        storeNode.label ||
        "";
      closeContextMenu();
      setRenaming({ nodeId: storeNode.id, value: label });
    },
    [chatStore, closeContextMenu],
  );

  const handleConfirmRename = useCallback(() => {
    if (!renaming.nodeId) return;
    const trimmed = renaming.value.trim();
    if (trimmed) {
      const next = renameTreeNode(
        { nodeId: renaming.nodeId, label: trimmed },
        { source: "side-menu" },
      );
      setChatStore(next);
    }
    setRenaming({ nodeId: null, value: "" });
  }, [renaming]);

  const handleCancelRename = useCallback(() => {
    setRenaming({ nodeId: null, value: "" });
  }, []);

  const explorerModel = useMemo(() => {
    return buildExplorerFromTree(
      chatStore?.tree || {},
      chatStore?.chatsById || {},
      {
        selectedNodeId,
        onSelect: handleSelectNode,
        onContextMenu: handleContextMenu,
        onStartRename: handleStartRename,
      },
    );
  }, [
    chatStore,
    handleSelectNode,
    selectedNodeId,
    handleContextMenu,
    handleStartRename,
  ]);

  const handleNewChat = useCallback(() => {
    const activeChat = chatStore?.chatsById?.[chatStore?.activeChatId];
    const hasMessages =
      Array.isArray(activeChat?.messages) && activeChat.messages.length > 0;
    if (!hasMessages) return;

    const result = createChatInSelectedContext(
      { parentFolderId: null },
      { source: "side-menu" },
    );
    setChatStore(result.store);
  }, [chatStore]);

  const handleDelete = useCallback((node) => {
    deleteTreeNodeCascade({ nodeId: node.id }, { source: "side-menu" });
    setChatStore(getChatsStore());
    setConfirmDelete({ open: false, node: null });
  }, []);

  const contextMenuItems = useMemo(
    () =>
      buildSideMenuContextMenuItems({
        node: contextMenu.node,
        clipboard,
        chatStore,
        setChatStore,
        handleStartRename,
        setClipboard,
        setConfirmDelete,
      }),
    [contextMenu.node, clipboard, chatStore, handleStartRename],
  );

  const explorerData = useMemo(() => {
    if (!renaming.nodeId || !explorerModel.data[renaming.nodeId]) {
      return explorerModel.data;
    }
    return {
      ...explorerModel.data,
      [renaming.nodeId]: {
        ...explorerModel.data[renaming.nodeId],
        component: ({ node }) => (
          <RenameRow
            node={node}
            value={renaming.value}
            onChange={(v) => setRenaming((r) => ({ ...r, value: v }))}
            onConfirm={handleConfirmRename}
            onCancel={handleCancelRename}
            isDark={isDark}
          />
        ),
      },
    };
  }, [
    explorerModel.data,
    renaming,
    handleConfirmRename,
    handleCancelRename,
    isDark,
  ]);

  return (
    <div
      style={{
        transition: "width 0.3s ease",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: onFragment === "side_menu" ? 320 : 0,
        backgroundColor: sideMenuBackgroundColor,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        zIndex: 2049,
      }}
    >
      <Button
        prefix_icon={
          onFragment === "main" ? "side_menu_left" : "side_menu_close"
        }
        style={{
          position: "absolute",
          top: 25,
          transform: "translate(-50%, -50%)",
          left: isDarwin ? 90 : 14,
          fontSize: 14,
          marginLeft: 12,
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => {
          if (onFragment === "main") {
            setOnFragment("side_menu");
          } else {
            setOnFragment("main");
          }
        }}
      />

      <Button
        prefix_icon="edit_box"
        style={{
          position: "absolute",
          top: 25,
          transform: "translateY(-50%)",
          left: isDarwin ? 120 : 44,
          fontSize: 14,
          WebkitAppRegion: "no-drag",
        }}
        onClick={handleNewChat}
      />

      <div
        style={{
          position: "absolute",
          top: 56,
          left: 12,
          right: 12,
          bottom: 58,
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}
      >
        <div
          style={{
            padding: "4px 4px 6px",
            fontSize: 11,
            fontFamily: "Jost",
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: theme?.color || "rgba(255,255,255,0.9)",
            opacity: 0.35,
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          Chats
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            borderRadius: 6,
            WebkitAppRegion: "no-drag",
          }}
          onContextMenu={handleBackgroundContextMenu}
        >
          <Explorer
            data={explorerData}
            root={explorerModel.root}
            default_expanded={explorerModel.defaultExpanded}
            draggable
            on_reorder={handleReorder}
            style={{ width: "100%", fontSize: 13 }}
            active_node_id={selectedNodeId}
          />
        </div>
      </div>

      <Button
        prefix_icon="settings"
        label="Settings"
        style={{
          position: "absolute",
          bottom: 12,
          left: 12,
          fontSize: 14,
          WebkitAppRegion: "no-drag",
        }}
        onClick={() => setSettingsOpen(true)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

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
        onConfirm={() => handleDelete(confirmDelete.node)}
        label={confirmDelete.node?.label || ""}
        isDark={isDark}
      />
    </div>
  );
};

export default SideMenu;
