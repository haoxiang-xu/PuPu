/**
 * Decide how a finished stream's final messages reach storage.
 *
 * Foreground chats normally persist via a debounced effect that waits on a
 * React commit — under a janky main thread that commit can be starved and the
 * last response lost. At stream end we instead persist the final messages
 * synchronously here, independent of the render cycle. Background chats keep
 * delegating to their own buffered flush.
 *
 * Side-effecting only through the injected `storageApi` /
 * `flushBackgroundPersist`, so it is unit-testable without mounting the hook.
 */
export const finalizeStreamPersist = ({
  storageApi,
  chatId,
  messages,
  isForeground,
  flushBackgroundPersist,
}) => {
  if (!isForeground) {
    if (typeof flushBackgroundPersist === "function") {
      flushBackgroundPersist(chatId);
    }
    return false;
  }

  if (!chatId || !Array.isArray(messages)) {
    return false;
  }
  if (!storageApi || typeof storageApi.setChatMessages !== "function") {
    return false;
  }

  storageApi.setChatMessages(chatId, messages, { source: "chat-page" });
  return true;
};
