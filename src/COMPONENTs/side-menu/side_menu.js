import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ConfigContext } from "../../CONTAINERs/config/context";

import Button from "../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Explorer from "../../BUILTIN_COMPONENTs/explorer/explorer";
import { SettingsModal } from "../settings/settings_modal";
import {
  applyExplorerReorder,
  bootstrapChatsStore,
  buildExplorerFromTree,
  createChatInSelectedContext,
  createFolder,
  deleteTreeNodeCascade,
  getChatsStore,
  renameTreeNode,
  selectTreeNode,
  setChatMessages,
  subscribeChatsStore,
} from "../../SERVICEs/chat_storage";

const getRuntimePlatform = () => {
  if (typeof window === "undefined") {
    return "web";
  }
  if (window.osInfo && typeof window.osInfo.platform === "string") {
    return window.osInfo.platform;
  }
  if (window.runtime && typeof window.runtime.platform === "string") {
    return window.runtime.platform;
  }
  return "web";
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  RenameRow — inline rename input rendered inside an explorer node                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const RenameRow = ({ node, value, onChange, onConfirm, onCancel, isDark }) => {
  const inputRef = useRef(null);
  const ICON_SIZE = 15; // Math.round(13 * 1.15)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 30,
        paddingRight: 8,
        gap: 4,
        fontSize: 13,
        fontFamily: "Jost, sans-serif",
      }}
    >
      {/* expand-toggle placeholder — keeps alignment */}
      <span style={{ width: 18, height: 18, flexShrink: 0 }} />

      {node.prefix_icon && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            opacity: 0.7,
          }}
        >
          <Icon
            src={node.prefix_icon}
            style={{ width: ICON_SIZE, height: ICON_SIZE }}
          />
        </span>
      )}

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCancel}
        style={{
          flex: 1,
          minWidth: 0,
          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
          border: "none",
          borderBottom: `1.5px solid ${
            isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)"
          }`,
          outline: "none",
          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
          fontSize: 13,
          fontFamily: "Jost, sans-serif",
          padding: "2px 4px",
          borderRadius: "3px 3px 0 0",
          lineHeight: 1.2,
        }}
      />

      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onConfirm();
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
          padding: "2px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          borderRadius: 3,
        }}
      >
        <Icon src="check" style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ContextMenu — portal-rendered right-click menu                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ContextMenu = ({ visible, x, y, items, onClose, isDark }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const bg = isDark ? "#1e1e1e" : "#ffffff";
  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
    : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";

  /* clamp so it never goes off-screen */
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuW = 180;
  const menuH = items.length * 32;
  const left = Math.min(x, screenW - menuW - 8);
  const top = Math.min(y, screenH - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        backgroundColor: bg,
        border,
        borderRadius: 8,
        boxShadow: shadow,
        padding: "4px 0",
        minWidth: menuW,
        userSelect: "none",
      }}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={i}
              style={{
                height: 1,
                margin: "4px 0",
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              }}
            />
          );
        }
        const textColor = item.danger
          ? isDark
            ? "rgba(255,100,100,0.9)"
            : "rgba(180,30,30,0.9)"
          : isDark
            ? "rgba(255,255,255,0.85)"
            : "rgba(0,0,0,0.80)";
        const hoverBg = item.danger
          ? isDark
            ? "rgba(220,50,50,0.15)"
            : "rgba(220,50,50,0.08)"
          : isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.05)";
        return (
          <div
            key={i}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "Jost",
              color: textColor,
              borderRadius: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {item.icon && (
              <Icon
                src={item.icon}
                color={textColor}
                style={{ width: 13, height: 13, flexShrink: 0 }}
              />
            )}
            {item.label}
          </div>
        );
      })}
    </div>,
    document.body,
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ConfirmDeleteModal                                                                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmDeleteModal = ({ open, onClose, onConfirm, label, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 360,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    {/* icon */}
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.15)"
          : "rgba(220,50,50,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
          fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
        />
      </svg>
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Delete "{label}"?
    </div>

    <div
      style={{
        fontSize: 13,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 24,
        lineHeight: 1.5,
      }}
    >
      This cannot be undone. All chats inside will also be removed.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Delete"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
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

export const sideMenuChatTreeAPI = {
  getStore: () => getChatsStore(),
  createChat: (params = {}) =>
    createChatInSelectedContext(params, { source: "external-ui" }),
  createFolder: (params = {}) =>
    createFolder(params, { source: "external-ui" }),
  renameNode: (params = {}) =>
    renameTreeNode(params, { source: "external-ui" }),
  deleteNodeCascade: (params = {}) =>
    deleteTreeNodeCascade(params, { source: "external-ui" }),
  selectNode: (params = {}) =>
    selectTreeNode(params, { source: "external-ui" }),
  applyReorder: (params = {}) =>
    applyExplorerReorder(params, { source: "external-ui" }),
};

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

  const contextMenuItems = useMemo(() => {
    const node = contextMenu.node;

    // Background (root-level) right-click
    if (!node) {
      return [
        {
          icon: "chat_new",
          label: "New Chat",
          onClick: () => {
            const res = createChatInSelectedContext(
              { parentFolderId: null },
              { source: "side-menu" },
            );
            setChatStore(res.store);
          },
        },
        {
          icon: "draft",
          label: "New Folder",
          onClick: () => {
            const res = createFolder(
              { parentFolderId: null },
              { source: "side-menu" },
            );
            setChatStore(res?.store || getChatsStore());
          },
        },
      ];
    }

    if (node.entity === "folder") {
      const items = [
        {
          icon: "edit_box",
          label: "New Chat",
          onClick: () => {
            const res = createChatInSelectedContext(
              { parentFolderId: node.id },
              { source: "side-menu" },
            );
            setChatStore(res.store);
          },
        },
        {
          icon: "draft",
          label: "New Folder",
          onClick: () => {
            const res = createFolder(
              { parentFolderId: node.id },
              { source: "side-menu" },
            );
            setChatStore(res?.store || getChatsStore());
          },
        },
        { type: "separator" },
        {
          icon: "edit",
          label: "Rename",
          onClick: () => handleStartRename(node),
        },
        {
          icon: "edit",
          label: "Copy",
          onClick: () =>
            setClipboard({
              type: "folder",
              nodeId: node.id,
              label: node.label,
            }),
        },
      ];
      if (clipboard) {
        items.push({
          icon: "add",
          label: "Paste",
          onClick: () => {
            if (clipboard.type === "chat") {
              const msgs =
                chatStore?.chatsById?.[clipboard.chatId]?.messages || [];
              const res = createChatInSelectedContext(
                {
                  title: `Copy of ${clipboard.label}`,
                  parentFolderId: node.id,
                },
                { source: "side-menu" },
              );
              setChatMessages(res.chatId, msgs, { source: "side-menu" });
              setChatStore(getChatsStore());
            } else {
              const res = createFolder(
                {
                  label: `Copy of ${clipboard.label}`,
                  parentFolderId: node.id,
                },
                { source: "side-menu" },
              );
              setChatStore(res?.store || getChatsStore());
            }
          },
        });
      }
      items.push({ type: "separator" });
      items.push({
        icon: "delete",
        label: "Delete",
        danger: true,
        onClick: () => setConfirmDelete({ open: true, node }),
      });
      return items;
    }

    if (node.entity === "chat") {
      const chatTitle =
        chatStore?.chatsById?.[node.chatId]?.title || node.label || "Chat";
      return [
        {
          icon: "edit",
          label: "Rename",
          onClick: () => handleStartRename(node),
        },
        {
          icon: "edit",
          label: "Copy",
          onClick: () =>
            setClipboard({
              type: "chat",
              chatId: node.chatId,
              label: chatTitle,
            }),
        },
        { type: "separator" },
        {
          icon: "delete",
          label: "Delete",
          danger: true,
          onClick: () => setConfirmDelete({ open: true, node }),
        },
      ];
    }

    return [];
  }, [contextMenu.node, clipboard, chatStore, handleStartRename]);

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
        backgroundColor: theme?.backgroundColor || "rgba(255,255,255,0.02)",
        borderRight: isDark
          ? "1px solid rgba(255,255,255,0.08)"
          : "1px solid rgba(0,0,0,0.08)",
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
