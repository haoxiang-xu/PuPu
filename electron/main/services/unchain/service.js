const { request: nodeHttpRequest } = require("http");
const { request: nodeHttpsRequest } = require("https");
const { Readable } = require("stream");
const { CHANNELS } = require("../../../shared/channels");
const { createPortFinder } = require("../../../shared/port_utils");
const {
  MEMORY_V2_ENV_KEYS,
  constrainMemoryV2ConfigForPlatform,
  projectMemoryV2Status,
  resolveMemoryV2ReleaseConfig,
  validateMemoryV2Status,
} = require("./memory_v2_rollout");

const UNCHAIN_HOST = "127.0.0.1";
const UNCHAIN_PORT_RANGE_START = 5879;
const UNCHAIN_PORT_RANGE_END = 5895;
const UNCHAIN_BOOT_TIMEOUT_MS = 60000;
const UNCHAIN_HEALTH_RETRY_MS = 250;
const UNCHAIN_RESTART_DELAY_MS = 1500;
/* restartMiso() only: how long to wait for a stop to actually land before
   starting again. Comfortably past stopMiso()'s 1200ms SIGTERM->SIGKILL
   escalation plus exit-handler latency. */
const UNCHAIN_RESTART_STOP_TIMEOUT_MS = 5000;
const UNCHAIN_RESTART_STOP_POLL_MS = 50;
const UNCHAIN_RUNTIME_CONTRACT_SCHEMA = "pupu.runtime-capabilities";
const UNCHAIN_RUNTIME_CONTRACT_VERSION = 1;
const UNCHAIN_DURABLE_JOBS_VERSION = "D4.1";
const UNCHAIN_DURABLE_JOB_WORKER_FLAG = "--durable-job-worker";
const UNCHAIN_STREAM_ENDPOINT = "/chat/stream";
const UNCHAIN_STREAM_V2_ENDPOINT = "/chat/stream/v2";
const UNCHAIN_STREAM_V4_ENDPOINT = "/chat/stream/v4";
const UNCHAIN_STREAM_REPLAY_MAX_EVENTS = 100000;
const UNCHAIN_STREAM_REPLAY_MAX_BYTES = 32 * 1024 * 1024;
const UNCHAIN_STREAM_REPLAY_TTL_MS = 30 * 60 * 1000;
const UNCHAIN_STREAM_REPLAY_COMPACT_MIN_HEAD = 4096;
const UNCHAIN_EXECUTION_CANCEL_ENDPOINT = "/chat/executions/cancel";
const UNCHAIN_TOOL_CONFIRMATION_ENDPOINT = "/chat/tool/confirmation";
const UNCHAIN_PENDING_INTERACTION_ENDPOINT = "/chat/interactions/pending";
const UNCHAIN_INTERJECT_ENDPOINT = "/chat/interject";
const UNCHAIN_HEALTH_ENDPOINT = "/health";
const UNCHAIN_COMPUTER_USE_STATUS_ENDPOINT = "/computer-use/status";
const UNCHAIN_COMPUTER_USE_CONFIG_ENDPOINT = "/computer-use/config";
const UNCHAIN_COMPUTER_USE_PROBE_ENDPOINT = "/computer-use/probe";
const UNCHAIN_MODELS_CATALOG_ENDPOINT = "/models/catalog";
const UNCHAIN_CUSTOM_PROVIDER_TEST_ENDPOINT =
  "/models/custom-providers/test";

// Allowlisted macOS System Settings deep links. The renderer may only pass a
// known target key; it can never hand us an arbitrary URL to open.
const COMPUTER_USE_PRIVACY_DEEP_LINKS = Object.freeze({
  screen_recording:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
  accessibility:
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
});
const COMPUTER_USE_BUILD_FEATURE_KEY = "enable_computer_use";
const COMPUTER_USE_RELEASE_ENV_KEY = "PUPU_FEATURE_COMPUTER_USE";
const FEATURE_FLAG_TRUE_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
  "enabled",
]);
const UNCHAIN_TOOLKIT_CATALOG_ENDPOINT = "/toolkits/catalog";
const UNCHAIN_TOOL_MODAL_CATALOG_ENDPOINT = "/toolkits/catalog/v2";
const UNCHAIN_TOOLKIT_DETAIL_ENDPOINT = "/toolkits";
const UNCHAIN_MCP_TOOLKITS_ENDPOINT = "/mcp/toolkits";
const UNCHAIN_MCP_TOOLKIT_INSTALL_ENDPOINT = "/mcp/toolkits/install";
const UNCHAIN_MCP_TOOLKIT_RELOAD_ENDPOINT = "/mcp/toolkits/reload";
const UNCHAIN_SKILLPACKS_ENDPOINT = "/skillpacks";
const UNCHAIN_SKILLPACK_INSTALL_ENDPOINT = "/skillpacks/install";
const UNCHAIN_MCP_OAUTH_START_ENDPOINT = "/mcp/oauth/start";
const UNCHAIN_MCP_OAUTH_CANCEL_ENDPOINT = "/mcp/oauth/cancel";
const UNCHAIN_MCP_OAUTH_STATUS_ENDPOINT = "/mcp/oauth/status";
const UNCHAIN_MCP_OAUTH_ENDPOINT = "/mcp/oauth";
const UNCHAIN_MCP_OAUTH_APPS_ENDPOINT = "/mcp/oauth/apps";
const UNCHAIN_MCP_STORE_METADATA_ENDPOINT = "/mcp/store/metadata";
const UNCHAIN_MCP_STORE_METADATA_RELOAD_ENDPOINT = "/mcp/store/metadata/reload";
const UNCHAIN_MCP_STORE_ENTRIES_ENDPOINT = "/mcp/store/entries";
const UNCHAIN_MCP_STORE_REGISTRIES_ENDPOINT = "/mcp/store/registries";
const UNCHAIN_MCP_STORE_REGISTRY_VALIDATE_ENDPOINT =
  "/mcp/store/registries/validate";
const UNCHAIN_MEMORY_PROJECTION_ENDPOINT = "/memory/projection";
const UNCHAIN_LONG_TERM_MEMORY_PROJECTION_ENDPOINT =
  "/memory/long-term/projection";
const UNCHAIN_REPLACE_SESSION_MEMORY_ENDPOINT = "/memory/session/replace";
const UNCHAIN_SESSION_MEMORY_EXPORT_ENDPOINT = "/memory/session/export";
const UNCHAIN_CHARACTERS_ENDPOINT = "/characters";
const UNCHAIN_CHARACTER_PREVIEW_ENDPOINT = "/characters/preview";
const UNCHAIN_CHARACTER_BUILD_ENDPOINT = "/characters/build";
const UNCHAIN_CHARACTER_IMPORT_ENDPOINT = "/characters/import";
const CONTEXT_V2_ENDPOINT = "/context/v2";
const CONTEXT_V2_MEMORY_ENDPOINT = "/context/v2/memory";

// ───────────────────────────────────────────────────────────────────────────
// Context / Memory V2 (P0) — renderer-facing boundary validation.
//
// The renderer reaches Context V2 through window.contextV2API → the CONTEXT_V2
// channels → the explicit `contextV2*` methods below. Everything the renderer
// can influence is validated HERE, at the main-process boundary, before any
// value is allowed to shape a URL, a query string or a JSON body:
//   * identifiers are matched against the sidecar's own identifier grammar,
//   * pagination is bounded (no unbounded page/limit/offset),
//   * content refs must match one of the known ref grammars AND are
//     percent-encoded per path segment before they touch the URL,
//   * every mutation body is REBUILT from an allowlist in snake_case — a
//     renderer object is never spread into a Flask payload,
//   * the promotion target namespace is server-bound (never accepted here),
//   * candidate-review responses are REBUILT on the way out too (bounded
//     previews, echoed ownerChatId) — a review body is largely free-form
//     curator output, so it is the one read worth projecting outbound.
// Error messages are static, field-name-only strings: no payload echo and no
// upstream stack ever crosses back to the renderer.
// ───────────────────────────────────────────────────────────────────────────

// Mirrors memory_v2_store._OWNER_ID_RE / _ID_RE. Main re-validates rather than
// trusting the sidecar to reject: a malformed id must never reach the wire.
const CONTEXT_V2_OWNER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const CONTEXT_V2_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
// Idempotency keys are machine-generated; 8..128 chars of the id charset.
const CONTEXT_V2_OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
// eslint-disable-next-line no-control-regex
const CONTEXT_V2_CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/;

const CONTEXT_V2_PATH_MAX_LENGTH = 1024;
const CONTEXT_V2_QUERY_MAX_LENGTH = 256;
const CONTEXT_V2_REASON_MAX_LENGTH = 4096;
const CONTEXT_V2_REF_MAX_LENGTH = 1024;
const CONTEXT_V2_PAGE_LIMIT_MAX = 500;
const CONTEXT_V2_CONTENT_LIMIT_MAX = 128 * 1024;
const CONTEXT_V2_CONTENT_LIMIT_DEFAULT = 32 * 1024;
const CONTEXT_V2_REBASE_HISTORY_MESSAGES_MAX = 10_000;
const CONTEXT_V2_REBASE_HISTORY_BYTES_MAX = 16 * 1024 * 1024;
const CONTEXT_V2_REBASE_MESSAGE_BYTES_MAX = 4 * 1024 * 1024;
const CONTEXT_V2_REBASE_JSON_DEPTH_MAX = 64;
const CONTEXT_V2_REBASE_JSON_NODES_MAX = 250_000;
const CONTEXT_V2_READINESS_TIMEOUT_MS = 5_000;

// Closed ref grammar, mirroring memory_v2_store's ref regexes. Anything else is
// rejected before encoding, so no traversal / query / fragment smuggling can
// reach the `<path:ref>` route.
const CONTEXT_V2_REF_PATTERNS = Object.freeze([
  /^pupu:\/\/memory\/[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^pupu:\/\/memory\/review\/[A-Za-z0-9][A-Za-z0-9._:-]*@[1-9][0-9]*\/(?:diff|proposed)$/,
  /^pupu:\/\/artifact\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^pupu:\/\/context\/event\/[A-Za-z0-9._:-]+$/,
  /^pupu:\/\/context\/event\/[A-Za-z0-9._:-]+\/content$/,
  /^pupu:\/\/context\/checkpoint\/[A-Za-z0-9._:-]+$/,
  /^entry:[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^event:[A-Za-z0-9._:-]+$/,
  /^event-content:[A-Za-z0-9._:-]+$/,
]);

const CONTEXT_V2_DECISIONS = Object.freeze(new Set(["apply", "reject"]));
const CONTEXT_V2_CANDIDATE_STATUSES = Object.freeze(
  new Set(["pending", "applied", "rejected", "superseded"]),
);
const CONTEXT_V2_JOB_STATUSES = Object.freeze(
  new Set(["pending", "leased", "completed", "failed", "cancelled"]),
);
const CONTEXT_V2_PROMOTION_STATUSES = Object.freeze(
  new Set(["pending", "applied", "rejected", "stale"]),
);
const CONTEXT_V2_REBASE_REASONS = Object.freeze(
  new Set(["resend", "edit", "delete"]),
);
// schema-v4 candidate_reviews.status, mirroring memory_v2_store's own filter.
const CONTEXT_V2_REVIEW_STATUSES = Object.freeze(
  new Set(["pending", "applied", "rejected", "stale"]),
);
// A review carries a rendered diff, so its response is bounded on the way OUT
// as well as validated on the way in: preview text is clamped and the review
// list is capped, so a compromised/buggy sidecar cannot push an unbounded blob
// across the IPC line into the renderer.
const CONTEXT_V2_REVIEW_PREVIEW_MAX_LENGTH = 8192;
const CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH = 4096;
const CONTEXT_V2_REVIEW_LIST_MAX = CONTEXT_V2_PAGE_LIMIT_MAX;
const CONTEXT_V2_REVIEW_SOURCE_EVENTS_MAX = 256;

// Same error transport contract as settings_storage / memory_vault: the stable
// code rides in the message behind a "[<code>] " prefix (Electron strips
// error.code across ipcMain.handle) AND stays on .code for main-process
// callers. `field` is always a literal from this file, never renderer input.
const createContextV2Error = (code, message) => {
  const error = new Error(`[${code}] ${message}`);
  error.code = code;
  return error;
};

const contextV2InvalidRequest = (field) =>
  createContextV2Error("context_v2_invalid_request", `${field} is invalid`);

const readContextV2String = (value) =>
  typeof value === "string" ? value.trim() : "";

const requireContextV2OwnerChatId = (value) => {
  const owner = readContextV2String(value);
  if (!CONTEXT_V2_OWNER_ID_PATTERN.test(owner)) {
    throw contextV2InvalidRequest("ownerChatId");
  }
  return owner;
};

const requireContextV2Identifier = (value, field) => {
  const id = readContextV2String(value);
  if (!CONTEXT_V2_ID_PATTERN.test(id)) {
    throw contextV2InvalidRequest(field);
  }
  return id;
};

const optionalContextV2Identifier = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return requireContextV2Identifier(value, field);
};

const requireContextV2OperationId = (value) => {
  const operationId = readContextV2String(value);
  if (!CONTEXT_V2_OPERATION_ID_PATTERN.test(operationId)) {
    throw contextV2InvalidRequest("operationId");
  }
  return operationId;
};

// Optimistic-concurrency revisions are 1-based positive integers upstream.
const requireContextV2Revision = (value, field) => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw contextV2InvalidRequest(field);
  }
  return value;
};

const optionalContextV2Revision = (value, field) => {
  if (value === undefined || value === null) {
    return null;
  }
  return requireContextV2Revision(value, field);
};

const requireContextV2SessionRevision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw contextV2InvalidRequest("expectedSessionRevision");
  }
  return value;
};

const requireContextV2RebaseReason = (value) => {
  const reason = readContextV2String(value).toLowerCase();
  if (!CONTEXT_V2_REBASE_REASONS.has(reason)) {
    throw contextV2InvalidRequest("reason");
  }
  return reason;
};

const cloneContextV2JsonValue = (value, state, depth = 0) => {
  if (depth > CONTEXT_V2_REBASE_JSON_DEPTH_MAX) {
    throw contextV2InvalidRequest("replacementHistory");
  }
  state.nodes += 1;
  if (state.nodes > CONTEXT_V2_REBASE_JSON_NODES_MAX) {
    throw contextV2InvalidRequest("replacementHistory");
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneContextV2JsonValue(item, state, depth + 1));
  }
  if (value && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    const cloned = Object.create(null);
    Object.keys(value).forEach((key) => {
      if (
        key.length > 512 ||
        CONTEXT_V2_CONTROL_CHARS_PATTERN.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      ) {
        throw contextV2InvalidRequest("replacementHistory");
      }
      cloned[key] = cloneContextV2JsonValue(value[key], state, depth + 1);
    });
    return cloned;
  }
  throw contextV2InvalidRequest("replacementHistory");
};

const requireContextV2ReplacementHistory = (value) => {
  if (
    !Array.isArray(value) ||
    value.length > CONTEXT_V2_REBASE_HISTORY_MESSAGES_MAX
  ) {
    throw contextV2InvalidRequest("replacementHistory");
  }
  const state = { nodes: 0 };
  const rebuilt = value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    const role = readContextV2String(message.role).toLowerCase();
    if (role !== "user" && role !== "assistant") {
      throw contextV2InvalidRequest("replacementHistory");
    }
    if (!Object.prototype.hasOwnProperty.call(message, "content")) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    const content = cloneContextV2JsonValue(message.content, state);
    if (content === null) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    const rebuiltMessage = { role, content };
    if (
      Buffer.byteLength(JSON.stringify(rebuiltMessage), "utf8") >
      CONTEXT_V2_REBASE_MESSAGE_BYTES_MAX
    ) {
      throw contextV2InvalidRequest("replacementHistory");
    }
    return rebuiltMessage;
  });
  if (
    Buffer.byteLength(JSON.stringify(rebuilt), "utf8") >
    CONTEXT_V2_REBASE_HISTORY_BYTES_MAX
  ) {
    throw contextV2InvalidRequest("replacementHistory");
  }
  return rebuilt;
};

const contextV2ResponseString = (value) =>
  typeof value === "string" ? value : "";

const contextV2ResponseIdentifier = (value) => {
  const identifier = contextV2ResponseString(value);
  return CONTEXT_V2_ID_PATTERN.test(identifier) ? identifier : "";
};

const contextV2ResponseNonNegativeInt = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : 0;

const contextV2ResponseEnum = (value, allowed) => {
  const normalized = contextV2ResponseString(value).toLowerCase();
  return allowed.has(normalized) ? normalized : "";
};

const contextV2SessionHeadResponse = (payload, ownerChatId, sessionId) => {
  const currentGenerationId = contextV2ResponseIdentifier(
    payload?.current_generation_id,
  );
  const sessionRevision = contextV2ResponseNonNegativeInt(
    payload?.session_revision,
  );
  const sessionExists = payload?.session_exists === true;
  return {
    ownerChatId,
    sessionId,
    admissionMode: contextV2ResponseEnum(
      payload?.admission_mode,
      new Set(["shadow", "active"]),
    ),
    targetMode: contextV2ResponseEnum(
      payload?.target_mode,
      new Set(["shadow", "active"]),
    ),
    bootstrapStatus: contextV2ResponseEnum(
      payload?.bootstrap_status,
      new Set(["pending", "complete", "failed"]),
    ),
    bootstrapErrorCode: contextV2ResponseIdentifier(
      payload?.bootstrap_error_code,
    ),
    v2Bootstrapped: payload?.v2_bootstrapped === true,
    sticky: payload?.sticky === true,
    sessionExists,
    mutationReady:
      payload?.mutation_ready === true &&
      sessionExists &&
      Boolean(currentGenerationId),
    currentGenerationId,
    currentGenerationNo: contextV2ResponseNonNegativeInt(
      payload?.current_generation_no,
    ),
    sessionRevision,
  };
};

const contextV2RebaseResponse = (
  payload,
  { ownerChatId, sessionId, sourceGenerationId, reason },
) => ({
  ownerChatId,
  sessionId,
  attemptId: contextV2ResponseIdentifier(payload?.attempt_id),
  generationId: contextV2ResponseIdentifier(payload?.generation_id),
  generationNo: contextV2ResponseNonNegativeInt(payload?.generation_no),
  sourceGenerationId,
  sourceGenerationRef: contextV2ResponseString(payload?.source_generation_ref),
  sessionRevision: contextV2ResponseNonNegativeInt(payload?.session_revision),
  eventCount: contextV2ResponseNonNegativeInt(payload?.event_count),
  messageEventCount: contextV2ResponseNonNegativeInt(
    payload?.message_event_count,
  ),
  eventRefs: Array.isArray(payload?.event_refs)
    ? payload.event_refs
        .filter((ref) => typeof ref === "string")
        .slice(0, CONTEXT_V2_REBASE_HISTORY_MESSAGES_MAX + 1)
    : [],
  turnMutationEventRef: contextV2ResponseString(
    payload?.turn_mutation_event_ref,
  ),
  captureQuality: contextV2ResponseString(payload?.capture_quality),
  journalDigest: contextV2ResponseString(payload?.journal_digest),
  pinnedTaskStateRevision: contextV2ResponseNonNegativeInt(
    payload?.pinned_task_state_revision,
  ),
  replacementHistoryHash: contextV2ResponseString(
    payload?.replacement_history_hash,
  ),
  reason,
  replayed: payload?.replayed === true,
});

const contextV2ResponseText = (value, maximum) =>
  contextV2ResponseString(value).slice(0, maximum);

