import { getDefaultToolkitSelection } from "../default_toolkit_store";
import {
  DEFAULT_CHAT_TITLE,
  DEFAULT_MODEL_ID,
  HOUR_MS,
  DAY_MS,
  MONTH_MS,
  MAX_SELECTED_TOOLKITS,
  MAX_TEXT_CHARS,
  MAX_TITLE_CHARS,
  MAX_TOOLKIT_ID_CHARS,
  MINUTE_MS,
  WEEK_MS,
  YEAR_MS,
  generateChatId,
  generateId,
  now,
} from "./chat_storage_constants";
import { sanitizeSystemPromptSections } from "../system_prompt_sections";

export const isValidTimestamp = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0;

export const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

export const clone = (value) => {
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

export const estimateBytes = (value) => {
  try {
    return toByteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
};

export const unique = (list = []) => {
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

export const sanitizeLabel = (input, fallback = "") => {
  const raw = String(input ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const next = raw || fallback;
  return next.slice(0, MAX_TITLE_CHARS) || fallback;
};

export const trimText = (value, max = MAX_TEXT_CHARS) => {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text.length > max ? text.slice(0, max) : text;
};

export const formatRelativeAgeShort = (value, referenceNow = now()) => {
  const targetMs = Number(value);
  if (!Number.isFinite(targetMs) || targetMs <= 0) {
    return "";
  }

  const baseMs = Number.isFinite(Number(referenceNow))
    ? Number(referenceNow)
    : now();
  const elapsed = Math.max(0, baseMs - targetMs);

  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h`;
  }
  if (elapsed < WEEK_MS) {
    return `${Math.floor(elapsed / DAY_MS)}d`;
  }
  if (elapsed < MONTH_MS) {
    return `${Math.floor(elapsed / WEEK_MS)}w`;
  }
  if (elapsed < YEAR_MS) {
    return `${Math.floor(elapsed / MONTH_MS)}mo`;
  }
  return `${Math.floor(elapsed / YEAR_MS)}y`;
};

export const sanitizeAttachment = (attachment) => {
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

export const sanitizeAttachments = (list) => {
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

export const deriveChatTitle = (messages, fallback = DEFAULT_CHAT_TITLE) => {
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

export const sanitizeModel = (model) => {
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

export const sanitizeSelectedToolkits = (selectedToolkits) => {
  if (!Array.isArray(selectedToolkits)) {
    return [];
  }

  return unique(
    selectedToolkits
      .map((item) =>
        typeof item === "string"
          ? trimText(item.trim(), MAX_TOOLKIT_ID_CHARS)
          : "",
      )
      .filter(Boolean),
  ).slice(0, MAX_SELECTED_TOOLKITS);
};

export const sanitizeSelectedWorkspaceIds = (ids) => {
  if (!Array.isArray(ids)) {
    return [];
  }

  return unique(
    ids
      .map((item) =>
        typeof item === "string" ? item.trim().slice(0, 200) : "",
      )
      .filter(Boolean),
  ).slice(0, 20);
};

export const sanitizeSystemPromptOverrides = (value) =>
  sanitizeSystemPromptSections(value, {
    allowNull: true,
    keepEmptyStrings: false,
  });

export const sanitizeMessage = (message) => {
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

    if (Array.isArray(message.traceFrames) && message.traceFrames.length > 0) {
      cleaned.traceFrames = message.traceFrames
        .map((frame) => {
          if (!isObject(frame)) return null;
          const f = {
            seq: Number.isFinite(Number(frame.seq)) ? Number(frame.seq) : 0,
            ts: Number.isFinite(Number(frame.ts)) ? Number(frame.ts) : 0,
            type: trimText(String(frame.type || ""), 64),
            stage: trimText(String(frame.stage || ""), 64),
          };
          if (Number.isFinite(Number(frame.iteration))) {
            f.iteration = Number(frame.iteration);
          }
          if (isObject(frame.payload)) {
            const p = clone(frame.payload);
            if (p) {
              if (typeof p.content === "string")
                p.content = trimText(p.content, 8000);
              if (typeof p.text === "string") p.text = trimText(p.text, 8000);
              if (typeof p.message === "string")
                p.message = trimText(p.message, 2000);
              if (typeof p.reasoning === "string")
                p.reasoning = trimText(p.reasoning, 8000);
              if (typeof p.observation === "string")
                p.observation = trimText(p.observation, 8000);
              if (typeof p.result === "string")
                p.result = trimText(p.result, 8000);
              if (typeof p.delta === "string")
                p.delta = trimText(p.delta, 2000);
              f.payload = p;
            }
          }
          return f;
        })
        .filter(Boolean);

      if (cleaned.traceFrames.length === 0) {
        delete cleaned.traceFrames;
      }
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

    if (
      typeof message.meta.requestId === "string" &&
      message.meta.requestId.trim()
    ) {
      meta.requestId = trimText(message.meta.requestId, 200);
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

export const sanitizeMessages = (messages) => {
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

export const computeLastMessageAt = (messages, fallback = null) => {
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

export const computeChatStats = (chat) => ({
  messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0,
  approxBytes: estimateBytes({
    threadId: chat.threadId,
    model: chat.model,
    selectedToolkits: chat.selectedToolkits,
    systemPromptOverrides: chat.systemPromptOverrides,
    draft: chat.draft,
    messages: chat.messages,
  }),
});

export const sanitizeDraft = (draft) => ({
  text: trimText(draft?.text || "", 20000),
  attachments: sanitizeAttachments(draft?.attachments),
  updatedAt: Number.isFinite(Number(draft?.updatedAt))
    ? Number(draft.updatedAt)
    : now(),
});

export const sanitizeChatSession = (chat, fallbackId) => {
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
    selectedToolkits: sanitizeSelectedToolkits(chat?.selectedToolkits),
    selectedWorkspaceIds: sanitizeSelectedWorkspaceIds(
      chat?.selectedWorkspaceIds,
    ),
    systemPromptOverrides: sanitizeSystemPromptOverrides(
      chat?.systemPromptOverrides,
    ),
    draft,
    messages,
    isTransientNewChat: chat?.isTransientNewChat === true,
    hasUnreadGeneratedReply: chat?.hasUnreadGeneratedReply === true,
    stats: {
      messageCount: 0,
      approxBytes: 0,
    },
  };

  cleaned.stats = computeChatStats(cleaned);
  return cleaned;
};

export const createChatSession = (overrides = {}) => {
  const seed = now();
  const toolkits =
    Array.isArray(overrides.selectedToolkits) &&
    overrides.selectedToolkits.length > 0
      ? overrides.selectedToolkits
      : getDefaultToolkitSelection("global");

  return sanitizeChatSession(
    {
      id: overrides.id || generateChatId(),
      title: overrides.title || DEFAULT_CHAT_TITLE,
      createdAt: seed,
      updatedAt: seed,
      lastMessageAt: null,
      threadId: overrides.threadId || null,
      model: overrides.model || { id: DEFAULT_MODEL_ID },
      selectedToolkits: sanitizeSelectedToolkits(toolkits),
      selectedWorkspaceIds: sanitizeSelectedWorkspaceIds(
        overrides.selectedWorkspaceIds,
      ),
      systemPromptOverrides: sanitizeSystemPromptOverrides(
        overrides.systemPromptOverrides,
      ),
      draft: {
        text: "",
        attachments: [],
        updatedAt: seed,
      },
      messages: [],
      isTransientNewChat: overrides.isTransientNewChat === true,
    },
    overrides.id,
  );
};
