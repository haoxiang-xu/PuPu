const {
  createContextV2Bridge,
} = require("../../preload/bridges/context_v2_bridge");
const { CHANNELS } = require("../../shared/channels");

// The preload bridge's one job is field-allowlist reconstruction: whatever the
// renderer hands in, only the named fields may cross the IPC line, and the
// call shape may never become a generic proxy.

describe("context v2 preload bridge", () => {
  let ipcRenderer;
  let bridge;

  beforeEach(() => {
    ipcRenderer = { invoke: jest.fn() };
    bridge = createContextV2Bridge(ipcRenderer);
  });

  test("requires ipcRenderer", () => {
    expect(() => createContextV2Bridge()).toThrow(/ipcRenderer is required/);
  });

  test("exposes exactly the eighteen context v2 capabilities", () => {
    expect(Object.keys(bridge)).toHaveLength(18);
    expect(Object.keys(bridge).sort()).toEqual(
      [
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
      ].sort(),
    );

    // Read + adjudicate only: no way to propose the review you then approve.
    [
      "proposeCandidateReview",
      "createCandidateReview",
      "readCandidateReviewContent",
    ].forEach((method) => {
      expect(bridge[method]).toBeUndefined();
    });
  });

  test("never forwards a caller object — every payload is rebuilt", () => {
    // A single hostile object reused across every method: if any method
    // forwarded (or spread) it, these extra keys would ride the channel.
    const hostile = {
      ownerChatId: "chat-1",
      spaceId: "space-1",
      ref: "event:evt-1",
      // Privileged plumbing a compromised renderer would love to smuggle.
      unchainAuthToken: "auth-token-123",
      unchain_auth: "auth-token-123",
      port: 5879,
      url: "http://127.0.0.1:5879/health",
      path: "/etc/passwd",
      workspaceRoot: "/Users/red/secret",
      method: "DELETE",
      endpoint: "/context/v2/memory/jobs/claim",
      targetNamespace: "user:attacker",
      target_namespace: "user:attacker",
      workerId: "worker-1",
      leaseToken: "lease-1",
    };

    const forbidden = [
      "unchainAuthToken",
      "unchain_auth",
      "port",
      "url",
      "path",
      "workspaceRoot",
      "method",
      "endpoint",
      "targetNamespace",
      "target_namespace",
      "workerId",
      "leaseToken",
    ];

    [
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
    ].forEach((method) => {
      ipcRenderer.invoke.mockClear();
      bridge[method](hostile);

      const [, sent] = ipcRenderer.invoke.mock.calls[0];
      expect(sent).not.toBe(hostile);
      forbidden.forEach((key) => {
        expect(Object.prototype.hasOwnProperty.call(sent, key)).toBe(false);
      });
      const serialized = JSON.stringify(sent);
      expect(serialized).not.toContain("auth-token-123");
      expect(serialized).not.toContain("attacker");
      expect(serialized).not.toContain("etc/passwd");
    });
  });

  test("getStatus takes no arguments and cannot be steered", () => {
    bridge.getStatus({ ownerChatId: "chat-1", counts: true });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(
      CHANNELS.CONTEXT_V2.GET_STATUS,
    );
    expect(ipcRenderer.invoke.mock.calls[0]).toHaveLength(1);
  });

  test("missing payloads still send the explicit allowlist shape", () => {
    bridge.listEvents();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.LIST_EVENTS,
      {
        ownerChatId: undefined,
        sessionId: undefined,
        attemptId: undefined,
        after: undefined,
        limit: undefined,
        includePayload: undefined,
      },
    );

    bridge.getSessionHead();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_SESSION_HEAD,
      { ownerChatId: undefined, sessionId: undefined },
    );

    bridge.rebaseSession();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.REBASE_SESSION,
      {
        ownerChatId: undefined,
        sessionId: undefined,
        replacementHistory: undefined,
        sourceGenerationId: undefined,
        expectedSessionRevision: undefined,
        operationId: undefined,
        reason: undefined,
      },
    );

    bridge.decidePromotion(null);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.DECIDE_PROMOTION,
      {
        ownerChatId: undefined,
        promotionId: undefined,
        decision: undefined,
        expectedRevision: undefined,
        decisionReason: undefined,
        operationId: undefined,
      },
    );

    // The review triad follows the same rule: an argument-free (or null) call
    // still sends the full allowlist shape so main REJECTS it, rather than
    // sending {} and letting a default fill in for a missing owner/fence.
    bridge.getCandidateReview();
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.GET_CANDIDATE_REVIEW,
      { ownerChatId: undefined, reviewId: undefined },
    );

    bridge.decideCandidateReview(null);
    expect(ipcRenderer.invoke).toHaveBeenLastCalledWith(
      CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE_REVIEW,
      {
        ownerChatId: undefined,
        reviewId: undefined,
        decision: undefined,
        expectedReviewRevision: undefined,
        expectedCandidateRevision: undefined,
        expectedTargetRevision: undefined,
        expectedSpaceRevision: undefined,
        decisionReason: undefined,
        operationId: undefined,
      },
    );
  });

  test("each method targets its own dedicated channel", () => {
    const bindings = [
      ["getStatus", CHANNELS.CONTEXT_V2.GET_STATUS],
      ["listEvents", CHANNELS.CONTEXT_V2.LIST_EVENTS],
      ["readContent", CHANNELS.CONTEXT_V2.READ_CONTENT],
      ["getSessionHead", CHANNELS.CONTEXT_V2.GET_SESSION_HEAD],
      ["rebaseSession", CHANNELS.CONTEXT_V2.REBASE_SESSION],
      ["listSpaces", CHANNELS.CONTEXT_V2.LIST_SPACES],
      ["getTree", CHANNELS.CONTEXT_V2.GET_TREE],
      ["listEntries", CHANNELS.CONTEXT_V2.LIST_ENTRIES],
      ["search", CHANNELS.CONTEXT_V2.SEARCH_ENTRIES],
      ["listCandidates", CHANNELS.CONTEXT_V2.LIST_CANDIDATES],
      ["listJobs", CHANNELS.CONTEXT_V2.LIST_JOBS],
      ["listPromotions", CHANNELS.CONTEXT_V2.LIST_PROMOTIONS],
      ["decideCandidate", CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE],
      ["createPromotion", CHANNELS.CONTEXT_V2.CREATE_PROMOTION],
      ["decidePromotion", CHANNELS.CONTEXT_V2.DECIDE_PROMOTION],
      [
        "listCandidateReviews",
        CHANNELS.CONTEXT_V2.LIST_CANDIDATE_REVIEWS,
      ],
      ["getCandidateReview", CHANNELS.CONTEXT_V2.GET_CANDIDATE_REVIEW],
      [
        "decideCandidateReview",
        CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE_REVIEW,
      ],
    ];

    const seen = new Set();
    bindings.forEach(([method, channel]) => {
      ipcRenderer.invoke.mockClear();
      bridge[method]({ ownerChatId: "chat-1" });
      expect(ipcRenderer.invoke.mock.calls[0][0]).toBe(channel);
      seen.add(channel);
    });
    expect(seen.size).toBe(bindings.length);
  });

  // The renderer has NO direct Context V2 delete capability at all. Deletion is
  // initiated through the chat store and completed by the main-process
  // deletion outbox, which calls unchainService.deleteContextV2Chat internally.
  // A renderer-reachable delete would let a compromised renderer destroy one
  // store's context while the other stores kept theirs.
  test("has no chat-deletion capability — method and channel are both gone", () => {
    expect(bridge.deleteChat).toBeUndefined();
    expect(Object.keys(bridge)).not.toContain("deleteChat");
    // Nothing on the bridge is delete-shaped under any other name.
    expect(
      Object.keys(bridge).filter((method) => /delete|destroy|purge|drop/i.test(method)),
    ).toEqual([]);

    // The channel constant itself is gone, so no caller can even name it.
    expect(CHANNELS.CONTEXT_V2.DELETE_CHAT).toBeUndefined();
    expect(Object.keys(CHANNELS.CONTEXT_V2)).toHaveLength(18);
    expect(
      Object.values(CHANNELS.CONTEXT_V2).filter((channel) =>
        /delete|destroy|purge|drop/i.test(channel),
      ),
    ).toEqual([]);

    // And no surviving method reaches a delete-chat channel by any path.
    Object.keys(bridge).forEach((method) => {
      ipcRenderer.invoke.mockClear();
      bridge[method]({ ownerChatId: "chat-1", operationId: "op-delete-0001" });
      const [channel] = ipcRenderer.invoke.mock.calls[0];
      expect(channel).not.toMatch(/delete/i);
    });
  });
});
