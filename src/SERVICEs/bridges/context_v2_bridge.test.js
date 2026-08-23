import {
  contextV2Bridge,
  isContextV2BridgeAvailable,
  parseContextV2ErrorCode,
} from "./context_v2_bridge";

const METHODS = [
  "getStatus",
  "listEvents",
  "readContent",
  "getSessionHead",
  "rebaseSession",
  "listSpaces",
  "getTree",
  "listEntries",
  "search",
  "listCandidates",
  "listJobs",
  "listPromotions",
  "decideCandidate",
  "createPromotion",
  "decidePromotion",
  "listCandidateReviews",
  "getCandidateReview",
  "decideCandidateReview",
];

const makeFakeApi = () =>
  METHODS.reduce((api, method) => {
    api[method] = jest.fn(() => Promise.resolve({ ok: true, method }));
    return api;
  }, {});

describe("context v2 renderer bridge", () => {
  afterEach(() => {
    delete window.contextV2API;
  });

  test("mirrors the preload capability set and adds nothing of its own", () => {
    expect(METHODS).toHaveLength(18);
    expect(Object.keys(contextV2Bridge).sort()).toEqual(
      ["isAvailable", ...METHODS].sort(),
    );
    // No privileged plumbing and no generic proxy on the renderer side either.
    Object.keys(contextV2Bridge).forEach((name) => {
      expect(name).not.toMatch(/token|port|url|endpoint|proxy|invoke|fetch/i);
    });
    // Reviews are read + adjudicate only on this side too.
    [
      "proposeCandidateReview",
      "createCandidateReview",
      "readCandidateReviewContent",
    ].forEach((name) => {
      expect(contextV2Bridge[name]).toBeUndefined();
    });
  });

  test("forwards the review triad verbatim to the preload bridge", async () => {
    const api = makeFakeApi();
    window.contextV2API = api;

    const listPayload = { ownerChatId: "chat-1", status: "pending", limit: 25 };
    await expect(
      contextV2Bridge.listCandidateReviews(listPayload),
    ).resolves.toEqual({ ok: true, method: "listCandidateReviews" });
    expect(api.listCandidateReviews).toHaveBeenCalledWith(listPayload);

    const getPayload = { ownerChatId: "chat-1", reviewId: "review-1" };
    await expect(
      contextV2Bridge.getCandidateReview(getPayload),
    ).resolves.toEqual({ ok: true, method: "getCandidateReview" });
    expect(api.getCandidateReview).toHaveBeenCalledWith(getPayload);

    // This module performs NO validation of its own — main is the single
    // validating boundary — so the payload must arrive byte-identical.
    const decidePayload = {
      ownerChatId: "chat-1",
      reviewId: "review-1",
      decision: "reject",
      expectedReviewRevision: 2,
      expectedCandidateRevision: 3,
      expectedTargetRevision: 4,
      expectedSpaceRevision: 5,
      decisionReason: "not now",
      operationId: "op-review-0001",
    };
    await expect(
      contextV2Bridge.decideCandidateReview(decidePayload),
    ).resolves.toEqual({ ok: true, method: "decideCandidateReview" });
    expect(api.decideCandidateReview).toHaveBeenCalledWith(decidePayload);
  });

  test("a preload bridge without the review triad reads as unavailable", () => {
    const partial = makeFakeApi();
    delete partial.decideCandidateReview;
    window.contextV2API = partial;
    // Fail closed: a stale preload (pre-schema-v4) must not look usable.
    expect(isContextV2BridgeAvailable()).toBe(false);
  });

  // The renderer cannot delete Context V2 state at all. It deletes a chat
  // through the chat store; the main-process deletion outbox then completes
  // Context V2 + Vault cleanup durably (and survives a restart mid-delete).
  // A renderer-reachable delete would be a partial, non-durable delete.
  test("has no chat-deletion capability of any shape", () => {
    expect(contextV2Bridge.deleteChat).toBeUndefined();
    expect(METHODS).not.toContain("deleteChat");
    expect(
      Object.keys(contextV2Bridge).filter((name) =>
        /delete|destroy|purge|drop/i.test(name),
      ),
    ).toEqual([]);
  });

  // The availability probe must not accept a preload API that still carries a
  // delete method, nor demand one: REQUIRED_METHODS is the mirror of the
  // 15-method preload surface.
  test("availability probe neither requires nor is satisfied by a delete method", () => {
    const api = makeFakeApi();
    api.deleteChat = jest.fn();
    window.contextV2API = api;
    expect(isContextV2BridgeAvailable()).toBe(true);
    // …but the extra preload method is NOT re-exported by this module.
    expect(contextV2Bridge.deleteChat).toBeUndefined();
  });

  test("is unavailable until the preload API is installed, then forwards calls", async () => {
    expect(isContextV2BridgeAvailable()).toBe(false);
    await expect(contextV2Bridge.getStatus()).rejects.toMatchObject({
      code: "context_v2_unavailable",
    });

    const api = makeFakeApi();
    window.contextV2API = api;
    expect(isContextV2BridgeAvailable()).toBe(true);

    const payload = { ownerChatId: "chat-1", limit: 10 };
    await expect(contextV2Bridge.listEvents(payload)).resolves.toEqual({
      ok: true,
      method: "listEvents",
    });
    expect(api.listEvents).toHaveBeenCalledWith(payload);

    const headPayload = { ownerChatId: "chat-1", sessionId: "session-1" };
    await expect(contextV2Bridge.getSessionHead(headPayload)).resolves.toEqual({
      ok: true,
      method: "getSessionHead",
    });
    expect(api.getSessionHead).toHaveBeenCalledWith(headPayload);

    await contextV2Bridge.getStatus();
    expect(api.getStatus).toHaveBeenCalledWith();
  });

  test("a bridge missing any method reads as unavailable (fail closed)", () => {
    const partial = makeFakeApi();
    delete partial.getSessionHead;
    window.contextV2API = partial;
    expect(isContextV2BridgeAvailable()).toBe(false);
  });

  test("does not swallow coded rejections", async () => {
    const api = makeFakeApi();
    const conflict = new Error(
      "[context_v2_operation_conflict] context v2 request failed",
    );
    api.decideCandidate = jest.fn(() => Promise.reject(conflict));
    window.contextV2API = api;

    const rejection = await contextV2Bridge
      .decideCandidate({ ownerChatId: "chat-1" })
      .catch((error) => error);
    expect(rejection).toBe(conflict);
    expect(parseContextV2ErrorCode(rejection)).toBe(
      "context_v2_operation_conflict",
    );
  });

  test("a synchronous throw from the preload bridge becomes a rejection", async () => {
    const api = makeFakeApi();
    api.listSpaces = jest.fn(() => {
      throw new Error("[context_v2_failed] boom");
    });
    window.contextV2API = api;

    await expect(
      contextV2Bridge.listSpaces({ ownerChatId: "chat-1" }),
    ).rejects.toThrow(/context_v2_failed/);
  });

  test("parses the stable error code out of the transported message", () => {
    expect(
      parseContextV2ErrorCode(new Error("[context_v2_invalid_request] nope")),
    ).toBe("context_v2_invalid_request");
    expect(parseContextV2ErrorCode(new Error("no code here"))).toBeNull();
  });

  test.each([
    "context_v2_rebase_in_progress",
    "context_v2_rebase_recovery_required",
    "context_v2_rebase_journal_incompatible",
    "context_v2_operation_conflict",
    "context_v2_revision_conflict",
    "context_v2_generation_conflict",
    "context_v2_rebase_unavailable",
  ])("strictly parses %s from raw and Electron-wrapped carriers", (code) => {
    expect(
      parseContextV2ErrorCode(
        new Error(`[${code}] context v2 request failed`),
      ),
    ).toBe(code);
    expect(
      parseContextV2ErrorCode(
        new Error(
          `Error invoking remote method 'context-v2:rebase-session': Error: [${code}] context v2 request failed`,
        ),
      ),
    ).toBe(code);
  });

  test("the parser is anchored to the exact carrier and fails closed", () => {
    expect(
      parseContextV2ErrorCode(
        new Error(
          "arbitrary prefix [context_v2_rebase_journal_incompatible] hidden",
        ),
      ),
    ).toBeNull();
    expect(
      parseContextV2ErrorCode(
        new Error(
          "Error invoking remote method 'other-channel': [context_v2_failed] hidden",
        ),
      ),
    ).toBeNull();
    expect(parseContextV2ErrorCode(new Error("[HAS-DASH] nope"))).toBeNull();
    expect(
      parseContextV2ErrorCode(new Error(`[${"a".repeat(65)}] nope`)),
    ).toBeNull();
  });
});
