import {
  CHATS_SCHEMA_VERSION,
  DEFAULT_CHAT_TITLE,
  DEFAULT_FOLDER_LABEL,
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
  trimText,
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
  removeChatFromTreeByChatId,
  resolveSelectedParentFolderId,
  sanitizeExplorerReorderPayload,
  snapshotSubtreeForCopy,
  sortChatsByUpdatedAt,
} from "./chat_storage_tree";
import { normalizeStore } from "./chat_storage_migrate";
import { createChatStorageBackend } from "./chat_storage_backend";

const storageBackend = createChatStorageBackend();
const hasIpcBackend = () =>
  typeof window !== "undefined" && !!window.chatStorageAPI;
let memoryStore = null;
let draftClaimSequence = 0;
const draftClaimsByChatId = new Map();

const createDraftClaimId = () => {
  draftClaimSequence += 1;
  return `draft-claim-${Date.now()}-${draftClaimSequence}`;
};

// —— v3 lazy-messages 内存模型 ——
// memoryStore 形状不变,但非激活 chat 的 `messages` 是 `[]` 占位(stats 仍是
// 真值,由 sanitizeChatSession 的占位守卫保留);激活 chat 永远持有完整消息。
// 持久化权威在 main 进程 SQLite,写路径走增量 ops(见 queueOpsForWrite)。

// pending ops(microtask 合并):按 (type, chatId) 去重,后写胜;
// delete 覆盖同 id 的 pending puts,put 撤销同 id 的 pending delete(重建语义)。
let pendingOps = null;

const ensurePendingOps = () => {
  if (!pendingOps) {
    pendingOps = {
      treeMeta: null,
      chatMetas: new Map(),
      messagesByChatId: new Map(),
      deletedChatIds: new Set(),
    };
  }
  return pendingOps;
};

// 该 chat 本 tick 内有未 flush 的消息写/删除 → 内存是唯一真值,
// 此时绝不能去 main 读(会读到旧行,消息被"复活")。
const hasPendingMessagesOverride = (chatId) =>
  !!pendingOps &&
  (pendingOps.messagesByChatId.has(chatId) ||
    pendingOps.deletedChatIds.has(chatId));

const chatMetaWithoutMessages = (chat) => {
  const { messages, ...meta } = chat;
  return meta;
};

// v3 复合快照(main 组装):有 chatMetasById 即 v3;否则视为 legacy 整库
// (localStorage fallback 或首启 localStorage→IPC 迁移回读)。
const isV3BootstrapSnapshot = (snapshot) =>
  isObject(snapshot) && isObject(snapshot.chatMetasById);

const assembleStoreFromV3Bootstrap = (snapshot) => {
  const chatsById = {};
  for (const [chatId, meta] of Object.entries(snapshot.chatMetasById)) {
    if (!isObject(meta)) {
      continue;
    }
    chatsById[chatId] = { ...meta, id: meta.id || chatId, messages: [] };
  }

  const activeChatId =
    typeof snapshot.activeChatId === "string" && chatsById[snapshot.activeChatId]
      ? snapshot.activeChatId
      : null;
  if (activeChatId) {
    chatsById[activeChatId].messages = Array.isArray(
      snapshot.activeChatMessages,
    )
      ? snapshot.activeChatMessages
      : [];
  }

  return {
    // renderer store 仍是 v2 形状;v3 只是持久层协议版本。设成当前版本
    // 以免 normalizeStore 走 v1 迁移把树重建掉。
    schemaVersion: CHATS_SCHEMA_VERSION,
    updatedAt: snapshot.updatedAt,
    chatsById,
    activeChatId,
    lruChatIds: [],
    tree: isObject(snapshot.tree) ? snapshot.tree : undefined,
    ui: {},
  };
};

// 同步保证某 chat 的消息在给定 store 对象里(激活切换/复制前的预载)。
// 仅 IPC 路径需要;占位为空且 meta 记录有消息时,sendSync 拉取。
// CONTRACT NOTE (review L1): hydration REPLACES the chat object (identity
// changes) but is memory-only — it is deliberately NOT named in dirty
// chatIds / ops, since nothing persisted changed. Consumers keying on chat
// identity (explorer row cache) will re-mint that one row; that's correct
// and cheap.
const ensureChatMessagesLoadedInStore = (store, chatId) => {
  if (!hasIpcBackend()) {
    return;
  }
  const chat = chatId ? store?.chatsById?.[chatId] : null;
  if (!chat) {
    return;
  }
  if (Array.isArray(chat.messages) && chat.messages.length > 0) {
    return;
  }
  if (Number(chat?.stats?.messageCount || 0) <= 0) {
    return;
  }
  if (hasPendingMessagesOverride(chatId)) {
    return;
  }
  let loaded = null;
  try {
    loaded = storageBackend.readMessages(chatId);
  } catch {
    loaded = null;
  }
  if (Array.isArray(loaded) && loaded.length > 0) {
    // COW 纪律:这个 chat 对象可能与上一世代共享(dev 下已冻结)。绝不就地
    // 写 chat.messages —— 换成携带消息的新对象。这是内存 hydration,不是
    // 数据变更(消息本就持久化在 main),因此不需要 dirty 声明;代价只是
    // 该 chat 本世代换一次身份(激活/复制路径,本来就要重渲染)。
    store.chatsById[chatId] = { ...chat, messages: sanitizeMessages(loaded) };
  }
};

