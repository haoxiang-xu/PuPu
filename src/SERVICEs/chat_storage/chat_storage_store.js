import {
  CHATS_STORAGE_KEY,
  DEFAULT_CHAT_TITLE,
  DEFAULT_FOLDER_LABEL,
  MAX_ACTIVE_MESSAGES_WHEN_TRIMMING,
  MAX_TOTAL_BYTES,
  TARGET_TOTAL_BYTES,
  ensureUniqueNodeId,
  now,
} from "./chat_storage_constants";
import {
  CHARACTER_CHAT_KIND,
  DEFAULT_CHARACTER_THREAD_ID,
  clone,
  computeChatStats,
  computeLastMessageAt,
  createChatSession,
  estimateBytes,
  isObject,
  isCharacterChatSession,
  sanitizeAttachment,
  sanitizeAgentOrchestration,
  sanitizeChatSession,
  sanitizeCharacterAvatar,
  sanitizeCharacterId,
  sanitizeCharacterName,
  sanitizeLabel,
  sanitizeMessages,
  sanitizeModel,
  sanitizeSelectedToolkits,
  sanitizeSelectedWorkspaceIds,
  sanitizeSystemPromptOverrides,
  unique,
  deriveChatTitle,
} from "./chat_storage_sanitize";
import {
  applySiblingIds,
  buildParentIndex,
  buildTreeNodeLookupByChatId,
  collectSubtreeNodeIds,
  createEmptyStoreV2,
  createFolderNode,
  ensureTreeHasNodeForChat,
  ensureUniqueLabel,
  findFallbackChatIdNearContainer,
  firstChatInTree,
  firstChatNodeIdInTree,
  getSiblingIds,
  insertNodeIntoParent,
  makeInitialTreeFromChats,
  removeChatFromTreeByChatId,
  resolveSelectedParentFolderId,
  sanitizeExplorerReorderPayload,
  snapshotSubtreeForCopy,
  sortChatsByUpdatedAt,
} from "./chat_storage_tree";
import { normalizeStore } from "./chat_storage_migrate";

const storeSubscribers = new Set();

const isLockedCharacterChat = (chat) => isCharacterChatSession(chat);

const getExplorerLabelForChat = (chat) => {
  if (isLockedCharacterChat(chat)) {
    return sanitizeLabel(
      chat.characterName || chat.title,
      chat.characterName || chat.title || DEFAULT_CHAT_TITLE,
    );
  }
  return sanitizeLabel(chat?.title, DEFAULT_CHAT_TITLE);
};

const findCharacterChatId = (store, characterId) => {
  const normalizedCharacterId = sanitizeCharacterId(characterId);
  if (!normalizedCharacterId) {
    return null;
  }

  const chatsById = isObject(store?.chatsById) ? store.chatsById : {};
  for (const [chatId, chat] of Object.entries(chatsById)) {
    if (
      chat?.kind === CHARACTER_CHAT_KIND &&
      sanitizeCharacterId(chat?.characterId) === normalizedCharacterId
    ) {
      return chatId;
    }
  }

  return null;
};

const resolveCharacterPreferredModelId = (character = {}) => {
  const candidates = [
    character?.defaultModelId,
    character?.default_model,
    character?.metadata?.defaultModelId,
    character?.metadata?.default_model,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const normalized = candidate.trim();
    if (normalized && normalized !== "unchain-unset") {
      return normalized;
    }
  }

  return "";
};

const resolveCharacterSourceModelId = (store, explicitModelId, character = {}) => {
  const preferredModelId = resolveCharacterPreferredModelId(character);
  if (preferredModelId) {
    return preferredModelId;
  }

  if (typeof explicitModelId === "string" && explicitModelId.trim()) {
    const normalized = explicitModelId.trim();
    return normalized && normalized !== "unchain-unset" ? normalized : "";
  }

  const activeChat =
    store?.activeChatId && store?.chatsById?.[store.activeChatId]
      ? store.chatsById[store.activeChatId]
      : null;
  if (!activeChat || activeChat.kind === CHARACTER_CHAT_KIND) {
    return "";
  }

  const modelId =
    typeof activeChat.model?.id === "string" ? activeChat.model.id.trim() : "";
  return modelId && modelId !== "unchain-unset" ? modelId : "";
};

const touchLru = (store, chatId) => {
  if (!chatId || !store.chatsById[chatId]) {
    return;
  }

  store.lruChatIds = unique([
    chatId,
    ...(Array.isArray(store.lruChatIds) ? store.lruChatIds : []),
  ]).filter((id) => store.chatsById[id]);
};

