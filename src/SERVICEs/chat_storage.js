const CHATS_STORAGE_KEY = "chats";
const CHATS_SCHEMA_VERSION = 1;

const MAX_TOTAL_BYTES = Math.floor(4.5 * 1024 * 1024);
const TARGET_TOTAL_BYTES = Math.floor(4.2 * 1024 * 1024);
const MAX_ACTIVE_MESSAGES_WHEN_TRIMMING = 200;
const MAX_TEXT_CHARS = 100000;
const MAX_TITLE_CHARS = 120;

const DEFAULT_MODEL_ID = "miso-unset";

const now = () => Date.now();

const isObject = (value) => value != null && typeof value === "object" && !Array.isArray(value);

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

const generateId = (prefix) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const trimText = (value, max = MAX_TEXT_CHARS) => {
  const text = typeof value === "string" ? value : String(value ?? "");
  if (text.length <= max) {
    return text;
  }
  return text.slice(0, max);
};

const sanitizeAttachment = (attachment) => {
  if (!isObject(attachment)) {
    return null;
  }

  const kind = attachment.kind === "link" ? "link" : "file";
  const fallbackName = kind === "link" ? "link" : "attachment";
  const name = trimText(String(attachment.name || fallbackName), 300) || fallbackName;
  const mimeType = attachment.mimeType ? trimText(String(attachment.mimeType), 200) : undefined;
  const ext = attachment.ext ? trimText(String(attachment.ext), 50) : undefined;
  const source = ["local", "url", "pasted"].includes(attachment.source)
    ? attachment.source
    : kind === "link"
      ? "url"
      : "local";
  const size = Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : undefined;

  const cleaned = {
    id: typeof attachment.id === "string" && attachment.id.trim() ? attachment.id : generateId("att"),
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
    if (url) {
      cleaned.url = url;
    }
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
    if (cleaned) {
      out.push(cleaned);
    }
  }
  return out;
};