const ensureMemoryStoreLoaded = () => {
  // Only cache the memory mirror when running against the IPC backend. In the
  // localStorage-fallback path (jsdom tests, pure web builds) the source of
  // truth is localStorage itself, and callers may legitimately mutate it
  // between reads — a stale mirror would break that contract.
  // NOTE: 即使 bootstrap 为空，也要跑 normalizeStore —— 它会 seed 默认 chat +
  // tree node。原本 getChatsStore 通过 writeStore 触发这步，现在热路径简化后
  // 必须在 readStore 入口保证；且空 bootstrap 产生的 seed 必须立刻持久化，
  // 否则后续 read 会每次生成不同 id 的 seed chat。
  if (!hasIpcBackend()) {
    const bootstrap = storageBackend.readBootstrap();
    if (bootstrap) return normalizeStore(bootstrap);
    const seeded = normalizeStore(null);
    try {
      storageBackend.persist(seeded);
    } catch {
      // no-op
    }
    return seeded;
  }
  if (memoryStore !== null) return memoryStore;
  const bootstrap = storageBackend.readBootstrap();
  const bootstrapStore = isV3BootstrapSnapshot(bootstrap)
    ? assembleStoreFromV3Bootstrap(bootstrap)
    : bootstrap;
  memoryStore = normalizeStore(bootstrapStore);
  // normalize 可能改写 activeChatId(快照里的 active 失效时兜底)——
  // 无论落在谁头上,激活 chat 必须满载消息。
  ensureChatMessagesLoadedInStore(memoryStore, memoryStore.activeChatId);
  if (!bootstrap) {
    try {
      storageBackend.persist(memoryStore);
    } catch {
      // no-op
    }
  }
  return memoryStore;
};

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

const emitStoreChange = (store, event = {}) => {
  if (storeSubscribers.size === 0) {
    return;
  }
  for (const listener of storeSubscribers) {
    try {
      listener(store, event);
    } catch {
      // no-op
    }
  }
};

let pendingEmit = null;
let microtaskScheduled = false;

// pending ops → 一条 APPLY_OPS(main 侧单事务应用)。顺序:先删后写,
// put_tree_meta 收尾(同 id 冲突已在入队时消解,这里只求可读)。
//
// ORDERING ASSUMPTION (load-bearing, spec §3): APPLY_OPS is fire-and-forget
// (ipcRenderer.send) while READ_MESSAGES is sendSync — correctness relies on
// Electron's renderer→main same-channel FIFO delivery: an APPLY_OPS sent
// before a later sendSync is processed by main first, so a post-flush sync
// read can never observe pre-flush rows for a chat whose ops were already
// sent. The not-yet-flushed window (same tick, before this microtask runs)
// is covered in-renderer by the pending-ops override
// (hasPendingMessagesOverride), which keeps such reads in memory.
const flushPendingOps = () => {
  if (!pendingOps) return;
  const { treeMeta, chatMetas, messagesByChatId, deletedChatIds } = pendingOps;
  pendingOps = null;

  const ops = [];
  if (deletedChatIds.size > 0) {
    ops.push({ type: "delete_chats", chatIds: [...deletedChatIds] });
  }
  for (const [chatId, meta] of chatMetas) {
    ops.push({ type: "put_chat_meta", chatId, meta });
  }
  for (const [chatId, messages] of messagesByChatId) {
    ops.push({ type: "put_messages", chatId, messages });
  }
  if (treeMeta) {
    ops.push({ type: "put_tree_meta", ...treeMeta });
  }
  if (ops.length === 0) return;

  try {
    storageBackend.applyOps(ops);
  } catch (error) {
    console.error("[chat-storage] backend applyOps failed:", error);
  }
};

// —— emit dirty 提示(switch-chain spec §2,形状冻结:加字段可,改语义不可)——
// 每个 subscribeChatsStore 事件携带
//   event.dirty = { chatIds, deletedChatIds, treeChanged, activeChanged }
// 供下游(explorer 增量等)按 id 增量更新,不必全量重derive。
// 内部累加用 Set,emit 时转数组;同 tick 多写取并集(见 mergePendingDirty)。
const createEmptyPendingDirty = () => ({
  chatIds: new Set(),
  deletedChatIds: new Set(),
  treeChanged: false,
  activeChanged: false,
});

// 同 tick 并集合并,语义与 pendingOps 对齐:
// - 后写的 delete 压掉先前的 chatIds 条目(delete wins);
// - 后写的 put 撤销先前的 delete(同 tick 重建语义)。
// 单次写内两个集合天然不相交(deleted = next 里已不存在;chatIds = 仍存在)。
const mergePendingDirty = (acc, add) => {
  for (const chatId of add.chatIds) {
    acc.chatIds.add(chatId);
    acc.deletedChatIds.delete(chatId);
  }
  for (const chatId of add.deletedChatIds) {
    acc.deletedChatIds.add(chatId);
    acc.chatIds.delete(chatId);
  }
  acc.treeChanged = acc.treeChanged || add.treeChanged === true;
  acc.activeChanged = acc.activeChanged || add.activeChanged === true;
  return acc;
};

const dirtyToEventShape = (dirty) => ({
  chatIds: [...dirty.chatIds],
  deletedChatIds: [...dirty.deletedChatIds],
  treeChanged: dirty.treeChanged === true,
  activeChanged: dirty.activeChanged === true,
});