const removeChatById = (store, chatId) => {
  if (!chatId || !store.chatsById[chatId]) {
    return;
  }

  delete store.chatsById[chatId];
  store.lruChatIds = store.lruChatIds.filter((id) => id !== chatId);

  const removedNodeId = removeChatFromTreeByChatId(store.tree, chatId);
  if (removedNodeId && store.tree.selectedNodeId === removedNodeId) {
    store.tree.selectedNodeId = null;
  }

  if (store.activeChatId === chatId) {
    store.activeChatId = null;
  }
};

const dropLeastRecentlyUsedChats = (store) => {
  let totalBytes = estimateBytes(store);

  while (totalBytes > TARGET_TOTAL_BYTES) {
    const removableChatId = [...store.lruChatIds]
      .reverse()
      .find((chatId) => chatId !== store.activeChatId);
    if (!removableChatId) {
      break;
    }

    removeChatById(store, removableChatId);
    totalBytes = estimateBytes(store);
  }

  if (
    totalBytes > MAX_TOTAL_BYTES &&
    store.activeChatId &&
    store.chatsById[store.activeChatId]
  ) {
    const activeChat = store.chatsById[store.activeChatId];
    if (activeChat.messages.length > MAX_ACTIVE_MESSAGES_WHEN_TRIMMING) {
      activeChat.messages = activeChat.messages.slice(
        -MAX_ACTIVE_MESSAGES_WHEN_TRIMMING,
      );
      activeChat.lastMessageAt = computeLastMessageAt(
        activeChat.messages,
        activeChat.lastMessageAt,
      );
      activeChat.updatedAt = now();
      activeChat.stats = computeChatStats(activeChat);
      totalBytes = estimateBytes(store);
    }
  }

  return store;
};

const emitStoreChange = (store, event = {}) => {
  if (storeSubscribers.size === 0) {
    return;
  }

  const snapshot = clone(store);
  if (!snapshot) {
    return;
  }

  for (const listener of storeSubscribers) {
    try {
      listener(snapshot, event);
    } catch {
      // no-op
    }
  }
};

const writeStore = (store, options = {}) => {
  const normalized = normalizeStore(store);
  const bounded = dropLeastRecentlyUsedChats(normalized);
  const finalized = normalizeStore(bounded);
  const emit = options.emit !== false;
  const event = {
    type: options.type || "store_write",
    source: options.source || "unknown",
  };

  if (typeof window === "undefined" || !window.localStorage) {
    if (emit) emitStoreChange(finalized, event);
    return finalized;
  }

  try {
    window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(finalized));
    if (emit) emitStoreChange(finalized, event);
    return finalized;
  } catch {
    const fallback = createEmptyStoreV2();

    if (finalized.activeChatId && finalized.chatsById[finalized.activeChatId]) {
      fallback.chatsById[finalized.activeChatId] =
        finalized.chatsById[finalized.activeChatId];
      fallback.activeChatId = finalized.activeChatId;
      fallback.lruChatIds = [finalized.activeChatId];
      fallback.tree = makeInitialTreeFromChats(
        fallback.chatsById,
        [finalized.activeChatId],
        finalized.activeChatId,
      );
    }

    const recovered = normalizeStore(fallback);

    try {
      window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(recovered));
    } catch {
      // swallow persist failure to avoid UI crash
    }

    if (emit) emitStoreChange(recovered, event);
    return recovered;
  }
};

const readStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createEmptyStoreV2();
  }

  try {
    const raw = window.localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) {
      return createEmptyStoreV2();
    }

    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch {
    return normalizeStore({});
  }
};

const withStore = (mutate, options = {}) => {
  const current = readStore();
  const working = clone(current) || current;
  const candidate = typeof mutate === "function" ? mutate(working) : working;
  const next = normalizeStore(candidate || working);
  next.updatedAt = now();
  return writeStore(next, options);
};

const updateActiveAndSelectedFromChatId = (store, chatId) => {
  if (!chatId || !store.chatsById[chatId]) {
    return;
  }

  store.activeChatId = chatId;
  if (store.chatsById[chatId].hasUnreadGeneratedReply) {
    store.chatsById[chatId].hasUnreadGeneratedReply = false;
    store.chatsById[chatId].updatedAt = now();
  }
  touchLru(store, chatId);

  let selectedNodeId = null;
  for (const [nodeId, node] of Object.entries(store.tree.nodesById)) {
    if (node.entity === "chat" && node.chatId === chatId) {
      selectedNodeId = nodeId;
      break;
    }
  }

  if (!selectedNodeId) {
    selectedNodeId = ensureTreeHasNodeForChat(store, chatId, {
      parentFolderId: null,
    });
  }

  if (selectedNodeId) {
    store.tree.selectedNodeId = selectedNodeId;
  }
};

