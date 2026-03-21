export const settleStreamingAssistantMessages = (messages) => {
  if (!Array.isArray(messages)) {
    return { changed: false, nextMessages: [] };
  }

  const patchedAt = Date.now();
  let changed = false;
  const nextMessages = [];

  for (const message of messages) {
    const isStreamingAssistant =
      message?.role === "assistant" && message?.status === "streaming";
    if (!isStreamingAssistant) {
      nextMessages.push(message);
      continue;
    }

    changed = true;
    if (!message?.content) {
      continue;
    }

    nextMessages.push({
      ...message,
      status: "cancelled",
      updatedAt: patchedAt,
    });
  }

  return {
    changed,
    nextMessages: changed ? nextMessages : messages,
  };
};

export const collectTurnMessageIds = (messages, targetMessageId) => {
  if (!Array.isArray(messages) || !targetMessageId) {
    return new Set();
  }

  const targetIndex = messages.findIndex(
    (message) => message?.id === targetMessageId,
  );
  if (targetIndex < 0) {
    return new Set();
  }

  let startIndex = targetIndex;
  while (startIndex > 0 && messages[startIndex]?.role !== "user") {
    startIndex -= 1;
  }
  if (messages[startIndex]?.role !== "user") {
    startIndex = targetIndex;
  }

  let endIndex = targetIndex;
  while (
    endIndex + 1 < messages.length &&
    messages[endIndex + 1]?.role !== "user"
  ) {
    endIndex += 1;
  }

  return new Set(
    messages
      .slice(startIndex, endIndex + 1)
      .map((message) => message?.id)
      .filter((messageId) => typeof messageId === "string" && messageId),
  );
};