// treeChanged 派生(禁止无脑 true):selectedNodeId / root 顺序 / 逐节点引用。
// Task 1 的身份保持 normalize 让未动节点跨世代引用稳定,因此
// "引用不等 ⟺ 节点内容真的变了"在这里成立(等价节点已被换回上一轮引用)。
const hasTreeChanged = (prevStore, nextStore) => {
  const prevTree = prevStore?.tree;
  const nextTree = nextStore?.tree;
  if (prevTree === nextTree) return false;
  if (!isObject(prevTree) || !isObject(nextTree)) return true;
  if ((prevTree.selectedNodeId ?? null) !== (nextTree.selectedNodeId ?? null)) {
    return true;
  }
  const prevRoot = Array.isArray(prevTree.root) ? prevTree.root : [];
  const nextRoot = Array.isArray(nextTree.root) ? nextTree.root : [];
  if (prevRoot.length !== nextRoot.length) return true;
  for (let i = 0; i < nextRoot.length; i += 1) {
    if (prevRoot[i] !== nextRoot[i]) return true;
  }
  const prevNodes = isObject(prevTree.nodesById) ? prevTree.nodesById : {};
  const nextNodes = isObject(nextTree.nodesById) ? nextTree.nodesById : {};
  const nextKeys = Object.keys(nextNodes);
  if (Object.keys(prevNodes).length !== nextKeys.length) return true;
  for (const nodeId of nextKeys) {
    if (prevNodes[nodeId] !== nextNodes[nodeId]) return true;
  }
  return false;
};

// 单次写世代的 dirty(ops 级信息 → 事件形状):
// - chatIds:声明的 chatMeta∪messages 中仍存在于 next 的 id,外加 key-diff
//   新增(prev 无、next 有)。新增即 dirty 是定义使然 —— 也兜住未声明的
//   创建路径(delete 兜底 seed、normalize seed),消费侧不会漏掉新会话。
// - deletedChatIds:key-diff 删除,与 queueOpsForWrite 的 delete_chats 同源。
// - activeChanged:activeChatId 世代间比较。
const computeWriteDirty = (prevStore, nextStore, declared) => {
  const chatIds = new Set();
  for (const chatId of [...declared.chatMeta, ...declared.messages]) {
    if (chatId && nextStore.chatsById?.[chatId]) {
      chatIds.add(chatId);
    }
  }
  const prevChats = isObject(prevStore?.chatsById) ? prevStore.chatsById : {};
  const nextChats = isObject(nextStore?.chatsById) ? nextStore.chatsById : {};
  for (const chatId of Object.keys(nextChats)) {
    if (!prevChats[chatId]) chatIds.add(chatId);
  }
  const deletedChatIds = new Set();
  for (const chatId of Object.keys(prevChats)) {
    if (!nextChats[chatId]) deletedChatIds.add(chatId);
  }
  return {
    chatIds,
    deletedChatIds,
    treeChanged: hasTreeChanged(prevStore, nextStore),
    activeChanged:
      (prevStore?.activeChatId ?? null) !== (nextStore?.activeChatId ?? null),
  };
};

const flushPendingEmit = () => {
  microtaskScheduled = false;
  flushPendingOps();
  if (!pendingEmit) return;
  const { store, emit, event, dirty } = pendingEmit;
  pendingEmit = null;
  if (emit) {
    emitStoreChange(store, { ...event, dirty: dirtyToEventShape(dirty) });
  }
};

const schedulePersistAndEmit = (store, options, writeDirty) => {
  const emit = options.emit !== false;
  const event = {
    type: options.type || "store_write",
    source: options.source || "unknown",
  };
  // 同 tick 内多次 writeStore 只合并为一次 persist + 一次 emit。
  // 始终保留最新的 store、event；dirty 跨写累加并集(含 emit=false 的静默写,
  // 订阅者看到的是最终 store,并集必须覆盖全部世代);
  // emit=false 不升级 emit=true（bootstrap 等静默写入不应点燃 subscribers）。
  pendingEmit = {
    store,
    event,
    dirty: mergePendingDirty(
      pendingEmit?.dirty || createEmptyPendingDirty(),
      writeDirty,
    ),
    emit: (pendingEmit?.emit ?? false) || emit,
  };
  if (!microtaskScheduled) {
    microtaskScheduled = true;
    queueMicrotask(flushPendingEmit);
  }
};

export const flushStoreEmitSync = () => {
  flushPendingEmit();
};

// dirty 声明协议:withStore(mutator, { dirty })。
// dirty = { chatMeta?: string[], messages?: string[] } 或返回该形状的函数
// (mutator 内部才知道新建 id 时用函数,writeStore 时机求值)。
const resolveDirtyDeclaration = (dirty) => {
  const resolved = typeof dirty === "function" ? dirty() : dirty;
  return {
    chatMeta: Array.isArray(resolved?.chatMeta) ? resolved.chatMeta : [],
    messages: Array.isArray(resolved?.messages) ? resolved.messages : [],
  };
};

