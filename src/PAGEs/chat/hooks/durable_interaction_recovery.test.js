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

const rawToolCall = {
  call_id: "call-1",
  confirmation_id: "interaction-1",
  requires_confirmation: true,
  toolkit_id: "core",
  toolkit_name: "Core",
  tool_name: "shell",
  tool_display_name: "Shell",
  arguments: { command: "npm install" },
  description: "Run npm install",
  interact_type: "confirmation",
  interact_config: {},
};

const rawPending = {
  status: "awaiting_response",
  session_id: "chat-a",
  interaction_id: "interaction-1",
  source_run_id: "attempt-source-1",
  active_attempt_id: "attempt-source-1",
  kind: "tool_approval",
  provider: "openai",
  model: "gpt-5",
  presentation: {
    trace_frame: {
      seq: 0,
      ts: 100,
      type: "tool_call",
      run_id: "attempt-source-1",
      stage: "durable_recovery",
      payload: { ...rawToolCall },
    },
    tool_call: { ...rawToolCall },
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
        activeAttemptId: "attempt-source-1",
      }),
    );
  });

  test("requires an exact session identity for a none projection", () => {
    expect(
      normalizePendingInteraction(
        { status: "none", session_id: "chat-a" },
        "chat-a",
      ),
    ).toEqual({ status: "none", sessionId: "chat-a" });
    expect(normalizePendingInteraction({ status: "none" }, "chat-a")).toBeNull();
    expect(
      normalizePendingInteraction(
        { status: "none", session_id: "chat-b" },
        "chat-a",
      ),
    ).toBeNull();
  });

  test("rejects unknown records and mismatched durable identities", () => {
    expect(
      normalizePendingInteraction(
        { ...rawPending, status: "future_status" },
        "chat-a",
      ),
    ).toBeNull();
    expect(
      normalizePendingInteraction(
        { ...rawPending, active_attempt_id: "attempt-other" },
        "chat-a",
      ),
    ).toBeNull();
    expect(
      normalizePendingInteraction(
        {
          ...rawPending,
          presentation: {
            ...rawPending.presentation,
            tool_call: {
              ...rawPending.presentation.tool_call,
              confirmation_id: "interaction-other",
            },
          },
        },
        "chat-a",
      ),
    ).toBeNull();
  });

  test("rejects unknown nested fields and divergent durable tool copies", () => {
    const withNestedSecret = {
      ...rawPending,
      presentation: {
        ...rawPending.presentation,
        tool_call: {
          ...rawPending.presentation.tool_call,
          secret: "must-not-cross-the-boundary",
        },
      },
    };
    expect(
      normalizePendingInteraction(withNestedSecret, "chat-a"),
    ).toBeNull();

    const withForeignToolIdentity = {
      ...rawPending,
      presentation: {
        ...rawPending.presentation,
        tool_call: {
          ...rawPending.presentation.tool_call,
          tool_name: "foreign_tool",
        },
      },
    };
    expect(
      normalizePendingInteraction(withForeignToolIdentity, "chat-a"),
    ).toBeNull();

    const withTraceMetadata = {
      ...rawPending,
      presentation: {
        ...rawPending.presentation,
        trace_frame: {
          ...rawPending.presentation.trace_frame,
          secret: "must-not-cross-the-boundary",
        },
      },
    };
    expect(
      normalizePendingInteraction(withTraceMetadata, "chat-a"),
    ).toBeNull();
  });

  test("accepts only canonical recorded outcomes for each interaction kind", () => {
    const humanArguments = {
      request_id: "call-1",
      kind: "selector",
      title: "Choose a stack",
      question: "Which stack should be used?",
      selection_mode: "single",
      options: [{ label: "Web", value: "web", description: "" }],
      allow_other: false,
      other_label: "Other",
      other_placeholder: "",
      min_selected: 1,
      max_selected: 1,
    };
    const humanToolCall = {
      ...rawToolCall,
      tool_name: "ask_user_question",
      tool_display_name: "Ask User",
      arguments: humanArguments,
      description: humanArguments.question,
      interact_type: "single",
      interact_config: humanArguments,
    };
    const humanPending = {
      ...rawPending,
      status: "receipt_recorded",
      kind: "human_input",
      receipt_id: "receipt-1",
      resolution: {
        outcome: "submitted",
        response: { selected_values: ["web_canvas"], other_text: null },
      },
      presentation: {
        trace_frame: {
          ...rawPending.presentation.trace_frame,
          payload: { ...humanToolCall },
        },
        tool_call: { ...humanToolCall },
      },
    };
    expect(normalizePendingInteraction(humanPending, "chat-a")).toEqual(
      expect.objectContaining({
        status: "receipt_recorded",
        kind: "human_input",
        receiptId: "receipt-1",
      }),
    );
    expect(
      normalizePendingInteraction(
        {
          ...humanPending,
          resolution: {
            outcome: "denied",
            response: { approved: false },
          },
        },
        "chat-a",
      ),
    ).toBeNull();
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
          ...rawPending.presentation,
          trace_frame: {
            ...rawPending.presentation.trace_frame,
            payload: {
              ...rawPending.presentation.trace_frame.payload,
              toolkit_id: "builtin.computer",
              tool_name: "computer",
            },
          },
          tool_call: {
            ...rawPending.presentation.tool_call,
            toolkit_id: "builtin.computer",
            tool_name: "computer",
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
