import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

import Button from "../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Explorer from "../../BUILTIN_COMPONENTs/explorer/explorer";
import { buildExplorerFromTree } from "../../SERVICEs/chat_storage";
import {
  ConfirmDeleteModal,
  ContextMenu,
  RenameRow,
} from "./side_menu_components";
import { sideMenuChatTreeAPI } from "./side_menu_api";
import { getRuntimePlatform } from "./side_menu_utils";
import { buildSideMenuContextMenuItems } from "./side_menu_context_menu_items";
import { useChatTreeStore } from "./hooks/use_chat_tree_store";
import { useSideMenuActions } from "./hooks/use_side_menu_actions";
import { useCharacterAvailability } from "./hooks/use_character_availability";
import { filter_explorer_data } from "./utils/filter_explorer_data";
import {
  exportChat,
  exportFolder,
  importFromFile,
  importFromDroppedFile,
} from "../../SERVICEs/chat_export";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../SERVICEs/feature_flags";

/* eslint-disable import/first -- dynamic import() inside lazy() is not a static import */
const SettingsModal = lazy(() =>
  import("../settings/settings_modal").then((m) => ({ default: m.SettingsModal })),
);
const ToolkitModal = lazy(() =>
  import("../toolkit/toolkit_modal").then((m) => ({ default: m.ToolkitModal })),
);
const AgentsModal = lazy(() =>
  import("../agents/agents_modal").then((m) => ({ default: m.AgentsModal })),
);
const WorkspaceModal = lazy(() =>
  import("../workspace/workspace_modal").then((m) => ({ default: m.WorkspaceModal })),
);
const MemoryInspectModal = lazy(() =>
  import("../memory-inspect/memory_inspect_modal").then((m) => ({
    default: m.MemoryInspectModal,
  })),
);
/* eslint-enable import/first */

export { sideMenuChatTreeAPI };

const resolveCharacterAvatarSrc = (avatar) => {
  const rawUrl = typeof avatar?.url === "string" ? avatar.url.trim() : "";
  if (rawUrl) {
    return rawUrl;
  }

  const rawPath =
    typeof avatar?.absolute_path === "string"
      ? avatar.absolute_path.trim()
      : "";
  if (!rawPath) {
    return "";
  }
  if (/^(https?:|data:|file:)/i.test(rawPath)) {
    return rawPath;
  }
  const normalized = rawPath.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? encodeURI(`file://${normalized}`)
    : encodeURI(`file:///${normalized}`);
};

const characterFallbackInitial = (name) => {
  const normalized =
    typeof name === "string" && name.trim() ? name.trim().charAt(0) : "C";
  return normalized.toUpperCase();
};

const AVAILABILITY_DOT_COLOR = {
  available: "#92c353",
  limited: "#ffaa44",
  busy: "#d74654",
  offline: "#93999e",
};