// declared = resolveDirtyDeclaration 的产物(writeStore 统一求值一次,
// ops 与 event dirty 共用同一份声明,不会二次调用函数式 dirty)。
const queueOpsForWrite = (prevStore, nextStore, declared) => {
  const pending = ensurePendingOps();

  // 恒发 tree meta:每次写都带最新 tree/activeChatId/updatedAt(体量小)。
  pending.treeMeta = {
    tree: nextStore.tree,
    activeChatId: nextStore.activeChatId ?? null,
    updatedAt: nextStore.updatedAt,
  };

  for (const chatId of declared.chatMeta) {
    const chat = chatId ? nextStore.chatsById?.[chatId] : null;
    if (!chat) continue;
    pending.deletedChatIds.delete(chatId);
    pending.chatMetas.set(chatId, chatMetaWithoutMessages(chat));
  }

  for (const chatId of declared.messages) {
    const chat = chatId ? nextStore.chatsById?.[chatId] : null;
    if (!chat) continue;
    pending.deletedChatIds.delete(chatId);
    pending.messagesByChatId.set(
      chatId,
      Array.isArray(chat.messages) ? chat.messages : [],
    );
  }

  // 删除靠 key diff(prev 有、next 没有),mutator 不需要声明;
  // delete 覆盖同 id 的 pending puts。
  const prevChats = isObject(prevStore?.chatsById) ? prevStore.chatsById : {};
  for (const chatId of Object.keys(prevChats)) {
    if (nextStore.chatsById?.[chatId]) continue;
    pending.chatMetas.delete(chatId);
    pending.messagesByChatId.delete(chatId);
    pending.deletedChatIds.add(chatId);
  }
};

// prevGenerationStore:本世代之前的 store(withStore 的 current),fallback
// 路径靠它做 key-diff / 树比较;IPC 路径以 memoryStore 为准(两者同一对象)。
const writeStore = (store, options = {}, prevGenerationStore = null) => {
  // 世代完成 → dev 下冻结共享对象(见 freezeStoreObjectsForDev)。
  // 放在装载/emit 之前:订阅者拿到的就是冻结世代。
  freezeStoreObjectsForDev(store);
  const declared = resolveDirtyDeclaration(options.dirty);
  if (hasIpcBackend()) {
    // IPC 路径：memoryStore 同步更新 → 立即一致性读；ops/emit 合并到 microtask
    const prevStore = memoryStore;
    memoryStore = store;
    queueOpsForWrite(prevStore, store, declared);
    schedulePersistAndEmit(
      store,
      options,
      computeWriteDirty(prevStore, store, declared),
    );
    return store;
  }

  // jsdom / 纯 web fallback：没有 memoryStore，persist 必须同步到 localStorage，
  // 否则下一次 withStore 的 readStore() 会读到旧数据
  const writeDirty = computeWriteDirty(prevGenerationStore, store, declared);
  try {
    storageBackend.persist(store);
  } catch (error) {
    console.error("[chat-storage] backend persist failed:", error);
  }
  if (options.emit !== false) {
    // fallback 同步 emit 与 IPC microtask emit 携带同一 dirty 形状。
    emitStoreChange(store, {
      type: options.type || "store_write",
      source: options.source || "unknown",
      dirty: dirtyToEventShape(writeDirty),
    });
  }
  return store;
};

// GC/LRU 驱逐已随 V3 移除(spec §5):持久化权威在 main SQLite,renderer 只持
// tree + metas + 激活消息,没有 quota 压力;用户数据不再被静默丢弃。
// lruChatIds 仍作为 MRU 记录保留(touchLru / normalize 的 active 置顶)。

// 页面关闭前强制 flush pending microtask：保证最后一次 writeStore 的
// ops (APPLY_OPS) 和 emit 都落地。main 侧 before-quit 负责关库,
// 这里只负责把 renderer 侧未发出的 IPC 挤出去。
if (
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function"
) {
  window.addEventListener("beforeunload", flushPendingEmit);
  window.addEventListener("pagehide", flushPendingEmit);
}

const readStore = () => {
  return ensureMemoryStoreLoaded();
};

// —— 写时复制(COW)世代模型(switch-chain spec §1)——
// withStore 不再对整库深克隆:工作副本只新建顶层与容器(chatsById/tree/
// lruChatIds),chat 对象按引用携带。要就地改某个既有 chat,必须先经
// claimChatForWrite 换成本世代的私有深克隆;静态 dirty 声明的 chat 在
// mutator 运行前预先 claim(mutator 可自由就地改)。tree 因其 helper
// (applySiblingIds/removeNodeFromParent/ensureTreeHasNodeForChat 等)大量
// 就地改节点且体量小,直接整棵深克隆 —— 未动节点的引用由 normalizeStore
// 的等价后置遍换回上一世代对象,身份保持不受影响。

// 本世代已私有化的 chat id 集(按工作副本对象隔离)。
const cowClaimedChatIds = new WeakMap();

const claimChatForWrite = (store, chatId) => {
  const chat =
    chatId && isObject(store?.chatsById) ? store.chatsById[chatId] : null;
  if (!chat) {
    return null;
  }
  let claimed = cowClaimedChatIds.get(store);
  if (!claimed) {
    claimed = new Set();
    cowClaimedChatIds.set(store, claimed);
  }
  if (claimed.has(chatId)) {
    return store.chatsById[chatId];
  }
  const copy = clone(chat) || chat;
  store.chatsById[chatId] = copy;
  claimed.add(chatId);
  return copy;
};

const createCowWorkingStore = (current, dirty) => {
  const base = isObject(current) ? current : createEmptyStoreV2();
  const working = {
    ...base,
    chatsById: isObject(base.chatsById) ? { ...base.chatsById } : {},
    lruChatIds: Array.isArray(base.lruChatIds) ? [...base.lruChatIds] : [],
    tree: clone(base.tree) || createEmptyStoreV2().tree,
    ui: isObject(base.ui) ? { ...base.ui } : {},
  };
  // 静态 dirty 声明:进 mutator 前先行深克隆(V3 dirty 表:所有 setter 走
  // updateChatSessionById,静态声明)。函数式 dirty(创建路径/激活翻标等,
  // id 在 mutator 内部才知道)由各就地写点自行 claimChatForWrite。
  if (dirty && typeof dirty !== "function") {
    const declared = resolveDirtyDeclaration(dirty);
    for (const chatId of [...declared.chatMeta, ...declared.messages]) {
      claimChatForWrite(working, chatId);
    }
  }
  return working;
};

