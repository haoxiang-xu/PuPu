import {
  finalizeStreamingMessage,
  getStreamingMessageText,
} from "../../../SERVICEs/streaming_message_chunks";
import {
  getLatestFinalMessageText,
  hasMeaningfulContent,
} from "./message_finality";

const isPlainRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasMeaningfulPayloadValue = (value) => {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasMeaningfulPayloadValue);
  if (!isPlainRecord(value)) return false;
  return Object.values(value).some(hasMeaningfulPayloadValue);
};

const FRAME_METADATA_KEYS = new Set([
  "agent_id",
  "run_id",
  "seq",
  "status",
  "timestamp",
  "ts",
]);

const TOOL_RESULT_METADATA_KEYS = new Set([
  ...FRAME_METADATA_KEYS,
  "call_id",
  "tool_name",
  "tool_display_name",
  "toolkit_id",
  "toolkit_name",
  "call_ref",
  "call_ref_metadata",
  "timeline_merge_policy",
]);

const RETAINABLE_VISIBLE_FRAME_TYPES = new Set([
  "reasoning",
  "observation",
  "tool_call",
  "tool_result",
  "final_message",
  "error",
  "fyi_injected",
  "side_answer",
  "clarify_request",
  "provider_retry",
]);

const hasVisibleFrameContent = (frame) => {
  const payload = frame.payload;
  switch (frame.type) {
    case "tool_call":
      return [payload.tool_name, payload.tool_display_name].some(
        (value) => typeof value === "string" && value.trim(),
      );
    case "tool_result":
      if (payload.result !== undefined) {
        return hasMeaningfulPayloadValue(payload.result);
      }
      return Object.entries(payload).some(
        ([key, value]) =>
          !TOOL_RESULT_METADATA_KEYS.has(key) && hasMeaningfulPayloadValue(value),
      );
    case "reasoning":
      return [payload.content, payload.text, payload.message, payload.reasoning]
        .some((value) => typeof value === "string" && value.trim()) ||
        hasMeaningfulPayloadValue(payload.reasoning_items);
    case "observation":
      return [payload.content, payload.text, payload.message, payload.observation]
        .some((value) => typeof value === "string" && value.trim());
    case "fyi_injected":
      return Array.isArray(payload.messages) && payload.messages.some(
        (message) =>
          message?.origin === "user" &&
          typeof message.text === "string" &&
          message.text.trim(),
      );
    case "side_answer":
      return [payload.question, payload.answer].some(
        (value) => typeof value === "string" && value.trim(),
      );
    case "clarify_request":
      return (
        (typeof payload.question === "string" && payload.question.trim()) ||
        hasMeaningfulPayloadValue(payload.options)
      );
    case "final_message":
      return typeof payload.content === "string" && payload.content.trim();
    case "error":
      return (
        (typeof payload.message === "string" && payload.message.trim()) ||
        hasMeaningfulPayloadValue(payload.code)
      );
    case "provider_retry":
      return (
        (typeof payload.provider === "string" && payload.provider.trim()) ||
        hasMeaningfulPayloadValue(payload.delay_ms) ||
        hasMeaningfulPayloadValue(payload.next_attempt)
      );
    default:
      return false;
  }
};

const hasMeaningfulFrame = (frame) => {
  if (
    !isPlainRecord(frame) ||
    typeof frame.type !== "string" ||
    !frame.type.trim() ||
    !RETAINABLE_VISIBLE_FRAME_TYPES.has(frame.type) ||
    !isPlainRecord(frame.payload)
  ) {
    return false;
  }
  const visibleContent = hasVisibleFrameContent(frame);
  if (!visibleContent) return false;
  return Object.entries(frame.payload).some(
    ([key, value]) =>
      !FRAME_METADATA_KEYS.has(key) && hasMeaningfulPayloadValue(value),
  );
};

const hasMeaningfulTraceFrames = (frames) =>
  Array.isArray(frames) && frames.some(hasMeaningfulFrame);

const hasMeaningfulSubagentFrames = (framesByRunId) =>
  isPlainRecord(framesByRunId) &&
  Object.entries(framesByRunId).some(
    ([runId, frames]) =>
      typeof runId === "string" &&
      runId.trim().length > 0 &&
      hasMeaningfulTraceFrames(frames),
  );

const hasMeaningfulExecutionHistory = (message) =>
  hasMeaningfulTraceFrames(message?.traceFrames) ||
  hasMeaningfulSubagentFrames(message?.subagentFrames);

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
    // #66-D: value-resolution order — store/streaming text first, then fall back
    // to the latest non-empty trace `final_message` so a cancelled turn never drops
    // already-generated assistant text. Tool frames are never used as body, and a
    // half-finished cancel is never fabricated into tool success or promoted to terminal.
    const streamingText = getStreamingMessageText(message);
    const content = hasMeaningfulContent(streamingText)
      ? streamingText
      : getLatestFinalMessageText(message?.traceFrames);
    if (
      !hasMeaningfulContent(content) &&
      !hasMeaningfulExecutionHistory(message)
    ) {
      continue;
    }

    nextMessages.push(finalizeStreamingMessage(message, {
      content,
      status: "cancelled",
      updatedAt: patchedAt,
    }));
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