const isTransientNewChatPending = (chat) => {
  if (!isObject(chat) || chat.isTransientNewChat !== true) {
    return false;
  }

  return !Array.isArray(chat.messages) || chat.messages.length === 0;
};

const getCleanupCandidateActiveChatId = (store, preferredNextChatId = null) => {
  const activeChatId = store.activeChatId;
  if (!activeChatId || !store.chatsById[activeChatId]) {
    return null;
  }

  if (preferredNextChatId && preferredNextChatId === activeChatId) {
    return null;
  }

  if (Object.keys(store.chatsById).length <= 1) {
    return null;
  }

  const activeChat = store.chatsById[activeChatId];
  if (!isTransientNewChatPending(activeChat)) {
    return null;
  }

  return activeChatId;
};

const resolveFallbackChatId = (store, preferredChatId = null) => {
  if (preferredChatId && store.chatsById[preferredChatId]) {
    return preferredChatId;
  }

  return (
    firstChatInTree(store.tree) ||
    sortChatsByUpdatedAt(store.chatsById)[0] ||
    null
  );
};

const updateCharacterNodeMetadata = (store, chatId, chat) => {
  const nodeId = ensureTreeHasNodeForChat(store, chatId, {
    parentFolderId: null,
  });
  if (!nodeId || !store.tree.nodesById[nodeId]) {
    return nodeId;
  }

  const node = store.tree.nodesById[nodeId];
  node.label = getExplorerLabelForChat(chat);
  node.updatedAt = now();
  return nodeId;
};

const cleanupTransientActiveChat = (store, preferredNextChatId = null) => {
  const removableChatId = getCleanupCandidateActiveChatId(
    store,
    preferredNextChatId,
  );
  if (!removableChatId) {
    return null;
  }

  removeChatById(store, removableChatId);
  const fallbackChatId = resolveFallbackChatId(store, preferredNextChatId);
  if (fallbackChatId) {
    updateActiveAndSelectedFromChatId(store, fallbackChatId);
  } else {
    store.activeChatId = null;
    store.tree.selectedNodeId = null;
  }

  return removableChatId;
};

export const getChatsStore = () => {
  const synced = writeStore(readStore(), {
    emit: false,
    source: "system",
    type: "store_bootstrap",
  });
  return clone(synced) || createEmptyStoreV2();
};

export const subscribeChatsStore = (listener) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  storeSubscribers.add(listener);
  return () => {
    storeSubscribers.delete(listener);
  };
};

export const bootstrapChatsStore = () => {
  const store = getChatsStore();
  const activeChat =
    store.activeChatId && store.chatsById[store.activeChatId]
      ? store.chatsById[store.activeChatId]
      : null;

  return {
    store,
    activeChat: activeChat || createChatSession(),
    tree: store.tree,
  };
};

export const createFolder = (params = {}, options = {}) => {
  const source = options.source || "unknown";
  let createdFolderId = null;

  const next = withStore(
    (store) => {
      const parentFolderId = resolveSelectedParentFolderId(
        store,
        params.parentFolderId,
      );
      const label = ensureUniqueLabel(
        store,
        parentFolderId,
        sanitizeLabel(params.label, DEFAULT_FOLDER_LABEL),
      );

      const folder = createFolderNode({ label });
      const folderIdToUse = ensureUniqueNodeId(
        store.tree.nodesById,
        folder.id,
        "fld",
      );
      store.tree.nodesById[folderIdToUse] = {
        ...folder,
        id: folderIdToUse,
      };
      createdFolderId = folderIdToUse;

      const siblings = getSiblingIds(store.tree, parentFolderId);
      applySiblingIds(store.tree, parentFolderId, [folderIdToUse, ...siblings]);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_create_folder",
    },
  );

  return {
    folderId: createdFolderId,
    store: clone(next) || next,
  };
};

