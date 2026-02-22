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
  createFolder,
  deleteTreeNodeCascade,
  getChatsStore,
  renameTreeNode,
  selectTreeNode,
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

export const sideMenuChatTreeAPI = {
  getStore: () => getChatsStore(),
  createChat: (params = {}) => createChatInSelectedContext(params, { source: "external-ui" }),
  createFolder: (params = {}) => createFolder(params, { source: "external-ui" }),
  renameNode: (params = {}) => renameTreeNode(params, { source: "external-ui" }),
  deleteNodeCascade: (params = {}) => deleteTreeNodeCascade(params, { source: "external-ui" }),
  selectNode: (params = {}) => selectTreeNode(params, { source: "external-ui" }),
  applyReorder: (params = {}) => applyExplorerReorder(params, { source: "external-ui" }),
};

const SideMenu = () => {
  const { theme, onFragment, setOnFragment } = useContext(ConfigContext);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const [chatStore, setChatStore] = useState(() => bootstrapChatsStore().store);

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

  const explorerModel = useMemo(() => {
    return buildExplorerFromTree(chatStore?.tree || {}, chatStore?.chatsById || {}, {
      selectedNodeId,
      onSelect: handleSelectNode,
    });
  }, [chatStore, handleSelectNode, selectedNodeId]);

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
        borderRight: `1px solid ${theme?.foregroundColor || "rgba(255,255,255,0.06)"}`,
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
            flex: 1,
            minHeight: 0,
            overflow: "auto",
            borderRadius: 6,
            WebkitAppRegion: "no-drag",
          }}
        >
          <Explorer
            data={explorerModel.data}
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
    </div>
  );
};

export default SideMenu;
