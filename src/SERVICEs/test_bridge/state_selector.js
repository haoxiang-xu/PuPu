export const collectStateSnapshot = ({
  chatStorage,
  window: win,
  configContext,
  catalogCounts,
  isStreaming,
}) => {
  const activeChatId = chatStorage.getActiveChatId() || null;
  const config = activeChatId ? chatStorage.getChatConfig(activeChatId) : null;
  const summaries = chatStorage.listChatsSummary() || [];
  const summary = activeChatId
    ? summaries.find((c) => c.id === activeChatId)
    : null;
  const modalRegistry = (win && win.__pupuModalRegistry) || null;
  return {
    active_chat_id: activeChatId,
    active_chat:
      summary && config
        ? {
            id: summary.id,
            title: summary.title,
            model: summary.model,
            message_count: summary.message_count,
            last_message_role: config.last_message_role || null,
          }
        : null,
    current_model: config?.model ?? null,
    toolkits_active: config?.toolkits ?? [],
    character_id: config?.character_id ?? null,
    modal_open: modalRegistry ? modalRegistry.openIds() : [],
    is_streaming: !!isStreaming,
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
