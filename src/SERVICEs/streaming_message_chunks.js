export const STREAMING_MESSAGE_CHUNK_SIZE = 1024;

export const normalizeStreamingChunks = (chunks) => {
  if (!Array.isArray(chunks)) {
    return [];
  }
  return chunks.filter((chunk) => typeof chunk === "string" && chunk.length > 0);
};

export const splitTextIntoStreamingChunks = (
  text,
  chunkSize = STREAMING_MESSAGE_CHUNK_SIZE,
) => {
  const normalizedText = typeof text === "string" ? text : "";
  if (!normalizedText) {
    return [];
  }

  const chunks = [];
  for (let index = 0; index < normalizedText.length; index += chunkSize) {
    chunks.push(normalizedText.slice(index, index + chunkSize));
  }
  return chunks;
};

export const appendTextToStreamingChunks = (
  previousChunks,
  delta,
  chunkSize = STREAMING_MESSAGE_CHUNK_SIZE,
) => {
  if (typeof delta !== "string" || !delta) {
    return normalizeStreamingChunks(previousChunks);
  }

  const chunks = normalizeStreamingChunks(previousChunks).slice();
  let remaining = delta;
  const lastIndex = chunks.length - 1;

  if (lastIndex >= 0 && chunks[lastIndex].length < chunkSize) {
    const available = chunkSize - chunks[lastIndex].length;
    const addition = remaining.slice(0, available);
    chunks[lastIndex] = `${chunks[lastIndex]}${addition}`;
    remaining = remaining.slice(addition.length);
  }

  for (let index = 0; index < remaining.length; index += chunkSize) {
    chunks.push(remaining.slice(index, index + chunkSize));
  }

  return chunks;
};

export const getStreamingMessageText = (message) => {
  const chunks = normalizeStreamingChunks(message?.streamingChunks);
  if (chunks.length > 0) {
    return chunks.join("");
  }
  return typeof message?.content === "string" ? message.content : "";
};

export const hasStreamingMessageText = (message) => {
  const chunks = normalizeStreamingChunks(message?.streamingChunks);
  if (chunks.some((chunk) => chunk.trim().length > 0)) {
    return true;
  }
  return (
    typeof message?.content === "string" && message.content.trim().length > 0
  );
};

export const appendStreamingMessageDelta = (
  message,
  delta,
  { updatedAt } = {},
) => {
  const previousChunks = normalizeStreamingChunks(message?.streamingChunks);
  const seedChunks =
    previousChunks.length > 0
      ? previousChunks
      : splitTextIntoStreamingChunks(message?.content || "");
  const streamingChunks = appendTextToStreamingChunks(seedChunks, delta);

  return {
    ...message,
    content: "",
    streamingChunks,
    ...(typeof updatedAt === "number" ? { updatedAt } : {}),
  };
};

export const replaceStreamingMessageText = (
  message,
  text,
  { updatedAt } = {},
) => ({
  ...message,
  content: "",
  streamingChunks: splitTextIntoStreamingChunks(text),
  ...(typeof updatedAt === "number" ? { updatedAt } : {}),
});

export const clearStreamingMessageText = (message, overrides = {}) => {
  const rest = { ...(message || {}) };
  delete rest.streamingChunks;
  return {
    ...rest,
    content: "",
    ...overrides,
  };
};

export const finalizeStreamingMessage = (message, overrides = {}) => {
  const rest = { ...(message || {}) };
  delete rest.streamingChunks;
  return {
    ...rest,
    content: getStreamingMessageText(message),
    ...overrides,
  };
};