// Candidate-review projection. Same discipline as the status and session-head
// responses: the sidecar payload is never forwarded, it is REBUILT from a
// closed field list. That matters more here than elsewhere because a review is
// the one Context V2 read whose body is largely free-form curator output — an
// upstream regression that started attaching an object id, a filesystem path,
// the auth token or an unbounded blob to a review would otherwise ride
// straight through to the renderer.
//
// `ownerChatId` is echoed from the CALLER's validated value, not from the
// payload, so a response can never re-attribute itself to another chat.
const contextV2CandidateReviewResponse = (payload, ownerChatId) => {
  const proposed = payload?.proposed;
  const target = payload?.target;
  const content = proposed?.content;
  const projected = {
    reviewId: contextV2ResponseIdentifier(payload?.review_id),
    reviewRef: contextV2ResponseText(
      payload?.review_ref,
      CONTEXT_V2_REF_MAX_LENGTH,
    ),
    ownerChatId,
    jobId: contextV2ResponseIdentifier(payload?.job_id),
    candidateId: contextV2ResponseIdentifier(payload?.candidate_id),
    candidateRef: contextV2ResponseText(
      payload?.candidate_ref,
      CONTEXT_V2_REF_MAX_LENGTH,
    ),
    candidateRevision: contextV2ResponseNonNegativeInt(
      payload?.candidate_revision,
    ),
    status: contextV2ResponseEnum(payload?.status, CONTEXT_V2_REVIEW_STATUSES),
    revision: contextV2ResponseNonNegativeInt(payload?.revision),
    decisionReason: contextV2ResponseText(
      payload?.decision_reason,
      CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
    ),
    diffRef: contextV2ResponseText(
      payload?.diff_ref,
      CONTEXT_V2_REF_MAX_LENGTH,
    ),
    diffPreview: contextV2ResponseText(
      payload?.diff_preview,
      CONTEXT_V2_REVIEW_PREVIEW_MAX_LENGTH,
    ),
    target: {
      spaceId: contextV2ResponseIdentifier(target?.space_id),
      path: contextV2ResponseText(target?.path, CONTEXT_V2_PATH_MAX_LENGTH),
      entryId: contextV2ResponseIdentifier(target?.entry_id),
      expectedRevision: contextV2ResponseNonNegativeInt(
        target?.expected_revision,
      ),
    },
    proposed: {
      mode: contextV2ResponseText(
        proposed?.mode,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      kind: contextV2ResponseText(
        proposed?.kind,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      description: contextV2ResponseText(
        proposed?.description,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      mimeType: contextV2ResponseText(
        proposed?.mime_type,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      linkUrl: contextV2ResponseText(
        proposed?.link_url,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      candidateRef: contextV2ResponseText(
        proposed?.candidate_ref,
        CONTEXT_V2_REF_MAX_LENGTH,
      ),
      candidateRevision: contextV2ResponseNonNegativeInt(
        proposed?.candidate_revision,
      ),
      sourceEventIds: Array.isArray(proposed?.source_event_ids)
        ? proposed.source_event_ids
            .filter((id) => typeof id === "string")
            .slice(0, CONTEXT_V2_REVIEW_SOURCE_EVENTS_MAX)
        : [],
    },
    createdAtMs: contextV2ResponseNonNegativeInt(payload?.created_at_ms),
    updatedAtMs: contextV2ResponseNonNegativeInt(payload?.updated_at_ms),
    decidedAtMs: contextV2ResponseNonNegativeInt(payload?.decided_at_ms),
    replayed: payload?.replayed === true,
  };
  // Content is optional (metadata-only reviews have none) and is described by
  // a ref the renderer reads through the existing READ_CONTENT grammar — the
  // bytes themselves never ride this response.
  if (content && typeof content === "object") {
    projected.proposed.content = {
      ref: contextV2ResponseText(content.ref, CONTEXT_V2_REF_MAX_LENGTH),
      mediaType: contextV2ResponseText(
        content.media_type,
        CONTEXT_V2_REVIEW_TEXT_MAX_LENGTH,
      ),
      bytes: contextV2ResponseNonNegativeInt(content.bytes),
      sha256: contextV2ResponseText(content.sha256, 128),
    };
  }
  return projected;
};

const contextV2CandidateReviewListResponse = (payload, ownerChatId) => ({
  ownerChatId,
  reviews: (Array.isArray(payload?.reviews) ? payload.reviews : [])
    .slice(0, CONTEXT_V2_REVIEW_LIST_MAX)
    .map((review) => contextV2CandidateReviewResponse(review, ownerChatId)),
});

const contextV2NonNegativeInt = (value, field, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw contextV2InvalidRequest(field);
  }
  return value;
};

const contextV2BoundedInt = (value, field, fallback, maximum) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw contextV2InvalidRequest(field);
  }
  return value;
};

const contextV2Boolean = (value, field, fallback) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    throw contextV2InvalidRequest(field);
  }
  return value;
};

// Virtual (in-store) paths only — never a filesystem path. Mirrors
// normalize_virtual_path: no backslash, no control chars, no "."/".." segment.
const requireContextV2Path = (value, field) => {
  const raw = readContextV2String(value);
  if (
    !raw ||
    raw.length > CONTEXT_V2_PATH_MAX_LENGTH ||
    raw.includes("\\") ||
    CONTEXT_V2_CONTROL_CHARS_PATTERN.test(raw)
  ) {
    throw contextV2InvalidRequest(field);
  }
  const segments = raw.split("/").filter((segment) => segment !== "");
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "." || segment === ".." || segment.length > 255,
    )
  ) {
    throw contextV2InvalidRequest(field);
  }
  return `/${segments.join("/")}`;
};

const optionalContextV2Path = (value, field) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  return requireContextV2Path(value, field);
};

const optionalContextV2Text = (value, field, maximum) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const text = readContextV2String(value);
  if (
    typeof value !== "string" ||
    text.length > maximum ||
    CONTEXT_V2_CONTROL_CHARS_PATTERN.test(text)
  ) {
    throw contextV2InvalidRequest(field);
  }
  return text;
};

const optionalContextV2Status = (value, allowed, field) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const status = readContextV2String(value).toLowerCase();
  if (!allowed.has(status)) {
    throw contextV2InvalidRequest(field);
  }
  return status;
};

const requireContextV2Decision = (value) => {
  const decision = readContextV2String(value).toLowerCase();
  if (!CONTEXT_V2_DECISIONS.has(decision)) {
    throw contextV2InvalidRequest("decision");
  }
  return decision;
};

const requireContextV2Ref = (value) => {
  const ref = readContextV2String(value);
  if (
    !ref ||
    ref.length > CONTEXT_V2_REF_MAX_LENGTH ||
    !CONTEXT_V2_REF_PATTERNS.some((pattern) => pattern.test(ref))
  ) {
    throw contextV2InvalidRequest("ref");
  }
  return ref;
};

// Refs are validated first, so this encoding is belt-and-braces: each path
// segment is percent-encoded independently and the "/" structure the
// `<path:ref>` route expects is preserved. No raw ref ever hits the URL.
const encodeContextV2Ref = (ref) =>
  ref
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const buildContextV2Query = (entries) => {
  const params = new URLSearchParams();
  entries.forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    params.set(key, typeof value === "boolean" ? String(value) : String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
};

const resolvePositiveReplaySetting = (value, fallback) => {
  const candidate = Number(value);
  return Number.isSafeInteger(candidate) && candidate > 0
    ? candidate
    : fallback;
};

const createStreamAbortError = (signal) => {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
};

const readStreamBodyText = async (body) => {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  try {
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        return text + decoder.decode();
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    if (typeof reader.releaseLock === "function") {
      reader.releaseLock();
    }
  }
};

const createNodeStreamFetch = ({
  httpRequest = nodeHttpRequest,
  httpsRequest = nodeHttpsRequest,
} = {}) => {
  return (url, options = {}) =>
    new Promise((resolve, reject) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (error) {
        reject(error);
        return;
      }

      const requestImpl =
        parsedUrl.protocol === "http:"
          ? httpRequest
          : parsedUrl.protocol === "https:"
            ? httpsRequest
            : null;
      if (typeof requestImpl !== "function") {
        reject(
          new TypeError(
            `Unsupported stream protocol: ${parsedUrl.protocol || "unknown"}`,
          ),
        );
        return;
      }

      const signal = options.signal;
      if (signal?.aborted) {
        reject(createStreamAbortError(signal));
        return;
      }

      let request = null;
      let responseStream = null;
      let responseSettled = false;
      let abortHandled = false;
      let abortListener = null;
      const cleanupAbortListener = () => {
        if (
          signal &&
          abortListener &&
          typeof signal.removeEventListener === "function"
        ) {
          signal.removeEventListener("abort", abortListener);
        }
      };
      const rejectBeforeResponse = (error) => {
        if (responseSettled) {
          return;
        }
        responseSettled = true;
        cleanupAbortListener();
        reject(error);
      };

      try {
        request = requestImpl(
          parsedUrl,
          {
            method: options.method || "GET",
            headers: options.headers || {},
          },
          (incomingResponse) => {
            if (responseSettled) {
              incomingResponse.destroy();
              return;
            }

            responseStream = incomingResponse;
            let body;
            try {
              body = Readable.toWeb(incomingResponse);
            } catch (error) {
              incomingResponse.destroy();
              rejectBeforeResponse(error);
              return;
            }

            responseSettled = true;
            incomingResponse.once("end", cleanupAbortListener);
            incomingResponse.once("close", cleanupAbortListener);
            incomingResponse.once("error", cleanupAbortListener);
            const status = Number(incomingResponse.statusCode || 0);
            resolve({
              ok: status >= 200 && status < 300,
              status,
              statusText: incomingResponse.statusMessage || "",
              body,
              text: () => readStreamBodyText(body),
            });
          },
        );
      } catch (error) {
        rejectBeforeResponse(error);
        return;
      }

      request.once("error", rejectBeforeResponse);
      if (typeof request.setTimeout === "function") {
        request.setTimeout(0);
      }

      if (signal && typeof signal.addEventListener === "function") {
        abortListener = () => {
          if (abortHandled) {
            return;
          }
          abortHandled = true;
          const error = createStreamAbortError(signal);
          if (responseStream && !responseStream.destroyed) {
            responseStream.destroy(error);
          }
          if (request && !request.destroyed) {
            request.destroy(error);
          }
          rejectBeforeResponse(error);
        };
        signal.addEventListener("abort", abortListener, { once: true });
        if (signal.aborted) {
          abortListener();
          return;
        }
      }

      try {
        request.end(options.body);
      } catch (error) {
        if (!request.destroyed) {
          request.destroy(error);
        }
        rejectBeforeResponse(error);
      }
    });
};

class MisoRuntimeContractError extends Error {
  constructor(message, contract = null) {
    super(message);
    this.name = "MisoRuntimeContractError";
    this.code = "miso_runtime_contract_incompatible";
    this.retryable = false;
    this.contract = contract;
  }
}

const cloneRuntimeContract = (contract) => {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    return null;
  }
  return JSON.parse(JSON.stringify(contract));
};

const readMisoHealthPayload = async (response) => {
  try {
    if (typeof response?.json === "function") {
      return await response.json();
    }
    if (typeof response?.text === "function") {
      const text = await response.text();
      return JSON.parse(text);
    }
  } catch (error) {
    throw new MisoRuntimeContractError(
      `Miso health returned invalid JSON: ${error?.message || String(error)}`,
    );
  }
  throw new MisoRuntimeContractError(
    "Miso health response did not include a JSON body",
  );
};

const validateMisoRuntimeContract = (healthPayload) => {
  const contract = healthPayload?.contract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new MisoRuntimeContractError(
      "Miso runtime contract is missing from /health",
    );
  }

  const fail = (reason) => {
    throw new MisoRuntimeContractError(
      `Incompatible Miso runtime contract: ${reason}`,
      contract,
    );
  };
  if (contract.schema !== UNCHAIN_RUNTIME_CONTRACT_SCHEMA) {
    fail(
      `expected schema ${UNCHAIN_RUNTIME_CONTRACT_SCHEMA}, received ${String(
        contract.schema || "missing",
      )}`,
    );
  }
  if (contract.version !== UNCHAIN_RUNTIME_CONTRACT_VERSION) {
    fail(
      `expected version ${UNCHAIN_RUNTIME_CONTRACT_VERSION}, received ${String(
        contract.version ?? "missing",
      )}`,
    );
  }

  const capabilities = contract.capabilities;
  if (
    !capabilities ||
    typeof capabilities !== "object" ||
    Array.isArray(capabilities)
  ) {
    fail("capabilities are missing");
  }
  for (const capability of [
    "runtime_events_v4",
    "execution_fencing",
    "durable_interactions",
    "exact_cancellation",
  ]) {
    if (capabilities[capability] !== true) {
      const reason = contract.reasons?.[capability];
      fail(
        `${capability} is required${
          typeof reason === "string" && reason.trim()
            ? ` (${reason.trim()})`
            : ""
        }`,
      );
    }
  }

  const durableJobs = capabilities.durable_jobs;
  if (
    !durableJobs ||
    typeof durableJobs !== "object" ||
    Array.isArray(durableJobs)
  ) {
    fail("durable_jobs capability is missing");
  }
  if (durableJobs.version !== UNCHAIN_DURABLE_JOBS_VERSION) {
    fail(
      `expected durable_jobs ${UNCHAIN_DURABLE_JOBS_VERSION}, received ${String(
        durableJobs.version || "missing",
      )}`,
    );
  }
  if (durableJobs.available !== true) {
    const reason =
      typeof durableJobs.reason === "string" ? durableJobs.reason.trim() : "";
    fail(
      `durable_jobs ${UNCHAIN_DURABLE_JOBS_VERSION} is unavailable${
        reason ? ` (${reason})` : ""
      }`,
    );
  }
  if (capabilities.automatic_wake_resume !== false) {
    fail("automatic_wake_resume must be explicitly false");
  }
  return contract;
};

const resolveComputerUseReleaseFlag = ({ app, fs, path }) => {
  const explicit = process.env[COMPUTER_USE_RELEASE_ENV_KEY];
  if (typeof explicit === "string" && explicit.trim()) {
    return FEATURE_FLAG_TRUE_VALUES.has(explicit.trim().toLowerCase());
  }

  if (typeof fs?.readFileSync !== "function") {
    return false;
  }

  const snapshotPath = app.isPackaged
    ? path.join(app.getAppPath(), "build", "build_feature_flags.json")
    : path.join(
        app.getAppPath(),
        ".local",
        "build_feature_flags.snapshot.json",
      );
  try {
    if (typeof fs.existsSync === "function" && !fs.existsSync(snapshotPath)) {
      return false;
    }
    const payload = JSON.parse(fs.readFileSync(snapshotPath, "utf-8"));
    return payload?.[COMPUTER_USE_BUILD_FEATURE_KEY] === true;
  } catch {
    return false;
  }
};