const CharacterChatRow = ({ node, depth, isDark, characterAvailability }) => {
  const [imageBroken, setImageBroken] = useState(false);
  const avatarSrc = resolveCharacterAvatarSrc(node.characterAvatar);
  const showImage = Boolean(avatarSrc) && !imageBroken;

  return (
    <div
      onClick={(event) => node.on_click && node.on_click(node, event)}
      onContextMenu={(event) =>
        node.on_context_menu && node.on_context_menu(node, event)
      }
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: 42,
        margin: "1px 3px",
        paddingLeft: depth * 16 + 9,
        paddingRight: 10,
        borderRadius: 5,
        cursor: "pointer",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 24,
          height: 24,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
            border: isDark
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(0,0,0,0.08)",
            color: isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.72)",
            fontSize: 11,
            fontWeight: 700,
            fontFamily: "NunitoSans, sans-serif",
          }}
        >
          {showImage ? (
            <img
              src={avatarSrc}
              alt={`${node.characterName || node.label || "character"} avatar`}
              onError={() => setImageBroken(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            characterFallbackInitial(node.characterName || node.label)
          )}
        </div>
        {AVAILABILITY_DOT_COLOR[characterAvailability] && (
          <div
            style={{
              position: "absolute",
              bottom: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: AVAILABILITY_DOT_COLOR[characterAvailability],
              border: `1.5px solid ${isDark ? "rgb(32,32,32)" : "rgb(248,248,248)"}`,
              boxSizing: "content-box",
            }}
          />
        )}
      </div>

      <div
        style={{
          minWidth: 0,
          flex: 1,
          fontSize: 12.5,
          fontFamily: "Jost, sans-serif",
          color: isDark ? "#fff" : "#171717",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {node.label}
      </div>

      {node.postfix ? (
        <div
          style={{
            flexShrink: 0,
            fontSize: 11,
            fontFamily: "Jost, sans-serif",
            color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.4)",
          }}
        >
          {node.postfix}
        </div>
      ) : null}
    </div>
  );
};

const SideMenu = () => {
  const { theme, onFragment, setOnFragment, onThemeMode } =
    useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);

  /* Track which lazy modals have been opened at least once.
     Once mounted, they stay in the tree so Modal's exit animation can play. */
  const lazyMountedRef = useRef({});
  if (settingsOpen) lazyMountedRef.current.settings = true;
  if (toolkitOpen) lazyMountedRef.current.toolkit = true;
  if (agentsOpen) lazyMountedRef.current.agents = true;
  if (workspaceModalOpen) lazyMountedRef.current.workspace = true;
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
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
  const [searchQuery, setSearchQuery] = useState("");
  const [memoryInspect, setMemoryInspect] = useState({
    open: false,
    sessionId: null,
    chatTitle: "",
  });
  if (memoryInspect.open) lazyMountedRef.current.memory = true;

  const { chatStore, setChatStore, selectedNodeId } = useChatTreeStore();
  const characterAvailabilityMap = useCharacterAvailability(
    chatStore?.chatsById,
  );

  const platform = getRuntimePlatform();
  const isDarwin = platform === "darwin";
  const sideMenuBackgroundColor = isDark ? "#151515" : "rgb(245, 245, 245)";
  const isAgentModalEnabled =
    featureFlags.enable_user_access_to_agent_modal === true;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeNow(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(timer);
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

  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);

  useEffect(() => {
    if (!isAgentModalEnabled) {
      setAgentsOpen(false);
    }
  }, [isAgentModalEnabled]);

  const closeContextMenu = useCallback(
    () => setContextMenu((c) => ({ ...c, visible: false })),
    [],
  );

  const handleInspectMemory = useCallback((sessionId, chatTitle) => {
    setMemoryInspect({ open: true, sessionId, chatTitle: chatTitle || "" });
    setContextMenu((c) => ({ ...c, visible: false }));
  }, []);

  const handleExport = useCallback(async (node) => {
    setContextMenu((c) => ({ ...c, visible: false }));
    if (!node) return;
    if (node.entity === "chat" && node.chatId) {
      await exportChat(node.chatId);
    } else if (node.entity === "folder") {
      await exportFolder(node.id);
    }
  }, []);

  const handleImport = useCallback(
    async (parentFolderId) => {
      setContextMenu((c) => ({ ...c, visible: false }));
      const result = await importFromFile({ parentFolderId });
      if (result?.store) {
        setChatStore(result.store);
      }
    },
    [setChatStore],
  );

  const handleDrop = useCallback(
    async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const files = Array.from(e.dataTransfer?.files || []);
      const jsonFile = files.find((f) => f.name.endsWith(".json"));
      if (!jsonFile) return;
      const result = await importFromDroppedFile(jsonFile, {
        parentFolderId: null,
      });
      if (result?.store) {
        setChatStore(result.store);
      }
    },
    [setChatStore],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

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

  const {
    handleSelectNode,
    handleReorder,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleNewChat,
    handleDelete,
  } = useSideMenuActions({
    chatStore,
    setChatStore,
    closeContextMenu,
    renaming,
    setRenaming,
    setConfirmDelete,
  });

  const explorerModel = useMemo(() => {
    return buildExplorerFromTree(
      chatStore?.tree || {},
      chatStore?.chatsById || {},
      {
        selectedNodeId,
        relativeNow,
        onSelect: handleSelectNode,
        onContextMenu: handleContextMenu,
        onStartRename: handleStartRename,
      },
    );
  }, [
    chatStore,
    handleSelectNode,
    selectedNodeId,
    relativeNow,
    handleContextMenu,
    handleStartRename,
  ]);

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
        onInspectMemory: handleInspectMemory,
        onExport: handleExport,
        onImport: handleImport,
      }),
    [
      contextMenu.node,
      clipboard,
      chatStore,
      handleStartRename,
      setChatStore,
      handleInspectMemory,
      handleExport,
      handleImport,
    ],
  );

  const explorerData = useMemo(() => {
    const nextData = { ...explorerModel.data };

    Object.entries(nextData).forEach(([nodeId, node]) => {
      if (node?.entity !== "chat" || node?.chatKind !== "character") {
        return;
      }

      nextData[nodeId] = {
        ...node,
        component: ({ node: componentNode, depth, isExpanded }) => (
          <CharacterChatRow
            node={componentNode}
            depth={depth}
            isExpanded={isExpanded}
            isDark={isDark}
            characterAvailability={
              characterAvailabilityMap[componentNode.characterId] || ""
            }
          />
        ),
      };
    });

    if (renaming.nodeId && nextData[renaming.nodeId]) {
      nextData[renaming.nodeId] = {
        ...nextData[renaming.nodeId],
        component: ({ node }) => (
          <RenameRow
            node={node}
            initialValue={renaming.value}
            onConfirm={handleConfirmRename}
            onCancel={handleCancelRename}
            isDark={isDark}
          />
        ),
      };
    }

    return nextData;
  }, [
    explorerModel.data,
    renaming.nodeId,
    renaming.value,
    handleConfirmRename,
    handleCancelRename,
    isDark,
    characterAvailabilityMap,
  ]);

  const { filteredData, filteredRoot } = useMemo(
    () => filter_explorer_data(explorerData, searchQuery),
    [explorerData, searchQuery],
  );

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
        <Input
          prefix_icon="search"
          no_separator
          value={searchQuery}
          set_value={setSearchQuery}
          placeholder="Search..."
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
                  color={theme?.color || (isDark ? "#CCC" : "#444")}
                />
              </div>
            ) : undefined
          }
          style={{
            fontSize: 12,
            height: 32,
            flexShrink: 0,
            marginBottom: 4,
            borderRadius: 6,
            WebkitAppRegion: "no-drag",
            color: theme?.color || (isDark ? "#CCC" : "#222"),
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
        <Button
          prefix_icon="tool"
          label="Tools"
          onClick={() => setToolkitOpen(true)}
          style={{
            width: "100%",
            justifyContent: "flex-start",
            fontSize: 14,
            padding: "5px 8px",
            borderRadius: 6,
            marginBottom: 2,
            WebkitAppRegion: "no-drag",
            iconSize: 16,
          }}
        />
        {isAgentModalEnabled && (
          <Button
            prefix_icon="bot"
            label="Agents"
            onClick={() => setAgentsOpen(true)}
            style={{
              width: "100%",
              justifyContent: "flex-start",
              fontSize: 14,
              padding: "5px 8px",
              borderRadius: 6,
              marginBottom: 2,
              WebkitAppRegion: "no-drag",
              iconSize: 16,
            }}
          />
        )}
        <Button
          prefix_icon="folder_2"
          label="Workspaces"
          onClick={() => setWorkspaceModalOpen(true)}
          style={{
            width: "100%",
            justifyContent: "flex-start",
            fontSize: 14,
            padding: "5px 8px",
            borderRadius: 6,
            marginBottom: 2,
            WebkitAppRegion: "no-drag",
            iconSize: 16,
          }}
        />
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
          onContextMenu={handleBackgroundContextMenu}
        >
          Chats
        </div>
        <div
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            borderRadius: 6,
            WebkitAppRegion: "no-drag",
          }}
          onContextMenu={handleBackgroundContextMenu}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {filteredRoot && filteredRoot.length === 0 ? (
            <div
              style={{
                padding: "12px 8px",
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: theme?.color || (isDark ? "#CCC" : "#444"),
                opacity: 0.4,
                userSelect: "none",
              }}
            >
              No chats found
            </div>
          ) : (
            <Explorer
              data={filteredRoot ? filteredData : explorerData}
              root={filteredRoot ?? explorerModel.root}
              default_expanded={
                filteredRoot ? true : explorerModel.defaultExpanded
              }
              draggable={!filteredRoot}
              on_reorder={handleReorder}
              style={{ width: "100%", fontSize: 13 }}
              active_node_id={selectedNodeId}
              context_menu_node_id={
                contextMenu.visible ? contextMenu.node?.id : undefined
              }
            />
          )}
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

      {/* Lazy modals: loaded on first open, kept mounted for exit animation */}
      <Suspense fallback={null}>
        {lazyMountedRef.current.settings && (
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {lazyMountedRef.current.toolkit && (
          <ToolkitModal open={toolkitOpen} onClose={() => setToolkitOpen(false)} />
        )}

        {lazyMountedRef.current.agents && (
          <AgentsModal
            open={isAgentModalEnabled && agentsOpen}
            onClose={() => setAgentsOpen(false)}
          />
        )}

        {lazyMountedRef.current.workspace && (
          <WorkspaceModal
            open={workspaceModalOpen}
            onClose={() => setWorkspaceModalOpen(false)}
          />
        )}

        {lazyMountedRef.current.memory && (
          <MemoryInspectModal
            open={memoryInspect.open}
            sessionId={memoryInspect.sessionId}
            chatTitle={memoryInspect.chatTitle}
            onClose={() =>
              setMemoryInspect({ open: false, sessionId: null, chatTitle: "" })
            }
          />
        )}
      </Suspense>

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
