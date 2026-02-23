const CHATS_STORAGE_KEY = "chats";
const CHATS_SCHEMA_VERSION = 2;

const MAX_TOTAL_BYTES = Math.floor(4.5 * 1024 * 1024);
const TARGET_TOTAL_BYTES = Math.floor(4.2 * 1024 * 1024);
const MAX_ACTIVE_MESSAGES_WHEN_TRIMMING = 200;
const MAX_TEXT_CHARS = 100000;
const MAX_TITLE_CHARS = 120;

const DEFAULT_MODEL_ID = "miso-unset";
const DEFAULT_CHAT_TITLE = "New Chat";
const DEFAULT_FOLDER_LABEL = "New Folder";

const storeSubscribers = new Set();

const now = () => Date.now();

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const clone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const toByteLength = (text) => {
  const value = String(text ?? "");
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
};

const estimateBytes = (value) => {
  try {
    return toByteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
};

const unique = (list = []) => {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    out.push(item);
  }
  return out;
};

const sanitizeLabel = (input, fallback = "") => {
  const raw = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const next = raw || fallback;
  return next.slice(0, MAX_TITLE_CHARS) || fallback;
};

const generateId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const generateFolderId = () => generateId("fld");
const generateChatId = () => generateId("chat");

const toChatNodeId = (chatId) => `chn-${chatId}`;

const ensureUniqueNodeId = (nodesById, preferred, prefix) => {
  if (!nodesById[preferred]) {
    return preferred;
  }

  let nextId = preferred;
  while (nodesById[nextId]) {
    nextId = `${prefix}-${Math.random().toString(16).slice(2)}`;
  }
  return nextId;
};

const trimText = (value, max = MAX_TEXT_CHARS) => {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
};

const sanitizeAttachment = (attachment) => {
  if (!isObject(attachment)) {
    return null;
  }

  const kind = attachment.kind === "link" ? "link" : "file";
  const fallbackName = kind === "link" ? "link" : "attachment";
  const name =
    trimText(String(attachment.name || fallbackName), 300) || fallbackName;
  const mimeType = attachment.mimeType
    ? trimText(String(attachment.mimeType), 200)
    : undefined;
  const ext = attachment.ext ? trimText(String(attachment.ext), 50) : undefined;
  const source = ["local", "url", "pasted"].includes(attachment.source)
    ? attachment.source
    : kind === "link"
      ? "url"
      : "local";
  const size = Number.isFinite(Number(attachment.size))
    ? Number(attachment.size)
    : undefined;

  const cleaned = {
    id:
      typeof attachment.id === "string" && attachment.id.trim()
        ? attachment.id
        : generateId("att"),
    kind,
    name,
    source,
    createdAt: Number.isFinite(Number(attachment.createdAt))
      ? Number(attachment.createdAt)
      : now(),
  };

  if (mimeType) cleaned.mimeType = mimeType;
  if (ext) cleaned.ext = ext;
  if (size != null && size >= 0) cleaned.size = size;

  if (kind === "link") {
    const url = trimText(String(attachment.url || ""), 2000);
    if (url) cleaned.url = url;
  }

  if (typeof attachment.localRef === "string" && attachment.localRef.trim()) {
    cleaned.localRef = trimText(attachment.localRef, 2000);
  }

  if (typeof attachment.checksum === "string" && attachment.checksum.trim()) {
    cleaned.checksum = trimText(attachment.checksum, 200);
  }

  return cleaned;
};

const sanitizeAttachments = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }

  const out = [];
  for (const item of list) {
    const cleaned = sanitizeAttachment(item);
    if (cleaned) out.push(cleaned);
  }
  return out;
};

const deriveChatTitle = (messages, fallback = DEFAULT_CHAT_TITLE) => {
  if (Array.isArray(messages)) {
    const userMessage = messages.find(
      (item) => item?.role === "user" && item?.content?.trim(),
    );
    if (userMessage && typeof userMessage.content === "string") {
      return sanitizeLabel(userMessage.content, fallback);
    }
  }
  return sanitizeLabel(fallback, DEFAULT_CHAT_TITLE);
};