const sanitizeMessage = (message) => {
  if (!isObject(message)) {
    return null;
  }

  const role = String(message.role || "").trim();
  if (!["system", "user", "assistant"].includes(role)) {
    return null;
  }

  const content = trimText(message.content, MAX_TEXT_CHARS);
  const createdAt = Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : now();
  const updatedAt = Number.isFinite(Number(message.updatedAt)) ? Number(message.updatedAt) : createdAt;

  const cleaned = {
    id: typeof message.id === "string" && message.id.trim() ? message.id : generateId(role),
    role,
    content,
    createdAt,
    updatedAt,
  };

  if (role === "assistant") {
    if (["streaming", "done", "error", "cancelled"].includes(message.status)) {
      cleaned.status = message.status;
    } else {
      cleaned.status = "done";
    }
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
    if (typeof message.meta.requestId === "string" && message.meta.requestId.trim()) {
      meta.requestId = trimText(message.meta.requestId, 200);
    }
    if (isObject(message.meta.usage)) {
      const usage = {};
      const promptTokens = Number(message.meta.usage.promptTokens);
      const completionTokens = Number(message.meta.usage.completionTokens);
      const completionChars = Number(message.meta.usage.completionChars);
      if (Number.isFinite(promptTokens) && promptTokens >= 0) usage.promptTokens = promptTokens;
      if (Number.isFinite(completionTokens) && completionTokens >= 0)
        usage.completionTokens = completionTokens;
      if (Number.isFinite(completionChars) && completionChars >= 0)
        usage.completionChars = completionChars;
      if (Object.keys(usage).length > 0) {
        meta.usage = usage;
      }
    }
    if (isObject(message.meta.error)) {
      const code = trimText(String(message.meta.error.code || "unknown"), 100);
      const msg = trimText(String(message.meta.error.message || "Unknown error"), 2000);
      meta.error = {
        code,
        message: msg,
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
    if (cleaned) {
      out.push(cleaned);
    }
  }
  return out;
};

const deriveChatTitle = (messages, fallback = "New Chat") => {
  if (Array.isArray(messages)) {
    const userMessage = messages.find((item) => item?.role === "user" && item?.content?.trim());
    if (userMessage && typeof userMessage.content === "string") {
      return trimText(userMessage.content.replace(/\s+/g, " ").trim(), MAX_TITLE_CHARS);
    }
  }
  return trimText(fallback, MAX_TITLE_CHARS) || "New Chat";
};

const sanitizeModel = (model) => {
  if (typeof model === "string") {
    const id = trimText(model, 200).trim() || DEFAULT_MODEL_ID;
    return { id };
  }

  if (!isObject(model)) {
    return { id: DEFAULT_MODEL_ID };
  }

  const id = trimText(String(model.id || DEFAULT_MODEL_ID), 200).trim() || DEFAULT_MODEL_ID;
  const cleaned = { id };

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

const computeLastMessageAt = (messages, fallback = null) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return Number.isFinite(Number(fallback)) ? Number(fallback) : null;
  }

  let latest = 0;
  for (const message of messages) {
    const time = Number.isFinite(Number(message.updatedAt))
      ? Number(message.updatedAt)
      : Number(message.createdAt);
    if (Number.isFinite(time) && time > latest) {
      latest = time;
    }
  }

  return latest || null;
};

const computeChatStats = (chat) => {
  const base = {
    messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
    approxBytes: estimateBytes({
      threadId: chat.threadId,
      model: chat.model,
      draft: chat.draft,
      messages: chat.messages,
    }),
  };

  return base;
};

const sanitizeDraft = (draft) => {
  const cleanedDraft = {
    text: trimText(draft?.text || "", 20000),
    attachments: sanitizeAttachments(draft?.attachments),
    updatedAt: Number.isFinite(Number(draft?.updatedAt)) ? Number(draft.updatedAt) : now(),
  };

  return cleanedDraft;
};

const sanitizeChatSession = (chat, fallbackId) => {
  const createdAt = Number.isFinite(Number(chat?.createdAt)) ? Number(chat.createdAt) : now();
  const messages = sanitizeMessages(chat?.messages);
  const draft = sanitizeDraft(chat?.draft || {});
  const updatedAt = Number.isFinite(Number(chat?.updatedAt))
    ? Number(chat.updatedAt)
    : Math.max(createdAt, draft.updatedAt);

  const cleaned = {
    id:
      typeof chat?.id === "string" && chat.id.trim()
        ? chat.id
        : typeof fallbackId === "string" && fallbackId.trim()
          ? fallbackId
          : generateId("chat"),
    title: trimText(chat?.title || "", MAX_TITLE_CHARS) || deriveChatTitle(messages),
    createdAt,
    updatedAt,
    lastMessageAt: computeLastMessageAt(messages, chat?.lastMessageAt),
    threadId:
      typeof chat?.threadId === "string" && chat.threadId.trim() ? trimText(chat.threadId, 200) : null,
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
  const seedTime = now();
  return sanitizeChatSession(
    {
      id: overrides.id || generateId("chat"),
      title: overrides.title || "New Chat",
      createdAt: seedTime,
      updatedAt: seedTime,
      lastMessageAt: null,
      threadId: overrides.threadId || null,
      model: overrides.model || { id: DEFAULT_MODEL_ID },
      draft: {
        text: "",
        attachments: [],
        updatedAt: seedTime,
      },
      messages: [],
    },
    overrides.id,
  );
};

const createEmptyStore = () => ({
  schemaVersion: CHATS_SCHEMA_VERSION,
  updatedAt: now(),
  activeChatId: null,
  chatOrder: [],
  chatsById: {},
  ui: {},
});

const touchChatOrder = (store, chatId) => {
  const order = Array.isArray(store.chatOrder) ? store.chatOrder : [];
  const filtered = order.filter((id) => id !== chatId && store.chatsById[id]);
  store.chatOrder = [chatId, ...filtered];
};

const ensureActiveChat = (store) => {
  const validIds = Object.keys(store.chatsById);

  if (validIds.length === 0) {
    const chat = createChatSession();
    store.chatsById[chat.id] = chat;
    store.activeChatId = chat.id;
    store.chatOrder = [chat.id];
    return chat;
  }

  const uniqueOrdered = [];
  const seen = new Set();
  const pushOrdered = (id) => {
    if (!id || seen.has(id) || !store.chatsById[id]) {
      return;
    }
    seen.add(id);
    uniqueOrdered.push(id);
  };

  if (Array.isArray(store.chatOrder)) {
    for (const id of store.chatOrder) {
      pushOrdered(id);
    }
  }

  validIds
    .sort((a, b) => {
      const aTime = Number(store.chatsById[a]?.updatedAt || 0);
      const bTime = Number(store.chatsById[b]?.updatedAt || 0);
      return bTime - aTime;
    })
    .forEach(pushOrdered);

  store.chatOrder = uniqueOrdered;

  if (!store.activeChatId || !store.chatsById[store.activeChatId]) {
    store.activeChatId = store.chatOrder[0] || null;
  }

  if (!store.activeChatId) {
    const chat = createChatSession();
    store.chatsById[chat.id] = chat;
    store.activeChatId = chat.id;
    touchChatOrder(store, chat.id);
    return chat;
  }

  touchChatOrder(store, store.activeChatId);
  return store.chatsById[store.activeChatId];
};

const normalizeStore = (input) => {
  const base = createEmptyStore();

  if (isObject(input?.ui)) {
    base.ui = input.ui;
  }

  const sourceChats = isObject(input?.chatsById) ? input.chatsById : {};
  for (const [id, chat] of Object.entries(sourceChats)) {
    const cleaned = sanitizeChatSession(chat, id);
    base.chatsById[cleaned.id] = cleaned;
  }

  base.chatOrder = Array.isArray(input?.chatOrder)
    ? input.chatOrder.filter((id) => typeof id === "string")
    : [];

  base.activeChatId =
    typeof input?.activeChatId === "string" && input.activeChatId.trim()
      ? input.activeChatId
      : null;

  base.updatedAt = Number.isFinite(Number(input?.updatedAt)) ? Number(input.updatedAt) : now();
  base.schemaVersion = CHATS_SCHEMA_VERSION;

  const active = ensureActiveChat(base);
  base.updatedAt = Math.max(base.updatedAt, active.updatedAt, now());

  return base;
};

const readRawStore = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return createEmptyStore();
  }

  try {
    const raw = window.localStorage.getItem(CHATS_STORAGE_KEY);
    if (!raw) {
      return createEmptyStore();
    }
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch {
    return createEmptyStore();
  }
};

const dropLeastRecentlyUsedChats = (store) => {
  let totalBytes = estimateBytes(store);

  while (totalBytes > TARGET_TOTAL_BYTES) {
    const removableId = [...store.chatOrder].reverse().find((id) => id !== store.activeChatId);
    if (!removableId) {
      break;
    }

    delete store.chatsById[removableId];
    store.chatOrder = store.chatOrder.filter((id) => id !== removableId);
    totalBytes = estimateBytes(store);
  }

  if (totalBytes > MAX_TOTAL_BYTES && store.activeChatId && store.chatsById[store.activeChatId]) {
    const activeChat = store.chatsById[store.activeChatId];
    if (activeChat.messages.length > MAX_ACTIVE_MESSAGES_WHEN_TRIMMING) {
      activeChat.messages = activeChat.messages.slice(-MAX_ACTIVE_MESSAGES_WHEN_TRIMMING);
      activeChat.lastMessageAt = computeLastMessageAt(activeChat.messages, activeChat.lastMessageAt);
      activeChat.updatedAt = now();
      activeChat.stats = computeChatStats(activeChat);
      totalBytes = estimateBytes(store);
    }
  }

  return store;
};

const writeStore = (store) => {
  const normalized = normalizeStore(store);
  const bounded = dropLeastRecentlyUsedChats(normalized);

  if (typeof window === "undefined" || !window.localStorage) {
    return bounded;
  }

  try {
    window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(bounded));
    return bounded;
  } catch {
    // Final fallback: keep only active chat.
    const activeId = bounded.activeChatId;
    const fallback = createEmptyStore();

    if (activeId && bounded.chatsById[activeId]) {
      fallback.chatsById[activeId] = bounded.chatsById[activeId];
      fallback.activeChatId = activeId;
      fallback.chatOrder = [activeId];
    }

    const recovered = normalizeStore(fallback);

    try {
      window.localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(recovered));
    } catch {
      // swallow persist failure to prevent chat UI crash
    }

    return recovered;
  }
};

