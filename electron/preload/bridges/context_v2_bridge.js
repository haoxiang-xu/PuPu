const { CHANNELS } = require("../../shared/channels");

// window.contextV2API — Memory / Context V2 (P0) control plane.
//
// A SEPARATE bridge from window.unchainAPI on purpose. The unchain bridge is
// already an oversized, high-blast-radius surface; Context V2 gets its own
// small, individually auditable window global so its capability list can be
// read in one screen and locked by contract tests.
//
// Exactly eighteen methods, each one a fixed capability:
//   getStatus / listEvents / readContent / getSessionHead / rebaseSession /
//   listSpaces / getTree / listEntries / search / listCandidates /
//   listJobs / listPromotions / decideCandidate / createPromotion /
//   decidePromotion / listCandidateReviews / getCandidateReview /
//   decideCandidateReview
//
// Invariants held HERE (main re-validates everything independently):
//   * Every payload is REBUILT field-by-field from an explicit allowlist. A
//     caller-supplied object is never forwarded, never spread — extra keys on
//     it can never ride the channel.
//   * No method takes a method / path / url / endpoint / fetch argument. There
//     is no generic proxy shape to construct.
//   * The unchain auth token, the sidecar port and filesystem paths are not
//     part of any call shape in either direction.
//   * The promotion TARGET NAMESPACE is server-bound and is deliberately NOT
//     an allowlisted field — it must never be added here.
//   * Internal Flask surface (event append, session bootstrap, job
//     claim/heartbeat/complete/fail, space/entry mutation, candidate create,
//     candidate-review PROPOSE) has no method on this bridge at all.
//   * CHAT DELETION IS ABSENT ON PURPOSE. The renderer cannot delete Context
//     V2 state directly at all; it asks the chat store to delete a chat, and
//     the main-process deletion outbox durably finishes the Context V2 and
//     Vault cleanup. A `deleteChat` method here would let a compromised
//     renderer drop one store's context and leave the others intact.
const createContextV2Bridge = (ipcRenderer) => {
  if (!ipcRenderer) {
    throw new Error("createContextV2Bridge: ipcRenderer is required");
  }

  // Status is COUNT-FREE by contract (main rebuilds it from an allowlist), and
  // takes no arguments at all.
  const getStatus = () => ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_STATUS);

  const listEvents = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_EVENTS, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      sessionId: payload ? payload.sessionId : undefined,
      attemptId: payload ? payload.attemptId : undefined,
      after: payload ? payload.after : undefined,
      limit: payload ? payload.limit : undefined,
      includePayload: payload ? payload.includePayload : undefined,
    });

  const readContent = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.READ_CONTENT, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      ref: payload ? payload.ref : undefined,
      offset: payload ? payload.offset : undefined,
      limit: payload ? payload.limit : undefined,
    });

  const getSessionHead = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_SESSION_HEAD, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      sessionId: payload ? payload.sessionId : undefined,
    });

  const rebaseSession = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.REBASE_SESSION, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      sessionId: payload ? payload.sessionId : undefined,
      replacementHistory: payload ? payload.replacementHistory : undefined,
      sourceGenerationId: payload ? payload.sourceGenerationId : undefined,
      expectedSessionRevision: payload
        ? payload.expectedSessionRevision
        : undefined,
      operationId: payload ? payload.operationId : undefined,
      reason: payload ? payload.reason : undefined,
    });

  const listSpaces = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_SPACES, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
    });

  const getTree = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_TREE, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      spaceId: payload ? payload.spaceId : undefined,
    });

  const listEntries = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_ENTRIES, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      spaceId: payload ? payload.spaceId : undefined,
      parentPath: payload ? payload.parentPath : undefined,
      includeDescendants: payload ? payload.includeDescendants : undefined,
    });

  const search = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.SEARCH_ENTRIES, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      query: payload ? payload.query : undefined,
      spaceId: payload ? payload.spaceId : undefined,
      limit: payload ? payload.limit : undefined,
    });

  const listCandidates = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_CANDIDATES, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      status: payload ? payload.status : undefined,
      limit: payload ? payload.limit : undefined,
    });

  // Read-only job visibility. There is no claim / heartbeat / complete / fail
  // method on this bridge — the worker lease protocol is not renderer surface.
  const listJobs = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_JOBS, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      status: payload ? payload.status : undefined,
      limit: payload ? payload.limit : undefined,
    });

  const listPromotions = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_PROMOTIONS, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      status: payload ? payload.status : undefined,
      limit: payload ? payload.limit : undefined,
    });

  const decideCandidate = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      candidateId: payload ? payload.candidateId : undefined,
      decision: payload ? payload.decision : undefined,
      expectedRevision: payload ? payload.expectedRevision : undefined,
      expectedSpaceRevision: payload
        ? payload.expectedSpaceRevision
        : undefined,
      decisionReason: payload ? payload.decisionReason : undefined,
      operationId: payload ? payload.operationId : undefined,
    });

  // NOTE: no targetNamespace field, by design. The promotion target namespace
  // is bound on the server; accepting it from the renderer would let a
  // compromised renderer choose where a memory lands.
  const createPromotion = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.CREATE_PROMOTION, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      sourceSpaceId: payload ? payload.sourceSpaceId : undefined,
      sourceEntryId: payload ? payload.sourceEntryId : undefined,
      sourceEntryRevision: payload ? payload.sourceEntryRevision : undefined,
      targetPath: payload ? payload.targetPath : undefined,
      targetEntryId: payload ? payload.targetEntryId : undefined,
      expectedTargetRevision: payload
        ? payload.expectedTargetRevision
        : undefined,
      operationId: payload ? payload.operationId : undefined,
    });

  const decidePromotion = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.DECIDE_PROMOTION, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      promotionId: payload ? payload.promotionId : undefined,
      decision: payload ? payload.decision : undefined,
      expectedRevision: payload ? payload.expectedRevision : undefined,
      decisionReason: payload ? payload.decisionReason : undefined,
      operationId: payload ? payload.operationId : undefined,
    });

  // ---- schema-v4 candidate reviews -------------------------------------
  // Read the review queue, read one review, decide it. Creating a review is a
  // curator-job product and has no method here: a renderer that could both
  // propose and decide would be approving its own writes.
  const listCandidateReviews = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.LIST_CANDIDATE_REVIEWS, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      status: payload ? payload.status : undefined,
      limit: payload ? payload.limit : undefined,
    });

  const getCandidateReview = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.GET_CANDIDATE_REVIEW, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      reviewId: payload ? payload.reviewId : undefined,
    });

  // The four expected* revisions are the CAS fences the decision is checked
  // against upstream. They are the only revision-shaped fields allowed; no
  // targetNamespace, targetPath, spaceId or jobId may be steered from here.
  const decideCandidateReview = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.CONTEXT_V2.DECIDE_CANDIDATE_REVIEW, {
      ownerChatId: payload ? payload.ownerChatId : undefined,
      reviewId: payload ? payload.reviewId : undefined,
      decision: payload ? payload.decision : undefined,
      expectedReviewRevision: payload
        ? payload.expectedReviewRevision
        : undefined,
      expectedCandidateRevision: payload
        ? payload.expectedCandidateRevision
        : undefined,
      expectedTargetRevision: payload
        ? payload.expectedTargetRevision
        : undefined,
      expectedSpaceRevision: payload
        ? payload.expectedSpaceRevision
        : undefined,
      decisionReason: payload ? payload.decisionReason : undefined,
      operationId: payload ? payload.operationId : undefined,
    });

  return {
    getStatus,
    listEvents,
    readContent,
    getSessionHead,
    rebaseSession,
    listSpaces,
    getTree,
    listEntries,
    search,
    listCandidates,
    listJobs,
    listPromotions,
    decideCandidate,
    createPromotion,
    decidePromotion,
    listCandidateReviews,
    getCandidateReview,
    decideCandidateReview,
  };
};

module.exports = { createContextV2Bridge };
