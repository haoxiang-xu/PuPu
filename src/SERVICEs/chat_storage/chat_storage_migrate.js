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

// 树节点等价判定(身份保持 normalize 的复用门):内容逐字段相同才复用上一
// 世代的节点对象。sanitizeTree 每次都重建节点对象,且 withStore 的工作副本
// 对 tree 做深克隆,所以"未动节点"无法靠引用相等判定 —— 等价判定是严格
// 更安全的实现(内容不同绝不复用),节点体量小,O(节点数) 可忽略。
const treeNodesEquivalent = (a, b) => {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  if (
    a.id !== b.id ||
    a.entity !== b.entity ||
    a.type !== b.type ||
    a.label !== b.label ||
    (a.chatId ?? null) !== (b.chatId ?? null) ||
    Number(a.createdAt) !== Number(b.createdAt) ||
    Number(a.updatedAt) !== Number(b.updatedAt)
  ) {
    return false;
  }
  const aChildren = Array.isArray(a.children) ? a.children : null;
  const bChildren = Array.isArray(b.children) ? b.children : null;
  if (!!aChildren !== !!bChildren) return false;
  if (aChildren) {
    if (aChildren.length !== bChildren.length) return false;
    for (let i = 0; i < aChildren.length; i += 1) {
      if (aChildren[i] !== bChildren[i]) return false;
    }
  }
  return true;
};

// normalizeStore(input, { prevStore })
// prevStore = 上一世代的 memoryStore(其 chat/node 都是上一轮 normalize 的
// sanitized 产物)。身份保持规则(switch-chain spec §1):
// - chat:input 里的值与 prevStore 同 id 的值**引用相等**(= 本世代 COW 未
//   触碰)→ 直接复用,跳过 re-sanitize。安全性由幂等守卫锁死:sanitize 对
//   已 sanitized 输入是不动点,复用引用语义等价。
// - tree 节点:sanitize 产物与 prevStore 同 id 节点内容等价 → 换回上一轮
//   的节点引用(供下游 React.memo / 行缓存命中)。
export const normalizeStore = (input, options = {}) => {
  const prevStore = isObject(options?.prevStore) ? options.prevStore : null;
  const prevChats =
    prevStore && isObject(prevStore.chatsById) ? prevStore.chatsById : null;
  const migrated =
    input?.schemaVersion === CHATS_SCHEMA_VERSION ? input : migrateV1ToV2(input);
  const next = createEmptyStoreV2();

  if (isObject(migrated?.ui)) {
    next.ui = migrated.ui;
  }

  const sourceChats = isObject(migrated?.chatsById) ? migrated.chatsById : {};
  for (const [chatId, chat] of Object.entries(sourceChats)) {
    if (prevChats && prevChats[chatId] === chat) {
      // 本世代未触碰(COW 引用穿透)→ 复用上一轮 sanitized 对象。
      next.chatsById[chatId] = chat;
      continue;
    }
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

  // 身份保持后置遍:tree 的一切修正(sanitizeTree/ensureTreeHasNodeForChat/
  // selectedNodeId 兜底)都已完成 —— 此刻内容仍与上一世代等价的节点,换回
  // 上一轮的对象引用。必须放在所有 tree 变更之后,复用进来的对象在 dev 下
  // 可能已被冻结,后续不允许再有就地写。
  if (prevStore && isObject(prevStore.tree?.nodesById)) {
    const prevNodes = prevStore.tree.nodesById;
    for (const [nodeId, node] of Object.entries(next.tree.nodesById)) {
      const prevNode = prevNodes[nodeId];
      if (prevNode && prevNode !== node && treeNodesEquivalent(node, prevNode)) {
        next.tree.nodesById[nodeId] = prevNode;
      }
    }
  }

  next.schemaVersion = CHATS_SCHEMA_VERSION;
  return next;
};