const withStore = (updater) => {
  const current = readRawStore();
  const nextCandidate = typeof updater === "function" ? updater(clone(current) || current) : current;
  const next = normalizeStore(nextCandidate || current);
  next.updatedAt = now();
  return writeStore(next);
};

const updateChatSession = (chatId, updater) => {
  if (typeof chatId !== "string" || !chatId.trim()) {
    return null;
  }

  const result = withStore((store) => {
    const existing = sanitizeChatSession(store.chatsById[chatId] || { id: chatId }, chatId);
    const candidate = clone(existing) || existing;
    const updated = typeof updater === "function" ? updater(candidate) : candidate;
    const cleaned = sanitizeChatSession(updated || candidate, chatId);
    cleaned.updatedAt = now();
    cleaned.lastMessageAt = computeLastMessageAt(cleaned.messages, cleaned.lastMessageAt);
    cleaned.stats = computeChatStats(cleaned);

    store.chatsById[chatId] = cleaned;
    store.activeChatId = chatId;
    touchChatOrder(store, chatId);

    return store;
  });

  const activeId = result.activeChatId;
  if (!activeId || !result.chatsById[activeId]) {
    return null;
  }

  return clone(result.chatsById[activeId]);
};

export const bootstrapChatsStore = () => {
  const persisted = writeStore(readRawStore());
  const active = persisted.activeChatId ? persisted.chatsById[persisted.activeChatId] : null;
  return clone(active) || createChatSession();
};

export const updateChatDraft = (chatId, patch = {}) => {
  return updateChatSession(chatId, (chat) => {
    const nextDraft = {
      ...chat.draft,
      ...patch,
      updatedAt: now(),
    };

    return {
      ...chat,
      draft: nextDraft,
    };
  });
};

export const setChatMessages = (chatId, messages) => {
  return updateChatSession(chatId, (chat) => {
    return {
      ...chat,
      messages,
      updatedAt: now(),
      lastMessageAt: computeLastMessageAt(messages, chat.lastMessageAt),
    };
  });
};

export const setChatThreadId = (chatId, threadId) => {
  return updateChatSession(chatId, (chat) => {
    return {
      ...chat,
      threadId: typeof threadId === "string" && threadId.trim() ? threadId.trim() : null,
      updatedAt: now(),
    };
  });
};

export const setChatModel = (chatId, model) => {
  return updateChatSession(chatId, (chat) => {
    return {
      ...chat,
      model: sanitizeModel(model),
      updatedAt: now(),
    };
  });
};

export const createChatMessageAttachment = (attachment) => {
  return sanitizeAttachment(attachment);
};

export const chatsStorageConstants = {
  key: CHATS_STORAGE_KEY,
  schemaVersion: CHATS_SCHEMA_VERSION,
};