const sanitizeModel = (model) => {
  if (typeof model === "string") {
    return { id: trimText(model, 200).trim() || DEFAULT_MODEL_ID };
  }

  if (!isObject(model)) {
    return { id: DEFAULT_MODEL_ID };
  }

  const cleaned = {
    id:
      trimText(String(model.id || DEFAULT_MODEL_ID), 200).trim() ||
      DEFAULT_MODEL_ID,
  };

  if (typeof model.provider === "string" && model.provider.trim()) {
    cleaned.provider = trimText(model.provider, 100);
  }

  if (Number.isFinite(Number(model.temperature))) {
    cleaned.temperature = Number(model.temperature);
  }

  if (Number.isFinite(Number(model.maxTokens))) {
    cleaned.maxTokens = Math.max(0, Math.floor(Number(model.maxTokens)));
  }

  return cleaned;
};

const sanitizeMessage = (message) => {
  if (!isObject(message)) {
    return null;
  }

  const role = String(message.role || "").trim();
  if (!["system", "user", "assistant"].includes(role)) {
    return null;
  }

  const createdAt = Number.isFinite(Number(message.createdAt))
    ? Number(message.createdAt)
    : now();
  const updatedAt = Number.isFinite(Number(message.updatedAt))
    ? Number(message.updatedAt)
    : createdAt;

  const cleaned = {
    id:
      typeof message.id === "string" && message.id.trim()
        ? message.id
        : generateId(role),
    role,
    content: trimText(message.content, MAX_TEXT_CHARS),
    createdAt,
    updatedAt,
  };

  if (role === "assistant") {
    cleaned.status = ["streaming", "done", "error", "cancelled"].includes(
      message.status,
    )
      ? message.status
      : "done";
  }

  if (role === "user" && Array.isArray(message.attachments)) {
    const attachments = sanitizeAttachments(message.attachments);
    if (attachments.length > 0) {
      cleaned.attachments = attachments;
    }
  }

  if (isObject(message.meta)) {
    const meta = {};

    if (typeof message.meta.model === "string" && message.meta.model.trim()) {
      meta.model = trimText(message.meta.model, 200);
    }

    if (
      typeof message.meta.requestId === "string" &&
      message.meta.requestId.trim()
    ) {
      meta.requestId = trimText(message.meta.requestId, 200);
    }

    if (isObject(message.meta.usage)) {
      const usage = {};
      const promptTokens = Number(message.meta.usage.promptTokens);
      const completionTokens = Number(message.meta.usage.completionTokens);
      const completionChars = Number(message.meta.usage.completionChars);
      if (Number.isFinite(promptTokens) && promptTokens >= 0)
        usage.promptTokens = promptTokens;
      if (Number.isFinite(completionTokens) && completionTokens >= 0)
        usage.completionTokens = completionTokens;
      if (Number.isFinite(completionChars) && completionChars >= 0)
        usage.completionChars = completionChars;
      if (Object.keys(usage).length > 0) {
        meta.usage = usage;
      }
    }

    if (isObject(message.meta.error)) {
      meta.error = {
        code: trimText(String(message.meta.error.code || "unknown"), 100),
        message: trimText(
          String(message.meta.error.message || "Unknown error"),
          2000,
        ),
      };
    }

    if (Object.keys(meta).length > 0) {
      cleaned.meta = meta;
    }
  }

  return cleaned;
};

const sanitizeMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return [];
  }

  const out = [];
  for (const message of messages) {
    const cleaned = sanitizeMessage(message);
    if (cleaned) out.push(cleaned);
  }
  return out;
};

const computeLastMessageAt = (messages, fallback = null) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return Number.isFinite(Number(fallback)) ? Number(fallback) : null;
  }

  let latest = 0;
  for (const message of messages) {
    const value = Number.isFinite(Number(message.updatedAt))
      ? Number(message.updatedAt)
      : Number(message.createdAt);
    if (Number.isFinite(value) && value > latest) {
      latest = value;
    }
  }

  return latest || null;
};

