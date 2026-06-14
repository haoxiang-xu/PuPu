const MAX_PREVIEW_MESSAGES = 8;
const TAIL_PREVIEW_MESSAGES = 7;
const MAX_CONTENT_PREVIEW_CHARS = 240;

const stringValue = (value) => (typeof value === "string" ? value : "");

const contentText = (content) => {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (!item || typeof item !== "object") {
          return "";
        }
        if (typeof item.text === "string") {
          return item.text;
        }
        if (typeof item.content === "string") {
          return item.content;
        }
        if (typeof item.output === "string") {
          return item.output;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content == null) {
    return "";
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
};

const contentItemCount = (content) => {
  if (Array.isArray(content)) {
    return content.length;
  }
  return content == null ? 0 : 1;
};

const previewIndexes = (messageCount) => {
  if (messageCount <= MAX_PREVIEW_MESSAGES) {
    return Array.from({ length: messageCount }, (_, index) => index);
  }
  const indexes = [0];
  const tailStart = Math.max(1, messageCount - TAIL_PREVIEW_MESSAGES);
  for (let index = tailStart; index < messageCount; index += 1) {
    indexes.push(index);
  }
  return indexes;
};

const summarizeMessage = (message, index) => {
  const content = contentText(message?.content);
  return {
    index,
    role: stringValue(message?.role),
    type: stringValue(message?.type),
    name: stringValue(message?.name),
    callId: stringValue(message?.call_id || message?.callId),
    contentChars: content.length,
    contentItemCount: contentItemCount(message?.content),
    contentPreview: content.slice(0, MAX_CONTENT_PREVIEW_CHARS),
  };
};

export const summarizeRequestMessagesForLog = (
  rawMessages,
  systemPrompt = "",
) => {
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  const totalContentChars = messages.reduce(
    (total, message) => total + contentText(message?.content).length,
    0,
  );
  const indexes = previewIndexes(messages.length);
  return {
    messageCount: messages.length,
    omittedMessageCount: Math.max(0, messages.length - indexes.length),
    totalContentChars,
    systemPromptChars: stringValue(systemPrompt).length,
    previewMessages: indexes.map((index) =>
      summarizeMessage(messages[index], index),
    ),
  };
};
