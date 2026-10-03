import { sanitizeMessage } from "./chat_storage_sanitize";

/* #386: the retry record survives the save path, so "Retried N×" is still
   there after a reload. */
test("a provider_retry trace frame keeps its closed payload when a message is saved", () => {
  const frame = {
    seq: 3,
    ts: 1790830000000,
    type: "provider_retry",
    run_id: "graph-step-1",
    iteration: 0,
    payload: {
      provider: "gemini",
      attempt_failed: 2,
      next_attempt: 3,
      max_attempts: 11,
      delay_ms: 4000,
      remaining_ms: 4000,
      http_status: 429,
      provider_status: "RESOURCE_EXHAUSTED",
      runtime_event_id: "event-1",
    },
  };
  const cleaned = sanitizeMessage({
    id: "assistant-1",
    role: "assistant",
    content: "answer",
    status: "done",
    createdAt: 1,
    updatedAt: 2,
    traceFrames: [frame],
  });

  expect(cleaned.traceFrames).toEqual([frame]);
});
