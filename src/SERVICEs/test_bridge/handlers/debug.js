import { collectStateSnapshot } from "../state_selector";

export const registerDebugHandlers = ({
  bridge,
  chatStorage,
  getConfigContext,
  getCatalogCounts,
  getIsStreaming,
}) => {
  bridge.register("getStateSnapshot", async ({ chat_id: chatId } = {}) =>
    collectStateSnapshot({
      chatStorage,
      window,
      chatId,
      configContext: getConfigContext
        ? getConfigContext()
        : { isDark: false, locale: "en" },
      catalogCounts: getCatalogCounts
        ? getCatalogCounts()
        : { models: 0, toolkits: 0, characters: 0 },
      isStreaming: getIsStreaming ? getIsStreaming() : false,
    }),
  );
};
