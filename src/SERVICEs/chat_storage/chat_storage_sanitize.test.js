import { sanitizeMessage } from "./chat_storage_sanitize";

describe("sanitizeMessage assistant artifactSummariesByTurnId", () => {
  const validBucket = {
    order: 1,
    status: "completed",
    artifacts: [
      {
        artifact_id: "file_diff:c1",
        kind: "file_diff",
        snapshot: { unified_diff: "@@ -1 +1 @@\n-a\n+b\n", truncated: false },
      },
    ],
  };

  test("preserves valid artifact summaries on assistant messages", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: { "run-1:turn-1": validBucket },
    });
    expect(cleaned.artifactSummariesByTurnId).toEqual({
      "run-1:turn-1": validBucket,
    });
  });

  test("drops artifacts missing required fields without dropping the bucket", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: {
        "run-1:turn-1": {
          order: 1,
          status: "completed",
          artifacts: [
            { artifact_id: "ok", kind: "file_diff", snapshot: { unified_diff: "" } },
            { kind: "file_diff", snapshot: {} }, // missing artifact_id
            { artifact_id: "no-kind", snapshot: {} }, // missing kind
            { artifact_id: "no-snap", kind: "file_diff" }, // missing snapshot
          ],
        },
      },
    });
    expect(cleaned.artifactSummariesByTurnId["run-1:turn-1"].artifacts).toHaveLength(1);
    expect(cleaned.artifactSummariesByTurnId["run-1:turn-1"].artifacts[0].artifact_id).toBe("ok");
  });

  test("drops pending buckets entirely", () => {
    const cleaned = sanitizeMessage({
      role: "assistant",
      content: "hi",
      artifactSummariesByTurnId: {
        "run-1:turn-1": { ...validBucket, status: "pending" },
      },
    });
    expect(cleaned.artifactSummariesByTurnId).toBeUndefined();
  });

  test("does not set the field on user messages", () => {
    const cleaned = sanitizeMessage({
      role: "user",
      content: "hi",
      artifactSummariesByTurnId: { "run-1:turn-1": validBucket },
    });
    expect(cleaned.artifactSummariesByTurnId).toBeUndefined();
  });
});
