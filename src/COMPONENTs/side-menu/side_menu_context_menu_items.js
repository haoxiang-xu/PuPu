import {
  buildCharacterMemorySessionId,
  createChatInSelectedContext,
  createChatWithMessagesInSelectedContext,
  createFolder,
  duplicateTreeNodeSubtree,
  getChatsStore,
} from "../../SERVICEs/chat_storage";

export const buildSideMenuContextMenuItems = ({
  node,
  clipboard,
  chatStore,
  setChatStore,
  handleStartRename,
  setClipboard,
  setConfirmDelete,
  onInspectMemory,
  onExport,
  onImport,
  t = (k) => k,
}) => {
  const isCharacterChatNode = (chatId) =>
    chatStore?.chatsById?.[chatId]?.kind === "character";

  const pasteFromClipboard = (parentFolderId) => {
    if (!clipboard) {
      return;
    }

    if (clipboard.type === "chat") {
      const latestStore = getChatsStore();
      if (latestStore?.chatsById?.[clipboard.chatId]?.kind === "character") {
        return;
      }
      const clipboardMessages = Array.isArray(clipboard.messages)
        ? clipboard.messages
        : null;
      const msgs =
        clipboardMessages && clipboardMessages.length > 0
          ? clipboardMessages
          : latestStore?.chatsById?.[clipboard.chatId]?.messages || [];
      const res = createChatWithMessagesInSelectedContext(
        {
          title: t("context_menu.copy_of", { label: clipboard.label }),
          parentFolderId,
          messages: msgs,
        },
        { source: "side-menu" },
      );
      setChatStore(res?.store || getChatsStore());
      return;
    }

    if (clipboard.type === "folder") {
      const res = duplicateTreeNodeSubtree(
        {
          sourceNodeId: clipboard.nodeId,
          label: t("context_menu.copy_of", { label: clipboard.label }),
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
        label: t("context_menu.new_chat"),
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
        label: t("context_menu.new_folder"),
        onClick: () => {
          const res = createFolder(
            { parentFolderId: null },
            { source: "side-menu" },
          );
          const store = res?.store || getChatsStore();
          setChatStore(store);
          const newNode = store?.tree?.nodesById?.[res?.folderId];
          if (newNode) handleStartRename(newNode);
        },
      },
    ];

    if (clipboard) {
      items.push({ type: "separator" });
      items.push({
        icon: "paste",
        label: t("context_menu.paste"),
        onClick: () => pasteFromClipboard(null),
      });
    }

    items.push({ type: "separator" });
    items.push({
      icon: "upload",
      label: t("context_menu.import"),
      onClick: () => onImport && onImport(null),
    });

    return items;
  }

  if (node.entity === "folder") {
    const items = [
      {
        icon: "chat_new",
        label: t("context_menu.new_chat"),
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
        label: t("context_menu.new_folder"),
        onClick: () => {
          const res = createFolder(
            { parentFolderId: node.id },
            { source: "side-menu" },
          );
          const store = res?.store || getChatsStore();
          setChatStore(store);
          const newNode = store?.tree?.nodesById?.[res?.folderId];
          if (newNode) handleStartRename(newNode);
        },
      },
      { type: "separator" },
      {
        icon: "rename",
        label: t("context_menu.rename"),
        onClick: () => handleStartRename(node),
      },
      {
        icon: "copy",
        label: t("context_menu.copy"),
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
        label: t("context_menu.paste"),
        onClick: () => pasteFromClipboard(node.id),
      });
    }

    items.push({ type: "separator" });
    items.push({
      icon: "download",
      label: t("context_menu.export"),
      onClick: () => onExport && onExport(node),
    });
    items.push({
      icon: "upload",
      label: t("context_menu.import"),
      onClick: () => onImport && onImport(node.id),
    });

    items.push({ type: "separator" });
    items.push({
      icon: "delete",
      label: t("context_menu.delete"),
      danger: true,
      onClick: () => setConfirmDelete({ open: true, node }),
    });
    return items;
  }

  if (node.entity === "chat") {
    const chat = chatStore?.chatsById?.[node.chatId];
    const chatTitle = chat?.title || node.label || "Chat";
    if (isCharacterChatNode(node.chatId)) {
      const memorySessionId = buildCharacterMemorySessionId(
        chat?.characterId,
        chat?.threadId || "main",
      );
      return [
        {
          icon: "brain",
          label: t("context_menu.inspect_memory"),
          onClick: () =>
            onInspectMemory && onInspectMemory(memorySessionId, chatTitle),
        },
        { type: "separator" },
        {
          icon: "delete",
          label: t("context_menu.delete"),
          danger: true,
          onClick: () => setConfirmDelete({ open: true, node }),
        },
      ];
    }
    return [
      {
        icon: "brain",
        label: t("context_menu.inspect_memory"),
        onClick: () =>
          onInspectMemory && onInspectMemory(node.chatId, chatTitle),
      },
      { type: "separator" },
      {
        icon: "rename",
        label: t("context_menu.rename"),
        onClick: () => handleStartRename(node),
      },
      {
        icon: "copy",
        label: t("context_menu.copy"),
        onClick: () =>
          setClipboard({
            type: "chat",
            chatId: node.chatId,
            label: chatTitle,
            messages: chatStore?.chatsById?.[node.chatId]?.messages || [],
          }),
      },
      {
        icon: "download",
        label: t("context_menu.export"),
        onClick: () => onExport && onExport(node),
      },
      { type: "separator" },
      {
        icon: "delete",
        label: t("context_menu.delete"),
        danger: true,
        onClick: () => setConfirmDelete({ open: true, node }),
      },
    ];
  }

  return [];
};