// dev 守卫(仅非 production;jsdom 测试全程 development,让整个套件充当
// 陈旧引用泄漏探测器):世代落库后冻结 chat 对象/messages 数组/tree 节点。
// 任何绕过 claim 的就地写(mutator 忘克隆、订阅者改快照)立刻 TypeError,
// 而不是悄悄污染跨世代共享对象。容器与顶层不冻结(世代内合法替换入口)。
const freezeStoreObjectsForDev = (store) => {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const chats = isObject(store?.chatsById) ? store.chatsById : null;
  if (chats) {
    for (const chat of Object.values(chats)) {
      if (!isObject(chat)) continue;
      if (Array.isArray(chat.messages)) Object.freeze(chat.messages);
      Object.freeze(chat);
    }
  }
  const nodes = isObject(store?.tree?.nodesById) ? store.tree.nodesById : null;
  if (nodes) {
    for (const node of Object.values(nodes)) {
      if (!isObject(node)) continue;
      if (Array.isArray(node.children)) Object.freeze(node.children);
      Object.freeze(node);
    }
  }
};

const withStore = (mutate, options = {}) => {
  const current = readStore();
  const working = createCowWorkingStore(current, options.dirty);
  const candidate = typeof mutate === "function" ? mutate(working) : working;
  // prevStore = 本世代之前的 store:未触碰的 chat(引用穿透)跳过 re-sanitize
  // 直接复用,未动 tree 节点换回上一轮引用 —— 下游 memo 因此命中。
  const next = normalizeStore(candidate || working, { prevStore: current });
  // 切会话安全带:无论 activeChatId 在哪条路径被改(select/delete 兜底/create/
  // normalize 兜底),写出/emit 前保证新激活 chat 的消息已在内存 ——
  // use_chat_session_state 的切换缝隙(直接读快照 messages)因此零改动。
  ensureChatMessagesLoadedInStore(next, next.activeChatId);
  next.updatedAt = now();
  return writeStore(next, options, current);
};

