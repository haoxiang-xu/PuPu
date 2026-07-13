/*
 * Canonical finality semantics for trace `final_message` segments.
 *
 * Signed contract: .claude/agent-memory/pupu-llm-expert/finality-ownership-contract.md
 * `finality` is segment-level (lives at `frame.payload.finality` on `final_message`
 * trace frames). It replaces the old `frames.some(type === "tool_call")` heuristic so
 * the renderer reads an explicit ownership flag instead of guessing.
 *
 * Day-1 producers emit `pending | draft | terminal`; `intermediate` is declared-only
 * (render as draft) and reserved for the future trace_view.v1 refactor. `legacy` is the
 * normalize-layer sentinel for historical messages that predate this field.
 */

export const FINALITY = {
  PENDING: "pending",
  DRAFT: "draft",
  INTERMEDIATE: "intermediate",
  TERMINAL: "terminal",
  LEGACY: "legacy",
};

const KNOWN_FINALITY = new Set(Object.values(FINALITY));

// Hit criterion is always "content trims non-empty", never "field exists".
export const hasMeaningfulContent = (value) =>
  typeof value === "string" && value.trim().length > 0;

// Absent / null / unknown finality normalizes to the `legacy` sentinel, so historical
// messages render as read-only history without any ownership inference.
export const normalizeFinality = (value) =>
  KNOWN_FINALITY.has(value) ? value : FINALITY.LEGACY;

// Segment-level read: the finality of a single trace frame.
export const getFrameFinality = (frame) =>
  normalizeFinality(frame?.payload?.finality);

// Derived, read-only message-level signal for list / sidebar only.
// Never drive render ownership from this — terminal ownership is segment-level.
export const messageHasTerminal = (message) =>
  Array.isArray(message?.traceFrames) &&
  message.traceFrames.some(
    (frame) =>
      frame?.type === "final_message" &&
      getFrameFinality(frame) === FINALITY.TERMINAL &&
      hasMeaningfulContent(frame?.payload?.content),
  );

// Latest non-empty `final_message` text in a frame list. Tool frames are never
// considered — only model text segments — so a settle fallback can recover
// already-generated assistant text without ever backfilling tool output as body.
export const getLatestFinalMessageText = (frames) => {
  if (!Array.isArray(frames)) return "";
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const frame = frames[i];
    if (
      frame?.type === "final_message" &&
      hasMeaningfulContent(frame?.payload?.content)
    ) {
      return frame.payload.content;
    }
  }
  return "";
};
