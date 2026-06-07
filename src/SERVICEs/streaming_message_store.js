import {
  appendTextToStreamingChunks,
  normalizeStreamingChunks,
  splitTextIntoStreamingChunks,
} from "./streaming_message_chunks";

const EMPTY_SNAPSHOT = Object.freeze({
  version: 0,
  textLength: 0,
  chunks: Object.freeze([]),
  updatedAt: 0,
});

const defaultNotifyScheduler = (callback) => {
  if (
    typeof window !== "undefined" &&
    typeof window.requestAnimationFrame === "function"
  ) {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
};

const defaultCancelScheduler = (handle) => {
  if (
    typeof window !== "undefined" &&
    typeof window.cancelAnimationFrame === "function"
  ) {
    window.cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
};

const keyFor = ({ chatId, messageId }) => `${chatId || ""}\u0000${messageId || ""}`;

const chatPrefix = (chatId) => `${chatId || ""}\u0000`;

const makeSnapshot = ({ previous, chunks, updatedAt }) => {
  const normalizedChunks = normalizeStreamingChunks(chunks);
  const textLength = normalizedChunks.reduce(
    (sum, chunk) => sum + chunk.length,
    0,
  );
  return {
    version: (previous?.version || 0) + 1,
    textLength,
    chunks: normalizedChunks,
    updatedAt: typeof updatedAt === "number" ? updatedAt : previous?.updatedAt || 0,
  };
};

export const createStreamingMessageStore = ({
  chunkSize = 1024,
  notifyScheduler = defaultNotifyScheduler,
  cancelScheduler = defaultCancelScheduler,
} = {}) => {
  const snapshots = new Map();
  const listenersByKey = new Map();
  const pendingKeys = new Set();
  let scheduledHandle = null;

  const listenersFor = (key) => {
    let listeners = listenersByKey.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersByKey.set(key, listeners);
    }
    return listeners;
  };

  const clearScheduledNotify = () => {
    if (scheduledHandle == null) {
      return;
    }
    cancelScheduler(scheduledHandle);
    scheduledHandle = null;
  };

  const notifyPending = () => {
    clearScheduledNotify();
    if (pendingKeys.size === 0) {
      return;
    }
    const keys = Array.from(pendingKeys);
    pendingKeys.clear();
    keys.forEach((key) => {
      const listeners = listenersByKey.get(key);
      if (!listeners) {
        return;
      }
      listeners.forEach((listener) => listener());
    });
  };

  const scheduleNotify = (key) => {
    pendingKeys.add(key);
    if (scheduledHandle != null) {
      return;
    }
    scheduledHandle = notifyScheduler(notifyPending);
  };

  const writeSnapshot = ({ chatId, messageId, chunks, updatedAt, notify = true }) => {
    const key = keyFor({ chatId, messageId });
    const previous = snapshots.get(key) || EMPTY_SNAPSHOT;
    const snapshot = makeSnapshot({ previous, chunks, updatedAt });
    snapshots.set(key, snapshot);
    if (notify) {
      scheduleNotify(key);
    }
    return snapshot;
  };

  const getSnapshot = ({ chatId, messageId } = {}) =>
    snapshots.get(keyFor({ chatId, messageId })) || EMPTY_SNAPSHOT;

  const getText = ({ chatId, messageId } = {}) =>
    getSnapshot({ chatId, messageId }).chunks.join("");

  return {
    begin({ chatId, messageId, seedText = "", updatedAt } = {}) {
      return writeSnapshot({
        chatId,
        messageId,
        chunks: splitTextIntoStreamingChunks(seedText, chunkSize),
        updatedAt,
        notify: false,
      });
    },

    append({ chatId, messageId, delta, updatedAt } = {}) {
      if (typeof delta !== "string" || !delta) {
        return getSnapshot({ chatId, messageId });
      }
      const previous = getSnapshot({ chatId, messageId });
      const chunks = appendTextToStreamingChunks(
        previous.chunks,
        delta,
        chunkSize,
      );
      return writeSnapshot({ chatId, messageId, chunks, updatedAt });
    },

    replace({ chatId, messageId, text = "", updatedAt } = {}) {
      return writeSnapshot({
        chatId,
        messageId,
        chunks: splitTextIntoStreamingChunks(text, chunkSize),
        updatedAt,
      });
    },

    flushNow({ chatId, messageId } = {}) {
      const key = keyFor({ chatId, messageId });
      if (pendingKeys.has(key)) {
        pendingKeys.delete(key);
        const listeners = listenersByKey.get(key);
        if (listeners) {
          listeners.forEach((listener) => listener());
        }
      }
      if (pendingKeys.size === 0) {
        clearScheduledNotify();
      }
    },

    getSnapshot,
    getText,

    materializeMessages({ chatId, messages } = {}) {
      if (!Array.isArray(messages)) {
        return [];
      }
      const prefix = chatPrefix(chatId);
      return messages.map((message) => {
        if (!message || typeof message.id !== "string") {
          return message;
        }
        const snapshot = snapshots.get(`${prefix}${message.id}`);
        if (!snapshot || snapshot.textLength <= 0) {
          return message;
        }
        const next = { ...message, content: snapshot.chunks.join("") };
        delete next.streamingChunks;
        return next;
      });
    },

    clear({ chatId, messageId } = {}) {
      const key = keyFor({ chatId, messageId });
      if (!snapshots.has(key)) {
        return;
      }
      snapshots.delete(key);
      scheduleNotify(key);
    },

    clearChat(chatId) {
      const prefix = chatPrefix(chatId);
      Array.from(snapshots.keys()).forEach((key) => {
        if (key.startsWith(prefix)) {
          snapshots.delete(key);
          scheduleNotify(key);
        }
      });
    },

    subscribe({ chatId, messageId } = {}, listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      const key = keyFor({ chatId, messageId });
      const listeners = listenersFor(key);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByKey.delete(key);
        }
      };
    },
  };
};