export const createChatInSelectedContext = (params = {}, options = {}) => {
  const source = options.source || "unknown";
  let createdChatId = null;
  let createdNodeId = null;

  const next = withStore(
    (store) => {
      const parentFolderId = resolveSelectedParentFolderId(
        store,
        params.parentFolderId,
      );
      const initialTitle = sanitizeLabel(params.title, DEFAULT_CHAT_TITLE);
      const chat = createChatSession({
        title: initialTitle,
        isTransientNewChat: initialTitle === DEFAULT_CHAT_TITLE,
      });
      store.chatsById[chat.id] = chat;
      createdChatId = chat.id;

      const nodeId = ensureTreeHasNodeForChat(store, chat.id, {
        parentFolderId,
      });
      createdNodeId = nodeId;
      updateActiveAndSelectedFromChatId(store, chat.id);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_create",
    },
  );

  return {
    chatId: createdChatId,
    nodeId: createdNodeId,
    store: clone(next) || next,
  };
};

export const openCharacterChat = (params = {}, options = {}) => {
  const source = options.source || "unknown";
  const character =
    params?.character && typeof params.character === "object"
      ? params.character
      : {};
  const characterId = sanitizeCharacterId(character.id);
  const characterName = sanitizeCharacterName(character.name || "Character");
  const characterAvatar = sanitizeCharacterAvatar(character.avatar);
  if (!characterId || !characterName) {
    return {
      ok: false,
      error: "Character is missing a valid id or name.",
      chatId: null,
      nodeId: null,
      store: getChatsStore(),
    };
  }

  let result = {
    ok: true,
    error: "",
    chatId: null,
    nodeId: null,
    created: false,
    store: null,
  };

  const next = withStore(
    (store) => {
      const existingChatId = findCharacterChatId(store, characterId);
      if (existingChatId && store.chatsById[existingChatId]) {
        const preferredModelId = resolveCharacterPreferredModelId(character);
        const chat = sanitizeChatSession(
          {
            ...store.chatsById[existingChatId],
            kind: CHARACTER_CHAT_KIND,
            characterId,
            characterName,
            characterAvatar:
              characterAvatar || store.chatsById[existingChatId].characterAvatar,
            model: preferredModelId
              ? { id: preferredModelId }
              : store.chatsById[existingChatId].model,
            title: characterName,
            threadId:
              store.chatsById[existingChatId].threadId ||
              DEFAULT_CHARACTER_THREAD_ID,
          },
          existingChatId,
        );
        store.chatsById[existingChatId] = chat;
        const nodeId = updateCharacterNodeMetadata(store, existingChatId, chat);
        cleanupTransientActiveChat(store, existingChatId);
        updateActiveAndSelectedFromChatId(store, existingChatId);
        result = {
          ok: true,
          error: "",
          chatId: existingChatId,
          nodeId,
          created: false,
          store: null,
        };
        store.updatedAt = now();
        return store;
      }

      const sourceModelId = resolveCharacterSourceModelId(
        store,
        params?.sourceModelId,
        character,
      );
      if (!sourceModelId) {
        result = {
          ok: false,
          error: "Select a model in a normal chat before opening this character.",
          chatId: null,
          nodeId: null,
          created: false,
          store: null,
        };
        return store;
      }

      const chat = createChatSession({
        kind: CHARACTER_CHAT_KIND,
        title: characterName,
        characterId,
        characterName,
        characterAvatar,
        threadId: DEFAULT_CHARACTER_THREAD_ID,
        model: { id: sourceModelId },
        selectedToolkits: [],
        selectedWorkspaceIds: [],
        isTransientNewChat: false,
      });
      store.chatsById[chat.id] = chat;
      const nodeId = updateCharacterNodeMetadata(store, chat.id, chat);
      cleanupTransientActiveChat(store, chat.id);
      updateActiveAndSelectedFromChatId(store, chat.id);
      result = {
        ok: true,
        error: "",
        chatId: chat.id,
        nodeId,
        created: true,
        store: null,
      };
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_open_character",
    },
  );

  result.store = clone(next) || next;
  return result;
};

