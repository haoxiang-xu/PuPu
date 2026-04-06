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

export const DEFAULT_CHAT_KIND = "default";
export const CHARACTER_CHAT_KIND = "character";
export const DEFAULT_CHARACTER_THREAD_ID = "main";
export const DEFAULT_AGENT_ORCHESTRATION = Object.freeze({
  mode: "default",
});

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

export const sanitizeAgentOrchestration = (agentOrchestration) => {
  if (!isObject(agentOrchestration)) {
    return { ...DEFAULT_AGENT_ORCHESTRATION };
  }

  const mode =
    typeof agentOrchestration.mode === "string" &&
    ["default", "developer_waiting_approval"].includes(
      agentOrchestration.mode.trim(),
    )
      ? agentOrchestration.mode.trim()
      : DEFAULT_AGENT_ORCHESTRATION.mode;

  return { mode };
};

const TOOLKIT_ID_ALIASES = Object.freeze({
  workspace: "workspace_toolkit",
  workspace_toolkit: "workspace_toolkit",
  access_workspace_toolkit: "workspace_toolkit",
  workspacetoolkit: "workspace_toolkit",
  WorkspaceToolkit: "workspace_toolkit",
  terminal: "terminal_toolkit",
  terminal_toolkit: "terminal_toolkit",
  run_terminal_toolkit: "terminal_toolkit",
  terminaltoolkit: "terminal_toolkit",
  TerminalToolkit: "terminal_toolkit",
  core: "core",
  core_toolkit: "core",
  coretoolkit: "core",
  CoreToolkit: "core",
  code: "core",
  code_toolkit: "core",
  codetoolkit: "core",
  CodeToolkit: "core",
  ask_user: "core",
  ask_user_toolkit: "core",
  "ask-user-toolkit": "core",
  interaction_toolkit: "core",
  "interaction-toolkit": "core",
  askusertoolkit: "core",
  AskUserToolkit: "core",
  external_api: "external_api",
  external_api_toolkit: "external_api",
  externalapitoolkit: "external_api",
  ExternalAPIToolkit: "external_api",
});

const REMOVED_TOOLKIT_IDS = new Set(["mcp", "mcptoolkit"]);

const normalizeSelectedToolkitId = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = trimText(value.trim(), MAX_TOOLKIT_ID_CHARS);
  if (!trimmed) {
    return "";
  }

  const lowered = trimmed.toLowerCase();
  if (REMOVED_TOOLKIT_IDS.has(lowered)) {
    return "";
  }

  return TOOLKIT_ID_ALIASES[trimmed] || TOOLKIT_ID_ALIASES[lowered] || trimmed;
};

export const sanitizeSelectedToolkits = (selectedToolkits) => {
  if (!Array.isArray(selectedToolkits)) {
    return [];
  }

  return unique(
    selectedToolkits
      .map((item) => normalizeSelectedToolkitId(item))
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

export const sanitizeChatKind = (value) =>
  value === CHARACTER_CHAT_KIND ? CHARACTER_CHAT_KIND : DEFAULT_CHAT_KIND;

export const sanitizeCharacterId = (value) =>
  typeof value === "string" && value.trim()
    ? trimText(value.trim(), 200)
    : "";

export const sanitizeCharacterSessionKeyComponent = (
  value,
  fallback = "default",
) => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
};

export const buildCharacterMemorySessionId = (characterId, threadId = "main") =>
  `character_${sanitizeCharacterSessionKeyComponent(characterId, "character")}__dm__${sanitizeCharacterSessionKeyComponent(threadId, "main")}`;

export const sanitizeCharacterName = (value) =>
  sanitizeLabel(value, "").slice(0, MAX_TITLE_CHARS);

export const sanitizeCharacterAvatar = (value) => {
  if (!isObject(value)) {
    return null;
  }

  const cleaned = {};
  const stringFields = [
    "url",
    "absolute_path",
    "relative_path",
    "data_url",
    "mime_type",
    "sha256",
  ];
  for (const field of stringFields) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      continue;
    }
    cleaned[field] = trimText(value[field].trim(), 4000);
  }

  return Object.keys(cleaned).length > 0 ? cleaned : null;
};

