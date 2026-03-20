export const CHATS_STORAGE_KEY = "chats";
export const CHATS_SCHEMA_VERSION = 2;

export const MAX_TOTAL_BYTES = Math.floor(4.5 * 1024 * 1024);
export const TARGET_TOTAL_BYTES = Math.floor(4.2 * 1024 * 1024);
export const MAX_ACTIVE_MESSAGES_WHEN_TRIMMING = 200;
export const MAX_TEXT_CHARS = 100000;
export const MAX_TITLE_CHARS = 120;
export const MAX_TOOLKIT_ID_CHARS = 200;
export const MAX_SELECTED_TOOLKITS = 50;

export const DEFAULT_MODEL_ID = "miso-unset";
export const DEFAULT_CHAT_TITLE = "New Chat";
export const DEFAULT_FOLDER_LABEL = "New Folder";

export const now = () => Date.now();

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;
export const MONTH_MS = 30 * DAY_MS;
export const YEAR_MS = 365 * DAY_MS;

export const generateId = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const generateFolderId = () => generateId("fld");
export const generateChatId = () => generateId("chat");
export const toChatNodeId = (chatId) => `chn-${chatId}`;

export const ensureUniqueNodeId = (nodesById, preferred, prefix) => {
  if (!nodesById[preferred]) {
    return preferred;
  }

  let nextId = preferred;
  while (nodesById[nextId]) {
    nextId = `${prefix}-${Math.random().toString(16).slice(2)}`;
  }
  return nextId;
};

export const chatsStorageConstants = {
  key: CHATS_STORAGE_KEY,
  schemaVersion: CHATS_SCHEMA_VERSION,
};