export const createChatWithMessagesInSelectedContext = (
  params = {},
  options = {},
) => {
  const source = options.source || "unknown";
  let createdChatId = null;
  let createdNodeId = null;

  const next = withStore(
    (store) => {
      const parentFolderId = resolveSelectedParentFolderId(
        store,
        params.parentFolderId,
      );
      const initialTitle = sanitizeLabel(params.title, DEFAULT_CHAT_TITLE);
      const baseChat = createChatSession({
        title: initialTitle,
        isTransientNewChat: initialTitle === DEFAULT_CHAT_TITLE,
      });
      const nextMessages = sanitizeMessages(params.messages);
      const nextTitle =
        !baseChat.title || baseChat.title === DEFAULT_CHAT_TITLE
          ? deriveChatTitle(nextMessages, DEFAULT_CHAT_TITLE)
          : baseChat.title;
      const finalizedChat = sanitizeChatSession(
        {
          ...baseChat,
          title: nextTitle,
          messages: nextMessages,
          isTransientNewChat:
            nextMessages.length > 0
              ? false
              : baseChat.isTransientNewChat === true,
          hasUnreadGeneratedReply: false,
          lastMessageAt: computeLastMessageAt(
            nextMessages,
            baseChat.lastMessageAt,
          ),
          updatedAt: now(),
        },
        baseChat.id,
      );

      store.chatsById[finalizedChat.id] = finalizedChat;
      createdChatId = finalizedChat.id;

      const nodeId = ensureTreeHasNodeForChat(store, finalizedChat.id, {
        parentFolderId,
      });
      createdNodeId = nodeId;
      updateActiveAndSelectedFromChatId(store, finalizedChat.id);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_create_with_messages",
    },
  );

  return {
    chatId: createdChatId,
    nodeId: createdNodeId,
    store: clone(next) || next,
  };
};

export const duplicateTreeNodeSubtree = (params = {}, options = {}) => {
  const source = options.source || "unknown";
  let duplicatedNodeId = null;

  const next = withStore(
    (store) => {
      const sourceNodeId =
        typeof params.sourceNodeId === "string" ? params.sourceNodeId : null;
      if (!sourceNodeId || !store.tree.nodesById[sourceNodeId]) {
        return store;
      }

      const parentFolderId = resolveSelectedParentFolderId(
        store,
        params.parentFolderId,
      );
      const snapshot = snapshotSubtreeForCopy(store, sourceNodeId);
      if (!snapshot) {
        return store;
      }

      const cloneFromSnapshot = (
        snapshotNodeId,
        destinationParentFolderId,
        cloneOptions = {},
      ) => {
        const snapshotNode = snapshot.nodesById[snapshotNodeId];
        if (!snapshotNode) {
          return null;
        }

        if (snapshotNode.entity === "folder") {
          const fallbackLabel =
            snapshotNodeId === snapshot.rootNodeId
              ? `Copy of ${snapshotNode.label || DEFAULT_FOLDER_LABEL}`
              : snapshotNode.label;
          const preferredLabel = sanitizeLabel(
            cloneOptions.overrideLabel ?? fallbackLabel,
            DEFAULT_FOLDER_LABEL,
          );
          const label = ensureUniqueLabel(
            store,
            destinationParentFolderId,
            preferredLabel,
          );
          const folder = createFolderNode({ label });
          let folderId = folder.id;
          while (store.tree.nodesById[folderId]) {
            folderId = createFolderNode().id;
          }

          store.tree.nodesById[folderId] = {
            ...folder,
            id: folderId,
            children: [],
          };
          insertNodeIntoParent(
            store,
            destinationParentFolderId,
            folderId,
            cloneOptions.prepend === true,
          );

          for (const childSnapshotId of snapshotNode.children) {
            cloneFromSnapshot(childSnapshotId, folderId, { prepend: false });
          }
          return folderId;
        }

        if (snapshotNode.entity === "chat") {
          const sourceChat = snapshot.chatsById[snapshotNode.chatId];
          if (!sourceChat) {
            return null;
          }
          if (isLockedCharacterChat(sourceChat)) {
            return null;
          }

          const initialTitle = sanitizeLabel(
            cloneOptions.overrideLabel ??
              snapshotNode.label ??
              sourceChat.title ??
              DEFAULT_CHAT_TITLE,
            DEFAULT_CHAT_TITLE,
          );
          const copiedChat = createChatSession({
            title: initialTitle,
            isTransientNewChat: initialTitle === DEFAULT_CHAT_TITLE,
          });
          const copiedMessages = sanitizeMessages(sourceChat.messages);
          const copiedTitle =
            !copiedChat.title || copiedChat.title === DEFAULT_CHAT_TITLE
              ? deriveChatTitle(copiedMessages, DEFAULT_CHAT_TITLE)
              : copiedChat.title;
          const finalizedChat = sanitizeChatSession(
            {
              ...copiedChat,
              title: copiedTitle,
              threadId: null,
              agentOrchestration: { mode: "default" },
              selectedToolkits: sanitizeSelectedToolkits(
                sourceChat.selectedToolkits,
              ),
              selectedWorkspaceIds: sanitizeSelectedWorkspaceIds(
                sourceChat.selectedWorkspaceIds,
              ),
              messages: copiedMessages,
              isTransientNewChat:
                copiedMessages.length > 0
                  ? false
                  : copiedChat.isTransientNewChat === true,
              hasUnreadGeneratedReply: false,
              lastMessageAt: computeLastMessageAt(
                copiedMessages,
                copiedChat.lastMessageAt,
              ),
              updatedAt: now(),
            },
            copiedChat.id,
          );
          store.chatsById[finalizedChat.id] = finalizedChat;

          const chatNodeId = ensureTreeHasNodeForChat(store, finalizedChat.id, {
            parentFolderId: destinationParentFolderId,
          });
          if (cloneOptions.prepend === true) {
            const siblings = getSiblingIds(store.tree, destinationParentFolderId)
              .filter((nodeId) => nodeId !== chatNodeId);
            applySiblingIds(store.tree, destinationParentFolderId, [
              chatNodeId,
              ...siblings,
            ]);
          }
          return chatNodeId;
        }

        return null;
      };

      duplicatedNodeId = cloneFromSnapshot(
        snapshot.rootNodeId,
        parentFolderId,
        {
          prepend: true,
          overrideLabel: params.label,
        },
      );
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_duplicate_subtree",
    },
  );

  return {
    nodeId: duplicatedNodeId,
    store: clone(next) || next,
  };
};

