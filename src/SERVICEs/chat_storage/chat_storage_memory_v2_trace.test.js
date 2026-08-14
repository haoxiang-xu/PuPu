import { sanitizeMessage } from "./chat_storage_sanitize";
import { computeCompletionDiagnosticsDigestV1 } from "../completion_diagnostics_v1";

const completionDiagnostics = (memoryV2) => ({
  schema: "pupu.completion_diagnostics.v1",
  diagnostics_digest: computeCompletionDiagnosticsDigestV1(memoryV2),
  memory_v2: memoryV2,
});

const {
  buildRunBundleV1,
} = require("../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

describe("chat storage Memory V2 trace reload", () => {
  test("preserves the bounded audit bundle and drops hidden or unknown fields", () => {
    const cleaned = sanitizeMessage({
      id: "assistant-memory",
      role: "assistant",
      content: "done",
      status: "done",
      meta: {
        bundle: {
          consumed_tokens: 10,
          memory_v2: {
            mode: "active",
            available_input_tokens: 64000,
            checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
            memory_agent_run: {
              status: "completed",
              model: "memory-model",
              reasoning: "hidden",
              credential: "sensitive",
            },
            arbitrary_provider_payload: { unsafe: true },
          },
        },
      },
    });

    expect(cleaned.meta.bundle.memory_v2).toMatchObject({
      mode: "active",
      available_input_tokens: 64000,
      checkpoint_ref: "pupu://context/checkpoint/checkpoint-1",
      memory_agent_run: {
        status: "completed",
        model: "memory-model",
      },
    });
    const serialized = JSON.stringify(cleaned.meta.bundle.memory_v2);
    expect(serialized).not.toContain("hidden");
    expect(serialized).not.toContain("sensitive");
    expect(serialized).not.toContain("arbitrary_provider_payload");
  });

  test.each([
    ["active", "complete"],
    ["shadow", "complete"],
    ["active", "partial"],
  ])(
    "preserves a strict %s/%s completion diagnostics envelope across reload",
    (mode, traceStatus) => {
      const cleaned = sanitizeMessage({
        id: `assistant-${mode}-${traceStatus}`,
        role: "assistant",
        content: "done",
        status: "done",
        meta: {
          completion_diagnostics: completionDiagnostics({
              mode,
              trace_status: traceStatus,
              ...(mode === "shadow" ? { shadow_only: true } : {}),
              ...(traceStatus === "partial"
                ? { persistence_degraded: true }
                : {}),
          }),
        },
      });

      expect(cleaned.meta.completion_diagnostics).toEqual(
        expect.objectContaining({
          schema: "pupu.completion_diagnostics.v1",
          memory_v2: expect.objectContaining({
            mode,
            trace_status: traceStatus,
          }),
        }),
      );
    },
  );

  test("drops malformed completion diagnostics without dropping the message", () => {
    const cleaned = sanitizeMessage({
      id: "assistant-malformed-diagnostics",
      role: "assistant",
      content: "done",
      status: "done",
      meta: {
        completion_diagnostics: completionDiagnostics({
          mode: "active",
          unknown: true,
        }),
      },
    });

    expect(cleaned.content).toBe("done");
    expect(cleaned.meta).toBeUndefined();
  });

  test("preserves a storage-admitted canonical RunBundle across reload", () => {
    const bundle = buildRunBundleV1();
    const cleaned = sanitizeMessage({
      id: "assistant-run-bundle-reload",
      role: "assistant",
      content: "done",
      status: "done",
      meta: { bundle },
    });
    expect(cleaned.meta.bundle).toEqual(bundle);
  });
});