const computeChatStats = (chat) => ({
  messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
  approxBytes: estimateBytes({
    threadId: chat.threadId,
    model: chat.model,
    draft: chat.draft,
    messages: chat.messages,
  }),
});

const sanitizeDraft = (draft) => ({
  text: trimText(draft?.text || "", 20000),
  attachments: sanitizeAttachments(draft?.attachments),
  updatedAt: Number.isFinite(Number(draft?.updatedAt))
    ? Number(draft.updatedAt)
    : now(),
});

const sanitizeChatSession = (chat, fallbackId) => {
  const createdAt = Number.isFinite(Number(chat?.createdAt))
    ? Number(chat.createdAt)
    : now();
  const messages = sanitizeMessages(chat?.messages);
  const draft = sanitizeDraft(chat?.draft || {});
  const updatedAt = Number.isFinite(Number(chat?.updatedAt))
    ? Number(chat.updatedAt)
    : Math.max(createdAt, draft.updatedAt);

  const title =
    sanitizeLabel(chat?.title, "") ||
    deriveChatTitle(messages, DEFAULT_CHAT_TITLE);

  const cleaned = {
    id:
      typeof chat?.id === "string" && chat.id.trim()
        ? chat.id
        : typeof fallbackId === "string" && fallbackId.trim()
          ? fallbackId
          : generateChatId(),
    title,
    createdAt,
    updatedAt,
    lastMessageAt: computeLastMessageAt(messages, chat?.lastMessageAt),
    threadId:
      typeof chat?.threadId === "string" && chat.threadId.trim()
        ? trimText(chat.threadId, 200)
        : null,
    model: sanitizeModel(chat?.model),
    draft,
    messages,
    stats: {
      messageCount: 0,
      approxBytes: 0,
    },
  };

  cleaned.stats = computeChatStats(cleaned);
  return cleaned;
};

const createChatSession = (overrides = {}) => {
  const seed = now();
  return sanitizeChatSession(
    {
      id: overrides.id || generateChatId(),
      title: overrides.title || DEFAULT_CHAT_TITLE,
      createdAt: seed,
      updatedAt: seed,
      lastMessageAt: null,
      threadId: overrides.threadId || null,
      model: overrides.model || { id: DEFAULT_MODEL_ID },
      draft: {
        text: "",
        attachments: [],
        updatedAt: seed,
      },
      messages: [],
    },
    overrides.id,
  );
};

const createFolderNode = ({ id, label, children = [] } = {}) => {
  const stamp = now();
  return {
    id: id || generateFolderId(),
    entity: "folder",
    type: "folder",
    label: sanitizeLabel(label, DEFAULT_FOLDER_LABEL),
    children: Array.isArray(children)
      ? children.filter((v) => typeof v === "string")
      : [],
    createdAt: stamp,
    updatedAt: stamp,
  };
};

const createChatNode = ({ id, chatId, label }) => {
  const stamp = now();
  return {
    id,
    entity: "chat",
    type: "file",
    chatId,
    label: sanitizeLabel(label, DEFAULT_CHAT_TITLE),
    createdAt: stamp,
    updatedAt: stamp,
  };
};

const createEmptyStoreV2 = () => ({
  schemaVersion: CHATS_SCHEMA_VERSION,
  updatedAt: now(),
  chatsById: {},
  activeChatId: null,
  lruChatIds: [],
  tree: {
    root: [],
    nodesById: {},
    selectedNodeId: null,
    expandedFolderIds: [],
  },
  ui: {},
});

const sortChatsByUpdatedAt = (chatsById) => {
  return Object.keys(chatsById).sort(
    (a, b) =>
      Number(chatsById[b]?.updatedAt || 0) -
      Number(chatsById[a]?.updatedAt || 0),
  );
};