export const selectTreeNode = ({ nodeId } = {}, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      let target =
        typeof nodeId === "string" ? store.tree.nodesById[nodeId] : null;
      if (target?.entity === "chat") {
        cleanupTransientActiveChat(store, target.chatId);
        target =
          typeof nodeId === "string" ? store.tree.nodesById[nodeId] : null;
      }

      if (!target) {
        store.tree.selectedNodeId = null;
        return store;
      }

      if (target.entity !== "chat") {
        return store;
      }

      store.tree.selectedNodeId = nodeId;
      if (target.entity === "chat") {
        updateActiveAndSelectedFromChatId(store, target.chatId);
      }
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_select",
    },
  );

  return clone(next) || next;
};

export const renameTreeNode = ({ nodeId, label } = {}, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      if (!nodeId || !store.tree.nodesById[nodeId]) {
        return store;
      }

      const parentById = buildParentIndex(store.tree);
      const parentFolderId = parentById[nodeId]?.parentId || null;
      const node = store.tree.nodesById[nodeId];
      if (
        node.entity === "chat" &&
        node.chatId &&
        isLockedCharacterChat(store.chatsById[node.chatId])
      ) {
        return store;
      }
      const fallback =
        node.entity === "folder" ? DEFAULT_FOLDER_LABEL : DEFAULT_CHAT_TITLE;
      const nextLabel = ensureUniqueLabel(
        store,
        parentFolderId,
        sanitizeLabel(label, fallback),
        nodeId,
      );

      node.label = nextLabel;
      node.updatedAt = now();

      if (node.entity === "chat" && store.chatsById[node.chatId]) {
        store.chatsById[node.chatId].title = nextLabel;
        store.chatsById[node.chatId].isTransientNewChat = false;
        store.chatsById[node.chatId].updatedAt = now();
        store.chatsById[node.chatId].stats = computeChatStats(
          store.chatsById[node.chatId],
        );
      }

      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_rename",
    },
  );

  return clone(next) || next;
};