// 返回激活结果 { chatId, metaChanged } (未激活 → null)。
// metaChanged=true 表示这里真的改了该 chat 的 meta(未读标志 true→false);
// 调用方(mutator)必须把这类 id 合并进自己的 dirty.chatMeta 声明,否则
// 清掉的未读标志只活在内存里,重启后从 SQLite 复活(见 lazy_messages 测试)。
const updateActiveAndSelectedFromChatId = (store, chatId) => {
  if (!chatId || !store.chatsById[chatId]) {
    return null;
  }

  // 激活前同步预载新 chat 的消息(非激活时是 [] 占位)。
  ensureChatMessagesLoadedInStore(store, chatId);
  store.activeChatId = chatId;
  let metaChanged = false;
  if (store.chatsById[chatId].hasUnreadGeneratedReply) {
    // COW:被激活的 chat 与上一世代共享 —— 翻未读标志前必须先私有化克隆
    // (metaChanged=true 会被调用方并进 dirty.chatMeta,持久化闭环不变)。
    const activatedChat = claimChatForWrite(store, chatId);
    activatedChat.hasUnreadGeneratedReply = false;
    activatedChat.updatedAt = now();
    metaChanged = true;
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

  return { chatId, metaChanged };
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

// 返回 { removedChatId, activation };activation 是 updateActiveAndSelectedFromChatId
// 的结果(兜底激活可能翻掉 fallback chat 的未读标志,调用方要据此声明 dirty)。
const cleanupTransientActiveChat = (store, preferredNextChatId = null) => {
  const removableChatId = getCleanupCandidateActiveChatId(
    store,
    preferredNextChatId,
  );
  if (!removableChatId) {
    return { removedChatId: null, activation: null };
  }

  removeChatById(store, removableChatId);
  const fallbackChatId = resolveFallbackChatId(store, preferredNextChatId);
  let activation = null;
  if (fallbackChatId) {
    activation = updateActiveAndSelectedFromChatId(store, fallbackChatId);
  } else {
    store.activeChatId = null;
    store.tree.selectedNodeId = null;
  }

  return { removedChatId: removableChatId, activation };
};

const cleanupPreviousTransientActiveChat = (
  store,
  previousActiveChatId,
  nextChatId,
) => {
  if (!previousActiveChatId || previousActiveChatId === nextChatId) {
    return { removedChatId: null, activation: null };
  }
  if (store.activeChatId !== previousActiveChatId) {
    return { removedChatId: null, activation: null };
  }

  return cleanupTransientActiveChat(store, nextChatId);
};

export const getChatsStore = () => {
  const current = readStore();
  return clone(current) || createEmptyStoreV2();
};

// v3 lazy-messages 读口(同步契约,spec §5/§9 单向门):
// 激活 chat 或内存已有消息 → 内存克隆;冷的非激活 chat → sendSync READ_MESSAGES
// (几 ms,仅用户动作触发:切换/导出/复制/测试桥)。
// fallback 构建(无 IPC)内存持有全部消息,永远不会走 IPC 分支。
export const getChatMessages = (chatId) => {
  if (!chatId) {
    return [];
  }
  const current = readStore();
  const chat = current?.chatsById?.[chatId];
  if (!chat) {
    return [];
  }

  const inMemory = Array.isArray(chat.messages) ? chat.messages : [];
  if (
    chatId === current.activeChatId ||
    inMemory.length > 0 ||
    !hasIpcBackend() ||
    hasPendingMessagesOverride(chatId)
  ) {
    return clone(inMemory) || [];
  }

  if (Number(chat?.stats?.messageCount || 0) <= 0) {
    return [];
  }

  let loaded = null;
  try {
    loaded = storageBackend.readMessages(chatId);
  } catch {
    loaded = null;
  }
  return Array.isArray(loaded) ? sanitizeMessages(loaded) : [];
};

// listener(store, event);event = { type, source, dirty }。
// dirty(spec §2 冻结形状,旧订阅者忽略即可,零破坏):
//   { chatIds: string[], deletedChatIds: string[],
//     treeChanged: boolean, activeChanged: boolean }
// 同 tick 合并 emit 时 dirty 是全部写世代的并集(delete 压过同 id 的 put)。
export const subscribeChatsStore = (listener, options = {}) => {
  if (typeof listener !== "function") {
    return () => {};
  }

  const excludeEventTypes = Array.isArray(options.excludeEventTypes)
    ? options.excludeEventTypes
    : null;

  const wrappedListener = excludeEventTypes
    ? (snapshot, event) => {
        if (!excludeEventTypes.includes(event.type)) {
          listener(snapshot, event);
        }
      }
    : listener;

  storeSubscribers.add(wrappedListener);
  return () => {
    storeSubscribers.delete(wrappedListener);
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
      const previousActiveChatId = store.activeChatId;
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
      cleanupPreviousTransientActiveChat(store, previousActiveChatId, chat.id);
      updateActiveAndSelectedFromChatId(store, chat.id);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_create",
      dirty: () => ({ chatMeta: createdChatId ? [createdChatId] : [] }),
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
      dirty: () => ({ chatMeta: result.chatId ? [result.chatId] : [] }),
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
      const previousActiveChatId = store.activeChatId;
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
      cleanupPreviousTransientActiveChat(
        store,
        previousActiveChatId,
        finalizedChat.id,
      );
      updateActiveAndSelectedFromChatId(store, finalizedChat.id);
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_create_with_messages",
      dirty: () =>
        createdChatId
          ? { chatMeta: [createdChatId], messages: [createdChatId] }
          : {},
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
  const duplicatedChatIds = [];

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
      // v3 lazy-messages:快照前把子树里每个源 chat 的消息载入(非激活 chat
      // 是 [] 占位),否则复制出来的会话是空的。在 store 侧做,
      // chat_storage_tree.js(Task 4 所辖)保持不动。
      for (const subtreeNodeId of collectSubtreeNodeIds(
        store.tree,
        sourceNodeId,
        [],
      )) {
        const subtreeNode = store.tree.nodesById[subtreeNodeId];
        if (subtreeNode?.entity === "chat" && subtreeNode.chatId) {
          ensureChatMessagesLoadedInStore(store, subtreeNode.chatId);
        }
      }
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
          duplicatedChatIds.push(finalizedChat.id);

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
      dirty: () => ({
        chatMeta: [...duplicatedChatIds],
        messages: [...duplicatedChatIds],
      }),
    },
  );

  return {
    nodeId: duplicatedNodeId,
    store: clone(next) || next,
  };
};

export const selectTreeNode = ({ nodeId } = {}, options = {}) => {
  const source = options.source || "unknown";
  // 激活时真的改了 meta(未读标志翻掉)的 chat id —— 必须进 dirty,
  // 否则清除只在内存,重启后未读标志从 SQLite 复活。
  const activatedMetaDirtyChatIds = new Set();

  const next = withStore(
    (store) => {
      let target =
        typeof nodeId === "string" ? store.tree.nodesById[nodeId] : null;
      if (target?.entity === "chat") {
        const cleanup = cleanupTransientActiveChat(store, target.chatId);
        if (cleanup.activation?.metaChanged) {
          activatedMetaDirtyChatIds.add(cleanup.activation.chatId);
        }
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
        const activation = updateActiveAndSelectedFromChatId(
          store,
          target.chatId,
        );
        if (activation?.metaChanged) {
          activatedMetaDirtyChatIds.add(activation.chatId);
        }
      }
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_select",
      dirty: () => ({ chatMeta: [...activatedMetaDirtyChatIds] }),
    },
  );

  return clone(next) || next;
};

export const renameTreeNode = ({ nodeId, label } = {}, options = {}) => {
  const source = options.source || "unknown";
  let renamedChatId = null;

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
        // COW:改名是对既有 chat 的就地写 —— 先 claim 私有克隆(dirty 已由
        // renamedChatId 声明)。
        const renamedChat = claimChatForWrite(store, node.chatId);
        renamedChat.title = nextLabel;
        renamedChat.isTransientNewChat = false;
        renamedChat.updatedAt = now();
        // v3:非激活 chat 的 messages 是 [] 占位 —— 从占位重算 stats 会把真值
        // 清零(sanitize 守卫此时救不回来)。只有内存里有消息才重算。
        if (
          Array.isArray(renamedChat.messages) &&
          renamedChat.messages.length > 0
        ) {
          renamedChat.stats = computeChatStats(renamedChat);
        }
        renamedChatId = node.chatId;
      }

      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "tree_rename",
      dirty: () => ({ chatMeta: renamedChatId ? [renamedChatId] : [] }),
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
          store.chatsById,
        );
        store.activeChatId = fallbackChatId || null;
      }

      if (selectedRemoved) {
        if (store.activeChatId) {
          const map = buildTreeNodeLookupByChatId(store.tree);
          store.tree.selectedNodeId =
            map[store.activeChatId] ||
            firstChatNodeIdInTree(store.tree, store.chatsById) ||
            null;
        } else {
          store.tree.selectedNodeId =
            firstChatNodeIdInTree(store.tree, store.chatsById) || null;
        }
      }

      if (!store.activeChatId || !store.chatsById[store.activeChatId]) {
        const firstChatId = firstChatInTree(store.tree, store.chatsById);
        if (firstChatId && store.chatsById[firstChatId]) {
          store.activeChatId = firstChatId;
        }
      }

      if (!store.activeChatId || !store.chatsById[store.activeChatId]) {
        const chat = createChatSession({ isTransientNewChat: true });
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

// No-op guard helpers. Chat switch re-hydrates local React state from the
// store, which then triggers effects that write the same values back. The
// guards below short-circuit those writes before they reach withStore/
// normalize/persist/emit — cutting the chat-switch cascade we saw in the
// DevTools flame chart.
const readChatSnapshotUnsafe = (chatId) => {
  if (!chatId) return null;
  const current = readStore();
  const chat = current?.chatsById?.[chatId];
  return chat || null;
};

const arraysShallowEq = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const agentOrchestrationEq = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.mode === b.mode;
};