const makeInitialTreeFromChats = (chatsById, orderedChatIds, activeChatId) => {
  const nodesById = {};
  const root = [];

  const ordered = unique([
    ...(Array.isArray(orderedChatIds) ? orderedChatIds : []),
    ...sortChatsByUpdatedAt(chatsById),
  ]).filter((chatId) => chatsById[chatId]);

  for (const chatId of ordered) {
    const preferredId = toChatNodeId(chatId);
    const nodeId = ensureUniqueNodeId(nodesById, preferredId, "chn");
    nodesById[nodeId] = createChatNode({
      id: nodeId,
      chatId,
      label: chatsById[chatId].title,
    });
    root.push(nodeId);
  }

  const activeNodeId =
    root.find((id) => nodesById[id]?.chatId === activeChatId) ||
    root[0] ||
    null;

  return {
    root,
    nodesById,
    selectedNodeId: activeNodeId,
    expandedFolderIds: [],
  };
};

const migrateV1ToV2 = (input) => {
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

  migrated.updatedAt = Number.isFinite(Number(input?.updatedAt))
    ? Number(input.updatedAt)
    : now();
  return migrated;
};

const buildParentIndex = (tree) => {
  const parentById = {};
  for (const rootId of tree.root) {
    parentById[rootId] = { parentId: null, index: tree.root.indexOf(rootId) };
  }

  for (const [nodeId, node] of Object.entries(tree.nodesById)) {
    if (node.entity !== "folder") {
      continue;
    }
    node.children.forEach((childId, index) => {
      if (!parentById[childId]) {
        parentById[childId] = { parentId: nodeId, index };
      }
    });
  }

  return parentById;
};

const firstChatInSubtree = (tree, nodeId) => {
  const node = tree.nodesById[nodeId];
  if (!node) {
    return null;
  }

  if (node.entity === "chat") {
    return node.chatId;
  }

  if (node.entity === "folder") {
    for (const childId of node.children) {
      const found = firstChatInSubtree(tree, childId);
      if (found) return found;
    }
  }

  return null;
};

const firstChatInTree = (tree) => {
  for (const rootId of tree.root) {
    const found = firstChatInSubtree(tree, rootId);
    if (found) return found;
  }
  return null;
};

const getSiblingIds = (tree, parentFolderId) => {
  if (!parentFolderId) {
    return [...tree.root];
  }

  const parent = tree.nodesById[parentFolderId];
  if (!parent || parent.entity !== "folder") {
    return [...tree.root];
  }

  return [...parent.children];
};

const applySiblingIds = (tree, parentFolderId, siblings) => {
  if (!parentFolderId) {
    tree.root = siblings;
    return;
  }

  const parent = tree.nodesById[parentFolderId];
  if (!parent || parent.entity !== "folder") {
    tree.root = siblings;
    return;
  }

  parent.children = siblings;
};

const resolveSelectedParentFolderId = (store, preferredParentFolderId) => {
  if (preferredParentFolderId === null) {
    return null;
  }

  if (
    typeof preferredParentFolderId === "string" &&
    preferredParentFolderId.trim()
  ) {
    const node = store.tree.nodesById[preferredParentFolderId];
    if (node && node.entity === "folder") {
      return preferredParentFolderId;
    }
    return null;
  }

  const selected = store.tree.selectedNodeId
    ? store.tree.nodesById[store.tree.selectedNodeId]
    : null;
  if (!selected) {
    return null;
  }

  if (selected.entity === "folder") {
    return selected.id;
  }

  const parentById = buildParentIndex(store.tree);
  const parent = parentById[selected.id];
  return parent ? parent.parentId : null;
};