export const deleteTreeNodeCascade = ({ nodeId } = {}, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      if (!nodeId || !store.tree.nodesById[nodeId]) {
        return store;
      }

      const parentById = buildParentIndex(store.tree);
      const parentInfo = parentById[nodeId] || { parentId: null, index: 0 };
      const subtreeIds = collectSubtreeNodeIds(store.tree, nodeId, []);
      const subtreeSet = new Set(subtreeIds);

      const removedChatIds = [];
      for (const id of subtreeIds) {
        const node = store.tree.nodesById[id];
        if (node?.entity === "chat") {
          removedChatIds.push(node.chatId);
        }
      }

      for (const chatId of removedChatIds) {
        delete store.chatsById[chatId];
      }

      store.lruChatIds = store.lruChatIds.filter(
        (chatId) => !removedChatIds.includes(chatId),
      );

      store.tree.root = store.tree.root.filter((id) => !subtreeSet.has(id));
      for (const node of Object.values(store.tree.nodesById)) {
        if (node.entity === "folder") {
          node.children = node.children.filter((id) => !subtreeSet.has(id));
        }
      }
      for (const id of subtreeIds) {
        delete store.tree.nodesById[id];
      }

      const activeRemoved = removedChatIds.includes(store.activeChatId);
      const selectedRemoved =
        store.tree.selectedNodeId && subtreeSet.has(store.tree.selectedNodeId);

      if (activeRemoved) {
        const fallbackChatId = findFallbackChatIdNearContainer(
          store.tree,
          parentInfo.parentId,
          parentInfo.index,
        );
        store.activeChatId = fallbackChatId || null;
      }

      if (selectedRemoved) {
        if (store.activeChatId) {
          const map = buildTreeNodeLookupByChatId(store.tree);
          store.tree.selectedNodeId =
            map[store.activeChatId] || firstChatNodeIdInTree(store.tree) || null;
        } else {
          store.tree.selectedNodeId = firstChatNodeIdInTree(store.tree) || null;
        }
      }

      if (!store.activeChatId || !store.chatsById[store.activeChatId]) {
        const firstChatId = firstChatInTree(store.tree);
        if (firstChatId && store.chatsById[firstChatId]) {
          store.activeChatId = firstChatId;
        }
      }

      if (!store.activeChatId || !store.chatsById[store.activeChatId]) {
        const chat = createChatSession();
        store.chatsById[chat.id] = chat;
        const nodeIdForChat = ensureTreeHasNodeForChat(store, chat.id, {
          parentFolderId: null,
        });
        store.activeChatId = chat.id;
        store.tree.selectedNodeId = nodeIdForChat;
      }

      touchLru(store, store.activeChatId);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_delete",
    },
  );

  return clone(next) || next;
};

export const applyExplorerReorder = ({ data, root } = {}, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      const payload = sanitizeExplorerReorderPayload({
        data,
        root,
        currentNodesById: store.tree.nodesById,
      });

      store.tree.nodesById = payload.nodesById;
      store.tree.root = payload.root;
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_reorder",
    },
  );

  return clone(next) || next;
};

const updateChatSessionById = (chatId, updater, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      if (!chatId) {
        return store;
      }

      const existing = sanitizeChatSession(
        store.chatsById[chatId] || { id: chatId },
        chatId,
      );
      const lockedCharacter = isLockedCharacterChat(existing);
      const candidate = clone(existing) || existing;
      const updated =
        typeof updater === "function" ? updater(candidate) : candidate;
      const cleaned = sanitizeChatSession(updated || candidate, chatId);

      if (lockedCharacter) {
        cleaned.kind = CHARACTER_CHAT_KIND;
        cleaned.characterId = existing.characterId;
        cleaned.characterName = existing.characterName;
        cleaned.characterAvatar = existing.characterAvatar || null;
        cleaned.title = existing.characterName || existing.title;
        cleaned.model = existing.model;
        cleaned.selectedToolkits = [];
        cleaned.selectedWorkspaceIds = [];
        cleaned.systemPromptOverrides = {};
        cleaned.threadId = existing.threadId || DEFAULT_CHARACTER_THREAD_ID;
        cleaned.isTransientNewChat = false;
      }

      store.chatsById[chatId] = cleaned;
      touchLru(store, chatId);

      updateCharacterNodeMetadata(store, chatId, cleaned);

      if (!store.activeChatId) {
        store.activeChatId = chatId;
      }

      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: options.type || "chat_update",
    },
  );

  return clone(next) || next;
};

export const updateChatDraft = (chatId, patch = {}, options = {}) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      draft: {
        ...chat.draft,
        ...patch,
        updatedAt: now(),
      },
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_draft" },
  );
};

export const setChatMessages = (chatId, messages, options = {}) => {
  return updateChatSessionById(
    chatId,
    (chat) => {
      const nextMessages = sanitizeMessages(messages);
      const nextTitle =
        !chat.title || chat.title === DEFAULT_CHAT_TITLE
          ? deriveChatTitle(nextMessages, DEFAULT_CHAT_TITLE)
          : chat.title;

      return {
        ...chat,
        title: nextTitle,
        messages: nextMessages,
        isTransientNewChat:
          nextMessages.length > 0 ? false : chat.isTransientNewChat === true,
        lastMessageAt: computeLastMessageAt(nextMessages, chat.lastMessageAt),
        updatedAt: now(),
      };
    },
    { ...options, type: "chat_update_messages" },
  );
};

export const setChatGeneratedUnread = (
  chatId,
  hasUnread = true,
  options = {},
) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      hasUnreadGeneratedReply: hasUnread === true,
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_generated_unread" },
  );
};

export const setChatThreadId = (chatId, threadId, options = {}) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      threadId:
        typeof threadId === "string" && threadId.trim() ? threadId.trim() : null,
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_thread" },
  );
};

