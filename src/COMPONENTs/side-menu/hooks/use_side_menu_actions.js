import { useCallback } from "react";
import {
  applyExplorerReorder,
  createChatInSelectedContext,
  deleteTreeNodeCascade,
  getChatsStore,
  renameTreeNode,
  selectTreeNode,
} from "../../../SERVICEs/chat_storage";

export const useSideMenuActions = ({
  chatStore,
  setChatStore,
  closeContextMenu,
  renaming,
  setRenaming,
  setConfirmDelete,
}) => {
  const handleSelectNode = useCallback(
    (nodeId) => {
      const next = selectTreeNode({ nodeId }, { source: "side-menu" });
      setChatStore(next);
    },
    [setChatStore],
  );

  const handleReorder = useCallback(
    (newData, newRoot) => {
      const next = applyExplorerReorder(
        {
          data: newData,
          root: newRoot,
        },
        { source: "side-menu" },
      );
      setChatStore(next);
    },
    [setChatStore],
  );

  const handleStartRename = useCallback(
    (storeNode) => {
      const label =
        chatStore?.chatsById?.[storeNode.chatId]?.title ||
        storeNode.label ||
        "";
      closeContextMenu();
      setRenaming({ nodeId: storeNode.id, value: label });
    },
    [chatStore, closeContextMenu, setRenaming],
  );

  const handleConfirmRename = useCallback(
    (newValue) => {
      if (!renaming.nodeId) return;
      const trimmed = (newValue ?? renaming.value).trim();
      if (trimmed) {
        const next = renameTreeNode(
          { nodeId: renaming.nodeId, label: trimmed },
          { source: "side-menu" },
        );
        setChatStore(next);
      }
      setRenaming({ nodeId: null, value: "" });
    },
    [renaming, setChatStore, setRenaming],
  );

  const handleCancelRename = useCallback(() => {
    setRenaming({ nodeId: null, value: "" });
  }, [setRenaming]);

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
  }, [chatStore, setChatStore]);

  const handleDelete = useCallback(
    (node) => {
      deleteTreeNodeCascade({ nodeId: node.id }, { source: "side-menu" });
      setChatStore(getChatsStore());
      setConfirmDelete({ open: false, node: null });
    },
    [setChatStore, setConfirmDelete],
  );

  return {
    handleSelectNode,
    handleReorder,
    handleStartRename,
    handleConfirmRename,
    handleCancelRename,
    handleNewChat,
    handleDelete,
  };
};

export default useSideMenuActions;