const ensureUniqueLabel = (
  store,
  parentFolderId,
  preferredLabel,
  excludeNodeId = null,
) => {
  const siblings = getSiblingIds(store.tree, parentFolderId);
  const used = new Set(
    siblings
      .filter((nodeId) => nodeId !== excludeNodeId)
      .map((nodeId) =>
        sanitizeLabel(
          store.tree.nodesById[nodeId]?.label || "",
          "",
        ).toLowerCase(),
      )
      .filter(Boolean),
  );

  const baseLabel = sanitizeLabel(preferredLabel, DEFAULT_FOLDER_LABEL);
  if (!used.has(baseLabel.toLowerCase())) {
    return baseLabel;
  }

  let index = 2;
  while (true) {
    const next = `${baseLabel} (${index})`;
    if (!used.has(next.toLowerCase())) {
      return next;
    }
    index += 1;
  }
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

const normalizeLru = (store) => {
  const ordered = unique([
    ...(Array.isArray(store.lruChatIds) ? store.lruChatIds : []),
    ...sortChatsByUpdatedAt(store.chatsById),
  ]).filter((chatId) => store.chatsById[chatId]);

  store.lruChatIds = ordered;
  touchLru(store, store.activeChatId);
};

const removeNodeFromParent = (tree, nodeId) => {
  const parentById = buildParentIndex(tree);
  const parentInfo = parentById[nodeId];
  if (!parentInfo) {
    return;
  }

  const siblings = getSiblingIds(tree, parentInfo.parentId);
  const nextSiblings = siblings.filter((id) => id !== nodeId);
  applySiblingIds(tree, parentInfo.parentId, nextSiblings);
};

const removeChatFromTreeByChatId = (tree, chatId) => {
  const entries = Object.entries(tree.nodesById);
  for (const [nodeId, node] of entries) {
    if (node.entity === "chat" && node.chatId === chatId) {
      removeNodeFromParent(tree, nodeId);
      delete tree.nodesById[nodeId];
      return nodeId;
    }
  }
  return null;
};

const ensureTreeHasNodeForChat = (store, chatId, options = {}) => {
  if (!chatId || !store.chatsById[chatId]) {
    return null;
  }

  for (const [nodeId, node] of Object.entries(store.tree.nodesById)) {
    if (node.entity === "chat" && node.chatId === chatId) {
      node.label = sanitizeLabel(
        store.chatsById[chatId].title,
        DEFAULT_CHAT_TITLE,
      );
      node.updatedAt = now();
      return nodeId;
    }
  }

  const preferredId = toChatNodeId(chatId);
  const nodeId = ensureUniqueNodeId(store.tree.nodesById, preferredId, "chn");
  store.tree.nodesById[nodeId] = createChatNode({
    id: nodeId,
    chatId,
    label: store.chatsById[chatId].title,
  });

  const parentFolderId = resolveSelectedParentFolderId(
    store,
    options.parentFolderId,
  );
  const siblings = getSiblingIds(store.tree, parentFolderId);
  applySiblingIds(store.tree, parentFolderId, [nodeId, ...siblings]);

  return nodeId;
};

const sanitizeTree = (treeInput, chatsById, activeChatId, lruChatIds) => {
  const rawNodes = isObject(treeInput?.nodesById) ? treeInput.nodesById : {};
  const provisional = {};
  const provisionalChatNodeByChatId = new Map();

  for (const [nodeId, rawNode] of Object.entries(rawNodes)) {
    if (!isObject(rawNode) || typeof nodeId !== "string" || !nodeId.trim()) {
      continue;
    }

    const entity = rawNode.entity;
    const nodeType = rawNode.type;

    if (entity === "folder" || nodeType === "folder") {
      provisional[nodeId] = {
        id: nodeId,
        entity: "folder",
        type: "folder",
        label: sanitizeLabel(rawNode.label, DEFAULT_FOLDER_LABEL),
        children: Array.isArray(rawNode.children)
          ? rawNode.children.filter((id) => typeof id === "string")
          : [],
        createdAt: Number.isFinite(Number(rawNode.createdAt))
          ? Number(rawNode.createdAt)
          : now(),
        updatedAt: Number.isFinite(Number(rawNode.updatedAt))
          ? Number(rawNode.updatedAt)
          : now(),
      };
      continue;
    }

    const chatId = typeof rawNode.chatId === "string" ? rawNode.chatId : null;
    if (
      !chatId ||
      !chatsById[chatId] ||
      provisionalChatNodeByChatId.has(chatId)
    ) {
      continue;
    }

    provisionalChatNodeByChatId.set(chatId, nodeId);
    provisional[nodeId] = {
      id: nodeId,
      entity: "chat",
      type: "file",
      chatId,
      label: sanitizeLabel(
        chatsById[chatId]?.title || rawNode.label,
        DEFAULT_CHAT_TITLE,
      ),
      createdAt: Number.isFinite(Number(rawNode.createdAt))
        ? Number(rawNode.createdAt)
        : now(),
      updatedAt: Number.isFinite(Number(rawNode.updatedAt))
        ? Number(rawNode.updatedAt)
        : now(),
    };
  }

  const normalized = {
    root: [],
    nodesById: {},
    selectedNodeId: null,
    expandedFolderIds: [],
  };

  const seen = new Set();

  const walk = (nodeId, path) => {
    if (!provisional[nodeId] || path.has(nodeId) || seen.has(nodeId)) {
      return null;
    }

    const node = provisional[nodeId];
    const nextPath = new Set(path);
    nextPath.add(nodeId);
    seen.add(nodeId);

    if (node.entity === "folder") {
      const nextChildren = [];
      for (const childId of node.children) {
        const walkedId = walk(childId, nextPath);
        if (walkedId) nextChildren.push(walkedId);
      }
      normalized.nodesById[nodeId] = {
        ...node,
        children: nextChildren,
      };
      return nodeId;
    }

    if (!chatsById[node.chatId]) {
      return null;
    }

    normalized.nodesById[nodeId] = {
      ...node,
      label: sanitizeLabel(
        chatsById[node.chatId]?.title || node.label,
        DEFAULT_CHAT_TITLE,
      ),
    };
    return nodeId;
  };

  const rawRoot = Array.isArray(treeInput?.root)
    ? treeInput.root.filter((id) => typeof id === "string")
    : [];
  for (const nodeId of rawRoot) {
    const walked = walk(nodeId, new Set());
    if (walked) normalized.root.push(walked);
  }

  const orderedChats = unique([
    ...(Array.isArray(lruChatIds) ? lruChatIds : []),
    ...sortChatsByUpdatedAt(chatsById),
  ]).filter((chatId) => chatsById[chatId]);

  const mappedChatIds = new Set();
  for (const node of Object.values(normalized.nodesById)) {
    if (node.entity === "chat") {
      mappedChatIds.add(node.chatId);
    }
  }

  for (const chatId of orderedChats) {
    if (mappedChatIds.has(chatId)) {
      continue;
    }

    const preferred = toChatNodeId(chatId);
    const nodeId = ensureUniqueNodeId(normalized.nodesById, preferred, "chn");
    normalized.nodesById[nodeId] = createChatNode({
      id: nodeId,
      chatId,
      label: chatsById[chatId].title,
    });
    normalized.root.push(nodeId);
    mappedChatIds.add(chatId);
  }

  const selectedRaw =
    typeof treeInput?.selectedNodeId === "string"
      ? treeInput.selectedNodeId
      : null;
  const activeNodeId = Object.keys(normalized.nodesById).find(
    (nodeId) =>
      normalized.nodesById[nodeId]?.entity === "chat" &&
      normalized.nodesById[nodeId]?.chatId === activeChatId,
  );

  normalized.selectedNodeId =
    (selectedRaw && normalized.nodesById[selectedRaw] && selectedRaw) ||
    activeNodeId ||
    normalized.root[0] ||
    null;

  normalized.expandedFolderIds = Array.isArray(treeInput?.expandedFolderIds)
    ? unique(
        treeInput.expandedFolderIds.filter(
          (nodeId) =>
            normalized.nodesById[nodeId] &&
            normalized.nodesById[nodeId].entity === "folder",
        ),
      )
    : [];

  return normalized;
};

const normalizeStore = (input) => {
  const migrated =
    input?.schemaVersion === CHATS_SCHEMA_VERSION
      ? input
      : migrateV1ToV2(input);
  const next = createEmptyStoreV2();

  if (isObject(migrated?.ui)) {
    next.ui = migrated.ui;
  }

  const sourceChats = isObject(migrated?.chatsById) ? migrated.chatsById : {};
  for (const [chatId, chat] of Object.entries(sourceChats)) {
    const cleaned = sanitizeChatSession(chat, chatId);
    next.chatsById[cleaned.id] = cleaned;
  }

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
    next.tree.selectedNodeId = activeNodeId || next.tree.root[0] || null;
  }

  if (
    next.tree.selectedNodeId &&
    !next.tree.nodesById[next.tree.selectedNodeId]
  ) {
    next.tree.selectedNodeId = activeNodeId || next.tree.root[0] || null;
  }

  normalizeLru(next);

  next.updatedAt = Number.isFinite(Number(migrated?.updatedAt))
    ? Math.max(Number(migrated.updatedAt), now())
    : now();

  next.schemaVersion = CHATS_SCHEMA_VERSION;
  return next;
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

const findFallbackChatIdNearContainer = (tree, parentFolderId, startIndex) => {
  const siblings = getSiblingIds(tree, parentFolderId);

  for (let i = startIndex; i < siblings.length; i += 1) {
    const found = firstChatInSubtree(tree, siblings[i]);
    if (found) return found;
  }

  for (let i = startIndex - 1; i >= 0; i -= 1) {
    const found = firstChatInSubtree(tree, siblings[i]);
    if (found) return found;
  }

  return firstChatInTree(tree);
};

const collectSubtreeNodeIds = (tree, nodeId, bucket = []) => {
  const node = tree.nodesById[nodeId];
  if (!node) {
    return bucket;
  }

  bucket.push(nodeId);
  if (node.entity === "folder") {
    node.children.forEach((childId) =>
      collectSubtreeNodeIds(tree, childId, bucket),
    );
  }
  return bucket;
};

const buildTreeNodeLookupByChatId = (tree) => {
  const map = {};
  for (const [nodeId, node] of Object.entries(tree.nodesById)) {
    if (node.entity === "chat") {
      map[node.chatId] = nodeId;
    }
  }
  return map;
};

const sanitizeExplorerLabel = (label, fallback) =>
  sanitizeLabel(label, fallback);

export const sanitizeExplorerReorderPayload = ({
  data,
  root,
  currentNodesById,
}) => {
  const payloadData = isObject(data) ? data : {};
  const payloadRoot = Array.isArray(root)
    ? root.filter((id) => typeof id === "string")
    : [];
  const sanitizedNodes = {};

  for (const [nodeId, baseNode] of Object.entries(currentNodesById || {})) {
    const payloadNode = payloadData[nodeId];
    if (baseNode.entity === "folder") {
      const rawChildren = Array.isArray(payloadNode?.children)
        ? payloadNode.children
        : baseNode.children;
      sanitizedNodes[nodeId] = {
        ...baseNode,
        label: sanitizeExplorerLabel(payloadNode?.label, baseNode.label),
        children: rawChildren.filter(
          (childId) =>
            typeof childId === "string" &&
            currentNodesById[childId] &&
            childId !== nodeId,
        ),
      };
      continue;
    }

    sanitizedNodes[nodeId] = {
      ...baseNode,
      label: sanitizeExplorerLabel(payloadNode?.label, baseNode.label),
    };
  }

  const sanitizedRoot = unique(
    payloadRoot.filter((nodeId) => sanitizedNodes[nodeId]),
  );
  return {
    nodesById: sanitizedNodes,
    root: sanitizedRoot,
  };
};

export const buildExplorerFromTree = (tree, chatsById, handlers = {}) => {
  const nodesById = isObject(tree?.nodesById) ? tree.nodesById : {};
  const root = Array.isArray(tree?.root) ? tree.root : [];

  const data = {};
  for (const [nodeId, node] of Object.entries(nodesById)) {
    const selected = handlers.selectedNodeId === nodeId;

    if (node.entity === "folder") {
      data[nodeId] = {
        type: "folder",
        entity: "folder",
        label: sanitizeLabel(node.label, DEFAULT_FOLDER_LABEL),
        children: Array.isArray(node.children) ? node.children : [],
        prefix_icon: "folder",
        style: selected
          ? {
              opacity: 1,
            }
          : undefined,
        on_click: () => {
          if (typeof handlers.onSelect === "function") {
            handlers.onSelect(nodeId);
          }
        },
        on_double_click: () => {
          if (typeof handlers.onStartRename === "function") {
            handlers.onStartRename(node);
          }
        },
        on_context_menu: (_node, event) => {
          if (typeof handlers.onContextMenu === "function") {
            handlers.onContextMenu(node, event);
          }
        },
      };
      continue;
    }

    const title = sanitizeLabel(
      chatsById?.[node.chatId]?.title || node.label,
      DEFAULT_CHAT_TITLE,
    );
    data[nodeId] = {
      type: "file",
      entity: "chat",
      chatId: node.chatId,
      label: title,
      prefix_icon: "chat",
      style: selected
        ? {
            opacity: 1,
          }
        : undefined,
      on_click: () => {
        if (typeof handlers.onSelect === "function") {
          handlers.onSelect(nodeId);
        }
      },
      on_double_click: () => {
        if (typeof handlers.onStartRename === "function") {
          handlers.onStartRename(node);
        }
      },
      on_context_menu: (_node, event) => {
        if (typeof handlers.onContextMenu === "function") {
          handlers.onContextMenu(node, event);
        }
      },
    };
  }

  return {
    data,
    root: [...root],
    defaultExpanded: Array.isArray(tree?.expandedFolderIds)
      ? tree.expandedFolderIds
      : [],
  };
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
      const folderId = ensureUniqueNodeId(
        store.tree.nodesById,
        folder.id,
        "fld",
      );
      store.tree.nodesById[folderId] = {
        ...folder,
        id: folderId,
      };
      createdFolderId = folderId;

      const siblings = getSiblingIds(store.tree, parentFolderId);
      applySiblingIds(store.tree, parentFolderId, [folderId, ...siblings]);
      store.tree.selectedNodeId = folderId;
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
      const chat = createChatSession({
        title: sanitizeLabel(params.title, DEFAULT_CHAT_TITLE),
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

export const selectTreeNode = ({ nodeId } = {}, options = {}) => {
  const source = options.source || "unknown";

  const next = withStore(
    (store) => {
      const target =
        typeof nodeId === "string" ? store.tree.nodesById[nodeId] : null;
      if (!target) {
        store.tree.selectedNodeId = null;
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
            map[store.activeChatId] || store.tree.root[0] || null;
        } else {
          store.tree.selectedNodeId = store.tree.root[0] || null;
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
      const candidate = clone(existing) || existing;
      const updated =
        typeof updater === "function" ? updater(candidate) : candidate;
      const cleaned = sanitizeChatSession(updated || candidate, chatId);

      store.chatsById[chatId] = cleaned;
      touchLru(store, chatId);

      const nodeId = ensureTreeHasNodeForChat(store, chatId, {
        parentFolderId: null,
      });
      if (nodeId && store.tree.nodesById[nodeId]) {
        store.tree.nodesById[nodeId].label = sanitizeLabel(
          cleaned.title,
          DEFAULT_CHAT_TITLE,
        );
        store.tree.nodesById[nodeId].updatedAt = now();
      }

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
        lastMessageAt: computeLastMessageAt(nextMessages, chat.lastMessageAt),
        updatedAt: now(),
      };
    },
    { ...options, type: "chat_update_messages" },
  );
};

export const setChatThreadId = (chatId, threadId, options = {}) => {
  return updateChatSessionById(
    chatId,
    (chat) => ({
      ...chat,
      threadId:
        typeof threadId === "string" && threadId.trim()
          ? threadId.trim()
          : null,
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
      model: sanitizeModel(model),
      updatedAt: now(),
    }),
    { ...options, type: "chat_update_model" },
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
      updatedAt: now(),
    }),
    { ...options, type: "chat_rename" },
  );
};

export const createChatMessageAttachment = (attachment) =>
  sanitizeAttachment(attachment);

export const chatsStorageConstants = {
  key: CHATS_STORAGE_KEY,
  schemaVersion: CHATS_SCHEMA_VERSION,
};