const createUnchainService = ({
  app,
  fs,
  path,
  spawn,
  spawnSync,
  crypto,
  net,
  streamRequestImpl = createNodeStreamFetch(),
  streamReplayConfig = {},
  shell = {},
  webContents,
  runtimeService,
  // Phase 4 (S4): main-internal provider-secret reader. Injected exactly the way
  // runtimeService is (index.js). Its readDecryptedProviderSecret is a
  // MAIN-INTERNAL method — never on the IPC allowlist, never bridged to renderer.
  settingsStorageService,
  // Memory V2 Vault remains main-internal. The URL + FD number enter the child
  // environment; the key is written once through anonymous FD 3 and is never
  // an environment variable or renderer capability.
  memoryVaultService,
  getAppIsQuitting,
  platform = process.platform,
}) => {
  const memoryV2ReleaseConfig = resolveMemoryV2ReleaseConfig({
    app,
    fs,
    path,
    environment: process.env,
  });
  const memoryV2RuntimeConfig = constrainMemoryV2ConfigForPlatform(
    memoryV2ReleaseConfig,
    platform,
  );
  const initialMemoryV2Readiness = () => {
    const protocolStatus = {
      runtimeProtocolDigest: "",
      runtimeProtocolVerification: "",
    };
    if (
      memoryV2ReleaseConfig.buildFeatureEnabled &&
      !memoryV2ReleaseConfig.snapshotValid
    ) {
      return {
        status: "degraded",
        reason:
          memoryV2ReleaseConfig.snapshotErrorCode ||
          "memory_v2_release_snapshot_invalid",
        sidecarFingerprint: "",
        ...protocolStatus,
      };
    }
    if (memoryV2RuntimeConfig.effectiveMode === "off") {
      return {
        status: "off",
        reason: "rollout_off",
        sidecarFingerprint: "",
        ...protocolStatus,
      };
    }
    return {
      status: "pending",
      reason: "not_verified",
      sidecarFingerprint: "",
      ...protocolStatus,
    };
  };
  let unchainProcess = null;
  let unchainPort = null;
  let unchainStatus = "stopped";
  let unchainStatusReason = "";
  let unchainRuntimeContract = null;
  let unchainAuthToken = "";
  let activeVaultBrokerKey = "";
  let unchainRestartTimer = null;
  let unchainIsStopping = false;
  let unchainPreserveStatusOnStop = false;
  let unchainStartPromise = null;
  let memoryV2Readiness = initialMemoryV2Readiness();
  // Tri-state desired computer-use flag. `null` = renderer has never expressed a
  // preference (do not touch sidecar env or re-push on restart); `true`/`false`
  // = last desired state, re-pushed after every ready transition so a sidecar
  // crash-restart converges back to the user's choice with no renderer involved.
  let lastComputerUseDesired = null;
  let lastComputerUseLocalBetaDesired = null;

  const unchainActiveStreams = new Map();
  const unchainStreamReplays = new Map();
  const replayConfig =
    streamReplayConfig && typeof streamReplayConfig === "object"
      ? streamReplayConfig
      : {};
  const streamReplayMaxEvents = resolvePositiveReplaySetting(
    replayConfig.maxEvents,
    UNCHAIN_STREAM_REPLAY_MAX_EVENTS,
  );
  const streamReplayMaxBytes = resolvePositiveReplaySetting(
    replayConfig.maxBytes,
    UNCHAIN_STREAM_REPLAY_MAX_BYTES,
  );
  const streamReplayTtlMs = resolvePositiveReplaySetting(
    replayConfig.ttlMs,
    UNCHAIN_STREAM_REPLAY_TTL_MS,
  );

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const { findAvailablePort } = createPortFinder(net);

  const getVaultBrokerBootstrap = () => {
    if (
      !memoryVaultService ||
      typeof memoryVaultService.getSinkBrokerBootstrap !== "function"
    ) {
      return null;
    }
    let candidate;
    try {
      candidate = memoryVaultService.getSinkBrokerBootstrap();
    } catch (_error) {
      return null;
    }
    const urlValue = candidate?.url;
    const keyValue = candidate?.key;
    if (
      typeof urlValue !== "string" ||
      typeof keyValue !== "string" ||
      !/^[0-9a-f]{64}$/.test(keyValue)
    ) {
      return null;
    }
    let parsed;
    try {
      parsed = new URL(urlValue);
    } catch (_error) {
      return null;
    }
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      !parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return { url: urlValue, key: keyValue };
  };

  const _parsePosixPsLine = (line) => {
    const match = String(line || "").match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      return null;
    }
    return {
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3] || "",
    };
  };

  const listStaleMisoPids = (entrypoint) => {
    if (!entrypoint || process.platform === "win32") {
      return [];
    }

    const scriptPath = Array.isArray(entrypoint.args) ? entrypoint.args[0] : "";
    const commandPath =
      typeof entrypoint.command === "string" ? entrypoint.command : "";
    const matchToken = String(scriptPath || commandPath || "").trim();
    if (!matchToken) {
      return [];
    }

    const psProbe = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (
      psProbe.error ||
      psProbe.status !== 0 ||
      typeof psProbe.stdout !== "string"
    ) {
      return [];
    }

    const stalePids = [];
    const rows = psProbe.stdout.split("\n");
    for (const row of rows) {
      const parsed = _parsePosixPsLine(row);
      if (!parsed) {
        continue;
      }

      // Only reap orphaned unchain server scripts from previous crashed sessions.
      if (parsed.ppid !== 1) {
        continue;
      }
      if (parsed.pid === process.pid) {
        continue;
      }
      if (!parsed.command.includes(matchToken)) {
        continue;
      }
      // The frozen durable-job wrapper intentionally outlives the sidecar.
      // It reuses the same packaged binary, so matching by executable path
      // alone would destroy a healthy job whenever PuPu restarts.
      if (parsed.command.includes(UNCHAIN_DURABLE_JOB_WORKER_FLAG)) {
        continue;
      }
      stalePids.push(parsed.pid);
    }

    return stalePids;
  };

  const terminateStaleMisoProcesses = (entrypoint) => {
    const stalePids = listStaleMisoPids(entrypoint);
    for (const pid of stalePids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        // Ignore races where process exits between ps and kill.
      }
    }
  };

  const looksLikeUnchainSource = (sourcePath) =>
    fs.existsSync(path.join(sourcePath, "pyproject.toml")) &&
    fs.existsSync(path.join(sourcePath, "src", "unchain", "__init__.py"));

  const resolveDevUnchainSourcePath = () => {
    const configuredSource = process.env.UNCHAIN_SOURCE_PATH;
    if (configuredSource && looksLikeUnchainSource(configuredSource)) {
      return configuredSource;
    }

    const siblingSource = path.resolve(app.getAppPath(), "..", "unchain");
    if (looksLikeUnchainSource(siblingSource)) {
      return siblingSource;
    }

    return null;
  };

  const UNCHAIN_REQUIRED_PYTHON_MODULES = [
    "flask",
    "mcp",
    "qdrant_client",
    "openai",
    "anthropic",
  ];
  const UNCHAIN_REQUIRED_PYTHON_VERSION = "3.12.x";

  const inspectPythonCommand = (
    pythonCommand,
    label,
    moduleNames = UNCHAIN_REQUIRED_PYTHON_MODULES,
  ) => {
    if (!pythonCommand) {
      return {
        ok: false,
        reason: `${label} is not configured.`,
      };
    }

    const probe = spawnSync(
      pythonCommand,
      [
        "-c",
        [
          "import importlib.util",
          "import json",
          "import sys",
          `module_names = ${JSON.stringify(moduleNames)}`,
          "missing = [name for name in module_names if importlib.util.find_spec(name) is None]",
          "print(json.dumps({",
          '    "version": sys.version.split()[0],',
          '    "major": sys.version_info[0],',
          '    "minor": sys.version_info[1],',
          '    "missing": missing,',
          "}))",
        ].join("\n"),
      ],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );

    if (probe.error) {
      return {
        ok: false,
        reason: `${label} is unavailable at ${pythonCommand}: ${probe.error.message}`,
      };
    }

    if (probe.status !== 0) {
      return {
        ok: false,
        reason: `${label} could not be inspected at ${pythonCommand}.`,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(String(probe.stdout || "").trim());
    } catch {
      return {
        ok: false,
        reason: `${label} returned an invalid probe response.`,
      };
    }

    if (parsed.major !== 3 || parsed.minor !== 12) {
      return {
        ok: false,
        reason: `${label} must use Python ${UNCHAIN_REQUIRED_PYTHON_VERSION}. Found ${parsed.version} at ${pythonCommand}.`,
      };
    }

    if (parsed.missing.length > 0) {
      return {
        ok: false,
        reason: `${label} is missing required modules (${parsed.missing.join(", ")}). Recreate that .venv with Python ${UNCHAIN_REQUIRED_PYTHON_VERSION}.`,
      };
    }

    return {
      ok: true,
      command: pythonCommand,
      version: parsed.version,
    };
  };

  const resolvePuPuVenvPythonPath = () => {
    const appPath = app.getAppPath();
    if (process.platform === "win32") {
      return path.join(appPath, ".venv", "Scripts", "python.exe");
    }
    return path.join(appPath, ".venv", "bin", "python");
  };

  const resolveMisoVenvPythonPath = () => {
    const unchainSourcePath = resolveDevUnchainSourcePath();
    if (!unchainSourcePath) {
      return null;
    }

    if (process.platform === "win32") {
      return path.join(unchainSourcePath, ".venv", "Scripts", "python.exe");
    }
    return path.join(unchainSourcePath, ".venv", "bin", "python");
  };

  const pickBestPythonCommand = () => {
    const candidates = [
      {
        label: "PuPu .venv",
        command: resolvePuPuVenvPythonPath(),
      },
      {
        label: "unchain .venv",
        command: resolveMisoVenvPythonPath(),
      },
    ];
    const failures = [];

    for (const candidate of candidates) {
      if (!candidate.command) {
        failures.push(`${candidate.label} could not be resolved.`);
        continue;
      }
      if (!fs.existsSync(candidate.command)) {
        failures.push(
          `${candidate.label} was not found at ${candidate.command}.`,
        );
        continue;
      }

      const inspection = inspectPythonCommand(
        candidate.command,
        candidate.label,
      );
      if (inspection.ok) {
        return inspection.command;
      }
      failures.push(inspection.reason);
    }

    throw new Error(
      [
        `PuPu requires a Python ${UNCHAIN_REQUIRED_PYTHON_VERSION} runtime in .venv.`,
        "Initialize ./scripts/init_python312_venv.sh in PuPu and ../unchain/scripts/init_python312_venv.sh in unchain.",
        ...failures,
      ].join(" "),
    );
  };

  const getMisoPythonCommand = () => {
    if (process.env.UNCHAIN_PYTHON_BIN) {
      const inspection = inspectPythonCommand(
        process.env.UNCHAIN_PYTHON_BIN,
        "UNCHAIN_PYTHON_BIN",
      );
      if (!inspection.ok) {
        throw new Error(inspection.reason);
      }
      return process.env.UNCHAIN_PYTHON_BIN;
    }
    return pickBestPythonCommand();
  };

  const getPackagedMisoBinaryPath = () => {
    if (process.platform === "darwin") {
      return path.join(
        process.resourcesPath,
        "unchain_runtime",
        "dist",
        "macos",
        "unchain-server",
      );
    }
    if (process.platform === "win32") {
      return path.join(
        process.resourcesPath,
        "unchain_runtime",
        "dist",
        "windows",
        "unchain-server.exe",
      );
    }
    return path.join(
      process.resourcesPath,
      "unchain_runtime",
      "dist",
      "linux",
      "unchain-server",
    );
  };

  const resolveMisoEntrypoint = () => {
    if (app.isPackaged) {
      const packagedBinary = getPackagedMisoBinaryPath();
      if (fs.existsSync(packagedBinary)) {
        return {
          command: packagedBinary,
          args: [],
          cwd: path.dirname(packagedBinary),
        };
      }

      const packagedScript = path.join(
        process.resourcesPath,
        "unchain_runtime",
        "server",
        "main.py",
      );
      if (!fs.existsSync(packagedScript)) {
        return null;
      }
      return {
        command: getMisoPythonCommand(),
        args: [packagedScript],
        cwd: path.dirname(packagedScript),
      };
    }

    const devScript = path.join(
      app.getAppPath(),
      "unchain_runtime",
      "server",
      "main.py",
    );
    if (!fs.existsSync(devScript)) {
      return null;
    }
    return {
      command: getMisoPythonCommand(),
      args: [devScript],
      cwd: path.dirname(devScript),
    };
  };

  // ---- Vault sink worker entrypoint --------------------------------------
  //
  // The one-shot Vault worker runs the SAME runtime as the sidecar, so its
  // launch coordinates are owned here rather than duplicated in index.js.
  //
  // Hard rules (security sign-off conditions):
  //  * takes NO parameters — nothing renderer-supplied can steer it,
  //  * never searches PATH / never uses a shell / never guesses a command,
  //  * packaged resolves ONLY the absolute onefile unchain-server binary
  //    (no Python fallback: a packaged app that lost its binary must fail
  //    closed, not fall back to whatever interpreter happens to exist),
  //  * dev resolves ONLY an absolute, validated Python 3.12 command plus the
  //    absolute server/main.py path,
  //  * every returned path is absolute and every failure is the same static
  //    code, so a caller cannot probe the filesystem through the error.
  const VAULT_SINK_WORKER_FLAG = "--vault-sink-worker";
  let vaultSinkWorkerEntrypoint = null;

  const vaultSinkWorkerUnavailable = () => {
    const error = new Error(
      "[vault_worker_unavailable] vault sink worker entrypoint is unavailable",
    );
    error.code = "vault_worker_unavailable";
    return error;
  };

  const absoluteExistingPath = (candidate) =>
    typeof candidate === "string" &&
    candidate.length > 0 &&
    !candidate.includes("\0") &&
    path.isAbsolute(candidate) &&
    fs.existsSync(candidate)
      ? candidate
      : null;

  const absoluteDirOrNull = (candidate) =>
    typeof candidate === "string" &&
    candidate.length > 0 &&
    !candidate.includes("\0") &&
    path.isAbsolute(candidate)
      ? candidate
      : null;

  const resolveVaultSinkWorkerEntrypoint = () => {
    // Resolved once per app run and frozen. Startup calls this a single time;
    // memoizing also means the dev Python probe (a spawnSync) never repeats.
    if (vaultSinkWorkerEntrypoint) return vaultSinkWorkerEntrypoint;

    const dataDir = absoluteDirOrNull(app.getPath("userData"));
    if (!dataDir) throw vaultSinkWorkerUnavailable();

    if (app.isPackaged) {
      const packagedBinary = absoluteExistingPath(getPackagedMisoBinaryPath());
      if (!packagedBinary) throw vaultSinkWorkerUnavailable();
      vaultSinkWorkerEntrypoint = Object.freeze({
        command: packagedBinary,
        args: Object.freeze([VAULT_SINK_WORKER_FLAG]),
        cwd: path.dirname(packagedBinary),
        dataDir,
        // Packaged sidecars must use PuPu's bundled, read-only runtime payload.
        mcpRuntimeDir: absoluteDirOrNull(
          path.join(process.resourcesPath || "", "mcp_runtime"),
        ),
      });
      return vaultSinkWorkerEntrypoint;
    }

    const devScript = absoluteExistingPath(
      path.join(app.getAppPath(), "unchain_runtime", "server", "main.py"),
    );
    if (!devScript) throw vaultSinkWorkerUnavailable();

    let pythonCommand = null;
    try {
      // Reuses the sidecar's validated candidates (PuPu/.venv, unchain/.venv,
      // or an explicit UNCHAIN_PYTHON_BIN) — all version- and module-checked.
      // Never a PATH lookup.
      pythonCommand = absoluteExistingPath(getMisoPythonCommand());
    } catch (_error) {
      // The probe's message names local paths; collapse it to the static code.
      pythonCommand = null;
    }
    if (!pythonCommand) throw vaultSinkWorkerUnavailable();

    vaultSinkWorkerEntrypoint = Object.freeze({
      command: pythonCommand,
      args: Object.freeze([devScript, VAULT_SINK_WORKER_FLAG]),
      cwd: path.dirname(devScript),
      dataDir,
      // Development only forwards an explicitly configured absolute override.
      mcpRuntimeDir: absoluteDirOrNull(process.env.PUPU_MCP_RUNTIME_DIR),
    });
    return vaultSinkWorkerEntrypoint;
  };

  const findAvailableMisoPort = async () => {
    return findAvailablePort({
      host: UNCHAIN_HOST,
      startPort: UNCHAIN_PORT_RANGE_START,
      endPort: UNCHAIN_PORT_RANGE_END,
      fallbackToEphemeral: true,
    });
  };

  const pingMiso = async () => {
    if (!unchainPort) {
      return false;
    }

    try {
      const response = await fetch(
        `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_HEALTH_ENDPOINT}`,
        {
          method: "GET",
          headers: unchainAuthToken
            ? { "x-unchain-auth": unchainAuthToken }
            : {},
        },
      );
      if (!response.ok) {
        return false;
      }
      const healthPayload = await readMisoHealthPayload(response);
      unchainRuntimeContract = cloneRuntimeContract(healthPayload?.contract);
      validateMisoRuntimeContract(healthPayload);
      return true;
    } catch (error) {
      if (error?.code === "miso_runtime_contract_incompatible") {
        unchainRuntimeContract = cloneRuntimeContract(
          error.contract || unchainRuntimeContract,
        );
        throw error;
      }
      return false;
    }
  };

  const waitForMisoReady = async () => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < UNCHAIN_BOOT_TIMEOUT_MS) {
      if (!unchainProcess || unchainProcess.killed) {
        return { ready: false, error: null };
      }

      try {
        // eslint-disable-next-line no-await-in-loop
        if (await pingMiso()) {
          return { ready: true, error: null };
        }
      } catch (error) {
        return { ready: false, error };
      }

      // eslint-disable-next-line no-await-in-loop
      await sleep(UNCHAIN_HEALTH_RETRY_MS);
    }

    return { ready: false, error: null };
  };

  const getMisoStatusPayload = () => ({
    status: unchainStatus,
    reason: unchainStatusReason || "",
    ready: unchainStatus === "ready",
    pid: unchainProcess?.pid || null,
    port: unchainPort,
    url: unchainPort ? `http://${UNCHAIN_HOST}:${unchainPort}` : null,
    contract: cloneRuntimeContract(unchainRuntimeContract),
    memoryV2: {
      configured: memoryV2ReleaseConfig.effectiveMode !== "off",
      ready:
        unchainStatus === "ready" && memoryV2Readiness.status === "ready",
      status: memoryV2Readiness.status,
      reason: memoryV2Readiness.reason,
      featureCeiling: memoryV2RuntimeConfig.featureCeiling,
      configuredMode: memoryV2RuntimeConfig.configuredMode,
      releaseRolloutMode: memoryV2RuntimeConfig.releaseEffectiveMode,
      rolloutMode: memoryV2RuntimeConfig.effectiveMode,
      canaryPercent: memoryV2RuntimeConfig.canaryPercent,
      readOnlyDegraded: memoryV2RuntimeConfig.readOnlyDegraded,
      platformActiveBlocked: memoryV2RuntimeConfig.platformActiveBlocked,
      releaseRolloutFingerprint:
        memoryV2RuntimeConfig.releaseRolloutFingerprint,
      rolloutFingerprint: memoryV2RuntimeConfig.rolloutFingerprint,
      sidecarFingerprint: memoryV2Readiness.sidecarFingerprint,
      runtimeProtocolDigest: memoryV2Readiness.runtimeProtocolDigest,
      runtimeProtocolVerification:
        memoryV2Readiness.runtimeProtocolVerification,
      snapshotFingerprint: memoryV2ReleaseConfig.snapshotFingerprint,
    },
  });

  const ensureMisoReady = () => {
    if (unchainStatus !== "ready" || !unchainPort) {
      const reasonSuffix =
        typeof unchainStatusReason === "string" && unchainStatusReason.trim()
          ? `, reason=${unchainStatusReason.trim()}`
          : "";
      throw new Error(
        `Miso service is not ready (status=${unchainStatus}${reasonSuffix})`,
      );
    }
  };

  const buildMisoUrl = (endpoint) => {
    ensureMisoReady();
    return `http://${UNCHAIN_HOST}:${unchainPort}${endpoint}`;
  };

  const buildMisoAssetUrl = (endpoint) => {
    const baseUrl = buildMisoUrl(endpoint);
    if (!unchainAuthToken) {
      return baseUrl;
    }
    return `${baseUrl}?unchain_auth=${encodeURIComponent(unchainAuthToken)}`;
  };

  const decorateCharacterAvatar = (character, { seed = false } = {}) => {
    if (!character || typeof character !== "object" || Array.isArray(character)) {
      return character;
    }

    const characterId =
      typeof character.id === "string" ? character.id.trim() : "";
    if (!characterId) {
      return character;
    }

    const avatarMeta =
      character.avatar &&
      typeof character.avatar === "object" &&
      !Array.isArray(character.avatar)
        ? character.avatar
        : null;
    const isBuiltinSeed =
      character.metadata &&
      typeof character.metadata === "object" &&
      character.metadata.origin === "builtin_seed";

    if (seed && !avatarMeta) {
      return character;
    }
    if (!seed && !avatarMeta && !isBuiltinSeed) {
      return character;
    }

    const avatar = avatarMeta ? { ...avatarMeta } : {};
    avatar.url = buildMisoAssetUrl(
      seed
        ? `${UNCHAIN_CHARACTERS_ENDPOINT}/seeds/${encodeURIComponent(characterId)}/avatar`
        : `${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(characterId)}/avatar`,
    );

    return {
      ...character,
      avatar,
    };
  };

  const readJsonResponse = async (
    response,
    errorPrefix,
    emptyPayload = {},
    invalidJsonMessage = "Invalid JSON response",
  ) => {
    const bodyText = await response.text();
    if (!response.ok) {
      let message = `${errorPrefix} (${response.status})`;
      let errorCode = "";
      if (bodyText) {
        try {
          const parsed = JSON.parse(bodyText);
          const serverCode =
            typeof parsed?.error?.code === "string" &&
            parsed.error.code.trim()
              ? parsed.error.code.trim()
              : "";
          const serverMessage =
            (typeof parsed?.error?.message === "string" &&
              parsed.error.message.trim()) ||
            (typeof parsed?.error === "string" && parsed.error.trim()) ||
            (typeof parsed?.message === "string" && parsed.message.trim()) ||
            "";
          errorCode = serverCode;
          if (serverMessage) {
            message = serverCode
              ? `${serverCode}: ${String(serverMessage)}`
              : String(serverMessage);
          }
        } catch {
          message = bodyText.slice(0, 200);
        }
      }
      const error = new Error(message);
      if (errorCode) {
        error.code = errorCode;
      }
      throw error;
    }

    if (!bodyText) {
      return emptyPayload;
    }

    try {
      return JSON.parse(bodyText);
    } catch {
      throw new Error(invalidJsonMessage);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Context / Memory V2 (P0) — the ONLY main-process surface the renderer has
  // for the sidecar's /context/v2 routes.
  //
  // Each method below is an explicit, individually named capability. There is
  // deliberately no generic proxy: no method/path/url/fetch parameter, no way
  // to reach a route that is not spelled out here. What is intentionally
  // ABSENT (internal / privileged Flask surface) stays absent:
  //   * event append + session bootstrap (owned by the stream path),
  //   * job create / claim / heartbeat / complete / fail (worker-lease
  //     protocol — a renderer must never take a lease),
  //   * space / entry create / update / delete (writes go through the
  //     candidate → decision funnel, not direct mutation),
  //   * candidate create (produced by the agent, not the renderer),
  //   * any long-term / cross-chat namespace selection.
  // The auth token, the sidecar port and every filesystem path stay inside
  // this closure; they are never returned to, nor accepted from, the renderer.
  // ─────────────────────────────────────────────────────────────────────────

  const contextV2Headers = (withBody = false) => {
    if (!unchainAuthToken) {
      throw createContextV2Error(
        "context_v2_missing_auth_token",
        "context v2 request is not authenticated",
      );
    }
    return withBody
      ? {
          "Content-Type": "application/json",
          "x-unchain-auth": unchainAuthToken,
        }
      : { "x-unchain-auth": unchainAuthToken };
  };

  const fetchContextV2StatusPayload = async () => {
    if (!unchainPort) {
      throw createContextV2Error(
        "context_v2_unreachable",
        "context v2 runtime is unreachable",
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      CONTEXT_V2_READINESS_TIMEOUT_MS,
    );
    if (typeof timeout.unref === "function") timeout.unref();
    try {
      const response = await fetch(
        `http://${UNCHAIN_HOST}:${unchainPort}${CONTEXT_V2_ENDPOINT}/status`,
        {
          method: "GET",
          headers: contextV2Headers(false),
          signal: controller.signal,
        },
      );
      return readJsonResponse(
        response,
        "Context V2 readiness failed",
        {},
        "Invalid Context V2 readiness response",
      );
    } finally {
      clearTimeout(timeout);
    }
  };

  const verifyContextV2Readiness = async () => {
    if (
      memoryV2ReleaseConfig.buildFeatureEnabled &&
      !memoryV2ReleaseConfig.snapshotValid
    ) {
      memoryV2Readiness = initialMemoryV2Readiness();
      return memoryV2Readiness;
    }
    if (memoryV2RuntimeConfig.effectiveMode === "off") {
      memoryV2Readiness = initialMemoryV2Readiness();
      return memoryV2Readiness;
    }
    try {
      const payload = await fetchContextV2StatusPayload();
      const validation = validateMemoryV2Status(
        payload,
        memoryV2RuntimeConfig,
      );
      if (validation.ok && memoryV2RuntimeConfig.platformActiveBlocked) {
        validation.ok = false;
        validation.reason = "vault_worker_containment_unavailable";
      }
      memoryV2Readiness = {
        status: validation.ok ? "ready" : "degraded",
        reason: validation.reason,
        sidecarFingerprint: validation.status.rolloutFingerprint,
        runtimeProtocolDigest:
          validation.status.runtimeProtocolManifest?.manifest_digest || "",
        runtimeProtocolVerification:
          validation.status.runtimeProtocolVerification,
      };
    } catch (_error) {
      memoryV2Readiness = {
        status: "degraded",
        reason: "context_v2_readiness_unavailable",
        sidecarFingerprint: "",
        runtimeProtocolDigest: "",
        runtimeProtocolVerification: "",
      };
    }
    return memoryV2Readiness;
  };

  const getContextV2ReadinessFailure = () => {
    if (
      memoryV2Readiness.reason === "context_v2_unchain_protocol_invalid"
    ) {
      return {
        code: "context_v2_unchain_protocol_invalid",
        message: "Memory V2 runtime protocol manifest is invalid",
      };
    }
    if (
      memoryV2Readiness.reason === "context_v2_unchain_protocol_incompatible"
    ) {
      return {
        code: "context_v2_unchain_protocol_incompatible",
        message: "Memory V2 runtime protocol is incompatible",
      };
    }
    return {
      code: "context_v2_readiness_failed",
      message: "Memory V2 capability is unavailable",
    };
  };

  // Single choke point for every Context V2 request. Transport failures are
  // normalized to a stable code — the raw fetch error (which can carry host,
  // port and a Node stack) never reaches the renderer.
  const contextV2Request = async (method, endpoint, body = null) => {
    ensureMisoReady();
    // `off` only disables new rollout admission. Existing sticky V2 chats must
    // still be able to recover/continue after a mode change; the sidecar remains
    // authoritative for session admission and owner binding on these requests.
    if (
      endpoint !== `${CONTEXT_V2_ENDPOINT}/status` &&
      memoryV2RuntimeConfig.effectiveMode !== "off" &&
      memoryV2Readiness.status !== "ready"
    ) {
      const failure = getContextV2ReadinessFailure();
      throw createContextV2Error(
        failure.code,
        failure.message,
      );
    }
    let response;
    try {
      response = await fetch(`http://${UNCHAIN_HOST}:${unchainPort}${endpoint}`, {
        method,
        headers: contextV2Headers(body !== null),
        ...(body !== null ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error && error.code === "context_v2_missing_auth_token") {
        throw error;
      }
      throw createContextV2Error(
        "context_v2_unreachable",
        "context v2 runtime is unreachable",
      );
    }

    try {
      return await readJsonResponse(
        response,
        "Context V2 request failed",
        {},
        "Invalid Context V2 response",
      );
    } catch (error) {
      // readJsonResponse surfaces the sidecar's stable error code; keep it and
      // re-wrap so the renderer only ever sees "[code] static message".
      const code =
        error && typeof error.code === "string" && error.code
          ? error.code
          : "context_v2_failed";
      throw createContextV2Error(code, "context v2 request failed");
    }
  };

  // Status is deliberately COUNT-FREE: it is rebuilt from an explicit
  // allowlist, so any row counts the sidecar might add later can never leak
  // out as a free enumeration oracle. It also carries no port, url or path.
  const getContextV2Status = async () => {
    if (unchainStatus !== "ready" || !unchainPort) {
      return {
        available: false,
        schemaVersion: 0,
        journalMode: "",
        lexicalBackend: "",
        vectorStatus: "",
        featureCeiling: "off",
        rolloutMode: "off",
        readOnlyDegraded: false,
      };
    }
    const payload = await contextV2Request("GET", `${CONTEXT_V2_ENDPOINT}/status`);
    const projected = projectMemoryV2Status(payload);
    if (memoryV2RuntimeConfig.effectiveMode !== "off") {
      const validation = validateMemoryV2Status(
        payload,
        memoryV2RuntimeConfig,
      );
      if (validation.ok && memoryV2RuntimeConfig.platformActiveBlocked) {
        validation.ok = false;
        validation.reason = "vault_worker_containment_unavailable";
      }
      memoryV2Readiness = {
        status: validation.ok ? "ready" : "degraded",
        reason: validation.reason,
        sidecarFingerprint: validation.status.rolloutFingerprint,
        runtimeProtocolDigest:
          validation.status.runtimeProtocolManifest?.manifest_digest || "",
        runtimeProtocolVerification:
          validation.status.runtimeProtocolVerification,
      };
      projected.available = projected.available && validation.ok;
    }
    return {
      available: projected.available,
      schemaVersion: projected.schemaVersion,
      journalMode: projected.journalMode,
      lexicalBackend: projected.lexicalBackend,
      vectorStatus: projected.vectorStatus,
      featureCeiling: projected.featureCeiling,
      rolloutMode: projected.rolloutMode,
      readOnlyDegraded: projected.readOnlyDegraded,
    };
  };

  const listContextV2Events = async (payload = {}) => {
    const query = buildContextV2Query([
      ["owner_chat_id", requireContextV2OwnerChatId(payload?.ownerChatId)],
      ["after", contextV2NonNegativeInt(payload?.after, "after", 0)],
      [
        "limit",
        contextV2BoundedInt(
          payload?.limit,
          "limit",
          100,
          CONTEXT_V2_PAGE_LIMIT_MAX,
        ),
      ],
      ["session_id", optionalContextV2Identifier(payload?.sessionId, "sessionId")],
      ["attempt_id", optionalContextV2Identifier(payload?.attemptId, "attemptId")],
      [
        "include_payload",
        contextV2Boolean(payload?.includePayload, "includePayload", true),
      ],
    ]);
    return contextV2Request("GET", `${CONTEXT_V2_ENDPOINT}/events${query}`);
  };

  const readContextV2Content = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const ref = requireContextV2Ref(payload?.ref);
    const query = buildContextV2Query([
      ["owner_chat_id", ownerChatId],
      ["offset", contextV2NonNegativeInt(payload?.offset, "offset", 0)],
      [
        "limit",
        contextV2BoundedInt(
          payload?.limit,
          "limit",
          CONTEXT_V2_CONTENT_LIMIT_DEFAULT,
          CONTEXT_V2_CONTENT_LIMIT_MAX,
        ),
      ],
    ]);
    return contextV2Request(
      "GET",
      `${CONTEXT_V2_ENDPOINT}/content/${encodeContextV2Ref(ref)}${query}`,
    );
  };

  const getContextV2SessionHead = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const sessionId = requireContextV2Identifier(
      payload?.sessionId,
      "sessionId",
    );
    const query = buildContextV2Query([
      ["owner_chat_id", ownerChatId],
      ["session_id", sessionId],
    ]);
    const response = await contextV2Request(
      "GET",
      `${CONTEXT_V2_ENDPOINT}/session/head${query}`,
    );
    return contextV2SessionHeadResponse(response, ownerChatId, sessionId);
  };

  const rebaseContextV2Session = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const sessionId = requireContextV2Identifier(
      payload?.sessionId,
      "sessionId",
    );
    const replacementHistory = requireContextV2ReplacementHistory(
      payload?.replacementHistory,
    );
    const sourceGenerationId = requireContextV2Identifier(
      payload?.sourceGenerationId,
      "sourceGenerationId",
    );
    const expectedSessionRevision = requireContextV2SessionRevision(
      payload?.expectedSessionRevision,
    );
    const operationId = requireContextV2OperationId(payload?.operationId);
    const reason = requireContextV2RebaseReason(payload?.reason);
    const response = await contextV2Request(
      "POST",
      `${CONTEXT_V2_ENDPOINT}/session/rebase`,
      {
        owner_chat_id: ownerChatId,
        session_id: sessionId,
        replacement_history: replacementHistory,
        source_generation_id: sourceGenerationId,
        expected_session_revision: expectedSessionRevision,
        operation_id: operationId,
        reason,
      },
    );
    return contextV2RebaseResponse(response, {
      ownerChatId,
      sessionId,
      sourceGenerationId,
      reason,
    });
  };

  const deleteContextV2Chat = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    return contextV2Request(
      "DELETE",
      `${CONTEXT_V2_ENDPOINT}/chat/${encodeURIComponent(ownerChatId)}`,
      { operation_id: requireContextV2OperationId(payload?.operationId) },
    );
  };

  const listContextV2Spaces = async (payload = {}) => {
    const query = buildContextV2Query([
      ["owner_chat_id", requireContextV2OwnerChatId(payload?.ownerChatId)],
    ]);
    return contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/spaces${query}`,
    );
  };

  const getContextV2Tree = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const spaceId = requireContextV2Identifier(payload?.spaceId, "spaceId");
    const query = buildContextV2Query([["owner_chat_id", ownerChatId]]);
    return contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/spaces/${encodeURIComponent(spaceId)}/tree${query}`,
    );
  };

  const listContextV2Entries = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const spaceId = requireContextV2Identifier(payload?.spaceId, "spaceId");
    const query = buildContextV2Query([
      ["owner_chat_id", ownerChatId],
      ["parent_path", optionalContextV2Path(payload?.parentPath, "parentPath")],
      [
        "include_descendants",
        contextV2Boolean(
          payload?.includeDescendants,
          "includeDescendants",
          true,
        ),
      ],
    ]);
    return contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/spaces/${encodeURIComponent(spaceId)}/entries${query}`,
    );
  };

  const searchContextV2Entries = async (payload = {}) => {
    const query = buildContextV2Query([
      ["owner_chat_id", requireContextV2OwnerChatId(payload?.ownerChatId)],
      [
        "q",
        optionalContextV2Text(payload?.query, "query", CONTEXT_V2_QUERY_MAX_LENGTH),
      ],
      ["space_id", optionalContextV2Identifier(payload?.spaceId, "spaceId")],
      [
        "limit",
        contextV2BoundedInt(
          payload?.limit,
          "limit",
          100,
          CONTEXT_V2_PAGE_LIMIT_MAX,
        ),
      ],
    ]);
    return contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/search${query}`,
    );
  };

  const buildContextV2ListQuery = (payload, statuses, field) =>
    buildContextV2Query([
      ["owner_chat_id", requireContextV2OwnerChatId(payload?.ownerChatId)],
      ["status", optionalContextV2Status(payload?.status, statuses, field)],
      [
        "limit",
        contextV2BoundedInt(
          payload?.limit,
          "limit",
          100,
          CONTEXT_V2_PAGE_LIMIT_MAX,
        ),
      ],
    ]);

  const listContextV2Candidates = async (payload = {}) =>
    contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/candidates${buildContextV2ListQuery(
        payload,
        CONTEXT_V2_CANDIDATE_STATUSES,
        "status",
      )}`,
    );

  // Read-only job visibility. The lease protocol (claim / heartbeat /
  // complete / fail) is intentionally NOT exposed on this bridge.
  const listContextV2Jobs = async (payload = {}) =>
    contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/jobs${buildContextV2ListQuery(
        payload,
        CONTEXT_V2_JOB_STATUSES,
        "status",
      )}`,
    );

  const listContextV2Promotions = async (payload = {}) =>
    contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/promotions${buildContextV2ListQuery(
        payload,
        CONTEXT_V2_PROMOTION_STATUSES,
        "status",
      )}`,
    );

  const decideContextV2Candidate = async (payload = {}) => {
    const candidateId = requireContextV2Identifier(
      payload?.candidateId,
      "candidateId",
    );
    const body = {
      owner_chat_id: requireContextV2OwnerChatId(payload?.ownerChatId),
      decision: requireContextV2Decision(payload?.decision),
      expected_revision: requireContextV2Revision(
        payload?.expectedRevision,
        "expectedRevision",
      ),
      operation_id: requireContextV2OperationId(payload?.operationId),
      decision_reason: optionalContextV2Text(
        payload?.decisionReason,
        "decisionReason",
        CONTEXT_V2_REASON_MAX_LENGTH,
      ),
    };
    const expectedSpaceRevision = optionalContextV2Revision(
      payload?.expectedSpaceRevision,
      "expectedSpaceRevision",
    );
    if (expectedSpaceRevision !== null) {
      body.expected_space_revision = expectedSpaceRevision;
    }
    return contextV2Request(
      "POST",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/candidates/${encodeURIComponent(candidateId)}/decision`,
      body,
    );
  };

  // Promotion proposal. `target_namespace` is server-bound (the Flask route
  // hardcodes it) and is NEVER accepted from the renderer — it is not on this
  // allowlist and must never be added here.
  const createContextV2Promotion = async (payload = {}) => {
    const body = {
      owner_chat_id: requireContextV2OwnerChatId(payload?.ownerChatId),
      source_space_id: requireContextV2Identifier(
        payload?.sourceSpaceId,
        "sourceSpaceId",
      ),
      source_entry_id: requireContextV2Identifier(
        payload?.sourceEntryId,
        "sourceEntryId",
      ),
      source_entry_revision: requireContextV2Revision(
        payload?.sourceEntryRevision,
        "sourceEntryRevision",
      ),
      target_path: requireContextV2Path(payload?.targetPath, "targetPath"),
      target_entry_id: optionalContextV2Identifier(
        payload?.targetEntryId,
        "targetEntryId",
      ),
      operation_id: requireContextV2OperationId(payload?.operationId),
    };
    const expectedTargetRevision = optionalContextV2Revision(
      payload?.expectedTargetRevision,
      "expectedTargetRevision",
    );
    if (expectedTargetRevision !== null) {
      body.expected_target_revision = expectedTargetRevision;
    }
    return contextV2Request(
      "POST",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/promotions`,
      body,
    );
  };

  const decideContextV2Promotion = async (payload = {}) => {
    const promotionId = requireContextV2Identifier(
      payload?.promotionId,
      "promotionId",
    );
    return contextV2Request(
      "POST",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/promotions/${encodeURIComponent(promotionId)}/decision`,
      {
        owner_chat_id: requireContextV2OwnerChatId(payload?.ownerChatId),
        decision: requireContextV2Decision(payload?.decision),
        expected_revision: requireContextV2Revision(
          payload?.expectedRevision,
          "expectedRevision",
        ),
        operation_id: requireContextV2OperationId(payload?.operationId),
        decision_reason: optionalContextV2Text(
          payload?.decisionReason,
          "decisionReason",
          CONTEXT_V2_REASON_MAX_LENGTH,
        ),
      },
    );
  };

  // ---- schema-v4 candidate reviews ---------------------------------------
  // Three fixed routes. There is deliberately no propose/create counterpart:
  // reviews are produced by a curator job holding a lease that never crosses
  // the IPC line, so the renderer can only read and adjudicate what a job has
  // already proposed.
  const listContextV2CandidateReviews = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const query = buildContextV2Query([
      ["owner_chat_id", ownerChatId],
      [
        "status",
        optionalContextV2Status(
          payload?.status,
          CONTEXT_V2_REVIEW_STATUSES,
          "status",
        ),
      ],
      [
        "limit",
        contextV2BoundedInt(
          payload?.limit,
          "limit",
          100,
          CONTEXT_V2_PAGE_LIMIT_MAX,
        ),
      ],
    ]);
    const response = await contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/reviews${query}`,
    );
    return contextV2CandidateReviewListResponse(response, ownerChatId);
  };

  const getContextV2CandidateReview = async (payload = {}) => {
    const ownerChatId = requireContextV2OwnerChatId(payload?.ownerChatId);
    const reviewId = requireContextV2Identifier(payload?.reviewId, "reviewId");
    const query = buildContextV2Query([["owner_chat_id", ownerChatId]]);
    const response = await contextV2Request(
      "GET",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/reviews/${encodeURIComponent(reviewId)}${query}`,
    );
    return contextV2CandidateReviewResponse(response, ownerChatId);
  };

  // Decision body allowlist. expected_review_revision is REQUIRED — a decision
  // without a CAS fence on the review itself could apply a diff the user never
  // saw. The other three fences are optional because not every review targets
  // an existing entry/space, but when present they are integers only.
  //
  // Not on this allowlist, and never to be added: target path / space id / job
  // id / namespace. Those come from the stored review, so the renderer decides
  // WHETHER a proposed write lands, never WHERE it lands.
  const decideContextV2CandidateReview = async (payload = {}) => {
    const reviewId = requireContextV2Identifier(payload?.reviewId, "reviewId");
    const body = {
      owner_chat_id: requireContextV2OwnerChatId(payload?.ownerChatId),
      decision: requireContextV2Decision(payload?.decision),
      expected_review_revision: requireContextV2Revision(
        payload?.expectedReviewRevision,
        "expectedReviewRevision",
      ),
      operation_id: requireContextV2OperationId(payload?.operationId),
      decision_reason: optionalContextV2Text(
        payload?.decisionReason,
        "decisionReason",
        CONTEXT_V2_REASON_MAX_LENGTH,
      ),
    };
    const optionalFences = [
      ["expected_candidate_revision", "expectedCandidateRevision"],
      ["expected_target_revision", "expectedTargetRevision"],
      ["expected_space_revision", "expectedSpaceRevision"],
    ];
    optionalFences.forEach(([bodyKey, field]) => {
      const revision = optionalContextV2Revision(payload?.[field], field);
      if (revision !== null) {
        body[bodyKey] = revision;
      }
    });
    const response = await contextV2Request(
      "POST",
      `${CONTEXT_V2_MEMORY_ENDPOINT}/reviews/${encodeURIComponent(reviewId)}/decision`,
      body,
    );
    return contextV2CandidateReviewResponse(response, body.owner_chat_id);
  };

  const getMisoModelCatalogPayload = async () => {
    if (unchainStatus === "starting") {
      return {};
    }

    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_MODELS_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso model catalog request failed",
      {},
      "Invalid Miso model catalog response",
    );
  };

  const getComputerUseDisabledPayload = (reason = "") => ({
    enabled: false,
    feature_available: false,
    local_beta_enabled: false,
    reason,
    capabilities: null,
    active: null,
  });

  const getComputerUseStatusPayload = async () => {
    if (unchainStatus === "starting") {
      return getComputerUseDisabledPayload("starting");
    }
    if (unchainStatus !== "ready" || !unchainPort) {
      return getComputerUseDisabledPayload(unchainStatusReason || "not_ready");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_COMPUTER_USE_STATUS_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Computer use status request failed",
      getComputerUseDisabledPayload("empty_response"),
      "Invalid computer use status response",
    );
  };

  const openComputerUsePrivacySettings = async (target = "") => {
    const key = typeof target === "string" ? target.trim() : "";
    const url = COMPUTER_USE_PRIVACY_DEEP_LINKS[key];
    if (!url) {
      return { ok: false, error: `Unknown privacy target: ${key || "(empty)"}` };
    }
    if (!shell || typeof shell.openExternal !== "function") {
      return { ok: false, error: "openExternal is unavailable" };
    }
    try {
      await shell.openExternal(url);
      return { ok: true, target: key };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || "Failed to open System Settings",
      };
    }
  };

  // Runtime override POST to the sidecar. Assumes readiness has already been
  // asserted by the caller (setComputerUseEnabled) or that we are inside the
  // post-ready re-push path. Always sends the auth header; a missing token is a
  // structured error rather than an unauthenticated write.
  const pushComputerUseConfig = async (
    enabled = undefined,
    localBetaEnabled = undefined,
  ) => {
    if (!unchainAuthToken) {
      const error = new Error(
        "Computer use config request failed: missing auth token",
      );
      error.code = "missing_auth_token";
      throw error;
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_COMPUTER_USE_CONFIG_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-unchain-auth": unchainAuthToken,
        },
        body: JSON.stringify({
          ...(typeof enabled === "boolean" ? { enabled } : {}),
          ...(typeof localBetaEnabled === "boolean"
            ? { local_beta_enabled: localBetaEnabled }
            : {}),
        }),
      },
    );

    return readJsonResponse(
      response,
      "Computer use config request failed",
      {
        ...(typeof enabled === "boolean" ? { enabled } : {}),
        ...(typeof localBetaEnabled === "boolean"
          ? { local_beta_enabled: localBetaEnabled }
          : {}),
      },
      "Invalid computer use config response",
    );
  };

  // Renderer-driven enable/disable of computer use. Updates the desired-state
  // cache FIRST (so a crash-restart re-push converges even if this POST fails),
  // then performs the authorized runtime override POST. Strict boolean only.
  const setComputerUseEnabled = async (enabled) => {
    if (typeof enabled !== "boolean") {
      const error = new Error(
        "setComputerUseEnabled requires a strict boolean enabled flag",
      );
      error.code = "invalid_argument";
      throw error;
    }

    lastComputerUseDesired = enabled;
    ensureMisoReady();
    const result = await pushComputerUseConfig(enabled);
    return { ok: true, ...result };
  };

  const setComputerUseLocalBetaEnabled = async (enabled) => {
    if (typeof enabled !== "boolean") {
      const error = new Error(
        "setComputerUseLocalBetaEnabled requires a strict boolean enabled flag",
      );
      error.code = "invalid_argument";
      throw error;
    }

    lastComputerUseLocalBetaDesired = enabled;
    ensureMisoReady();
    const result = await pushComputerUseConfig(undefined, enabled);
    return { ok: true, ...result };
  };

  const probeComputerUseModel = async (model, force = false) => {
    if (typeof model !== "string" || !model.trim() || typeof force !== "boolean") {
      const error = new Error("probeComputerUseModel requires a model and boolean force flag");
      error.code = "invalid_argument";
      throw error;
    }
    ensureMisoReady();
    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_COMPUTER_USE_PROBE_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ model: model.trim(), force }),
      },
    );
    return readJsonResponse(
      response,
      "Computer use model probe failed",
      {},
      "Invalid computer use probe response",
    );
  };

  // Fire-and-forget re-push of the cached desired state after a ready
  // transition. Never throws into the startup path: on failure the sidecar
  // defaults fail-closed (off) plus the spawn env carries the same value, so a
  // dropped re-push degrades safely rather than breaking boot.
  const resyncComputerUseConfig = async () => {
    if (
      lastComputerUseDesired === null &&
      lastComputerUseLocalBetaDesired === null
    ) {
      return;
    }
    try {
      await pushComputerUseConfig(
        lastComputerUseDesired === null ? undefined : lastComputerUseDesired,
        lastComputerUseLocalBetaDesired === null
          ? undefined
          : lastComputerUseLocalBetaDesired,
      );
    } catch (error) {
      emitMisoRuntimeLog(
        "stderr",
        `computer-use resync failed: ${error?.message || String(error)}`,
      );
    }
  };

  const getMisoToolkitCatalogPayload = async () => {
    if (unchainStatus === "starting") {
      return { toolkits: [], artifactKinds: [], count: 0, source: "" };
    }

    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOLKIT_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso toolkit catalog request failed",
      {},
      "Invalid Miso toolkit catalog response",
    );
  };

  const getMisoToolModalCatalogPayload = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOL_MODAL_CATALOG_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso tool modal catalog request failed",
      {},
      "Invalid Miso tool modal catalog response",
    );
  };

  const getMisoToolkitDetailPayload = async (toolkitId, toolName) => {
    ensureMisoReady();

    const safeToolkitId = encodeURIComponent(String(toolkitId || ""));
    let url = `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOLKIT_DETAIL_ENDPOINT}/${safeToolkitId}/metadata`;
    if (typeof toolName === "string" && toolName.trim()) {
      url += `?tool_name=${encodeURIComponent(toolName.trim())}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
    });

    return readJsonResponse(
      response,
      "Miso toolkit detail request failed",
      {},
      "Invalid Miso toolkit detail response",
    );
  };

  const normalizeMcpPayload = (payload = {}) => {
    const source = payload && typeof payload === "object" ? payload : {};
    const isPlainObject = (value) =>
      value && typeof value === "object" && !Array.isArray(value);
    const workspaceRootRaw = source.workspaceRoot ?? source.workspace_root;
    const workspaceRoot =
      typeof workspaceRootRaw === "string" ? workspaceRootRaw.trim() : "";
    const secrets = isPlainObject(source.secrets)
      ? Object.fromEntries(
          Object.entries(source.secrets).filter(
            ([key, value]) =>
              typeof key === "string" &&
              key.trim() &&
              typeof value === "string" &&
              value.trim(),
          ),
        )
      : {};
    const customRecipe = isPlainObject(source.customRecipe)
      ? source.customRecipe
      : isPlainObject(source.custom_recipe)
        ? source.custom_recipe
        : null;

    return {
      ...(workspaceRoot ? { workspaceRoot } : {}),
      ...(Object.keys(secrets).length ? { secrets } : {}),
      ...(customRecipe ? { customRecipe } : {}),
    };
  };

  const listMisoMcpToolkits = async () => {
    ensureMisoReady();

    const response = await fetch(buildMisoUrl(UNCHAIN_MCP_TOOLKITS_ENDPOINT), {
      method: "GET",
      headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
    });

    return readJsonResponse(
      response,
      "Miso MCP toolkit list request failed",
      { toolkits: [], count: 0 },
      "Invalid Miso MCP toolkit list response",
    );
  };

  const installMisoMcpToolkit = async (payload = {}) => {
    ensureMisoReady();

    const source = payload && typeof payload === "object" ? payload : {};
    const entryIdRaw = source.entry_id ?? source.entryId;
    const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_TOOLKIT_INSTALL_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({
          entry_id: entryId,
          ...normalizeMcpPayload(source),
        }),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP toolkit install request failed",
      {},
      "Invalid Miso MCP toolkit install response",
    );
  };

  /* Skill-pack install/delete — persists an imported PURE-SKILL pack to the
     backend skill_packs store (which never opens an MCP connection). The
     descriptor is built entirely on the renderer (skill_pack_import.js); this
     is a thin relay. Backend error codes (skill_pack_already_installed 409,
     invalid_skill_pack 400) propagate via readJsonResponse's error.code. */
  const installMisoSkillPack = async (payload = {}) => {
    ensureMisoReady();

    const source = payload && typeof payload === "object" ? payload : {};
    const pack = source.pack && typeof source.pack === "object" ? source.pack : {};
    const response = await fetch(buildMisoUrl(UNCHAIN_SKILLPACK_INSTALL_ENDPOINT), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
      },
      body: JSON.stringify({ pack }),
    });

    return readJsonResponse(
      response,
      "Miso skill pack install request failed",
      {},
      "Invalid Miso skill pack install response",
    );
  };

  const deleteMisoSkillPack = async (toolkitId) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_SKILLPACKS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      ),
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso skill pack delete request failed",
      {},
      "Invalid Miso skill pack delete response",
    );
  };

  // Custom Model Provider — test-connection relay (design §6.5 / §7.6).
  //
  // Contract: forwards { custom_provider, api_key } to Miso's
  // POST /models/custom-providers/test. The request body carries a one-shot
  // API key, so this method deliberately performs NO body-level logging
  // (design §9.4 red line — no api_key may reach any log). It also returns a
  // structured { ok:false, error:{ code, message } } on transport failure
  // instead of throwing a raw exception, so the renderer always gets a shape
  // it can render. Backend success/structured-failure bodies pass through
  // untouched (Miso answers 200 for both; the `ok` field is the signal).
  const testMisoCustomProvider = async (payload = {}) => {
    const source = payload && typeof payload === "object" ? payload : {};
    const customProvider =
      source.custom_provider && typeof source.custom_provider === "object"
        ? source.custom_provider
        : null;
    const apiKey =
      typeof source.api_key === "string" ? source.api_key : "";

    if (!customProvider) {
      return {
        ok: false,
        error: {
          code: "custom_provider_invalid",
          message: "custom_provider is required",
        },
      };
    }

    try {
      ensureMisoReady();
    } catch {
      return {
        ok: false,
        error: {
          code: "provider_service_unavailable",
          message: "The model runtime is not ready",
        },
      };
    }

    // Timeout slightly larger than the backend's 15s hard probe timeout so the
    // structured `provider_timeout` from Flask wins the race when the provider
    // is merely slow; this abort only fires if the whole round-trip stalls.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(
        buildMisoUrl(UNCHAIN_CUSTOM_PROVIDER_TEST_ENDPOINT),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(unchainAuthToken
              ? { "x-unchain-auth": unchainAuthToken }
              : {}),
          },
          body: JSON.stringify({
            custom_provider: customProvider,
            api_key: apiKey,
          }),
          signal: controller.signal,
        },
      );

      const bodyText = await response.text();

      if (!response.ok) {
        let code = "provider_bad_response";
        let message = `Custom provider test failed (${response.status})`;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            const serverCode =
              (typeof parsed?.code === "string" && parsed.code.trim()) ||
              (typeof parsed?.error?.code === "string" &&
                parsed.error.code.trim()) ||
              "";
            const serverMessage =
              (typeof parsed?.message === "string" && parsed.message.trim()) ||
              (typeof parsed?.error?.message === "string" &&
                parsed.error.message.trim()) ||
              (typeof parsed?.error === "string" && parsed.error.trim()) ||
              "";
            if (serverCode) {
              code = serverCode;
            }
            if (serverMessage) {
              message = serverMessage;
            }
          } catch {
            // Non-JSON error body: keep the generic code, avoid echoing the
            // raw body (it could contain redacted-but-sensitive fragments).
          }
        }
        return { ok: false, error: { code, message } };
      }

      if (!bodyText) {
        return {
          ok: false,
          error: {
            code: "provider_bad_response",
            message: "Empty response from model runtime",
          },
        };
      }

      try {
        return JSON.parse(bodyText);
      } catch {
        return {
          ok: false,
          error: {
            code: "provider_bad_response",
            message: "Invalid response from model runtime",
          },
        };
      }
    } catch (error) {
      const aborted =
        error &&
        (error.name === "AbortError" || controller.signal.aborted);
      if (aborted) {
        return {
          ok: false,
          error: {
            code: "provider_timeout",
            message: "The provider did not respond in time.",
          },
        };
      }
      return {
        ok: false,
        error: {
          code: "provider_unreachable",
          message: "Could not reach the model runtime",
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const submitMisoInterject = async (payload = {}) => {
    ensureMisoReady();

    const source = payload && typeof payload === "object" ? payload : {};
    const response = await fetch(buildMisoUrl(UNCHAIN_INTERJECT_ENDPOINT), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
      },
      body: JSON.stringify({ ...source }),
    });

    return readJsonResponse(
      response,
      "Miso interject request failed",
      {},
      "Invalid Miso interject response",
    );
  };

  const deleteMisoMcpToolkit = async (toolkitId) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_TOOLKITS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      ),
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP toolkit delete request failed",
      {},
      "Invalid Miso MCP toolkit delete response",
    );
  };

  const reloadMisoMcpToolkits = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_TOOLKIT_RELOAD_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(normalizeMcpPayload(payload)),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP toolkit reload request failed",
      { toolkits: [], count: 0 },
      "Invalid Miso MCP toolkit reload response",
    );
  };

  const checkMisoMcpToolkitHealth = async (toolkitId, payload = {}) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_TOOLKITS_ENDPOINT}/${encodeURIComponent(cleanId)}/health`,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(normalizeMcpPayload(payload)),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP toolkit health request failed",
      {},
      "Invalid Miso MCP toolkit health response",
    );
  };

  const configureMisoMcpToolkit = async (toolkitId, payload = {}) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_TOOLKITS_ENDPOINT}/${encodeURIComponent(cleanId)}/configure`,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(normalizeMcpPayload(payload)),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP toolkit configure request failed",
      {},
      "Invalid Miso MCP toolkit configure response",
    );
  };

  const startMisoMcpOAuth = async (entryId) => {
    ensureMisoReady();

    const cleanEntryId = typeof entryId === "string" ? entryId.trim() : "";
    if (!cleanEntryId) {
      throw new Error("entryId is required");
    }

    const response = await fetch(buildMisoUrl(UNCHAIN_MCP_OAUTH_START_ENDPOINT), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
      },
      body: JSON.stringify({ entry_id: cleanEntryId }),
    });

    const payload = await readJsonResponse(
      response,
      "Miso MCP OAuth start request failed",
      {},
      "Invalid Miso MCP OAuth start response",
    );
    const authUrl = typeof payload.authUrl === "string" ? payload.authUrl : "";
    const state = typeof payload.state === "string" ? payload.state.trim() : "";
    if (!state) {
      throw new Error("Invalid Miso MCP OAuth start response: state is required");
    }
    if (!authUrl) {
      const cancellation = await cancelMisoMcpOAuth(state);
      if (cancellation?.cancelled !== true) {
        const error = new Error(
          "Invalid Miso MCP OAuth start response; the attempt could not be safely cancelled",
        );
        error.code = "mcp_oauth_start_cancel_failed";
        throw error;
      }
      const error = new Error(
        "Invalid Miso MCP OAuth start response: authorization URL is required",
      );
      error.code = "mcp_oauth_start_failed";
      throw error;
    }
    if (!shell || typeof shell.openExternal !== "function") {
      const cancellation = await cancelMisoMcpOAuth(state);
      if (cancellation?.cancelled !== true) {
        const error = new Error(
          "The OAuth authorization page is unavailable and the attempt could not be safely cancelled",
        );
        error.code = "mcp_oauth_browser_open_cancel_failed";
        throw error;
      }
      const error = new Error("The OAuth authorization page is unavailable");
      error.code = "mcp_oauth_browser_open_failed";
      throw error;
    }
    if (authUrl) {
      try {
        await shell.openExternal(authUrl);
      } catch (openError) {
        let cancellation;
        try {
          cancellation = await cancelMisoMcpOAuth(state);
        } catch {
          const error = new Error(
            "Failed to open the OAuth authorization page and cancel the attempt",
          );
          error.code = "mcp_oauth_browser_open_cancel_failed";
          throw error;
        }
        if (cancellation?.cancelled !== true) {
          const error = new Error(
            "Failed to open the OAuth authorization page; the attempt could not be safely cancelled",
          );
          error.code = "mcp_oauth_browser_open_cancel_failed";
          throw error;
        }
        const error = new Error(
          "Failed to open the OAuth authorization page; the attempt was cancelled",
        );
        error.code = "mcp_oauth_browser_open_failed";
        error.cause = openError;
        throw error;
      }
    }
    return payload;
  };

  const cancelMisoMcpOAuth = async (state) => {
    ensureMisoReady();

    const cleanState = typeof state === "string" ? state.trim() : "";
    if (!cleanState) {
      throw new Error("state is required");
    }

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_OAUTH_CANCEL_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ state: cleanState }),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP OAuth cancel request failed",
      {},
      "Invalid Miso MCP OAuth cancel response",
    );
  };

  const getMisoMcpOAuthStatus = async (state) => {
    ensureMisoReady();

    const cleanState = typeof state === "string" ? state.trim() : "";
    if (!cleanState) {
      throw new Error("state is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_OAUTH_STATUS_ENDPOINT}?state=${encodeURIComponent(cleanState)}`,
      ),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP OAuth status request failed",
      { entryId: "", toolkitId: "", authStatus: "unknown" },
      "Invalid Miso MCP OAuth status response",
    );
  };

  const disconnectMisoMcpOAuth = async (toolkitId) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_MCP_OAUTH_ENDPOINT}/${encodeURIComponent(cleanId)}`),
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP OAuth disconnect request failed",
      {},
      "Invalid Miso MCP OAuth disconnect response",
    );
  };

  const listMisoMcpOAuthApps = async () => {
    ensureMisoReady();

    const response = await fetch(buildMisoUrl(UNCHAIN_MCP_OAUTH_APPS_ENDPOINT), {
      method: "GET",
      headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
    });

    return readJsonResponse(
      response,
      "Miso MCP OAuth apps list request failed",
      { apps: [], count: 0 },
      "Invalid Miso MCP OAuth apps list response",
    );
  };

  const configureMisoMcpOAuthApp = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_MCP_OAUTH_APPS_ENDPOINT}/configure`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP OAuth app configure request failed",
      {},
      "Invalid Miso MCP OAuth app configure response",
    );
  };

  const deleteMisoMcpOAuthApp = async (toolkitId) => {
    ensureMisoReady();

    const cleanId = typeof toolkitId === "string" ? toolkitId.trim() : "";
    if (!cleanId) {
      throw new Error("toolkitId is required");
    }

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_MCP_OAUTH_APPS_ENDPOINT}/${encodeURIComponent(cleanId)}`),
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP OAuth app delete request failed",
      {},
      "Invalid Miso MCP OAuth app delete response",
    );
  };

  const listMisoMcpStoreMetadata = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_STORE_METADATA_ENDPOINT),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store metadata request failed",
      { entries: [], byEntryId: {}, status: "unavailable" },
      "Invalid Miso MCP store metadata response",
    );
  };

  const reloadMisoMcpStoreMetadata = async (payload = {}) => {
    ensureMisoReady();

    const source = payload && typeof payload === "object" ? payload : {};
    const entryIdRaw = source.entry_id ?? source.entryId;
    const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_STORE_METADATA_RELOAD_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(entryId ? { entry_id: entryId } : {}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store metadata reload request failed",
      { entries: [], byEntryId: {}, status: "unavailable" },
      "Invalid Miso MCP store metadata reload response",
    );
  };

  const listMisoMcpStoreEntries = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_STORE_ENTRIES_ENDPOINT),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store entries request failed",
      { entries: [], count: 0, status: "unavailable" },
      "Invalid Miso MCP store entries response",
    );
  };

  const listMisoMcpStoreRegistries = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_STORE_REGISTRIES_ENDPOINT),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store registries request failed",
      { registries: [], count: 0, status: "unavailable" },
      "Invalid Miso MCP store registries response",
    );
  };

  const importMisoMcpStoreRegistry = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_MCP_STORE_REGISTRIES_ENDPOINT}/import`),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store registry import request failed",
      {},
      "Invalid Miso MCP store registry import response",
    );
  };

  const validateMisoMcpStoreRegistry = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_MCP_STORE_REGISTRY_VALIDATE_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store registry validate request failed",
      { valid: false, status: "unavailable", diagnostics: [], entries: [], count: 0 },
      "Invalid Miso MCP store registry validate response",
    );
  };

  const refreshMisoMcpStoreRegistry = async (registryId) => {
    ensureMisoReady();

    const cleanId = typeof registryId === "string" ? registryId.trim() : "";
    if (!cleanId) {
      throw new Error("registryId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_STORE_REGISTRIES_ENDPOINT}/${encodeURIComponent(cleanId)}/refresh`,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store registry refresh request failed",
      {},
      "Invalid Miso MCP store registry refresh response",
    );
  };

  const deleteMisoMcpStoreRegistry = async (registryId) => {
    ensureMisoReady();

    const cleanId = typeof registryId === "string" ? registryId.trim() : "";
    if (!cleanId) {
      throw new Error("registryId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_STORE_REGISTRIES_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      ),
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store registry delete request failed",
      {},
      "Invalid Miso MCP store registry delete response",
    );
  };

  const approveMisoMcpStoreEntry = async (entryId, payload = {}) => {
    ensureMisoReady();

    const cleanEntryId = typeof entryId === "string" ? entryId.trim() : "";
    if (!cleanEntryId) {
      throw new Error("entryId is required");
    }
    const source = payload && typeof payload === "object" ? payload : {};
    const registryId =
      typeof source.registryId === "string"
        ? source.registryId.trim()
        : typeof source.registry_id === "string"
          ? source.registry_id.trim()
          : "";
    const acknowledgedRisk = Boolean(
      source.acknowledgedRisk || source.acknowledged_risk,
    );

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_STORE_ENTRIES_ENDPOINT}/${encodeURIComponent(cleanEntryId)}/approve`,
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({
          ...(registryId ? { registryId } : {}),
          ...(acknowledgedRisk ? { acknowledgedRisk } : {}),
        }),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store entry approve request failed",
      {},
      "Invalid Miso MCP store entry approve response",
    );
  };

  const revokeMisoMcpStoreEntryApproval = async (entryId, payload = {}) => {
    ensureMisoReady();

    const cleanEntryId = typeof entryId === "string" ? entryId.trim() : "";
    if (!cleanEntryId) {
      throw new Error("entryId is required");
    }
    const source = payload && typeof payload === "object" ? payload : {};
    const registryId =
      typeof source.registryId === "string"
        ? source.registryId.trim()
        : typeof source.registry_id === "string"
          ? source.registry_id.trim()
          : "";

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_MCP_STORE_ENTRIES_ENDPOINT}/${encodeURIComponent(cleanEntryId)}/approval`,
      ),
      {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(registryId ? { registryId } : {}),
      },
    );

    return readJsonResponse(
      response,
      "Miso MCP store entry approval revoke request failed",
      {},
      "Invalid Miso MCP store entry approval revoke response",
    );
  };

  const getMisoMemoryProjection = async (sessionId) => {
    ensureMisoReady();

    const cleanId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!cleanId) {
      throw new Error("sessionId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_MEMORY_PROJECTION_ENDPOINT}?session_id=${encodeURIComponent(cleanId)}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso memory projection request failed",
      {},
      "Invalid Miso memory projection response",
    );
  };

  const getMisoLongTermMemoryProjection = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_LONG_TERM_MEMORY_PROJECTION_ENDPOINT}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso long-term memory projection request failed",
      {},
      "Invalid Miso long-term memory projection response",
    );
  };

  const replaceMisoSessionMemory = async (payload = {}) => {
    ensureMisoReady();

    const sessionIdRaw = payload?.sessionId ?? payload?.session_id;
    const sessionId =
      typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
    if (!sessionId) {
      throw new Error("session_id is required");
    }

    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    const options =
      payload?.options && typeof payload.options === "object"
        ? { ...payload.options }
        : {};
    // Phase 4 (S4): this is a secret-bearing outbound path too (memory
    // re-extraction needs the model key). Run the SAME strip+inject helper so
    // the descriptor never leaks to Flask and a decryption failure fails closed
    // instead of a keyless forward (contract B2).
    const secretInjection = applyProviderSecretInjection(options);
    if (!secretInjection.ok) {
      return {
        applied: false,
        error: {
          code: secretInjection.code,
          message: secretInjection.message,
          retryable: false,
          status: 0,
        },
      };
    }
    const operationIdRaw = payload?.operationId ?? payload?.operation_id;
    const operationId =
      typeof operationIdRaw === "string" ? operationIdRaw.trim() : "";
    const expectedSessionRevisionRaw =
      payload?.expectedSessionRevision ?? payload?.expected_session_revision;
    const expectedSessionRevision = Number(expectedSessionRevisionRaw);
    const expectedCancelAttemptIdRaw =
      payload?.expectedCancelAttemptId ?? payload?.expected_cancel_attempt_id;
    const expectedCancelAttemptId =
      typeof expectedCancelAttemptIdRaw === "string"
        ? expectedCancelAttemptIdRaw.trim()
        : "";

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_REPLACE_SESSION_MEMORY_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          messages,
          options,
          ...(operationId ? { operation_id: operationId } : {}),
          ...(Number.isInteger(expectedSessionRevision) &&
          expectedSessionRevision >= 0
            ? { expected_session_revision: expectedSessionRevision }
            : {}),
          ...(expectedCancelAttemptId
            ? { expected_cancel_attempt_id: expectedCancelAttemptId }
            : {}),
        }),
      },
    );

    const bodyText = await response.text();
    if (!response.ok) {
      const status = Number.isInteger(response.status) ? response.status : 0;
      let parsed = null;
      if (bodyText) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = null;
        }
      }
      const serverError =
        parsed?.error &&
        typeof parsed.error === "object" &&
        !Array.isArray(parsed.error)
          ? parsed.error
          : {};
      const code =
        typeof serverError.code === "string" && serverError.code.trim()
          ? serverError.code.trim()
          : "memory_replace_failed";
      const message =
        (typeof serverError.message === "string" &&
          serverError.message.trim()) ||
        (bodyText && !parsed ? bodyText.slice(0, 200) : "") ||
        `Miso session memory replace request failed (${status})`;
      const expectedRevision = serverError.expected_revision;
      const actualRevision = serverError.actual_revision;
      return {
        applied: false,
        error: {
          code,
          message,
          retryable: serverError.retryable === true,
          status,
          expected_revision:
            Number.isInteger(expectedRevision) && expectedRevision >= 0
              ? expectedRevision
              : null,
          actual_revision:
            Number.isInteger(actualRevision) && actualRevision >= 0
              ? actualRevision
              : null,
        },
      };
    }

    if (!bodyText) {
      throw new Error("Invalid Miso session memory replace response");
    }
    try {
      const parsed = JSON.parse(bodyText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Invalid Miso session memory replace response");
      }
      return parsed;
    } catch (error) {
      if (error?.message === "Invalid Miso session memory replace response") {
        throw error;
      }
      throw new Error("Invalid Miso session memory replace response");
    }
  };

  const getMisoSessionMemoryExport = async (sessionId) => {
    ensureMisoReady();

    const cleanId = typeof sessionId === "string" ? sessionId.trim() : "";
    if (!cleanId) {
      throw new Error("sessionId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_SESSION_MEMORY_EXPORT_ENDPOINT}?session_id=${encodeURIComponent(cleanId)}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso session memory export request failed",
      {},
      "Invalid Miso session memory export response",
    );
  };

  const listMisoSeedCharacters = async () => {
    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(`${UNCHAIN_CHARACTERS_ENDPOINT}/seeds`),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso seed character list request failed",
      { characters: [], count: 0 },
      "Invalid Miso seed character list response",
    );

    return {
      ...payload,
      characters: Array.isArray(payload.characters)
        ? payload.characters.map((character) =>
            decorateCharacterAvatar(character, { seed: true }),
          )
        : [],
    };
  };

  const listMisoCharacters = async () => {
    if (unchainStatus === "starting") {
      return { characters: [], count: 0 };
    }

    ensureMisoReady();

    const response = await fetch(
      buildMisoUrl(UNCHAIN_CHARACTERS_ENDPOINT),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso character list request failed",
      { characters: [], count: 0 },
      "Invalid Miso character list response",
    );

    return {
      ...payload,
      characters: Array.isArray(payload.characters)
        ? payload.characters.map((character) => decorateCharacterAvatar(character))
        : [],
    };
  };

  const getMisoCharacter = async (characterId) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }

    const response = await fetch(
      buildMisoUrl(
        `${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      ),
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    const payload = await readJsonResponse(
      response,
      "Miso character get request failed",
      {},
      "Invalid Miso character get response",
    );

    return decorateCharacterAvatar(payload);
  };

  const saveMisoCharacter = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character save request failed",
      {},
      "Invalid Miso character save response",
    );
  };

  const deleteMisoCharacter = async (characterId) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}`,
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso character delete request failed",
      {},
      "Invalid Miso character delete response",
    );
  };

  const listMisoRecipes = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}/agent_recipes`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso recipe list request failed",
      { recipes: [], count: 0 },
      "Invalid Miso recipe list response",
    );
  };

  const getMisoRecipe = async (recipeName) => {
    ensureMisoReady();

    const cleanName = typeof recipeName === "string" ? recipeName.trim() : "";
    if (!cleanName) {
      throw new Error("recipeName is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}/agent_recipes/${encodeURIComponent(cleanName)}`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    if (response.status === 404) return null;

    return readJsonResponse(
      response,
      "Miso recipe get request failed",
      {},
      "Invalid Miso recipe get response",
    );
  };

  const saveMisoRecipe = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}/agent_recipes`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso recipe save request failed",
      {},
      "Invalid Miso recipe save response",
    );
  };

  const deleteMisoRecipe = async (recipeName) => {
    ensureMisoReady();

    const cleanName = typeof recipeName === "string" ? recipeName.trim() : "";
    if (!cleanName) {
      throw new Error("recipeName is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}/agent_recipes/${encodeURIComponent(cleanName)}`,
      {
        method: "DELETE",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso recipe delete request failed",
      {},
      "Invalid Miso recipe delete response",
    );
  };

  const listMisoSubagentRefs = async () => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}/agent_recipes/subagent_refs`,
      {
        method: "GET",
        headers: unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {},
      },
    );

    return readJsonResponse(
      response,
      "Miso subagent refs request failed",
      { refs: [], count: 0 },
      "Invalid Miso subagent refs response",
    );
  };

  const previewMisoCharacterDecision = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_PREVIEW_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character preview request failed",
      {},
      "Invalid Miso character preview response",
    );
  };

  const buildMisoCharacterAgentConfig = async (payload = {}) => {
    ensureMisoReady();

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_BUILD_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(
          payload && typeof payload === "object" ? payload : {},
        ),
      },
    );

    return readJsonResponse(
      response,
      "Miso character build request failed",
      {},
      "Invalid Miso character build response",
    );
  };

  const exportMisoCharacter = async (characterId, filePath) => {
    ensureMisoReady();

    const cleanId = typeof characterId === "string" ? characterId.trim() : "";
    if (!cleanId) {
      throw new Error("characterId is required");
    }
    const cleanPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!cleanPath) {
      throw new Error("filePath is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTERS_ENDPOINT}/${encodeURIComponent(cleanId)}/export`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ file_path: cleanPath }),
      },
    );

    return readJsonResponse(
      response,
      "Miso character export request failed",
      {},
      "Invalid Miso character export response",
    );
  };

  const importMisoCharacter = async (filePath) => {
    ensureMisoReady();

    const cleanPath = typeof filePath === "string" ? filePath.trim() : "";
    if (!cleanPath) {
      throw new Error("filePath is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_CHARACTER_IMPORT_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify({ file_path: cleanPath }),
      },
    );

    return readJsonResponse(
      response,
      "Miso character import request failed",
      {},
      "Invalid Miso character import response",
    );
  };

  const submitMisoToolConfirmation = async (payload = {}) => {
    ensureMisoReady();

    const confirmationIdRaw = payload?.confirmation_id;
    const confirmationId =
      typeof confirmationIdRaw === "string" ? confirmationIdRaw.trim() : "";
    if (!confirmationId) {
      throw new Error("confirmation_id is required");
    }
    if (typeof payload?.approved !== "boolean") {
      throw new Error("approved must be a boolean");
    }

    const modifiedArguments = payload?.modified_arguments;
    let vaultInteractionBound = false;
    if (
      memoryVaultService &&
      typeof memoryVaultService.isBoundUseInteraction === "function"
    ) {
      try {
        vaultInteractionBound =
          memoryVaultService.isBoundUseInteraction(confirmationId) === true;
      } catch (_error) {
        vaultInteractionBound = false;
      }
    }
    if (vaultInteractionBound && modifiedArguments != null) {
      const error = new Error(
        "[vault_modified_arguments_forbidden] modified arguments are forbidden for vault use",
      );
      error.code = "vault_modified_arguments_forbidden";
      throw error;
    }

    let effectiveApproved = payload.approved;
    let vaultConfirmationHandled = false;
    if (
      memoryVaultService &&
      typeof memoryVaultService.confirmBoundUseIntent === "function"
    ) {
      const vaultDecision = await memoryVaultService.confirmBoundUseIntent({
        interactionId: confirmationId,
        rendererApproved: payload.approved,
      });
      if (vaultDecision?.handled === true) {
        vaultConfirmationHandled = true;
        effectiveApproved = vaultDecision.approved === true;
      }
    }

    const reasonRaw = payload?.reason;
    const requestBody = {
      confirmation_id: confirmationId,
      approved: effectiveApproved,
      reason:
        vaultConfirmationHandled && !effectiveApproved
          ? "vault_native_confirmation_denied"
          : typeof reasonRaw === "string"
            ? reasonRaw
            : String(reasonRaw || ""),
    };

    const sessionIdRaw = payload?.session_id || payload?.sessionId;
    const sessionId =
      typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
    if (sessionId) {
      requestBody.session_id = sessionId;
    }

    if (modifiedArguments != null && !vaultConfirmationHandled) {
      const isObject =
        typeof modifiedArguments === "object" &&
        !Array.isArray(modifiedArguments);
      if (!isObject) {
        throw new Error("modified_arguments must be an object");
      }
      requestBody.modified_arguments = modifiedArguments;
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_TOOL_CONFIRMATION_ENDPOINT}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
        body: JSON.stringify(requestBody),
      },
    );

    const result = await readJsonResponse(
      response,
      "Miso tool confirmation request failed",
      null,
      "Invalid Miso tool confirmation response",
    );
    if (
      result === null ||
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      throw new Error("Invalid Miso tool confirmation response");
    }
    return result;
  };

  const getMisoPendingInteraction = async (payload = {}) => {
    ensureMisoReady();

    const sessionIdRaw = payload?.session_id || payload?.sessionId;
    const sessionId =
      typeof sessionIdRaw === "string" ? sessionIdRaw.trim() : "";
    if (!sessionId) {
      throw new Error("session_id is required");
    }

    const response = await fetch(
      `http://${UNCHAIN_HOST}:${unchainPort}${UNCHAIN_PENDING_INTERACTION_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`,
      {
        method: "GET",
        headers: {
          ...(unchainAuthToken ? { "x-unchain-auth": unchainAuthToken } : {}),
        },
      },
    );

    const pending = await readJsonResponse(
      response,
      "Miso pending interaction request failed",
      null,
      "Invalid Miso pending interaction response",
    );
    if (
      pending === null ||
      typeof pending !== "object" ||
      Array.isArray(pending)
    ) {
      throw new Error("Invalid Miso pending interaction response");
    }
    // Recovery is the same security boundary as live SSE: a Vault interaction
    // must be durably bound before any renderer can approve it.
    bindVaultUseInteractionFromStreamPayload(pending);
    return pending;
  };

  const clearMisoStreamReplayExpiry = (streamState) => {
    if (streamState?.replayExpiryTimer) {
      clearTimeout(streamState.replayExpiryTimer);
      streamState.replayExpiryTimer = null;
    }
  };

  const expireMisoStreamReplay = (requestId, streamState) => {
    clearMisoStreamReplayExpiry(streamState);
    streamState.replayExpiryTimer = setTimeout(() => {
      if (unchainStreamReplays.get(requestId) === streamState) {
        unchainStreamReplays.delete(requestId);
      }
    }, streamReplayTtlMs);
    if (typeof streamState.replayExpiryTimer.unref === "function") {
      streamState.replayExpiryTimer.unref();
    }
  };

  const isTerminalMisoStreamEvent = (event, data) =>
    event === "done" ||
    event === "error" ||
    (event === "frame" &&
      (data?.type === "done" || data?.type === "error"));

  const measureMisoStreamReplayEnvelope = (envelope) => {
    try {
      return Buffer.byteLength(JSON.stringify(envelope), "utf8");
    } catch {
      return streamReplayMaxBytes + 1;
    }
  };

  const trimMisoStreamReplay = (streamState) => {
    while (
      streamState.replayBuffer.length - streamState.replayHead >
        streamReplayMaxEvents ||
      streamState.replayBytes > streamReplayMaxBytes
    ) {
      const replayEntry = streamState.replayBuffer[streamState.replayHead];
      streamState.replayBuffer[streamState.replayHead] = null;
      streamState.replayHead += 1;
      if (replayEntry) {
        streamState.replayBytes = Math.max(
          0,
          streamState.replayBytes - replayEntry.byteSize,
        );
      }
    }

    if (
      streamState.replayHead >= UNCHAIN_STREAM_REPLAY_COMPACT_MIN_HEAD &&
      streamState.replayHead * 2 >= streamState.replayBuffer.length
    ) {
      streamState.replayBuffer = streamState.replayBuffer.slice(
        streamState.replayHead,
      );
      streamState.replayHead = 0;
    }
  };

  const recordMisoStreamEvent = (requestId, event, data) => {
    const streamState = unchainStreamReplays.get(requestId);
    if (!streamState) {
      return null;
    }
    const streamSeq = streamState.nextReplaySeq;
    streamState.nextReplaySeq += 1;
    const envelope = { requestId, event, data, streamSeq };
    const byteSize = measureMisoStreamReplayEnvelope(envelope);
    streamState.replayBuffer.push({ envelope, byteSize });
    streamState.replayBytes += byteSize;
    trimMisoStreamReplay(streamState);
    if (isTerminalMisoStreamEvent(event, data)) {
      streamState.terminal = true;
      streamState.terminalStreamSeq = streamSeq;
    }
    return envelope;
  };

  const resolveMisoStreamTarget = (targetOrId) => {
    try {
      const target =
        targetOrId && typeof targetOrId.send === "function"
          ? targetOrId
          : webContents.fromId(
              typeof targetOrId === "number" ? targetOrId : targetOrId?.id,
            );
      if (!target || typeof target.send !== "function") {
        return null;
      }
      if (
        typeof target.isDestroyed === "function" &&
        target.isDestroyed()
      ) {
        return null;
      }
      return target;
    } catch {
      return null;
    }
  };

  const sendMisoStreamEnvelope = (targetOrId, envelope) => {
    const target = resolveMisoStreamTarget(targetOrId);
    if (!target) {
      return false;
    }
    try {
      target.send(CHANNELS.UNCHAIN.STREAM_EVENT, envelope);
      return true;
    } catch {
      return false;
    }
  };

  const emitMisoStreamDirectEvent = (target, requestId, event, data) =>
    sendMisoStreamEnvelope(target, {
      requestId,
      event,
      data,
    });

  const bindVaultUseInteractionFromStreamPayload = (data) => {
    if (!data || typeof data !== "object") return false;
    const candidates = [
      data.vault_use,
      data.arguments?.vault_use,
      data.interact_config?.vault_use,
      data.tool_call?.vault_use,
      data.tool_call?.arguments?.vault_use,
      data.tool_call?.interact_config?.vault_use,
      data.payload?.vault_use,
      data.payload?.arguments?.vault_use,
      data.payload?.interact_config?.vault_use,
      data.payload?.tool_call?.vault_use,
      data.payload?.tool_call?.arguments?.vault_use,
      data.payload?.tool_call?.interact_config?.vault_use,
      data.data?.vault_use,
      data.data?.arguments?.vault_use,
      data.data?.interact_config?.vault_use,
      data.data?.tool_call?.vault_use,
      data.data?.tool_call?.arguments?.vault_use,
      data.data?.tool_call?.interact_config?.vault_use,
      data.presentation?.vault_use,
      data.presentation?.arguments?.vault_use,
      data.presentation?.interact_config?.vault_use,
      data.presentation?.tool_call?.vault_use,
      data.presentation?.tool_call?.arguments?.vault_use,
      data.presentation?.tool_call?.interact_config?.vault_use,
    ];
    const binding = candidates.find(
      (candidate) =>
        candidate && typeof candidate === "object" && !Array.isArray(candidate),
    );
    if (!binding) return false;
    if (
      !memoryVaultService ||
      typeof memoryVaultService.bindPreparedUseIntent !== "function"
    ) {
      const error = new Error(
        "[vault_intent_binding_failed] vault interaction binding failed",
      );
      error.code = "vault_intent_binding_failed";
      throw error;
    }
    const interactionId =
      binding.interaction_id ||
      data.interaction_id ||
      data.confirmation_id ||
      data.tool_call?.confirmation_id ||
      data.payload?.confirmation_id ||
      data.payload?.tool_call?.confirmation_id ||
      data.data?.confirmation_id ||
      data.data?.tool_call?.confirmation_id ||
      data.presentation?.confirmation_id ||
      data.presentation?.tool_call?.confirmation_id;
    try {
      memoryVaultService.bindPreparedUseIntent({
        intent_id: binding.intent_id,
        interaction_id: interactionId,
        operation_id: binding.operation_id,
        owner_chat_id: binding.owner_chat_id,
        session_id: binding.session_id,
        attempt_id: binding.attempt_id,
        run_id: binding.run_id,
        call_id: binding.call_id,
      });
      return true;
    } catch (_error) {
      const error = new Error(
        "[vault_intent_binding_failed] vault interaction binding failed",
      );
      error.code = "vault_intent_binding_failed";
      throw error;
    }
  };

  const emitMisoStreamEvent = (targetWebContentsId, requestId, event, data) => {
    try {
      bindVaultUseInteractionFromStreamPayload(data);
    } catch (_error) {
      // Do not expose an unbound Vault confirmation to the renderer. This
      // static terminal error contains no request identity, handle or secret.
      event = "error";
      data = {
        code: "vault_intent_binding_failed",
        message: "Vault confirmation could not be bound safely.",
      };
    }
    const streamState = unchainStreamReplays.get(requestId);
    const envelope =
      recordMisoStreamEvent(requestId, event, data) || {
        requestId,
        event,
        data,
      };
    const attachedWebContentsId = streamState
      ? streamState.attachedWebContentsId
      : targetWebContentsId;
    if (!attachedWebContentsId) {
      return;
    }
    const attachedAttachmentId = streamState?.attachmentId || "";
    const sent = sendMisoStreamEnvelope(attachedWebContentsId, envelope);
    if (
      !sent &&
      streamState &&
      streamState.attachedWebContentsId === attachedWebContentsId &&
      streamState.attachmentId === attachedAttachmentId
    ) {
      streamState.attachedWebContentsId = null;
      streamState.attachmentId = "";
    }
  };

  const emitMisoRuntimeLog = (level, text) => {
    const normalizedLevel = level === "stderr" ? "stderr" : "stdout";
    let normalizedText = typeof text === "string" ? text.trim() : "";
    if (!normalizedText) {
      return;
    }
    if (
      activeVaultBrokerKey &&
      normalizedText.includes(activeVaultBrokerKey)
    ) {
      normalizedText = normalizedText
        .split(activeVaultBrokerKey)
        .join("[REDACTED_VAULT_BROKER_KEY]");
    }

    const targets =
      typeof webContents.getAllWebContents === "function"
        ? webContents.getAllWebContents()
        : [];

    for (const target of targets) {
      if (!target || target.isDestroyed()) {
        continue;
      }
      if (
        typeof target.getType === "function" &&
        target.getType() !== "window"
      ) {
        continue;
      }
      try {
        target.send(CHANNELS.UNCHAIN.RUNTIME_LOG, {
          level: normalizedLevel,
          text: normalizedText,
        });
      } catch {
        // Ignore renderer availability races.
      }
    }
  };

  const stringifyBridgeErrorValue = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value == null) {
      return "";
    }

    try {
      const json = JSON.stringify(value);
      if (typeof json === "string" && json.trim()) {
        return json.trim();
      }
    } catch {
      // Fall through to String(value).
    }

    try {
      return String(value).trim();
    } catch {
      return "";
    }
  };

  const serializeBridgeErrorCause = (cause) => {
    if (cause instanceof Error) {
      if (typeof cause.stack === "string" && cause.stack.trim()) {
        return cause.stack.trim();
      }
      if (typeof cause.message === "string" && cause.message.trim()) {
        return cause.message.trim();
      }
    }

    return stringifyBridgeErrorValue(cause);
  };

  const logMisoStreamBridgeFailure = (requestId, streamError) => {
    try {
      const normalizedRequestId =
        typeof requestId === "string" && requestId.trim()
          ? requestId.trim()
          : "unknown";
      const prefix = `[requestId=${normalizedRequestId}]`;
      const message =
        (typeof streamError?.message === "string" && streamError.message.trim()) ||
        stringifyBridgeErrorValue(streamError) ||
        "Failed to bridge SSE stream";

      emitMisoRuntimeLog(
        "stderr",
        `stream bridge failed ${prefix}: ${message}`,
      );

      const stack =
        typeof streamError?.stack === "string" && streamError.stack.trim()
          ? streamError.stack.trim()
          : "";
      if (stack) {
        emitMisoRuntimeLog(
          "stderr",
          `stream bridge stack ${prefix}: ${stack}`,
        );
      }

      const cause = serializeBridgeErrorCause(streamError?.cause);
      if (cause) {
        emitMisoRuntimeLog(
          "stderr",
          `stream bridge cause ${prefix}: ${cause}`,
        );
      }
    } catch {
      // Diagnostics must never interfere with stream error handling.
    }
  };

  const createUnchainRuntimeLogLineEmitter = (level) => {
    let bufferedText = "";

    const emitLine = (line) => {
      const normalizedLine = typeof line === "string" ? line.trim() : "";
      if (!normalizedLine) {
        return;
      }
      emitMisoRuntimeLog(level, normalizedLine);
    };

    const push = (chunk) => {
      if (chunk == null) {
        return;
      }

      bufferedText += String(chunk).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = bufferedText.split("\n");
      bufferedText = lines.pop() || "";

      for (const line of lines) {
        emitLine(line);
      }
    };

    const flush = () => {
      if (!bufferedText) {
        return;
      }
      emitLine(bufferedText);
      bufferedText = "";
    };

    return {
      push,
      flush,
    };
  };

  const terminateAllMisoStreams = (event, data) => {
    for (const [requestId, streamState] of unchainActiveStreams.entries()) {
      streamState.controller.abort();
      emitMisoStreamEvent(streamState.webContentsId, requestId, event, data);
    }
    unchainActiveStreams.clear();
  };

  const scheduleMisoRestart = () => {
    if (getAppIsQuitting() || unchainRestartTimer) {
      return;
    }

    unchainRestartTimer = setTimeout(() => {
      unchainRestartTimer = null;
      startMiso();
    }, UNCHAIN_RESTART_DELAY_MS);
  };

  const stopMiso = ({ preserveStatus = false } = {}) => {
    if (unchainRestartTimer) {
      clearTimeout(unchainRestartTimer);
      unchainRestartTimer = null;
    }

    terminateAllMisoStreams("done", {
      cancelled: true,
      reason: "service_stopping",
    });

    if (unchainProcess && !unchainProcess.killed) {
      unchainIsStopping = true;
      unchainPreserveStatusOnStop = Boolean(preserveStatus);
      unchainProcess.kill("SIGTERM");
      const forceKillTimer = setTimeout(() => {
        if (unchainProcess && !unchainProcess.killed) {
          unchainProcess.kill("SIGKILL");
        }
      }, 1200);
      if (typeof forceKillTimer.unref === "function") forceKillTimer.unref();
    } else {
      if (!preserveStatus) {
        unchainStatus = "stopped";
      }
      if (getAppIsQuitting()) {
        unchainStatusReason = "";
      }
    }
  };

  const startMiso = async () => {
    if (unchainProcess || unchainStatus === "starting") {
      return;
    }
    if (unchainStartPromise) {
      return unchainStartPromise;
    }

    unchainStatus = "starting";
    unchainStatusReason = "";
    unchainRuntimeContract = null;
    memoryV2Readiness = initialMemoryV2Readiness();

    unchainStartPromise = (async () => {
      let entrypoint;
      try {
        entrypoint = resolveMisoEntrypoint();
      } catch (error) {
        unchainStatus = "not_found";
        unchainStatusReason =
          error?.message || "Python 3.12 runtime for Miso was not found";
        return;
      }
      if (!entrypoint) {
        unchainStatus = "not_found";
        unchainStatusReason = "Miso server entrypoint was not found";
        return;
      }

      terminateStaleMisoProcesses(entrypoint);

      unchainPort = await findAvailableMisoPort();
      if (!unchainPort) {
        unchainStatus = "error";
        unchainStatusReason = "Unable to find an open port for the Miso service";
        return;
      }
      unchainAuthToken = crypto.randomBytes(24).toString("hex");

      const devUnchainSourcePath = app.isPackaged
        ? null
        : resolveDevUnchainSourcePath();
      const mcpRuntimeDir = app.isPackaged
        ? path.join(process.resourcesPath, "mcp_runtime")
        : process.env.PUPU_MCP_RUNTIME_DIR;
      const computerUseReleaseEnabled = resolveComputerUseReleaseFlag({
        app,
        fs,
        path,
      });
      const sidecarEnvironment = { ...process.env };
      // Never inherit developer/user ambient broker coordinates or credentials.
      // The key is NEVER an environment variable: shell tools and durable jobs
      // inherit os.environ. It is delivered once through anonymous stdio FD 3.
      delete sidecarEnvironment.PUPU_VAULT_BROKER_URL;
      delete sidecarEnvironment.PUPU_VAULT_BROKER_KEY;
      delete sidecarEnvironment.PUPU_VAULT_BROKER_FD;
      const vaultBrokerBootstrap = getVaultBrokerBootstrap();
      activeVaultBrokerKey = vaultBrokerBootstrap?.key || "";
      unchainProcess = spawn(entrypoint.command, entrypoint.args, {
        detached: false,
        cwd: entrypoint.cwd,
        windowsHide: true,
        env: {
          ...sidecarEnvironment,
          ...(vaultBrokerBootstrap
            ? {
                PUPU_VAULT_BROKER_URL: vaultBrokerBootstrap.url,
                PUPU_VAULT_BROKER_FD: "3",
              }
            : {}),
          UNCHAIN_HOST,
          UNCHAIN_PORT: String(unchainPort),
          UNCHAIN_AUTH_TOKEN: unchainAuthToken,
          UNCHAIN_VERSION: app.getVersion(),
          UNCHAIN_PROVIDER: process.env.UNCHAIN_PROVIDER || "ollama",
          UNCHAIN_MODEL: process.env.UNCHAIN_MODEL || "deepseek-r1:14b",
          UNCHAIN_DATA_DIR: app.getPath("userData"),
          UNCHAIN_PARENT_PID: String(process.pid),
          PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
          PYTHONUTF8: process.env.PYTHONUTF8 || "1",
          ...(devUnchainSourcePath ? { UNCHAIN_SOURCE_PATH: devUnchainSourcePath } : {}),
          // Packaged sidecars must use PuPu's bundled, read-only runtime payload.
          // Development only forwards an explicitly configured override.
          ...(mcpRuntimeDir ? { PUPU_MCP_RUNTIME_DIR: mcpRuntimeDir } : {}),
          // Hard release/build ceiling. Unlike PUPU_COMPUTER_USE below, this
          // value never comes from the renderer's user toggle. Packaged apps
          // read the build artifact; development may use the .local build
          // snapshot or an explicit process env override.
          [COMPUTER_USE_RELEASE_ENV_KEY]: computerUseReleaseEnabled ? "1" : "0",
          [MEMORY_V2_ENV_KEYS.featureCeiling]:
            memoryV2RuntimeConfig.sidecarEnvironment[
              MEMORY_V2_ENV_KEYS.featureCeiling
            ],
          [MEMORY_V2_ENV_KEYS.rolloutMode]:
            memoryV2RuntimeConfig.sidecarEnvironment[
              MEMORY_V2_ENV_KEYS.rolloutMode
            ],
          [MEMORY_V2_ENV_KEYS.canaryPercent]:
            memoryV2RuntimeConfig.sidecarEnvironment[
              MEMORY_V2_ENV_KEYS.canaryPercent
            ],
          [MEMORY_V2_ENV_KEYS.readOnlyDegraded]:
            memoryV2RuntimeConfig.sidecarEnvironment[
              MEMORY_V2_ENV_KEYS.readOnlyDegraded
            ],
          [MEMORY_V2_ENV_KEYS.storeOwner]:
            memoryV2RuntimeConfig.sidecarEnvironment[
              MEMORY_V2_ENV_KEYS.storeOwner
            ],
          // Belt-and-braces for the desired computer-use flag. Set AFTER the
          // process.env spread so an explicit user choice wins over any dev
          // PUPU_COMPUTER_USE in the ambient env. "0" is not in the sidecar's
          // truthy set, so OFF parses as disabled. Omitted entirely when the
          // renderer has never expressed a preference (null cache).
          ...(lastComputerUseDesired !== null
            ? { PUPU_COMPUTER_USE: lastComputerUseDesired ? "1" : "0" }
            : {}),
          ...(lastComputerUseLocalBetaDesired !== null
            ? {
                PUPU_COMPUTER_USE_LOCAL_BETA:
                  lastComputerUseLocalBetaDesired ? "1" : "0",
              }
            : {}),
        },
        stdio: ["ignore", "pipe", "pipe", "pipe"],
      });

      let vaultBootstrapFailed = false;
      if (vaultBrokerBootstrap) {
        const bootstrapPipe = unchainProcess?.stdio?.[3];
        const failVaultBootstrap = () => {
          if (vaultBootstrapFailed) return;
          vaultBootstrapFailed = true;
          unchainStatus = "error";
          unchainStatusReason = "Vault broker bootstrap pipe failed";
          try {
            void memoryVaultService?.stopSinkBroker?.();
          } catch (_error) {
            // Broker shutdown is best-effort; sidecar shutdown is mandatory.
          }
          stopMiso({ preserveStatus: true });
        };
        if (
          !bootstrapPipe ||
          typeof bootstrapPipe.once !== "function" ||
          typeof bootstrapPipe.end !== "function"
        ) {
          failVaultBootstrap();
        } else {
          bootstrapPipe.once("error", failVaultBootstrap);
          try {
            // Exactly one write; no logger or environment object ever sees key.
            bootstrapPipe.end(`${vaultBrokerBootstrap.key}\n`);
          } catch (_error) {
            failVaultBootstrap();
          }
        }
      }

      const stdoutLineEmitter = createUnchainRuntimeLogLineEmitter("stdout");
      const stderrLineEmitter = createUnchainRuntimeLogLineEmitter("stderr");
      const flushUnchainRuntimeLogs = () => {
        stdoutLineEmitter.flush();
        stderrLineEmitter.flush();
      };

      unchainProcess.stdout?.on("data", (chunk) => {
        stdoutLineEmitter.push(chunk);
      });

      unchainProcess.stderr?.on("data", (chunk) => {
        stderrLineEmitter.push(chunk);
        const text = String(chunk).trim();
        if (/ModuleNotFoundError|No module named/i.test(text)) {
          unchainStatusReason = text;
        }
      });

      unchainProcess.on("error", (error) => {
        flushUnchainRuntimeLogs();
        activeVaultBrokerKey = "";
        unchainStatus = error.code === "ENOENT" ? "not_found" : "error";
        unchainStatusReason = error.message || "Failed to start Miso process";
        unchainProcess = null;

        terminateAllMisoStreams("error", {
          code: "unchain_process_error",
          message: error.message || "Miso process failed to start",
        });

        if (error.code !== "ENOENT") {
          scheduleMisoRestart();
        }
      });

      unchainProcess.on("exit", (code, signal) => {
        flushUnchainRuntimeLogs();
        activeVaultBrokerKey = "";
        const stoppedIntentionally = unchainIsStopping || getAppIsQuitting();
        unchainProcess = null;

        if (stoppedIntentionally) {
          const preserveStatus = unchainPreserveStatusOnStop;
          unchainIsStopping = false;
          unchainPreserveStatusOnStop = false;
          if (!getAppIsQuitting() && !preserveStatus) {
            unchainStatus = "stopped";
          }
          return;
        }

        unchainStatus = "error";
        unchainStatusReason = `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
        terminateAllMisoStreams("error", {
          code: "unchain_process_exit",
          message: `Miso process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        });
        scheduleMisoRestart();
      });

      if (vaultBootstrapFailed) {
        return;
      }

      const readiness = await waitForMisoReady();
      if (!readiness.ready) {
        const missingRuntime = unchainStatus === "not_found";
        const contractError =
          readiness.error?.code === "miso_runtime_contract_incompatible"
            ? readiness.error
            : null;
        if (!missingRuntime) {
          unchainStatus = "error";
          unchainStatusReason =
            contractError?.message ||
            unchainStatusReason ||
            `Health check timed out after ${UNCHAIN_BOOT_TIMEOUT_MS}ms`;
        }
        stopMiso({ preserveStatus: Boolean(contractError) });
        if (missingRuntime) {
          unchainStatus = "not_found";
          unchainStatusReason = unchainStatusReason || "Miso runtime not found";
          return;
        }
        if (!contractError) {
          scheduleMisoRestart();
        }
        return;
      }

      await verifyContextV2Readiness();

      unchainStatus = "ready";
      unchainStatusReason = "";

      // Re-assert the user's desired computer-use state after every ready
      // transition (first boot AND crash-restart), with no renderer involved.
      // Non-fatal by design (see resyncComputerUseConfig).
      await resyncComputerUseConfig();
    })();

    try {
      await unchainStartPromise;
    } finally {
      unchainStartPromise = null;
    }
  };

  /*
   * The ONLY correct way to bounce the sidecar. Callers outside this closure
   * must never hand-roll `stopMiso(); startMiso();` — that sequence is
   * deterministically broken, and the breakage is silent:
   *
   *   1. stopMiso() returns synchronously with SIGTERM still in flight. It sets
   *      `unchainIsStopping = true` but does NOT clear `unchainProcess` —
   *      only the process's own 'exit' handler does that, and 'exit' is a
   *      macrotask that cannot run before the caller's next `await`.
   *   2. startMiso() therefore hits `if (unchainProcess || ...) return` and
   *      returns immediately, having started nothing.
   *   3. The 'exit' handler then sees `unchainIsStopping`, marks the status
   *      "stopped", and returns BEFORE scheduleMisoRestart() — so the usual
   *      crash-restart safety net never arms either.
   *
   * Net effect of the naive sequence: a LIVE backend is killed and never comes
   * back. Hence the wait below — completion of a stop is only observable from
   * inside this closure, which is why the primitive has to live here.
   *
   * The wait is bounded well past stopMiso()'s own 1200ms SIGTERM->SIGKILL
   * escalation. If it still has not exited by then something is wrong at the OS
   * level; startMiso() will no-op and the caller's own status polling is the
   * right place for that to surface, rather than hanging here forever.
   */
  const restartMiso = async () => {
    stopMiso();

    const deadline = Date.now() + UNCHAIN_RESTART_STOP_TIMEOUT_MS;
    while (unchainProcess && Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(UNCHAIN_RESTART_STOP_POLL_MS);
    }

    return startMiso();
  };

  const parseSseBlock = (block) => {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines = [];

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim() || "message";
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    return {
      eventName,
      dataText: dataLines.join("\n"),
    };
  };

  const parseSsePayload = (dataText) => {
    if (!dataText) {
      return {
        payload: {},
        isValidJson: true,
      };
    }

    try {
      return {
        payload: JSON.parse(dataText),
        isValidJson: true,
      };
    } catch {
      return {
        payload: {
          message: dataText,
        },
        isValidJson: false,
      };
    }
  };

  const streamMisoSseToRenderer = async ({
    response,
    requestId,
    webContentsId,
    controller,
  }) => {
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error("Miso stream body is not readable");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let sawTerminalEvent = false;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder
        .decode(value, { stream: true })
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const block = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);

        if (block.trim().length > 0) {
          const parsedBlock = parseSseBlock(block);
          const parsedPayload = parseSsePayload(parsedBlock.dataText);
          const payload = parsedPayload.payload;
          emitMisoStreamEvent(
            webContentsId,
            requestId,
            parsedBlock.eventName,
            payload,
          );

          if (
            parsedBlock.eventName === "done" ||
            parsedBlock.eventName === "error" ||
            (parsedBlock.eventName === "frame" &&
              (payload?.type === "done" || payload?.type === "error"))
          ) {
            sawTerminalEvent = true;
            break;
          }
        }

        boundaryIndex = buffer.indexOf("\n\n");
      }

      if (sawTerminalEvent) {
        break;
      }
    }

    // Recover a final SSE block even when upstream closes without the
    // trailing "\n\n" separator.
    const trailingBlock = buffer.trim();
    if (!sawTerminalEvent && trailingBlock.length > 0) {
      const parsedBlock = parseSseBlock(trailingBlock);
      const parsedPayload = parseSsePayload(parsedBlock.dataText);
      if (parsedPayload.isValidJson) {
        const payload = parsedPayload.payload;
        emitMisoStreamEvent(
          webContentsId,
          requestId,
          parsedBlock.eventName,
          payload,
        );
        if (
          parsedBlock.eventName === "done" ||
          parsedBlock.eventName === "error" ||
          (parsedBlock.eventName === "frame" &&
            (payload?.type === "done" || payload?.type === "error"))
        ) {
          sawTerminalEvent = true;
        }
      }
    }

    if (!sawTerminalEvent && !controller.signal.aborted) {
      emitMisoStreamEvent(webContentsId, requestId, "error", {
        code: "unexpected_stream_eof",
        message: "Miso stream ended before a terminal event",
      });
    }
  };

  // ---- Phase 4 (S4): provider-secret strip+inject seam ----------------------
  // Frozen v2 descriptor contract (phase4-descriptor-contract.md). The renderer
  // no longer writes secret VALUES into options; it writes a non-sensitive
  // descriptor list:
  //   options.__pupu_secret_injection = [{ kind, id, channel }, ...]
  // INVARIANT (B2): every main outbound path that forwards renderer-normalized
  // options to Flask MUST run this helper first. It decrypts each descriptor via
  // the main-internal reader, writes the SAME byte-for-byte field set the
  // renderer wrote today (per the fixed (id, channel) table below), and ALWAYS
  // strips the descriptor so Flask never sees it. On any decryption failure it
  // returns a fail-closed result — the caller must never keyless-forward.
  const PROVIDER_SECRET_INJECTION_KEY = "__pupu_secret_injection";

  // (kind, id, channel) -> exact ordered field set. This is the mechanical
  // byte-equivalence guarantee: main replays the identical fields the renderer
  // used to write. Custom providers use a DEDICATED named channel and NEVER the
  // generic api_key/apiKey (A8/§9.1; gate 7 red line #9).
  const resolveProviderSecretFieldNames = (kind, id, channel) => {
    if (kind === "provider" && id === "openai" && channel === "model") {
      return ["openaiApiKey", "openai_api_key", "apiKey", "api_key"];
    }
    if (kind === "provider" && id === "openai" && channel === "embedding") {
      return ["openaiApiKey", "openai_api_key"];
    }
    if (kind === "provider" && id === "anthropic" && channel === "model") {
      return ["anthropicApiKey", "anthropic_api_key"];
    }
    if (
      kind === "custom_provider" &&
      channel === "model" &&
      typeof id === "string" &&
      id.startsWith("custom.")
    ) {
      return ["custom_provider_api_key", "customProviderApiKey"];
    }
    return null;
  };

  const readProviderSecretForInjection = (kind, id) => {
    if (
      !settingsStorageService ||
      typeof settingsStorageService.readDecryptedProviderSecret !== "function"
    ) {
      return null;
    }
    try {
      // readDecryptedProviderSecret is documented never-throw, but stay
      // defensive: a throw must NEVER crash the send chain.
      return settingsStorageService.readDecryptedProviderSecret(kind, id);
    } catch (_error) {
      return null;
    }
  };

  const providerSecretStorageIsAvailable = () => {
    if (
      !settingsStorageService ||
      typeof settingsStorageService.getSecretStorageStatus !== "function"
    ) {
      return false;
    }
    try {
      return settingsStorageService.getSecretStorageStatus() === "available";
    } catch (_error) {
      return false;
    }
  };

  // Mutates `options` in place (contract §4). Returns { ok: true } on success or
  // { ok: false, code, message } when any descriptor entry could not be
  // resolved. The descriptor is ALWAYS stripped first — success or failure,
  // Flask never sees it.
  const applyProviderSecretInjection = (options) => {
    if (!options || typeof options !== "object") {
      return { ok: true };
    }
    if (
      !Object.prototype.hasOwnProperty.call(
        options,
        PROVIDER_SECRET_INJECTION_KEY,
      )
    ) {
      // No descriptor -> forward as-is (legacy-injected key during the migration
      // window, or a legitimately keyless request).
      return { ok: true };
    }

    const list = options[PROVIDER_SECRET_INJECTION_KEY];
    // Strip unconditionally: Flask must NEVER see the descriptor.
    delete options[PROVIDER_SECRET_INJECTION_KEY];

    if (!Array.isArray(list) || list.length === 0) {
      // Malformed/empty descriptor: nothing to inject, already stripped.
      return { ok: true };
    }

    let failed = false;
    for (const entry of list) {
      if (!entry || typeof entry !== "object") {
        failed = true;
        continue;
      }
      const fieldNames = resolveProviderSecretFieldNames(
        entry.kind,
        entry.id,
        entry.channel,
      );
      if (!fieldNames) {
        // Unknown (kind, id, channel): renderer/main desync. Fail closed rather
        // than silently forward a request the renderer meant to authenticate.
        failed = true;
        continue;
      }
      const secret = readProviderSecretForInjection(entry.kind, entry.id);
      if (typeof secret !== "string" || secret.length === 0) {
        failed = true;
        continue;
      }
      for (const fieldName of fieldNames) {
        options[fieldName] = secret;
      }
    }

    if (failed) {
      // Distinguish a storage-layer outage from a merely-missing credential so
      // the renderer can surface the right message. Never leak values.
      const code = providerSecretStorageIsAvailable()
        ? "provider_missing_api_key"
        : "secret_storage_unavailable";
      const message =
        code === "secret_storage_unavailable"
          ? "Provider secret storage is unavailable"
          : "A configured provider secret could not be resolved";
      return { ok: false, code, message };
    }
    return { ok: true };
  };

  const startMisoStream = async ({
    requestId,
    payload,
    sender,
    attachmentId = "",
    endpoint = UNCHAIN_STREAM_ENDPOINT,
  }) => {
    if (typeof requestId !== "string" || !requestId.trim()) {
      return;
    }

    if (unchainStatus !== "ready" || !unchainPort) {
      const reasonSuffix =
        typeof unchainStatusReason === "string" && unchainStatusReason.trim()
          ? `: ${unchainStatusReason.trim()}`
          : "";
      emitMisoStreamDirectEvent(sender, requestId, "error", {
        code: "unchain_not_ready",
        message: `Miso service is not ready (${unchainStatus})${reasonSuffix}`,
      });
      return;
    }

    const requestPayload =
      payload && typeof payload === "object" ? { ...payload } : {};
    if (
      requestPayload.memory_v2_requested === true &&
      memoryV2RuntimeConfig.effectiveMode !== "off" &&
      memoryV2Readiness.status !== "ready"
    ) {
      const failure = getContextV2ReadinessFailure();
      emitMisoStreamDirectEvent(sender, requestId, "error", failure);
      return;
    }
    const requestOptions =
      requestPayload.options && typeof requestPayload.options === "object"
        ? { ...requestPayload.options }
        : {};
    const workspaceRootCandidate =
      typeof requestOptions.workspaceRoot === "string" &&
      requestOptions.workspaceRoot.trim()
        ? requestOptions.workspaceRoot
        : typeof requestOptions.workspace_root === "string" &&
            requestOptions.workspace_root.trim()
          ? requestOptions.workspace_root
          : "";

    if (workspaceRootCandidate) {
      const validation = runtimeService.validateWorkspaceRootPath(
        workspaceRootCandidate,
      );
      if (!validation.valid) {
        emitMisoStreamDirectEvent(sender, requestId, "error", {
          code: "invalid_workspace_root",
          message: validation.reason || "Invalid workspace root",
        });
        return;
      }

      requestPayload.options = {
        ...requestOptions,
        workspaceRoot: validation.resolvedPath,
        workspace_root: validation.resolvedPath,
      };
    } else {
      requestPayload.options = requestOptions;
    }

    // Phase 4 (S4): decrypt + inject provider secrets from the descriptor list,
    // then strip the descriptor. Runs after the workspaceRoot injection and
    // before the POST — this is V1/V2/V4's single choke point. Fail-closed: on
    // any decryption failure emit a structured error and never keyless-POST.
    const secretInjection = applyProviderSecretInjection(requestPayload.options);
    if (!secretInjection.ok) {
      emitMisoStreamDirectEvent(sender, requestId, "error", {
        code: secretInjection.code,
        message: secretInjection.message,
      });
      return;
    }

    if (
      unchainActiveStreams.has(requestId) ||
      unchainStreamReplays.has(requestId)
    ) {
      emitMisoStreamDirectEvent(sender, requestId, "error", {
        code: "duplicate_request",
        message: "Request is already active",
      });
      return;
    }

    const controller = new AbortController();
    const executionIdCandidate =
      requestPayload.execution_id ??
      requestPayload.executionId ??
      requestPayload.session_id ??
      requestPayload.sessionId ??
      requestPayload.threadId ??
      requestPayload.thread_id;
    const attemptIdCandidate =
      requestPayload.attempt_id ?? requestPayload.attemptId;
    const sourceAttemptIdCandidate =
      requestPayload.source_attempt_id ?? requestPayload.sourceAttemptId;
    const ownerChatIdCandidate =
      requestPayload.owner_chat_id ?? requestPayload.ownerChatId;
    const interactionIdCandidate =
      requestPayload.interaction_id ?? requestPayload.interactionId;
    const executionId =
      typeof executionIdCandidate === "string"
        ? executionIdCandidate.trim()
        : "";
    const attemptId =
      typeof attemptIdCandidate === "string" ? attemptIdCandidate.trim() : "";
    const sourceAttemptId =
      typeof sourceAttemptIdCandidate === "string"
        ? sourceAttemptIdCandidate.trim()
        : "";
    const ownerChatId =
      typeof ownerChatIdCandidate === "string"
        ? ownerChatIdCandidate.trim()
        : "";
    const interactionId = optionalContextV2Identifier(
      interactionIdCandidate,
      "interactionId",
    );
    const normalizedAttachmentId =
      typeof attachmentId === "string" ? attachmentId.trim() : "";
    const replayEnabled = Boolean(
      endpoint === UNCHAIN_STREAM_V4_ENDPOINT && executionId && attemptId,
    );
    const streamState = {
      controller,
      webContentsId: sender.id,
      attachedWebContentsId: sender.id,
      attachmentId: normalizedAttachmentId,
      executionId,
      attemptId,
      sourceAttemptId,
      ownerChatId,
      interactionId,
      requestOptions: { ...requestPayload.options },
      replayBuffer: [],
      replayHead: 0,
      replayBytes: 0,
      nextReplaySeq: 1,
      terminal: false,
      terminalStreamSeq: 0,
      replayExpiryTimer: null,
    };
    unchainActiveStreams.set(requestId, streamState);
    if (replayEnabled) {
      unchainStreamReplays.set(requestId, streamState);
    }

    try {
      // Keep localhost SSE outside Chromium's network lifecycle. Display sleep
      // can suspend Electron net.fetch, while Undici terminates quiet bodies
      // after five minutes. The Node request adapter has no inactivity timeout.
      const response = await streamRequestImpl(
        `http://${UNCHAIN_HOST}:${unchainPort}${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-unchain-auth": unchainAuthToken,
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const bodyText = await response.text();
        let code = "upstream_http_error";
        let message = `Miso stream request failed (${response.status})`;
        if (bodyText) {
          try {
            const parsed = JSON.parse(bodyText);
            const serverCode = parsed?.error?.code;
            if (typeof serverCode === "string" && serverCode.trim()) {
              code = serverCode.trim();
            }
            const serverMessage = parsed?.error?.message || parsed?.message;
            if (serverMessage) {
              message = serverMessage;
            }
          } catch {
            message = bodyText.slice(0, 200);
          }
        }

        emitMisoStreamEvent(sender.id, requestId, "error", {
          code,
          message,
        });
        return;
      }

      await streamMisoSseToRenderer({
        response,
        requestId,
        webContentsId: sender.id,
        controller,
      });
    } catch (streamError) {
      if (controller.signal.aborted) {
        emitMisoStreamEvent(sender.id, requestId, "done", {
          cancelled: true,
        });
        return;
      }

      logMisoStreamBridgeFailure(requestId, streamError);
      emitMisoStreamEvent(sender.id, requestId, "error", {
        code: "stream_bridge_failed",
        message: streamError?.message || "Failed to bridge SSE stream",
      });
    } finally {
      unchainActiveStreams.delete(requestId);
      if (unchainStreamReplays.get(requestId) === streamState) {
        expireMisoStreamReplay(requestId, streamState);
      }
    }
  };

  const startMisoStreamV2 = (args) =>
    startMisoStream({ ...args, endpoint: UNCHAIN_STREAM_V2_ENDPOINT });

  const startMisoStreamV4 = (args) =>
    startMisoStream({ ...args, endpoint: UNCHAIN_STREAM_V4_ENDPOINT });

  const cancelMisoStream = (requestId) => {
    const streamState = unchainActiveStreams.get(requestId);
    if (!streamState) {
      return false;
    }
    streamState.controller.abort();
    return true;
  };

  const readMisoStreamAttachmentIdentity = (payload = {}) => {
    const requestIdCandidate = payload.request_id ?? payload.requestId;
    const executionIdCandidate =
      payload.execution_id ??
      payload.executionId ??
      payload.session_id ??
      payload.sessionId;
    const attemptIdCandidate = payload.attempt_id ?? payload.attemptId;
    const attachmentIdCandidate =
      payload.attachment_id ?? payload.attachmentId;
    return {
      requestId:
        typeof requestIdCandidate === "string"
          ? requestIdCandidate.trim()
          : "",
      executionId:
        typeof executionIdCandidate === "string"
          ? executionIdCandidate.trim()
          : "",
      attemptId:
        typeof attemptIdCandidate === "string"
          ? attemptIdCandidate.trim()
          : "",
      attachmentId:
        typeof attachmentIdCandidate === "string"
          ? attachmentIdCandidate.trim()
          : "",
    };
  };

  const matchesMisoStreamAttachmentIdentity = (streamState, identity) =>
    Boolean(
      streamState &&
        identity.requestId &&
        identity.executionId &&
        identity.attemptId &&
        streamState.executionId === identity.executionId &&
        streamState.attemptId === identity.attemptId,
    );

  const detachMisoStream = (senderId, payload = {}) => {
    const identity = readMisoStreamAttachmentIdentity(payload);
    const streamState = identity.requestId
      ? unchainStreamReplays.get(identity.requestId)
      : null;
    if (!matchesMisoStreamAttachmentIdentity(streamState, identity)) {
      return false;
    }
    if (
      streamState.attachedWebContentsId &&
      streamState.attachedWebContentsId !== senderId
    ) {
      return false;
    }
    if (
      streamState.attachmentId &&
      streamState.attachmentId !== identity.attachmentId
    ) {
      return false;
    }
    streamState.attachedWebContentsId = null;
    streamState.attachmentId = "";
    return true;
  };

  const attachMisoStreamV4 = (event, payload = {}) => {
    const identity = readMisoStreamAttachmentIdentity(payload);
    if (
      !identity.requestId ||
      !identity.executionId ||
      !identity.attemptId ||
      !identity.attachmentId
    ) {
      return {
        ok: false,
        code: "invalid_stream_attach_identity",
        message:
          "request_id, execution_id, attempt_id, and attachment_id are required to attach a stream",
      };
    }
    const streamState = unchainStreamReplays.get(identity.requestId);
    if (!streamState) {
      return {
        ok: false,
        code: "stream_not_found",
        message: "The requested stream is no longer available for replay",
      };
    }
    if (!matchesMisoStreamAttachmentIdentity(streamState, identity)) {
      return {
        ok: false,
        code: "stream_identity_mismatch",
        message: "The stream identity does not match this execution attempt",
      };
    }

    const afterSeqCandidate = payload.after_seq ?? payload.afterSeq;
    const afterSeqNumber = Number(afterSeqCandidate);
    const afterSeq = Number.isInteger(afterSeqNumber)
      ? Math.max(0, afterSeqNumber)
      : 0;
    const firstAvailableSeq =
      streamState.replayBuffer[streamState.replayHead]?.envelope?.streamSeq ||
      streamState.nextReplaySeq;
    if (afterSeq < firstAvailableSeq - 1) {
      return {
        ok: false,
        code: "stream_replay_gap",
        message: "The requested stream replay is no longer complete",
        first_available_seq: firstAvailableSeq,
        requested_after_seq: afterSeq,
      };
    }

    const target = resolveMisoStreamTarget(event?.sender);
    if (!target) {
      return {
        ok: false,
        code: "stream_attach_target_unavailable",
        message: "The renderer is unavailable for stream replay",
      };
    }
    streamState.attachedWebContentsId = streamState.terminal
      ? null
      : target.id;
    streamState.attachmentId = streamState.terminal
      ? ""
      : identity.attachmentId;
    let replayedThroughSeq = afterSeq;
    for (
      let replayIndex = streamState.replayHead;
      replayIndex < streamState.replayBuffer.length;
      replayIndex += 1
    ) {
      const envelope = streamState.replayBuffer[replayIndex]?.envelope;
      if (!envelope) {
        continue;
      }
      if (envelope.streamSeq <= afterSeq) {
        continue;
      }
      if (!sendMisoStreamEnvelope(target, envelope)) {
        if (
          streamState.attachedWebContentsId === target.id &&
          streamState.attachmentId === identity.attachmentId
        ) {
          streamState.attachedWebContentsId = null;
          streamState.attachmentId = "";
        }
        return {
          ok: false,
          code: "stream_attach_target_unavailable",
          message: "The renderer became unavailable during stream replay",
          replayed_through_seq: replayedThroughSeq,
        };
      }
      replayedThroughSeq = envelope.streamSeq;
    }
    return {
      ok: true,
      request_id: identity.requestId,
      execution_id: identity.executionId,
      attempt_id: identity.attemptId,
      attachment_id: identity.attachmentId,
      replayed_through_seq: replayedThroughSeq,
      terminal: streamState.terminal,
      active: unchainActiveStreams.get(identity.requestId) === streamState,
    };
  };

  const cancelMisoExecution = async (payload = {}) => {
    ensureMisoReady();

    const requestIdCandidate = payload?.requestId ?? payload?.request_id;
    const requestId =
      typeof requestIdCandidate === "string" ? requestIdCandidate.trim() : "";
    const activeStream = requestId
      ? unchainActiveStreams.get(requestId)
      : undefined;

    const executionIdCandidate =
      payload?.execution_id ??
      payload?.executionId ??
      payload?.session_id ??
      payload?.sessionId ??
      activeStream?.executionId;
    const attemptIdCandidate =
      payload?.attempt_id ?? payload?.attemptId ?? activeStream?.attemptId;
    const sourceAttemptIdCandidate =
      payload?.source_attempt_id ??
      payload?.sourceAttemptId ??
      activeStream?.sourceAttemptId;
    const ownerChatIdCandidate =
      payload?.owner_chat_id ??
      payload?.ownerChatId ??
      activeStream?.ownerChatId;
    const interactionIdCandidate =
      payload?.interaction_id ??
      payload?.interactionId ??
      activeStream?.interactionId;
    const executionId =
      typeof executionIdCandidate === "string"
        ? executionIdCandidate.trim()
        : "";
    const attemptId =
      typeof attemptIdCandidate === "string" ? attemptIdCandidate.trim() : "";
    const sourceAttemptId =
      typeof sourceAttemptIdCandidate === "string"
        ? sourceAttemptIdCandidate.trim()
        : "";
    const ownerChatId = requireContextV2OwnerChatId(ownerChatIdCandidate);
    const interactionId = optionalContextV2Identifier(
      interactionIdCandidate,
      "interactionId",
    );

    if (!executionId) {
      throw new TypeError("execution_id is required to cancel an execution");
    }
    if (!attemptId) {
      throw new TypeError("attempt_id is required to cancel an execution");
    }
    if (
      activeStream &&
      ((activeStream.executionId && activeStream.executionId !== executionId) ||
        (activeStream.attemptId && activeStream.attemptId !== attemptId) ||
        (activeStream.ownerChatId &&
          activeStream.ownerChatId !== ownerChatId) ||
        (activeStream.interactionId &&
          interactionId &&
          activeStream.interactionId !== interactionId) ||
        (activeStream.sourceAttemptId &&
          sourceAttemptId &&
          activeStream.sourceAttemptId !== sourceAttemptId))
    ) {
      throw new Error("Cancel identity does not match the active stream attempt");
    }

    const cancelPayload = {
      owner_chat_id: ownerChatId,
      execution_id: executionId,
      attempt_id: attemptId,
    };
    if (sourceAttemptId) {
      cancelPayload.source_attempt_id = sourceAttemptId;
    }
    if (interactionId) {
      cancelPayload.interaction_id = interactionId;
    }
    const reason =
      typeof payload?.reason === "string" ? payload.reason.trim() : "";
    const idempotencyKeyCandidate =
      payload?.idempotency_key ?? payload?.idempotencyKey;
    const idempotencyKey =
      typeof idempotencyKeyCandidate === "string"
        ? idempotencyKeyCandidate.trim()
        : "";
    if (reason) {
      cancelPayload.reason = reason;
    }
    if (idempotencyKey) {
      cancelPayload.idempotency_key = idempotencyKey;
    }

    const response = await fetch(
      buildMisoUrl(UNCHAIN_EXECUTION_CANCEL_ENDPOINT),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-unchain-auth": unchainAuthToken,
        },
        body: JSON.stringify(cancelPayload),
      },
    );

    return readJsonResponse(
      response,
      "Failed to cancel execution",
      {
        status: "ok",
        execution_id: executionId,
        attempt_id: attemptId,
      },
      "Invalid execution cancel response",
    );
  };

  const stopActiveMisoExecutionsForLifecycle = async (payload = {}) => {
    const reasonCandidate =
      typeof payload?.reason === "string" ? payload.reason.trim() : "";
    const reason = reasonCandidate || "app_lifecycle_stop";
    const activeSnapshot = Array.from(unchainActiveStreams.entries());
    const exactCancellationRequests = [];

    for (const [requestId, streamState] of activeSnapshot) {
      const executionId =
        typeof streamState?.executionId === "string"
          ? streamState.executionId.trim()
          : "";
      const attemptId =
        typeof streamState?.attemptId === "string"
          ? streamState.attemptId.trim()
          : "";
      const sourceAttemptId =
        typeof streamState?.sourceAttemptId === "string"
          ? streamState.sourceAttemptId.trim()
          : "";

      if (executionId && attemptId) {
        // Start the semantic cancel before severing the stream transport. Each
        // request is independent so one failed attempt cannot keep another run
        // alive across an app-close or system-suspend boundary.
        exactCancellationRequests.push(
          cancelMisoExecution({
            request_id: requestId,
            execution_id: executionId,
            attempt_id: attemptId,
            ...(sourceAttemptId
              ? { source_attempt_id: sourceAttemptId }
              : {}),
            reason,
            idempotency_key: `lifecycle-stop:${executionId}:${attemptId}`,
          }),
        );
      }

      if (unchainActiveStreams.get(requestId) === streamState) {
        unchainActiveStreams.delete(requestId);
      }
      streamState.controller.abort();
    }

    // Lifecycle stop is terminal intent, unlike renderer/HMR detach. Clear the
    // whole process-local replay registry, including streams that became
    // terminal immediately before the lifecycle event; otherwise reopening the
    // app could replay a successful terminal and launch its queued successor.
    for (const [requestId, streamState] of unchainStreamReplays.entries()) {
      clearMisoStreamReplayExpiry(streamState);
      unchainStreamReplays.delete(requestId);
    }

    const settled = await Promise.allSettled(exactCancellationRequests);
    return {
      active_count: activeSnapshot.length,
      exact_cancel_count: exactCancellationRequests.length,
      exact_cancel_succeeded: settled.filter(
        (result) => result.status === "fulfilled",
      ).length,
      exact_cancel_failed: settled.filter(
        (result) => result.status === "rejected",
      ).length,
    };
  };

  const handleStreamStart = (event, payload) => {
    const requestId = payload?.requestId;
    const requestPayload = payload?.payload || {};
    void startMisoStream({
      requestId,
      payload: requestPayload,
      sender: event.sender,
    });
  };

  const handleStreamStartV2 = (event, payload) => {
    const requestId = payload?.requestId;
    const requestPayload = payload?.payload || {};
    void startMisoStreamV2({
      requestId,
      payload: requestPayload,
      sender: event.sender,
    });
  };

  const handleStreamStartV4 = (event, payload) => {
    const requestId = payload?.requestId;
    const requestPayload = payload?.payload || {};
    const attachmentId = payload?.attachmentId ?? payload?.attachment_id;
    void startMisoStreamV4({
      requestId,
      payload: requestPayload,
      sender: event.sender,
      attachmentId,
    });
  };

  const handleStreamDetach = (event, payload) => {
    detachMisoStream(event?.sender?.id, payload || {});
  };

  const handleStreamCancel = (_event, payload) => {
    const requestId = payload?.requestId;
    if (typeof requestId === "string") {
      cancelMisoStream(requestId);
    }
  };

  return {
    startMiso,
    stopMiso,
    // Stop-then-start done correctly. See the comment on restartMiso: callers
    // outside this closure cannot sequence stop/start safely themselves.
    restartMiso,
    // MAIN-PROCESS ONLY. Deliberately not registered on any IPC channel: it
    // returns absolute local launch coordinates for the Vault sink worker.
    resolveVaultSinkWorkerEntrypoint,
    getMisoStatusPayload,
    getComputerUseStatusPayload,
    setComputerUseEnabled,
    setComputerUseLocalBetaEnabled,
    probeComputerUseModel,
    openComputerUsePrivacySettings,
    getMisoModelCatalogPayload,
    getMisoToolkitCatalogPayload,
    getMisoToolModalCatalogPayload,
    getMisoToolkitDetailPayload,
    listMisoMcpToolkits,
    installMisoMcpToolkit,
    testMisoCustomProvider,
    deleteMisoMcpToolkit,
    installMisoSkillPack,
    deleteMisoSkillPack,
    reloadMisoMcpToolkits,
    checkMisoMcpToolkitHealth,
    configureMisoMcpToolkit,
    startMisoMcpOAuth,
    cancelMisoMcpOAuth,
    getMisoMcpOAuthStatus,
    disconnectMisoMcpOAuth,
    listMisoMcpOAuthApps,
    configureMisoMcpOAuthApp,
    deleteMisoMcpOAuthApp,
    listMisoMcpStoreMetadata,
    reloadMisoMcpStoreMetadata,
    listMisoMcpStoreEntries,
    listMisoMcpStoreRegistries,
    importMisoMcpStoreRegistry,
    validateMisoMcpStoreRegistry,
    refreshMisoMcpStoreRegistry,
    deleteMisoMcpStoreRegistry,
    approveMisoMcpStoreEntry,
    revokeMisoMcpStoreEntryApproval,
    // Context / Memory V2 (P0) controlled bridge — explicit capabilities only.
    getContextV2Status,
    listContextV2Events,
    readContextV2Content,
    getContextV2SessionHead,
    rebaseContextV2Session,
    deleteContextV2Chat,
    listContextV2Spaces,
    getContextV2Tree,
    listContextV2Entries,
    searchContextV2Entries,
    listContextV2Candidates,
    listContextV2Jobs,
    listContextV2Promotions,
    decideContextV2Candidate,
    createContextV2Promotion,
    decideContextV2Promotion,
    listContextV2CandidateReviews,
    getContextV2CandidateReview,
    decideContextV2CandidateReview,
    getMisoMemoryProjection,
    getMisoLongTermMemoryProjection,
    replaceMisoSessionMemory,
    replaceUnchainSessionMemory: replaceMisoSessionMemory,
    getMisoSessionMemoryExport,
    listMisoSeedCharacters,
    listMisoCharacters,
    getMisoCharacter,
    saveMisoCharacter,
    deleteMisoCharacter,
    listMisoRecipes,
    getMisoRecipe,
    saveMisoRecipe,
    deleteMisoRecipe,
    listMisoSubagentRefs,
    previewMisoCharacterDecision,
    buildMisoCharacterAgentConfig,
    exportMisoCharacter,
    importMisoCharacter,
    submitMisoToolConfirmation,
    getMisoPendingInteraction,
    submitMisoInterject,
    cancelMisoExecution,
    // MAIN-PROCESS ONLY. App close/system suspend are execution intent, while
    // renderer STREAM_DETACH remains transport-only for transient reattach.
    stopActiveMisoExecutionsForLifecycle,
    attachMisoStreamV4,
    handleStreamStart,
    handleStreamStartV2,
    handleStreamStartV4,
    handleStreamDetach,
    handleStreamCancel,
  };
};

module.exports = {
  createNodeStreamFetch,
  createUnchainService,
};
