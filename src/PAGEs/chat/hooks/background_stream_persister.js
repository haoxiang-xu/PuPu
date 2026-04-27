import { setChatMessages } from "../../../SERVICEs/chat_storage";

const DEFAULT_INTERVAL_MS = 2000;

const state = {
  intervalMs: DEFAULT_INTERVAL_MS,
  pending: new Map(),
};

const writeNow = (chatId, messages) => {
  setChatMessages(chatId, messages, { source: "chat-page" });
};

export const configureBackgroundPersister = ({ intervalMs } = {}) => {
  if (typeof intervalMs === "number" && intervalMs >= 0) {
    state.intervalMs = intervalMs;
  }
};

export const scheduleBackgroundPersist = (chatId, messages) => {
  if (!chatId || !Array.isArray(messages)) return;
  const entry = state.pending.get(chatId);
  if (entry) {
    entry.messages = messages;
    return;
  }
  const timerId = setTimeout(() => {
    const current = state.pending.get(chatId);
    state.pending.delete(chatId);
    if (current) writeNow(chatId, current.messages);
  }, state.intervalMs);
  state.pending.set(chatId, { timerId, messages });
};

export const flushBackgroundPersist = (chatId) => {
  if (!chatId) return false;
  const entry = state.pending.get(chatId);
  if (!entry) return false;
  clearTimeout(entry.timerId);
  state.pending.delete(chatId);
  writeNow(chatId, entry.messages);
  return true;
};

export const cancelBackgroundPersist = (chatId) => {
  if (!chatId) return false;
  const entry = state.pending.get(chatId);
  if (!entry) return false;
  clearTimeout(entry.timerId);
  state.pending.delete(chatId);
  return true;
};

export const flushAllBackgroundPersist = () => {
  for (const [chatId, entry] of state.pending.entries()) {
    clearTimeout(entry.timerId);
    writeNow(chatId, entry.messages);
  }
  state.pending.clear();
};

export const __resetBackgroundPersisterForTests = () => {
  for (const entry of state.pending.values()) {
    clearTimeout(entry.timerId);
  }
  state.pending.clear();
  state.intervalMs = DEFAULT_INTERVAL_MS;
};
