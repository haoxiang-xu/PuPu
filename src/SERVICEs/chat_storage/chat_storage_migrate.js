import {
  CHATS_SCHEMA_VERSION,
  now,
} from "./chat_storage_constants";
import {
  createChatSession,
  CHARACTER_CHAT_KIND,
  isObject,
  sanitizeChatSession,
  unique,
} from "./chat_storage_sanitize";
import {
  createEmptyStoreV2,
  ensureTreeHasNodeForChat,
  firstChatInTree,
  firstChatNodeIdInTree,
  makeInitialTreeFromChats,
  sanitizeTree,
  sortChatsByUpdatedAt,
} from "./chat_storage_tree";

const dedupeCharacterChats = (storeLike) => {
  const store = storeLike;
  const sourceChats = isObject(store?.chatsById) ? store.chatsById : {};
  const winnerByCharacterId = new Map();
  const duplicateChatIds = new Set();

  for (const [chatId, chat] of Object.entries(sourceChats)) {
    if (
      chat?.kind !== CHARACTER_CHAT_KIND ||
      typeof chat?.characterId !== "string" ||
      !chat.characterId.trim()
    ) {
      continue;
    }

    const key = chat.characterId.trim();
    const currentWinner = winnerByCharacterId.get(key);
    if (!currentWinner) {
      winnerByCharacterId.set(key, {
        chatId,
        updatedAt: Number(chat.updatedAt || 0),
      });
      continue;
    }

    const candidateUpdatedAt = Number(chat.updatedAt || 0);
    if (candidateUpdatedAt >= currentWinner.updatedAt) {
      duplicateChatIds.add(currentWinner.chatId);
      winnerByCharacterId.set(key, {
        chatId,
        updatedAt: candidateUpdatedAt,
      });
      continue;
    }

    duplicateChatIds.add(chatId);
  }

  if (duplicateChatIds.size === 0) {
    return store;
  }

  for (const chatId of duplicateChatIds) {
    delete store.chatsById[chatId];
  }

  if (Array.isArray(store.lruChatIds)) {
    store.lruChatIds = store.lruChatIds.filter((chatId) => !duplicateChatIds.has(chatId));
  }

  return store;
};

export const migrateV1ToV2 = (input) => {
  const migrated = createEmptyStoreV2();
  const sourceChats = isObject(input?.chatsById) ? input.chatsById : {};

  for (const [chatId, chat] of Object.entries(sourceChats)) {
    const cleaned = sanitizeChatSession(chat, chatId);
    migrated.chatsById[cleaned.id] = cleaned;
  }

  if (Object.keys(migrated.chatsById).length === 0) {
    const chat = createChatSession();
    migrated.chatsById[chat.id] = chat;
  }

  const orderFromV1 = Array.isArray(input?.chatOrder)
    ? input.chatOrder.filter(
        (id) => typeof id === "string" && migrated.chatsById[id],
      )
    : [];

  const active =
    typeof input?.activeChatId === "string" &&
    migrated.chatsById[input.activeChatId]
      ? input.activeChatId
      : orderFromV1[0] || sortChatsByUpdatedAt(migrated.chatsById)[0] || null;

  migrated.activeChatId = active;
  migrated.lruChatIds = unique([
    ...(active ? [active] : []),
    ...orderFromV1,
    ...sortChatsByUpdatedAt(migrated.chatsById),
  ]);
  migrated.tree = makeInitialTreeFromChats(
    migrated.chatsById,
    orderFromV1,
    migrated.activeChatId,
  );

  if (isObject(input?.ui)) {
    migrated.ui = input.ui;
  }

  dedupeCharacterChats(migrated);

  migrated.updatedAt = Number.isFinite(Number(input?.updatedAt))
    ? Number(input.updatedAt)
    : now();
  return migrated;
};

export const normalizeStore = (input) => {
  const migrated =
    input?.schemaVersion === CHATS_SCHEMA_VERSION ? input : migrateV1ToV2(input);
  const next = createEmptyStoreV2();

  if (isObject(migrated?.ui)) {
    next.ui = migrated.ui;
  }

  const sourceChats = isObject(migrated?.chatsById) ? migrated.chatsById : {};
  for (const [chatId, chat] of Object.entries(sourceChats)) {
    const cleaned = sanitizeChatSession(chat, chatId);
    next.chatsById[cleaned.id] = cleaned;
  }

  dedupeCharacterChats(next);

  if (Object.keys(next.chatsById).length === 0) {
    const chat = createChatSession();
    next.chatsById[chat.id] = chat;
  }

  const rawActiveChatId =
    typeof migrated?.activeChatId === "string" &&
    next.chatsById[migrated.activeChatId]
      ? migrated.activeChatId
      : null;

  next.lruChatIds = unique(
    (Array.isArray(migrated?.lruChatIds) ? migrated.lruChatIds : []).filter(
      (chatId) => typeof chatId === "string" && next.chatsById[chatId],
    ),
  );

  next.tree = sanitizeTree(
    migrated?.tree,
    next.chatsById,
    rawActiveChatId,
    next.lruChatIds,
  );

  let activeChatId = rawActiveChatId;
  if (!activeChatId || !next.chatsById[activeChatId]) {
    const selectedNode = next.tree.selectedNodeId
      ? next.tree.nodesById[next.tree.selectedNodeId]
      : null;
    if (
      selectedNode?.entity === "chat" &&
      next.chatsById[selectedNode.chatId]
    ) {
      activeChatId = selectedNode.chatId;
    }
  }

  if (!activeChatId || !next.chatsById[activeChatId]) {
    activeChatId = firstChatInTree(next.tree);
  }

  if (!activeChatId || !next.chatsById[activeChatId]) {
    const sorted = sortChatsByUpdatedAt(next.chatsById);
    activeChatId = sorted[0] || null;
  }

  if (!activeChatId || !next.chatsById[activeChatId]) {
    const chat = createChatSession();
    next.chatsById[chat.id] = chat;
    activeChatId = chat.id;
  }

  next.activeChatId = activeChatId;

  const activeNodeId = ensureTreeHasNodeForChat(next, activeChatId, {
    parentFolderId: null,
  });
  if (
    !next.tree.selectedNodeId ||
    !next.tree.nodesById[next.tree.selectedNodeId]
  ) {
    next.tree.selectedNodeId =
      activeNodeId || firstChatNodeIdInTree(next.tree) || null;
  }

  if (
    next.tree.selectedNodeId &&
    next.tree.nodesById[next.tree.selectedNodeId]?.entity !== "chat"
  ) {
    next.tree.selectedNodeId =
      activeNodeId || firstChatNodeIdInTree(next.tree) || null;
  }

  const ordered = unique([
    ...(Array.isArray(next.lruChatIds) ? next.lruChatIds : []),
    ...sortChatsByUpdatedAt(next.chatsById),
  ]).filter((chatId) => next.chatsById[chatId]);
  next.lruChatIds = ordered;
  if (next.activeChatId && next.chatsById[next.activeChatId]) {
    next.lruChatIds = unique([next.activeChatId, ...next.lruChatIds]).filter(
      (chatId) => next.chatsById[chatId],
    );
  }

  next.updatedAt = Number.isFinite(Number(migrated?.updatedAt))
    ? Math.max(Number(migrated.updatedAt), now())
    : now();

  next.schemaVersion = CHATS_SCHEMA_VERSION;
  return next;
};
