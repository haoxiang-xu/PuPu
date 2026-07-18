import {
  buildRecoveredConfirmationRequest,
  buildDurableResumePayload,
  durableInteractionRetryDelayMs,
  ensureDurableInteractionMessage,
  findDurableInteractionOwnerMessageId,
  isRetryableDurableInteractionError,
  normalizePendingInteraction,
  prepareDurableInteractionResumeMessages,
  shouldReconcileDurableResumeError,
} from "./durable_interaction_recovery";

const rawPending = {
  status: "awaiting_response",
  session_id: "chat-a",
  interaction_id: "interaction-1",
  source_run_id: "attempt-source-1",
  active_attempt_id: "attempt-active-1",
  kind: "tool_approval",
  presentation: {
    trace_frame: {
      seq: 0,
      ts: 100,
      type: "tool_call",
      stage: "durable_recovery",
      payload: {
        call_id: "call-1",
        confirmation_id: "interaction-1",
        toolkit_id: "core",
        tool_name: "shell",
        arguments: { command: "npm install" },
      },
    },
  },
  resume_available: true,
  resume_options: {
    modelId: "openai:gpt-5",
    memory_enabled: true,
  },
};

describe("durable interaction recovery helpers", () => {
  test("normalizes and rejects cross-session pending interactions", () => {
    expect(normalizePendingInteraction(rawPending, "chat-b")).toBeNull();
    expect(normalizePendingInteraction(rawPending, "chat-a")).toEqual(
      expect.objectContaining({
        status: "awaiting_response",
        sessionId: "chat-a",
        interactionId: "interaction-1",
        callId: "call-1",
        sourceRunId: "attempt-source-1",
        activeAttemptId: "attempt-active-1",
      }),
    );
  });

  test("rehydrates one owner bubble and reuses it for resume", () => {
    const pending = normalizePendingInteraction(rawPending, "chat-a");
    const first = ensureDurableInteractionMessage([], pending, 200);
    const second = ensureDurableInteractionMessage(first.messages, pending, 300);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.messages).toHaveLength(1);
    expect(
      findDurableInteractionOwnerMessageId(
        second.messages,
        pending.interactionId,
        pending.callId,
      ),
    ).toBe(first.ownerMessageId);

    const resumed = prepareDurableInteractionResumeMessages(
      second.messages,
      pending,
      first.ownerMessageId,
      400,
    );
    expect(resumed.messages[0]).toEqual(
      expect.objectContaining({
        id: first.ownerMessageId,
        status: "streaming",
        updatedAt: 400,
      }),
    );
  });

  test("builds an empty-message resume request without creating a user turn", () => {
    const pending = normalizePendingInteraction(rawPending, "chat-a");
    expect(buildDurableResumePayload(pending)).toEqual({
      mode: "resume_interaction",
      threadId: "chat-a",
      interaction_id: "interaction-1",
      source_attempt_id: "attempt-source-1",
      message: "",
      history: [],
      attachments: [],
      options: {
        modelId: "openai:gpt-5",
        memory_enabled: true,
      },
      trace_level: "minimal",
    });
  });

  test("preserves toolkit identity for recovered confirmation policy", () => {
    const pending = normalizePendingInteraction(
      {
        ...rawPending,
        presentation: {
          trace_frame: {
            ...rawPending.presentation.trace_frame,
            payload: {
              ...rawPending.presentation.trace_frame.payload,
              toolkit_id: "builtin.computer",
              tool_name: "computer",
            },
          },
        },
      },
      "chat-a",
    );
    expect(
      buildRecoveredConfirmationRequest({
        pending,
        chatId: "chat-a",
        ownerMessageId: "assistant-1",
        requestedAt: 200,
      }),
    ).toEqual(
      expect.objectContaining({
        toolkitId: "builtin.computer",
        toolName: "computer",
      }),
    );
  });

  test("recognizes retryable lease failures and caps exponential delay", () => {
    expect(
      isRetryableDurableInteractionError({ code: "execution_lease_conflict" }),
    ).toBe(true);
    expect(
      isRetryableDurableInteractionError({ message: "active_execution_lease" }),
    ).toBe(true);
    expect(
      isRetryableDurableInteractionError({ code: "execution_lease_not_owned" }),
    ).toBe(true);
    expect(isRetryableDurableInteractionError({ code: "invalid_request" })).toBe(
      false,
    );
    expect([0, 1, 2, 3, 4, 5].map(durableInteractionRetryDelayMs)).toEqual([
      1000,
      2000,
      4000,
      8000,
      15000,
      15000,
    ]);
  });

  test("reconciles stale resume errors without making them generic retries", () => {
    expect(
      shouldReconcileDurableResumeError({ code: "interaction_not_found" }),
    ).toBe(true);
    expect(
      shouldReconcileDurableResumeError({
        message: "No durable interaction found for this session and ID",
      }),
    ).toBe(true);
    expect(
      shouldReconcileDurableResumeError({ code: "interaction_superseded" }),
    ).toBe(true);
    expect(
      shouldReconcileDurableResumeError({ code: "execution_lease_conflict" }),
    ).toBe(false);
    expect(
      isRetryableDurableInteractionError({ code: "interaction_not_found" }),
    ).toBe(false);
  });
});