export const setChatModel = (chatId, model, options = {}) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      model: isLockedCharacterChat(chat) ? chat.model : sanitizeModel(model),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_model" },
  );
};

export const setChatAgentOrchestration = (
  chatId,
  agentOrchestration,
  options = {},
) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      agentOrchestration: isLockedCharacterChat(chat)
        ? { mode: "default" }
        : sanitizeAgentOrchestration(agentOrchestration),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_agent_orchestration" },
  );
};

export const setChatSelectedToolkits = (
  chatId,
  selectedToolkits,
  options = {},
) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      selectedToolkits: isLockedCharacterChat(chat)
        ? []
        : sanitizeSelectedToolkits(selectedToolkits),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_toolkits" },
  );
};

export const setChatSelectedWorkspaceIds = (
  chatId,
  selectedWorkspaceIds,
  options = {},
) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      selectedWorkspaceIds: isLockedCharacterChat(chat)
        ? []
        : sanitizeSelectedWorkspaceIds(selectedWorkspaceIds),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_workspace_ids" },
  );
};

export const setChatSystemPromptOverrides = (
  chatId,
  systemPromptOverrides,
  options = {},
) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      systemPromptOverrides: sanitizeSystemPromptOverrides(systemPromptOverrides),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_system_prompt_overrides" },
  );
};

export const setChatTitle = (chatId, title, options = {}) => {
  if (!chatId) {
    return null;
  }

  const nodeLookup = buildTreeNodeLookupByChatId(getChatsStore().tree);
  const nodeId = nodeLookup[chatId];
  if (nodeId) {
    return renameTreeNode({ nodeId, label: title }, options);
  }

  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      title: sanitizeLabel(title, chat.title || DEFAULT_CHAT_TITLE),
      isTransientNewChat: false,
      updatedAt: now(),
    }),
    { ...options, type: "chat_rename" },
  );
};

export const refreshCharacterChatMetadata = (characters, options = {}) => {
  if (!Array.isArray(characters) || characters.length === 0) {
    return clone(getChatsStore()) || getChatsStore();
  }

  const byCharacterId = new Map();
  for (const character of characters) {
    const characterId = sanitizeCharacterId(character?.id);
    if (!characterId) {
      continue;
    }
    byCharacterId.set(characterId, character);
  }

  if (byCharacterId.size === 0) {
    return clone(getChatsStore()) || getChatsStore();
  }

  const next = withStore(
    (store) => {
      for (const [chatId, chat] of Object.entries(store.chatsById || {})) {
        if (chat?.kind !== CHARACTER_CHAT_KIND) {
          continue;
        }

        const characterId = sanitizeCharacterId(chat?.characterId);
        const latestCharacter = byCharacterId.get(characterId);
        if (!latestCharacter) {
          continue;
        }

        const nextCharacterName =
          sanitizeCharacterName(
            latestCharacter?.name || chat?.characterName || chat?.title,
          ) ||
          chat?.characterName ||
          chat?.title ||
          DEFAULT_CHAT_TITLE;
        const nextCharacterAvatar =
          sanitizeCharacterAvatar(latestCharacter?.avatar) ||
          chat?.characterAvatar ||
          null;

        const currentName =
          typeof chat?.characterName === "string" ? chat.characterName : "";
        const currentAvatar = JSON.stringify(chat?.characterAvatar || null);
        const incomingAvatar = JSON.stringify(nextCharacterAvatar || null);

        if (
          nextCharacterName === currentName &&
          incomingAvatar === currentAvatar
        ) {
          continue;
        }

        const cleaned = sanitizeChatSession(
          {
            ...chat,
            title: nextCharacterName,
            characterName: nextCharacterName,
            characterAvatar: nextCharacterAvatar,
          },
          chatId,
        );
        store.chatsById[chatId] = cleaned;
        updateCharacterNodeMetadata(store, chatId, cleaned);
      }

      return store;
    },
    {
      ...options,
      type: options.type || "chat_refresh_character_metadata",
    },
  );

  return clone(next) || next;
};

export const cleanupTransientNewChatOnPageLeave = (options = {}) => {
  const source = options.source || "unknown";
  const snapshot = readStore();
  if (!getCleanupCandidateActiveChatId(snapshot, null)) {
    return clone(snapshot) || snapshot;
  }

  const next = withStore(
    (store) => {
      cleanupTransientActiveChat(store, null);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_cleanup_transient_new",
    },
  );

  return clone(next) || next;
};

export const createChatMessageAttachment = (attachment) =>
  sanitizeAttachment(attachment);