export const isCharacterChatSession = (chat) =>
  sanitizeChatKind(chat?.kind) === CHARACTER_CHAT_KIND &&
  Boolean(sanitizeCharacterId(chat?.characterId));

const sanitizeTraceFrame = (frame) => {
  if (!isObject(frame)) return null;
  const cleanedFrame = {
    seq: Number.isFinite(Number(frame.seq)) ? Number(frame.seq) : 0,
    ts: Number.isFinite(Number(frame.ts)) ? Number(frame.ts) : 0,
    run_id: typeof frame.run_id === "string" ? frame.run_id : "",
    type: trimText(String(frame.type || ""), 64),
  };
  if (Number.isFinite(Number(frame.iteration))) {
    cleanedFrame.iteration = Number(frame.iteration);
  }
  if (isObject(frame.payload)) {
    const payload = clone(frame.payload);
    if (payload) {
      if (typeof payload.content === "string") {
        payload.content = trimText(payload.content, 8000);
      }
      if (typeof payload.text === "string") {
        payload.text = trimText(payload.text, 8000);
      }
      if (typeof payload.message === "string") {
        payload.message = trimText(payload.message, 2000);
      }
      if (typeof payload.reasoning === "string") {
        payload.reasoning = trimText(payload.reasoning, 8000);
      }
      if (typeof payload.observation === "string") {
        payload.observation = trimText(payload.observation, 8000);
      }
      if (typeof payload.result === "string") {
        payload.result = trimText(payload.result, 8000);
      }
      if (typeof payload.delta === "string") {
        payload.delta = trimText(payload.delta, 2000);
      }
      cleanedFrame.payload = payload;
    }
  }
  return cleanedFrame;
};

const sanitizeTraceFrames = (frames) => {
  if (!Array.isArray(frames) || frames.length === 0) {
    return [];
  }
  return frames.map((frame) => sanitizeTraceFrame(frame)).filter(Boolean);
};

const sanitizeSubagentMeta = (meta) => {
  if (!isObject(meta)) {
    return null;
  }
  const cleanedMeta = {
    subagentId:
      typeof meta.subagentId === "string" ? trimText(meta.subagentId, 300) : "",
    mode: typeof meta.mode === "string" ? trimText(meta.mode, 50) : "",
    template: typeof meta.template === "string" ? trimText(meta.template, 200) : "",
    batchId: typeof meta.batchId === "string" ? trimText(meta.batchId, 200) : "",
    parentId: typeof meta.parentId === "string" ? trimText(meta.parentId, 300) : "",
    lineage: Array.isArray(meta.lineage)
      ? meta.lineage
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => trimText(item, 300))
      : [],
    status: typeof meta.status === "string" ? trimText(meta.status, 100) : "",
  };
  return cleanedMeta;
};