const attachmentIdsEq = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if ((a[i]?.id || "") !== (b[i]?.id || "")) return false;
  }
  return true;
};

// dirty 粒度:所有走这里的 setter 都是 {chatMeta:[chatId]};只有
// setChatMessages 额外声明 {messages:[chatId]}(内部 includeMessagesDirty)。
const updateChatSessionById = (chatId, updater, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      if (!chatId) {
        return store;
      }
      if (!store.chatsById[chatId]) {
        return store;
      }

      const existing = sanitizeChatSession(store.chatsById[chatId], chatId);
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
      dirty: {
        chatMeta: chatId ? [chatId] : [],
        ...(options.includeMessagesDirty && chatId
          ? { messages: [chatId] }
          : {}),
      },
    },
  );

  return clone(next) || next;
};

export const updateChatDraft = (chatId, patch = {}, options = {}) => {
  const existing = readChatSnapshotUnsafe(chatId);
  if (existing) {
    const draft = existing.draft || {};
    const hasText = Object.prototype.hasOwnProperty.call(patch, "text");
    const hasAttachments = Object.prototype.hasOwnProperty.call(
      patch,
      "attachments",
    );
    const nextText = hasText ? trimText(patch.text || "", 20000) : null;
    const textSame = !hasText || (draft.text || "") === nextText;
    const attachmentsSame =
      !hasAttachments || attachmentIdsEq(draft.attachments, patch.attachments);
    if (textSame && attachmentsSame) {
      return getChatsStore();
    }
  }
  if (options.preserveDraftClaim !== true) {
    draftClaimsByChatId.delete(chatId);
  }
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

export const claimChatDraft = (chatId, patch = {}, options = {}) => {
  const store = updateChatDraft(chatId, patch, {
    ...options,
    preserveDraftClaim: true,
  });
  if (!chatId || !store?.chatsById?.[chatId]) {
    draftClaimsByChatId.delete(chatId);
    return { claimed: false, claimId: null, store };
  }

  const claimId = createDraftClaimId();
  draftClaimsByChatId.set(chatId, claimId);
  return { claimed: true, claimId, store };
};

export const replaceClaimedChatDraft = (
  chatId,
  expectedClaimId,
  patch = {},
  options = {},
) => {
  if (
    !chatId ||
    !expectedClaimId ||
    draftClaimsByChatId.get(chatId) !== expectedClaimId
  ) {
    return { applied: false, claimId: null, store: getChatsStore() };
  }

  const store = updateChatDraft(chatId, patch, {
    ...options,
    preserveDraftClaim: true,
  });
  if (!store?.chatsById?.[chatId]) {
    draftClaimsByChatId.delete(chatId);
    return { applied: false, claimId: null, store };
  }

  const claimId = createDraftClaimId();
  draftClaimsByChatId.set(chatId, claimId);
  return { applied: true, claimId, store };
};

export const releaseChatDraftClaim = (chatId, expectedClaimId) => {
  if (
    !chatId ||
    !expectedClaimId ||
    draftClaimsByChatId.get(chatId) !== expectedClaimId
  ) {
    return false;
  }
  draftClaimsByChatId.delete(chatId);
  return true;
};

export const releaseAllChatDraftClaims = () => {
  const released = draftClaimsByChatId.size;
  draftClaimsByChatId.clear();
  return released;
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
        // 元数据化的"生成中"标志(树上的小绿点):唯一消息写入口在这里,
        // 顺手维护,树/启动 settle 不再需要扫消息(消息可能是懒占位)。
        isGenerating: nextMessages.some(
          (message) =>
            message &&
            message.role === "assistant" &&
            message.status === "streaming",
        ),
        isTransientNewChat:
          nextMessages.length > 0 ? false : chat.isTransientNewChat === true,
        lastMessageAt: computeLastMessageAt(nextMessages, chat.lastMessageAt),
        updatedAt: now(),
      };
    },
    {
      ...options,
      type: "chat_update_messages",
      includeMessagesDirty: true,
    },
  );
};

