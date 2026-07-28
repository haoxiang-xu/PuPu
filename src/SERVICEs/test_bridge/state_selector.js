export const collectStateSnapshot = ({
  chatStorage,
  window: win,
  configContext,
  catalogCounts,
  isStreaming,
  chatId,
}) => {
  const activeChatId = chatStorage.getActiveChatId() || null;
  const requestedChatId =
    typeof chatId === "string" && chatId.trim() ? chatId.trim() : null;
  const inspectedChatId = requestedChatId || activeChatId;
  const activeConfig = activeChatId
    ? chatStorage.getChatConfig(activeChatId)
    : null;
  const config = inspectedChatId
    ? chatStorage.getChatConfig(inspectedChatId)
    : null;
  const summaries = chatStorage.listChatsSummary() || [];
  const activeSummary = activeChatId
    ? summaries.find((c) => c.id === activeChatId)
    : null;
  const inspectedSummary = inspectedChatId
    ? summaries.find((c) => c.id === inspectedChatId)
    : null;
  const modalRegistry = (win && win.__pupuModalRegistry) || null;
  const buildChatSnapshot = (summary, snapshotConfig) =>
    summary && snapshotConfig
      ? {
          id: summary.id,
          title: summary.title,
          model: summary.model,
          message_count: summary.message_count,
          last_message_role: snapshotConfig.last_message_role || null,
        }
      : null;
  return {
    active_chat_id: activeChatId,
    active_chat: buildChatSnapshot(activeSummary, activeConfig),
    inspected_chat_id: inspectedChatId,
    inspected_chat: buildChatSnapshot(inspectedSummary, config),
    current_model: config?.model ?? null,
    toolkits_active: config?.toolkits ?? [],
    character_id: config?.character_id ?? null,
    modal_open: modalRegistry ? modalRegistry.openIds() : [],
    is_streaming:
      inspectedChatId === activeChatId
        ? !!isStreaming
        : config?.is_streaming === true,
    route: win?.location?.hash || "",
    window_state: {
      width: win?.innerWidth ?? 0,
      height: win?.innerHeight ?? 0,
      isDark: !!configContext?.isDark,
      locale: configContext?.locale || "en",
    },
    catalog_loaded: catalogCounts,
  };
};
