/* Read authority already recorded for THIS chat, never the composer model,
 * selected Agent, or a guessed character-session formula. Normal send starts
 * at chatId; durable resume/character send may use another persisted session.
 * The normal threadId is presentation configuration, not an execution ID. */
export function run_observation_scope(store, messages, resourceId) {
  const owner = store?.activeChatId;
  const chat = typeof owner === "string" && owner.length > 0 &&
    Object.prototype.hasOwnProperty.call(store.chatsById || {}, owner) ? store.chatsById[owner] : null;
  if (!chat) return null;
  const recorded = Array.isArray(messages) ? [...messages].reverse().find((message) =>
    message?.role === "assistant" && typeof message.meta?.executionSessionId === "string" && message.meta.executionSessionId.length > 0) : null;
  const execution = recorded ? recorded.meta.executionSessionId : chat.kind === "character" ? null : owner;
  return execution ? { owner_chat_id: owner, execution_id: execution, resource_id: resourceId } : null;
}