export const markChatStarted = (chatId, options = {}) => {
  const existing = readChatSnapshotUnsafe(chatId);
  if (!existing || existing.isTransientNewChat !== true) {
    return false;
  }

  updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      isTransientNewChat: false,
      updatedAt: now(),
    }),
    {
      ...options,
      type: "chat_mark_started",
    },
  );
  return true;
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
  const existing = readChatSnapshotUnsafe(chatId);
  if (existing) {
    const nextAgent = isLockedCharacterChat(existing)
      ? { mode: "default" }
      : sanitizeAgentOrchestration(agentOrchestration);
    if (agentOrchestrationEq(existing.agentOrchestration, nextAgent)) {
      return getChatsStore();
    }
  }
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
  const existing = readChatSnapshotUnsafe(chatId);
  if (existing) {
    const nextToolkits = isLockedCharacterChat(existing)
      ? []
      : sanitizeSelectedToolkits(selectedToolkits);
    if (arraysShallowEq(existing.selectedToolkits, nextToolkits)) {
      return getChatsStore();
    }
  }
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
  const existing = readChatSnapshotUnsafe(chatId);
  if (existing) {
    const nextWorkspaces = isLockedCharacterChat(existing)
      ? []
      : sanitizeSelectedWorkspaceIds(selectedWorkspaceIds);
    if (arraysShallowEq(existing.selectedWorkspaceIds, nextWorkspaces)) {
      return getChatsStore();
    }
  }
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

// Bundle setter: writes toolkits/agent/workspace in one updateChatSessionById
// call. Used at chat-switch where all three local states get re-hydrated and
// their effects would otherwise fire three separate store writes in series.
export const setChatSessionBundle = (chatId, patch = {}, options = {}) => {
  const existing = readChatSnapshotUnsafe(chatId);
  if (!existing) return getChatsStore();
  const locked = isLockedCharacterChat(existing);

  const hasAgent = Object.prototype.hasOwnProperty.call(
    patch,
    "agentOrchestration",
  );
  const hasToolkits = Object.prototype.hasOwnProperty.call(
    patch,
    "selectedToolkits",
  );
  const hasWorkspaces = Object.prototype.hasOwnProperty.call(
    patch,
    "selectedWorkspaceIds",
  );
  const hasRecipe = Object.prototype.hasOwnProperty.call(
    patch,
    "selectedRecipeName",
  );

  const nextAgent = hasAgent
    ? locked
      ? { mode: "default" }
      : sanitizeAgentOrchestration(patch.agentOrchestration)
    : null;
  const nextToolkits = hasToolkits
    ? locked
      ? []
      : sanitizeSelectedToolkits(patch.selectedToolkits)
    : null;
  const nextWorkspaces = hasWorkspaces
    ? locked
      ? []
      : sanitizeSelectedWorkspaceIds(patch.selectedWorkspaceIds)
    : null;
  const nextRecipe = hasRecipe
    ? locked
      ? "Default"
      : typeof patch.selectedRecipeName === "string" &&
          patch.selectedRecipeName.trim()
        ? patch.selectedRecipeName.trim()
        : "Default"
    : null;

  const agentSame =
    !hasAgent || agentOrchestrationEq(existing.agentOrchestration, nextAgent);
  const toolkitsSame =
    !hasToolkits || arraysShallowEq(existing.selectedToolkits, nextToolkits);
  const workspacesSame =
    !hasWorkspaces ||
    arraysShallowEq(existing.selectedWorkspaceIds, nextWorkspaces);
  const recipeSame =
    !hasRecipe ||
    (existing.selectedRecipeName || "Default") === nextRecipe;

  if (agentSame && toolkitsSame && workspacesSame && recipeSame) {
    return getChatsStore();
  }

  return updateChatSessionById(
    chatId,
    (chat) => {
      const out = { ...chat, updatedAt: now() };
      if (hasAgent) out.agentOrchestration = nextAgent;
      if (hasToolkits) out.selectedToolkits = nextToolkits;
      if (hasWorkspaces) out.selectedWorkspaceIds = nextWorkspaces;
      if (hasRecipe) out.selectedRecipeName = nextRecipe;
      return out;
    },
    { ...options, type: "chat_update_session_bundle" },
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

  const touchedChatIds = [];

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
        touchedChatIds.push(chatId);
        updateCharacterNodeMetadata(store, chatId, cleaned);
      }

      return store;
    },
    {
      ...options,
      type: options.type || "chat_refresh_character_metadata",
      dirty: () => ({ chatMeta: [...touchedChatIds] }),
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

  // 兜底激活可能翻掉 fallback chat 的未读标志 → 必须声明 dirty 持久化。
  const activatedMetaDirtyChatIds = new Set();

  const next = withStore(
    (store) => {
      const cleanup = cleanupTransientActiveChat(store, null);
      if (cleanup.activation?.metaChanged) {
        activatedMetaDirtyChatIds.add(cleanup.activation.chatId);
      }
      store.updatedAt = now();
      return store;
    },
    {
      source,
      type: "chat_cleanup_transient_new",
      dirty: () => ({ chatMeta: [...activatedMetaDirtyChatIds] }),
    },
  );

  return clone(next) || next;
};

export const createChatMessageAttachment = (attachment) =>
  sanitizeAttachment(attachment);