const sanitizeSubagentFramesByRunId = (value) => {
  if (!isObject(value)) {
    return undefined;
  }
  const cleanedEntries = Object.entries(value)
    .map(([runId, frames]) => {
      const cleanedRunId =
        typeof runId === "string" ? trimText(runId, 300).trim() : "";
      if (!cleanedRunId || !Array.isArray(frames)) {
        return null;
      }
      return [cleanedRunId, sanitizeTraceFrames(frames)];
    })
    .filter(Boolean);
  if (cleanedEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(cleanedEntries);
};

const sanitizeSubagentMetaByRunId = (value) => {
  if (!isObject(value)) {
    return undefined;
  }
  const cleanedEntries = Object.entries(value)
    .map(([runId, meta]) => {
      const cleanedRunId =
        typeof runId === "string" ? trimText(runId, 300).trim() : "";
      const cleanedMeta = sanitizeSubagentMeta(meta);
      if (!cleanedRunId || !cleanedMeta) {
        return null;
      }
      return [cleanedRunId, cleanedMeta];
    })
    .filter(Boolean);
  if (cleanedEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(cleanedEntries);
};

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

    const cleanedTraceFrames = sanitizeTraceFrames(message.traceFrames);
    if (cleanedTraceFrames.length > 0) {
      cleaned.traceFrames = cleanedTraceFrames;
    }

    const cleanedSubagentFrames = sanitizeSubagentFramesByRunId(
      message.subagentFrames,
    );
    if (cleanedSubagentFrames) {
      cleaned.subagentFrames = cleanedSubagentFrames;
    }

    const cleanedSubagentMeta = sanitizeSubagentMetaByRunId(
      message.subagentMetaByRunId,
    );
    if (cleanedSubagentMeta) {
      cleaned.subagentMetaByRunId = cleanedSubagentMeta;
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

    if (isObject(message.meta.bundle)) {
      const b = message.meta.bundle;
      const bundle = {};
      if (typeof b.consumed_tokens === "number") bundle.consumed_tokens = b.consumed_tokens;
      if (typeof b.input_tokens === "number") bundle.input_tokens = b.input_tokens;
      if (typeof b.output_tokens === "number") bundle.output_tokens = b.output_tokens;
      if (typeof b.cache_read_input_tokens === "number") bundle.cache_read_input_tokens = b.cache_read_input_tokens;
      if (typeof b.cache_creation_input_tokens === "number") bundle.cache_creation_input_tokens = b.cache_creation_input_tokens;
      if (typeof b.model === "string" && b.model.trim()) bundle.model = trimText(b.model, 200);
      if (Object.keys(bundle).length > 0) meta.bundle = bundle;
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
    agentOrchestration: chat.agentOrchestration,
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
  const kind = sanitizeChatKind(chat?.kind);
  const characterId =
    kind === CHARACTER_CHAT_KIND ? sanitizeCharacterId(chat?.characterId) : "";
  const characterName =
    kind === CHARACTER_CHAT_KIND
      ? sanitizeCharacterName(chat?.characterName || title)
      : "";
  const characterAvatar =
    kind === CHARACTER_CHAT_KIND
      ? sanitizeCharacterAvatar(chat?.characterAvatar)
      : null;
  const resolvedTitle =
    kind === CHARACTER_CHAT_KIND && characterName ? characterName : title;

  const cleaned = {
    id:
      typeof chat?.id === "string" && chat.id.trim()
        ? chat.id
        : typeof fallbackId === "string" && fallbackId.trim()
          ? fallbackId
          : generateChatId(),
    kind,
    title: resolvedTitle,
    createdAt,
    updatedAt,
    lastMessageAt: computeLastMessageAt(messages, chat?.lastMessageAt),
    threadId:
      typeof chat?.threadId === "string" && chat.threadId.trim()
        ? trimText(chat.threadId, 200)
        : null,
    model: sanitizeModel(chat?.model),
    agentOrchestration: sanitizeAgentOrchestration(chat?.agentOrchestration),
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

  if (kind === CHARACTER_CHAT_KIND) {
    cleaned.characterId = characterId;
    cleaned.characterName = characterName || resolvedTitle;
    cleaned.characterAvatar = characterAvatar;
    cleaned.agentOrchestration = { ...DEFAULT_AGENT_ORCHESTRATION };
    cleaned.selectedToolkits = [];
    cleaned.selectedWorkspaceIds = [];
    cleaned.systemPromptOverrides = {};
    cleaned.isTransientNewChat = false;
    cleaned.threadId =
      typeof chat?.threadId === "string" && chat.threadId.trim()
        ? trimText(chat.threadId, 200)
        : DEFAULT_CHARACTER_THREAD_ID;
  }

  cleaned.stats = computeChatStats(cleaned);
  return cleaned;
};

export const createChatSession = (overrides = {}) => {
  const seed = now();
  const hasExplicitToolkits = Array.isArray(overrides.selectedToolkits);
  const toolkits = hasExplicitToolkits
    ? overrides.selectedToolkits
    : getDefaultToolkitSelection("global");

  return sanitizeChatSession(
    {
      id: overrides.id || generateChatId(),
      title: overrides.title || DEFAULT_CHAT_TITLE,
      kind: overrides.kind,
      characterId: overrides.characterId,
      characterName: overrides.characterName,
      characterAvatar: overrides.characterAvatar,
      createdAt: seed,
      updatedAt: seed,
      lastMessageAt: null,
      threadId: overrides.threadId || null,
      model: overrides.model || { id: DEFAULT_MODEL_ID },
      agentOrchestration: sanitizeAgentOrchestration(
        overrides.agentOrchestration,
      ),
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
