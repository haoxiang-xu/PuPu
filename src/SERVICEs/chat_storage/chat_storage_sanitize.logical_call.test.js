import { sanitizeMessage } from "./chat_storage_sanitize";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

describe("chat trace storage preserves logical-call identity evidence", () => {
  test("retains explicit top-level provenance as raw JSON and leaves absent fields absent", () => {
    const frame = {
      seq: 7,
      ts: 100,
      run_id: null,
      type: "tool_call",
      stage: { source: "confirmed", unexpected: true },
      links: ["intent:cursor-7", { relation: "reply_to", value: null }],
      event_id: false,
      execution_id: " execution-7 ",
      session_id: 12,
      event_cursor: "7",
      iteration: null,
      payload: {
        call_ref: {
          schema: "pupu.tool_call_ref.v1",
          call_id: "call-7",
          unexpected: true,
        },
      },
    };
    const cleaned = sanitizeMessage({
      id: "assistant-storage-provenance",
      role: "assistant",
      content: "done",
      status: "done",
      traceFrames: [frame, { seq: 8, ts: 101, run_id: "run-7", type: "text" }],
    });

    expect(cleaned.traceFrames[0]).toEqual(frame);
    expect(cleaned.traceFrames[1]).not.toHaveProperty("iteration");
    for (const key of [
      "stage",
      "links",
      "event_id",
      "execution_id",
      "session_id",
      "event_cursor",
      "iteration",
    ]) {
      expect(own(cleaned.traceFrames[0], key)).toBe(true);
    }
    expect(cleaned.traceFrames[0].run_id).toBeNull();
    expect(cleaned.traceFrames[0].iteration).toBeNull();
    expect(cleaned.traceFrames[0].payload.call_ref).toEqual(
      frame.payload.call_ref,
    );
  });

  test.each([null, false, "", "2"])(
    "preserves an explicitly malformed iteration value %p instead of coercing or dropping it",
    (iteration) => {
      const cleaned = sanitizeMessage({
        id: `assistant-iteration-${String(iteration)}`,
        role: "assistant",
        content: "done",
        status: "done",
        traceFrames: [
          { seq: 1, ts: 1, run_id: "run-1", type: "tool_call", iteration },
        ],
      });

      expect(own(cleaned.traceFrames[0], "iteration")).toBe(true);
      expect(cleaned.traceFrames[0].iteration).toBe(iteration);
    },
  );
});
