import {
  createChatInSelectedContext,
  createFolder,
  duplicateTreeNodeSubtree,
  getChatsStore,
  setChatMessages,
} from "../../SERVICEs/chat_storage";

export const buildSideMenuContextMenuItems = ({
  node,
  clipboard,
  chatStore,
  setChatStore,
  handleStartRename,
  setClipboard,
  setConfirmDelete,
}) => {
  const pasteFromClipboard = (parentFolderId) => {
    if (!clipboard) {
      return;
    }

    if (clipboard.type === "chat") {
      const latestStore = getChatsStore();
      const msgs = Array.isArray(clipboard.messages)
        ? clipboard.messages
        : latestStore?.chatsById?.[clipboard.chatId]?.messages || [];
      const res = createChatInSelectedContext(
        {
          title: `Copy of ${clipboard.label}`,
          parentFolderId,
        },
        { source: "side-menu" },
      );
      setChatMessages(res.chatId, msgs, { source: "side-menu" });
      setChatStore(getChatsStore());
      return;
    }

    if (clipboard.type === "folder") {
      const res = duplicateTreeNodeSubtree(
        {
          sourceNodeId: clipboard.nodeId,
          label: `Copy of ${clipboard.label}`,
          parentFolderId,
        },
        { source: "side-menu" },
      );
      setChatStore(res?.store || getChatsStore());
    }
  };

  if (!node) {
    const items = [
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
        icon: "folder_new",
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

    if (clipboard) {
      items.push({ type: "separator" });
      items.push({
        icon: "paste",
        label: "Paste",
        onClick: () => pasteFromClipboard(null),
      });
    }

    return items;
  }

  if (node.entity === "folder") {
    const items = [
      {
        icon: "chat_new",
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
        icon: "folder_new",
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
        icon: "rename",
        label: "Rename",
        onClick: () => handleStartRename(node),
      },
      {
        icon: "copy",
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
        icon: "paste",
        label: "Paste",
        onClick: () => pasteFromClipboard(node.id),
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
        icon: "rename",
        label: "Rename",
        onClick: () => handleStartRename(node),
      },
      {
        icon: "copy",
        label: "Copy",
        onClick: () =>
          setClipboard({
            type: "chat",
            chatId: node.chatId,
            label: chatTitle,
            messages: chatStore?.chatsById?.[node.chatId]?.messages || [],
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
};
