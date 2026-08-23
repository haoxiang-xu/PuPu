import {
  isMemoryV2TraceBundle,
  presentMemoryV2Audit,
  sanitizeMemoryV2TraceBundle,
} from "./memory_v2_trace_presenter";

describe("Memory V2 trace presenter", () => {
  const payload = {
    schema_version: "memory_v2.context.v1",
    mode: "active",
    real_context_window_tokens: 100000,
    available_input_tokens: 88000,
    compression_threshold_tokens: 79200,
    predicted_total_tokens: 44000,
    before_estimated_tokens: 45000,
    after_estimated_tokens: 32000,
    compacted: true,
    dropped_turn_count: 4,
    compacted_tool_result_count: 2,
    source_event_range: {
      first_event_id: "evt-first",
      last_event_id: "evt-last",
      event_count: 52,
    },
    checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
    artifact_refs: [
      {
        uri: "pupu://artifact/artifact-1@1",
        media_type: "application/json",
        bytes: 1200,
      },
    ],
    curator_run: {
      run_id: "curator-1",
      status: "completed",
      trigger: "checkpoint_consolidation",
      provider: "openai",
      model: "gpt-memory",
      model_version: "2026-07",
      consumed_tokens: 230,
      input_tokens: 180,
      output_tokens: 50,
      cost_usd: 0.01,
      diff: { path: "/decisions.md", action: "create" },
      undo_ref: "operation:undo-curator-1",
      handoff_ref: "pupu://artifact/handoff-1@1",
      reasoning: "must never be exposed",
      credentials: { api_key: "must-never-persist" },
    },
    unknown_payload: { should_not_survive: true },
    chain_of_thought: "must never be exposed",
  };

  test("presents context pressure, compression, durable refs, and curator audit data", () => {
    const audit = presentMemoryV2Audit(payload, { runStatus: "done" });

    expect(audit).toMatchObject({
      mode: "active",
      status: "Complete",
      pressure: {
        predictedTokens: 44000,
        availableTokens: 88000,
        percent: 50,
      },
      compression: {
        compacted: true,
        beforeTokens: 45000,
        afterTokens: 32000,
        droppedTurns: 4,
      },
    });
    expect(audit.refs.map((item) => item.ref)).toEqual([
      "pupu://context/checkpoint/checkpoint-1",
      "pupu://artifact/artifact-1@1",
    ]);
    expect(audit.agentRuns).toHaveLength(1);
    expect(audit.agentRuns[0]).toMatchObject({
      id: "curator-1",
      status: "Completed",
      trigger: "checkpoint_consolidation",
      provider: "openai",
      model: "gpt-memory",
      version: "2026-07",
      consumedTokens: 230,
      cost: 0.01,
    });
    expect(audit.agentRuns[0].diff).toContain("/decisions.md");
    expect(audit.agentRuns[0].refs[0].ref).toBe("pupu://artifact/handoff-1@1");
  });

  test("uses only the explicit audit allowlist and strips hidden reasoning and credentials", () => {
    const sanitized = sanitizeMemoryV2TraceBundle(payload);
    const serialized = JSON.stringify(sanitized);

    expect(sanitized.unknown_payload).toBeUndefined();
    expect(serialized).not.toContain("must never be exposed");
    expect(serialized).not.toContain("must-never-persist");
    expect(serialized).not.toContain("chain_of_thought");
    expect(serialized).not.toContain("credentials");
    expect(isMemoryV2TraceBundle(payload)).toBe(true);
    expect(isMemoryV2TraceBundle({ unknown: true })).toBe(false);
  });

  test.each([
    [{ mode: "active", persistence_degraded: true }, "Partial"],
    [{ mode: "legacy", legacy_v1: true }, "Legacy"],
    [{ mode: "off", reason: "memory_v2_runtime_unavailable" }, "Unavailable"],
  ])("normalizes the unified trace state", (raw, expected) => {
    expect(presentMemoryV2Audit(raw)?.status).toBe(expected);
  });
});
