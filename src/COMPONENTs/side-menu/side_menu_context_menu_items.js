import {
  buildCharacterMemorySessionId,
  createChatInSelectedContext,
  createChatWithMessagesInSelectedContext,
  createFolder,
  duplicateTreeNodeSubtree,
  getChatMessages,
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
      // v3 lazy messages: store snapshots hold `[]` placeholders for
      // non-active chats — read through getChatMessages, never the snapshot.
      const msgs =
        clipboardMessages && clipboardMessages.length > 0
          ? clipboardMessages
          : getChatMessages(clipboard.chatId) || [];
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
      // V1 vector view keys off the derived character memory session id.
      // `buildCharacterMemorySessionId` is a lossy many-to-one mapping
      // (lowercasing + illegal-char substitution + empty fallback), so it can
      // never be inverted back to a chat id — `ownerChatId` must be carried
      // separately and is always the UI chat id.
      const memorySessionId = buildCharacterMemorySessionId(
        chat?.characterId,
        chat?.threadId || "main",
      );
      return [
        {
          icon: "brain",
          label: t("context_menu.inspect_memory"),
          onClick: () =>
            onInspectMemory &&
            onInspectMemory({
              sessionId: memorySessionId,
              chatTitle,
              ownerChatId: node.chatId,
            }),
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
          onInspectMemory &&
          onInspectMemory({
            // Plain chats: the V1 session key and the V2 owner key coincide in
            // value, but they are two distinct contracts — keep them separate
            // so the character branch above stays the only special case.
            sessionId: node.chatId,
            chatTitle,
            ownerChatId: node.chatId,
          }),
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
            // v3 lazy messages: never trust the snapshot's placeholder array.
            messages: getChatMessages(node.chatId) || [],
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
