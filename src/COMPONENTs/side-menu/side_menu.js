import { useSurfaceComposite } from "../../BUILTIN_COMPONENTs/material/surface_composite";
import { SURFACE_DITHER_STYLE } from "../../BUILTIN_COMPONENTs/material/surface_dither";
import { SIDEBAR_GLASS_FILTER } from "../../CONTAINERs/config/theme_semantic";
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
import { Z } from "../../BUILTIN_COMPONENTs/layer/z_layers";
import { buildExplorerFromTree } from "../../SERVICEs/chat_storage";
import {
  ConfirmDeleteModal,
  ContextMenu,
  RenameRow,
} from "./side_menu_components";
import { sideMenuChatTreeAPI } from "./side_menu_api";
import usePresentationPlatform from "../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import useWindowFullscreen from "../../BUILTIN_COMPONENTs/mini_react/use_window_fullscreen";
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
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import SuspenseFallback from "../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import { SettingsModal } from "../settings/settings_modal";
import { ToolkitModal } from "../toolkit/toolkit_modal";
import { WorkspaceModal } from "../workspace/workspace_modal";
import PanelResizeHandle from "../agents/pages/recipes_page/panel_resize_handle";
import SideMenuBreadcrumb from "./side_menu_breadcrumb";
import SideMenuDrillButton from "./side_menu_drill_button";
import { useAgentsSidebarSearch } from "../../SERVICEs/agents_sidebar_search";
import { HEADER_ICON_BUTTON } from "../agents/pages/recipes_page/recipe_list";
import {
  SIDE_MENU_WIDTH,
  clampSideMenuWidth,
  sideMenuWidthCss,
  writeSideMenuWidthVar,
} from "../../SERVICEs/side_menu_width";

/* eslint-disable import/first -- dynamic import() inside lazy() is not a static import */
const MemoryInspectModal = lazy(() =>
  import("../memory-inspect/memory_inspect_modal").then((m) => ({
    default: m.MemoryInspectModal,
  })),
);
const ModelProvidersModal = lazy(() =>
  import("../model-providers/model_providers_modal").then((m) => ({
    default: m.ModelProvidersModal,
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

const CharacterChatRow = ({ node, depth, isDark, theme, characterAvailability }) => {
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
            fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
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
          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
  const {
    theme,
    onFragment,
    setOnFragment,
    onThemeMode,
    appMode = "chat",
    setAppMode,
    setAgentsSidebarSlot,
    sideMenuWidth = SIDE_MENU_WIDTH.DEFAULT,
    setSideMenuWidth,
    sideMenuResizing = false,
    setSideMenuResizing,
  } = useContext(ConfigContext);
  const resizeStartWidthRef = useRef(sideMenuWidth);
  const resizeWidthRef = useRef(sideMenuWidth);
  const resizeFrameRef = useRef(0);
  const inAgents = appMode === "agents";
  const switchMode = useCallback(
    (mode) => {
      if (typeof setAppMode === "function") setAppMode(mode);
    },
    [setAppMode],
  );
  const isFullScreen = useWindowFullscreen();
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [modelProvidersOpen, setModelProvidersOpen] = useState(false);
  const [modelProvidersInitialEntry, setModelProvidersInitialEntry] = useState(null);

  /* Track which lazy modals have been opened at least once.
     Once mounted, they stay in the tree so Modal's exit animation can play. */
  const lazyMountedRef = useRef({});
  if (settingsOpen) lazyMountedRef.current.settings = true;
  if (toolkitOpen) lazyMountedRef.current.toolkit = true;
  if (workspaceModalOpen) lazyMountedRef.current.workspace = true;
  if (modelProvidersOpen) lazyMountedRef.current.modelProviders = true;
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
  /* One search field for both panes: the chat list's query, or the agent
     list's (which the docked list reads). */
  const [agentsQuery, setAgentsQuery] = useAgentsSidebarSearch();
  const activeQuery = inAgents ? agentsQuery : searchQuery;
  const setActiveQuery = inAgents ? setAgentsQuery : setSearchQuery;
  const [memoryInspect, setMemoryInspect] = useState({
    open: false,
    sessionId: null,
    chatTitle: "",
    ownerChatId: null,
  });
  if (memoryInspect.open) lazyMountedRef.current.memory = true;

  const { chatStore, setChatStore, selectedNodeId } = useChatTreeStore();
  const characterAvailabilityMap = useCharacterAvailability(
    chatStore?.chatsById,
  );

  const platform = usePresentationPlatform();
  const isDarwin = platform === "darwin";
  const reserveDarwinTrafficLights = isDarwin && !isFullScreen;
  /* Slightly see-through, yet over the shell background it lands on exactly
     the theme's sidebar colour: --pupu-sidebar-glass is solved for that
     (theme_semantic.calibratedGlass). */
  const sideMenuBackgroundColor = isDark
    ? "var(--pupu-sidebar-glass, #151515)"
    : "var(--pupu-sidebar-glass, rgb(245, 245, 245))";
  const surface = useSurfaceComposite({
    backgroundColor: sideMenuBackgroundColor,
    backdropFilter: SIDEBAR_GLASS_FILTER,
  });
  const isAgentsEnabled = featureFlags.enable_user_access_to_agents === true;
  const isCharactersEnabled =
    featureFlags.enable_user_access_to_characters === true;
  const isAgentModalEnabled = isAgentsEnabled || isCharactersEnabled;

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
    if (!isAgentModalEnabled && inAgents) {
      switchMode("chat");
    }
  }, [isAgentModalEnabled, inAgents, switchMode]);

  const closeContextMenu = useCallback(
    () => setContextMenu((c) => ({ ...c, visible: false })),
    [],
  );

  /*
   * Mount interface for the memory inspector. Object parameter, never
   * positional: `sessionId` and `ownerChatId` are both legal chat-id-shaped
   * strings, so a positional swap would be silent in JS and would send the
   * inspector at the wrong owner while every layer below reports success.
   *
   *   sessionId   — V1 vector view key. Character chats: the derived
   *                 character memory session id. Plain chats: the chat id.
   *   chatTitle   — display title for the modal header.
   *   ownerChatId — V2 context_v2 owner key. ALWAYS the UI chat id
   *                 (`node.chatId`) for both branches. Never derived from
   *                 `sessionId` — that mapping is lossy and non-invertible.
   *
   * Snapshot semantics: values are captured from the right-clicked node at
   * open time and do not follow the active chat afterwards.
   */
  const handleInspectMemory = useCallback((params) => {
    if (!params || typeof params !== "object") {
      // Guards the exact failure this interface exists to prevent: a legacy
      // positional call destructures to all-undefined without throwing.
      console.error(
        "[side-menu] onInspectMemory expects an object " +
          "({ sessionId, chatTitle, ownerChatId }), received:",
        params,
      );
      return;
    }
    const { sessionId, chatTitle, ownerChatId } = params;
    setMemoryInspect({
      open: true,
      sessionId,
      chatTitle: chatTitle || "",
      ownerChatId: ownerChatId || null,
    });
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

  /* Switch-chain incrementalization Task 3: the handlers object passed to
     buildExplorerFromTree must keep a CONSTANT reference across renders — it
     is part of the row cache key (row closures capture it). Stable dispatcher
     via the latest-ref pattern: the methods never change identity and read
     the freshest callbacks through a ref. The data fields riding on the
     object (selectedNodeId / relativeNow) are refreshed in place before each
     build; their row-level effects are value-checked by the cache itself. */
  const explorerHandlerCallbacksRef = useRef({});
  explorerHandlerCallbacksRef.current.onSelect = handleSelectNode;
  explorerHandlerCallbacksRef.current.onContextMenu = handleContextMenu;
  explorerHandlerCallbacksRef.current.onStartRename = handleStartRename;

  const explorerHandlersRef = useRef(null);
  if (explorerHandlersRef.current === null) {
    explorerHandlersRef.current = {
      onSelect: (nodeId) =>
        explorerHandlerCallbacksRef.current.onSelect?.(nodeId),
      onContextMenu: (node, event) =>
        explorerHandlerCallbacksRef.current.onContextMenu?.(node, event),
      onStartRename: (node) =>
        explorerHandlerCallbacksRef.current.onStartRename?.(node),
    };
  }

  /* Caller-owned generation row cache (see buildExplorerFromTree): untouched
     rows keep reference identity across store writes, so the memo'd explorer
     rows skip re-rendering — the recompute below is mostly cache hits. */
  const explorerRowCacheRef = useRef({ rowsByNodeId: new Map() });

  const explorerModel = useMemo(() => {
    const handlers = explorerHandlersRef.current;
    handlers.selectedNodeId = selectedNodeId;
    handlers.relativeNow = relativeNow;
    return buildExplorerFromTree(
      chatStore?.tree || {},
      chatStore?.chatsById || {},
      handlers,
      explorerRowCacheRef.current,
    );
  }, [chatStore, selectedNodeId, relativeNow]);

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
        t,
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
      t,
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
            theme={theme}
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
    theme,
    characterAvailabilityMap,
  ]);

  const { filteredData, filteredRoot } = useMemo(
    () => filter_explorer_data(explorerData, searchQuery),
    [explorerData, searchQuery],
  );

  return (
    <div
      style={{
        transition: sideMenuResizing ? "none" : "width 0.3s ease",
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        width: onFragment === "side_menu" ? sideMenuWidthCss(sideMenuWidth) : 0,
        backgroundColor: sideMenuBackgroundColor,
        backdropFilter: SIDEBAR_GLASS_FILTER,
        WebkitBackdropFilter: SIDEBAR_GLASS_FILTER,
        ...SURFACE_DITHER_STYLE,
        ...surface.style,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        /* 必须压过 title bar(APP_CHROME)。迁移前靠 2049 > 2048 表达,
           并由 container.js 的 JSX 顺序兜底;现在是显式的。 */
        zIndex: Z.APP_CHROME_TOP,
      }}
    >
      {surface.definition}
      <Button
        prefix_icon={
          onFragment === "main" ? "side_menu_left" : "side_menu_close"
        }
        ariaLabel={
          onFragment === "main" ? "Open sidebar" : "Close sidebar"
        }
        style={{
          position: "absolute",
          top: 25,
          transform: "translate(-50%, -50%)",
          left: reserveDarwinTrafficLights ? 90 : 14,
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


      {/* Two panes side by side, slid as one: the chat list, and the Agents
          pane it drills into. Like a navigation stack in a sidebar column —
          "Agents ›" pushes, the breadcrumb's Home pops — so the side menu never shows
          both and the window's centre follows the pane. */}
      {/* Always the first line, above the search field: where the side
          menu is, and the way home. */}
      {/* Centred between the top row's icons (14px, centred on y=25, so
          ending at 32) and the search field (y=88): 15px of air each side. */}
      <div style={{ position: "absolute", top: 47, left: 12, right: 12 }}>
        <SideMenuBreadcrumb
          isDark={isDark}
          crumbs={
            inAgents
              ? [
                  { key: "home", icon: "home_door", label: t("side_menu.home"), onClick: () => switchMode("chat") },
                  { key: "agents", icon: "bot", label: t("side_menu.agents") },
                ]
              : [{ key: "home", icon: "home_door", label: t("side_menu.home") }]
          }
        />
      </div>

      {/* The search field stays put like the breadcrumb above it; only what
          is under it slides. It searches whichever pane is showing, and
          each pane keeps its own query. */}
      <label
        data-testid="side-menu-search"
        style={{ position: "absolute", top: 88, left: 12, right: 12, display: "block" }}
      >
        <Input
          prefix_icon="search"
          no_separator
          value={activeQuery}
          set_value={setActiveQuery}
          placeholder={t("side_menu.search")}
          postfix_component={
            activeQuery ? (
              <div
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveQuery("");
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
            width: "100%",
            boxSizing: "border-box",
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
      </label>

      <div
        style={{
          position: "absolute",
          top: 124,
          left: 0,
          right: 0,
          bottom: 58,
          overflow: "hidden",
        }}
      >
        <div
          data-testid="side-menu-panes"
          style={{
            display: "flex",
            width: "200%",
            height: "100%",
            transform: inAgents ? "translateX(-50%)" : "translateX(0)",
            transition: "transform 0.32s cubic-bezier(0.32,1,0.32,1)",
          }}
        >
          <div
            aria-hidden={inAgents ? true : undefined}
            style={{
              width: "50%",
              height: "100%",
              boxSizing: "border-box",
              padding: "0 12px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
              visibility: inAgents ? "hidden" : "visible",
              transition: "visibility 0.32s",
            }}
          >
            <Button
              prefix_icon="pentagon"
              label={t("side_menu.models")}
              onClick={() => {
                setModelProvidersInitialEntry(null);
                setModelProvidersOpen(true);
              }}
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
            <Button
              prefix_icon="tool"
              label={t("side_menu.tools")}
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
            <Button
              prefix_icon="folder_2"
              label={t("side_menu.workspaces")}
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
            {isAgentModalEnabled && (
              <SideMenuDrillButton
                icon="bot"
                label={t("side_menu.agents")}
                onClick={() => switchMode("agents")}
                isDark={isDark}
                testId="side-menu-agents-entry"
              />
            )}
            {/* The section title with its action, like the Agents list's:
                New chat lives here, not in the window's top bar. */}
            <div
              data-testid="side-menu-chats-title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 0 6px 4px",
                flexShrink: 0,
              }}
              onContextMenu={handleBackgroundContextMenu}
            >
              <div
                style={{
                  flex: 1,
                  fontSize: 11,
                  fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: "1.5px",
                  color: theme?.color || "rgba(255,255,255,0.9)",
                  opacity: 0.35,
                  userSelect: "none",
                }}
              >
                {t("side_menu.chats")}
              </div>
              <Button
                prefix_icon="add"
                ariaLabel="New chat"
                style={HEADER_ICON_BUTTON}
                onClick={(...args) => handleNewChat(...args)}
              />
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
                    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                    color: theme?.color || (isDark ? "#CCC" : "#444"),
                    opacity: 0.4,
                    userSelect: "none",
                  }}
                >
                  {t("side_menu.no_chats_found")}
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

          <div
            aria-hidden={inAgents ? undefined : true}
            style={{
              width: "50%",
              height: "100%",
              boxSizing: "border-box",
              padding: "0 12px",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              visibility: inAgents ? "visible" : "hidden",
              transition: "visibility 0.32s",
            }}
          >
            {/* The agent list renders here (search, "‹ Chats", actions,
                list), handed over by the Agents workspace. */}
            <div
              ref={setAgentsSidebarSlot}
              data-testid="side-menu-agents-slot"
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                WebkitAppRegion: "no-drag",
              }}
            />
          </div>
        </div>
      </div>

      {typeof setSideMenuWidth === "function" && (
        <PanelResizeHandle
          testId="side-menu-resize-handle"
          pillTestId="side-menu-resize-pill"
          isDark={isDark}
          visible={onFragment === "side_menu"}
          style={{ top: 0, bottom: 0, right: 0 }}
          onDragStart={() => {
            resizeStartWidthRef.current = sideMenuWidth;
            resizeWidthRef.current = sideMenuWidth;
            if (typeof setSideMenuResizing === "function") {
              setSideMenuResizing(true);
            }
          }}
          onDrag={(dx) => {
            /* No render per move: the CSS variable carries the width, at
               most once a frame. */
            resizeWidthRef.current = clampSideMenuWidth(
              resizeStartWidthRef.current + dx,
            );
            if (resizeFrameRef.current) return;
            resizeFrameRef.current = requestAnimationFrame(() => {
              resizeFrameRef.current = 0;
              writeSideMenuWidthVar(resizeWidthRef.current);
            });
          }}
          onDragEnd={() => {
            if (resizeFrameRef.current) {
              cancelAnimationFrame(resizeFrameRef.current);
              resizeFrameRef.current = 0;
            }
            writeSideMenuWidthVar(resizeWidthRef.current);
            if (typeof setSideMenuWidth === "function") {
              setSideMenuWidth(resizeWidthRef.current);
            }
            if (typeof setSideMenuResizing === "function") {
              setSideMenuResizing(false);
            }
          }}
        />
      )}

      <Button
        prefix_icon="settings"
        label={t("side_menu.settings")}
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
      <Suspense fallback={<SuspenseFallback fullscreen />}>
        {lazyMountedRef.current.settings && (
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            onOpenModelProviders={(entryId) => {
              setSettingsOpen(false);
              setModelProvidersInitialEntry(
                typeof entryId === "string" ? entryId : null,
              );
              setModelProvidersOpen(true);
            }}
          />
        )}

        {lazyMountedRef.current.toolkit && (
          <ToolkitModal open={toolkitOpen} onClose={() => setToolkitOpen(false)} />
        )}

        {lazyMountedRef.current.workspace && (
          <WorkspaceModal
            open={workspaceModalOpen}
            onClose={() => setWorkspaceModalOpen(false)}
          />
        )}

        {lazyMountedRef.current.modelProviders && (
          <ModelProvidersModal
            open={modelProvidersOpen}
            onClose={() => setModelProvidersOpen(false)}
            initialEntryId={modelProvidersInitialEntry}
          />
        )}

        {lazyMountedRef.current.memory && (
          <MemoryInspectModal
            open={memoryInspect.open}
            sessionId={memoryInspect.sessionId}
            chatTitle={memoryInspect.chatTitle}
            ownerChatId={memoryInspect.ownerChatId}
            onClose={() =>
              setMemoryInspect({
                open: false,
                sessionId: null,
                chatTitle: "",
                ownerChatId: null,
              })
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
