import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import contextV2Bridge, {
  parseContextV2ErrorCode,
} from "../../SERVICEs/bridges/context_v2_bridge";

const MAX_PENDING_ITEMS = 25;
const DIFF_PREVIEW_MAX_CHARS = 1200;
const DIFF_PREVIEW_MAX_LINES = 24;
const REVIEW_CONTENT_PAGE_BYTES = 32 * 1024;
const mono = "Menlo, Monaco, Consolas, monospace";

// The only proposal mode the Curator can currently freeze into a review. An
// unknown mode is treated as undecidable rather than rendered generically: this
// is an approval gate, and a user must not accept a change whose semantics the
// UI cannot name. Adding a backend mode is a one-line addition here.
const DECIDABLE_REVIEW_MODES = Object.freeze({
  overwrite: "Replace the existing entry",
});

// `mode` is untrusted snapshot text, so the lookup must never fall through to
// Object.prototype (`toString`, `constructor`, …) and hand a function to JSX.
const reviewModeLabel = (mode) =>
  Object.prototype.hasOwnProperty.call(DECIDABLE_REVIEW_MODES, mode)
    ? DECIDABLE_REVIEW_MODES[mode]
    : "";

// Decision failures that mean "your frozen fences no longer match the store".
// Every one of them reloads the queue so the user re-decides against fresh
// revisions instead of hammering a stale CAS.
const STALE_DECISION_CODES = Object.freeze([
  "context_v2_revision_conflict",
  "context_v2_candidate_decided",
  "context_v2_promotion_decided",
  "context_v2_review_decided",
  "context_v2_candidate_changed",
  "context_v2_candidate_target_mismatch",
  "context_v2_operation_conflict",
  "context_v2_not_found",
]);

// Host-path shapes must never reach the DOM from Memory V2 metadata or from a
// proposal diff. Two regexes on one source: the probe stays non-global so
// `.test()` can never carry `lastIndex` between calls.
const HOST_PATH_SOURCE =
  "(?:file://[^\\s\"']*|[A-Za-z]:\\\\[^\\s\"']*|/(?:Users|home|var|private|tmp|etc|opt|root)/[^\\s\"']*)";
const HOST_PATH_PROBE = new RegExp(HOST_PATH_SOURCE);
const HOST_PATH_SCRUBBER = new RegExp(HOST_PATH_SOURCE, "g");
const HOST_PATH_PLACEHOLDER = "[redacted path]";

// Control characters are stripped from every untrusted string before it can
// reach the DOM or a bounded preview. `.replace` resets lastIndex on each
// call, so this shared global regex carries no state between items.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const boundedText = (value, maximum = 600) =>
  typeof value === "string"
    ? value
        .replace(CONTROL_CHARACTERS, "")
        .trim()
        .slice(0, maximum)
    : "";

const positiveRevision = (value) =>
  Number.isSafeInteger(value) && value > 0 ? value : null;

const nonNegativeCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

const plainObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

// Memory paths are app-scoped (`/task/decisions.md`). Anything host-shaped is an
// anomaly, so the path is withheld and the item is made undecidable.
const pathPresentation = (value, maximum = 900) => {
  const text = boundedText(value, maximum);
  if (!text) return { text: "", unsafe: false };
  if (HOST_PATH_PROBE.test(text)) {
    return { text: HOST_PATH_PLACEHOLDER, unsafe: true };
  }
  return { text, unsafe: false };
};

// The diff is untrusted model/tool output. It is bounded by lines AND chars,
// control-stripped, and host-path-scrubbed before it is rendered as plain text.
const boundedDiffPreview = (value) => {
  const raw = typeof value === "string" ? value : "";
  if (!raw) return { text: "", truncated: false };
  const cleaned = raw
    .replace(CONTROL_CHARACTERS, "")
    .replace(HOST_PATH_SCRUBBER, HOST_PATH_PLACEHOLDER);
  const clipped = cleaned
    .split("\n")
    .slice(0, DIFF_PREVIEW_MAX_LINES)
    .join("\n")
    .slice(0, DIFF_PREVIEW_MAX_CHARS);
  return { text: clipped, truncated: clipped.length < cleaned.length };
};

const base64Bytes = (value) => {
  if (
    typeof value !== "string" ||
    !value ||
    typeof window === "undefined" ||
    typeof window.atob !== "function"
  ) {
    return new Uint8Array();
  }
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const textMediaType = (value) => {
  const mediaType = boundedText(value, 160).toLowerCase();
  return (
    !mediaType ||
    mediaType.startsWith("text/") ||
    mediaType.includes("json") ||
    mediaType.includes("xml") ||
    mediaType.includes("markdown")
  );
};

const stableHash = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

const decisionOperationId = ({ ownerChatId, kind, id, revision, decision }) =>
  `memory-review:${kind}:${decision}:r${revision}:${stableHash(
    `${ownerChatId}|${kind}|${id}|${revision}|${decision}`,
  )}`;

// A review decision is fenced by four revisions. The server binds an
// operation_id to its exact intent hash, so every fence has to participate in
// the id: identical intent replays the receipt, a moved fence is a new intent.
const reviewOperationId = ({
  ownerChatId,
  reviewId,
  candidateRef,
  decision,
  expectedReviewRevision,
  expectedCandidateRevision,
  expectedTargetRevision,
  expectedSpaceRevision,
}) =>
  `memory-review:review:${decision}:r${expectedReviewRevision}:${stableHash(
    [
      ownerChatId,
      "review",
      reviewId,
      candidateRef,
      decision,
      expectedReviewRevision,
      expectedCandidateRevision,
      expectedTargetRevision,
      expectedSpaceRevision,
    ].join("|"),
  )}`;

const pendingRecords = (payload, key, idKey) => {
  const values = Array.isArray(payload?.[key]) ? payload[key] : [];
  return values
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        boundedText(item[idKey], 240) &&
        positiveRevision(item.revision) !== null &&
        boundedText(item.status, 32).toLowerCase() === "pending",
    )
    .slice(0, MAX_PENDING_ITEMS);
};

const errorPresentation = (error, fallback) => {
  const code = parseContextV2ErrorCode(error);
  const message = boundedText(error?.message, 700) || fallback;
  return {
    code: code || "context_v2_request_failed",
    message,
  };
};

const ActionButton = ({ children, disabled, onClick, tone = "neutral" }) => {
  const isPositive = tone === "positive";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick(event);
      }}
      style={{
        border: isPositive
          ? "1px solid rgba(67, 143, 91, 0.48)"
          : "1px solid var(--pupu-card-border, rgba(127,127,127,0.24))",
        borderRadius: 7,
        padding: "4px 9px",
        background: isPositive
          ? "rgba(67, 143, 91, 0.1)"
          : "var(--pupu-surface, transparent)",
        color: "inherit",
        opacity: disabled ? 0.42 : 0.82,
        cursor: disabled ? "default" : "pointer",
        fontSize: 10.5,
        lineHeight: 1.4,
      }}
    >
      {children}
    </button>
  );
};

const ReviewMeta = ({ label, children }) => {
  if (!children) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "74px minmax(0, 1fr)",
        gap: 8,
        marginTop: 4,
        fontSize: 10.5,
        lineHeight: 1.5,
      }}
    >
      <span style={{ opacity: 0.46 }}>{label}</span>
      <span
        style={{
          minWidth: 0,
          opacity: 0.72,
          overflowWrap: "anywhere",
          whiteSpace: "pre-wrap",
          userSelect: "text",
        }}
      >
        {children}
      </span>
    </div>
  );
};

const ReviewCard = ({ children, isDark, testId }) => (
  <div
    data-testid={testId}
    style={{
      marginTop: 7,
      padding: 9,
      borderRadius: 8,
      border: "1px solid var(--pupu-card-border, rgba(127,127,127,0.2))",
      background: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.018)",
    }}
  >
    {children}
  </div>
);

const CardHeading = ({ title, revision }) => (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      gap: 8,
      alignItems: "baseline",
    }}
  >
    <span style={{ fontSize: 11.5, fontWeight: 600 }}>{title}</span>
    <span style={{ fontSize: 9.5, opacity: 0.4, fontFamily: mono }}>
      r{revision}
    </span>
  </div>
);

const BlockedNote = ({ children }) => (
  <div style={{ marginTop: 6, fontSize: 10, opacity: 0.55 }}>{children}</div>
);

const ReviewContentReader = ({ ownerChatId, refValue, label, isDark }) => {
  const decoderRef = useRef(null);
  const fallbackBytesRef = useRef([]);
  const [reader, setReader] = useState({
    open: false,
    loading: false,
    text: "",
    nextOffset: 0,
    totalBytes: null,
    mimeType: "",
    error: "",
  });
  const ref = boundedText(refValue, 1024);
  const closeLabel = label.startsWith("Read ") ? label.slice(5) : label;
  const available =
    Boolean(ref && boundedText(ownerChatId, 255)) &&
    contextV2Bridge.isAvailable();

  const readPage = (offset) => {
    if (!available || !Number.isSafeInteger(offset) || offset < 0) return;
    if (offset === 0) {
      decoderRef.current = null;
      fallbackBytesRef.current = [];
    }
    setReader((current) => ({
      ...current,
      open: true,
      loading: true,
      ...(offset === 0 ? { text: "" } : {}),
      error: "",
    }));
    Promise.resolve(
      contextV2Bridge.readContent({
        ownerChatId,
        ref,
        offset,
        limit: REVIEW_CONTENT_PAGE_BYTES,
      }),
    )
      .then((page) => {
      const mimeType = boundedText(page?.mime_type, 160);
      const nextOffset = Number.isSafeInteger(page?.next_offset)
        ? page.next_offset
        : null;
      let nextText = "";
      if (textMediaType(mimeType)) {
        const bytes = base64Bytes(page?.data);
        if (
          typeof window !== "undefined" &&
          typeof window.TextDecoder === "function"
        ) {
          const decoder =
            decoderRef.current ||
            new window.TextDecoder("utf-8", { fatal: false });
          decoderRef.current = decoder;
          nextText = decoder.decode(bytes, { stream: nextOffset !== null });
          if (nextOffset === null) {
            nextText += decoder.decode();
            decoderRef.current = null;
          }
        } else {
          fallbackBytesRef.current.push(bytes);
          const totalLength = fallbackBytesRef.current.reduce(
            (total, chunk) => total + chunk.length,
            0,
          );
          const combined = new Uint8Array(totalLength);
          let cursor = 0;
          fallbackBytesRef.current.forEach((chunk) => {
            combined.set(chunk, cursor);
            cursor += chunk.length;
          });
          const encoded = Array.from(
            combined,
            (byte) => `%${byte.toString(16).padStart(2, "0")}`,
          ).join("");
          try {
            nextText = decodeURIComponent(encoded);
            fallbackBytesRef.current = [];
          } catch (_error) {
            if (nextOffset === null) {
              nextText = Array.from(
                combined,
                (byte) => String.fromCharCode(byte),
              ).join("");
              fallbackBytesRef.current = [];
            }
          }
        }
        if (label.toLowerCase().includes("diff")) {
          nextText = nextText.replace(
            HOST_PATH_SCRUBBER,
            HOST_PATH_PLACEHOLDER,
          );
        }
        nextText = nextText.replace(CONTROL_CHARACTERS, "");
      } else {
        nextText = `[Binary content · ${
          mimeType || "application/octet-stream"
        }]`;
      }
      setReader((current) => ({
        ...current,
        open: true,
        loading: false,
        text: offset > 0 ? `${current.text}${nextText}` : nextText,
        nextOffset,
        totalBytes: Number.isSafeInteger(page?.total_bytes)
          ? page.total_bytes
          : null,
        mimeType,
        error: "",
      }));
      })
      .catch((error) => {
        decoderRef.current = null;
        setReader((current) => ({
          ...current,
          open: true,
          loading: false,
          error:
            boundedText(error?.message, 700) ||
            "Review content could not be read.",
        }));
      });
  };

  if (!available) return null;

  return (
    <div style={{ marginTop: 7 }}>
      <ActionButton
        disabled={reader.loading}
        onClick={() => {
          if (reader.open) {
            setReader((current) => ({ ...current, open: false }));
          } else if (reader.text || reader.error) {
            setReader((current) => ({ ...current, open: true }));
          } else {
            readPage(0);
          }
        }}
      >
        {reader.loading
          ? "Reading…"
          : reader.open
            ? `Close ${closeLabel}`
            : label}
      </ActionButton>
      {reader.open && (
        <div style={{ marginTop: 6 }}>
          {reader.error ? (
            <BlockedNote>{reader.error}</BlockedNote>
          ) : (
            <pre
              data-testid="memory-v2-review-content"
              style={{
                margin: 0,
                padding: 7,
                maxHeight: 260,
                overflow: "auto",
                borderRadius: 7,
                border:
                  "1px solid var(--pupu-card-border, rgba(127,127,127,0.16))",
                background: isDark
                  ? "rgba(0,0,0,0.24)"
                  : "rgba(0,0,0,0.035)",
                fontFamily: mono,
                fontSize: 10,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                userSelect: "text",
              }}
            >
              {reader.text}
            </pre>
          )}
          {!reader.error && !reader.loading && reader.nextOffset !== null && (
            <div style={{ marginTop: 6 }}>
              <ActionButton
                disabled={reader.loading}
                onClick={() => readPage(reader.nextOffset)}
              >
                Read next page
              </ActionButton>
            </div>
          )}
          {!reader.error && reader.totalBytes !== null && (
            <div style={{ marginTop: 4, fontSize: 9.5, opacity: 0.48 }}>
              {reader.mimeType || "content"} · {reader.totalBytes.toLocaleString()} bytes
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const sourceEventLabel = (values) => {
  const eventIds = Array.isArray(values)
    ? values.map((value) => boundedText(value, 160)).filter(Boolean)
    : [];
  if (eventIds.length === 0) return "";
  const visible = eventIds.slice(0, 3).join(", ");
  return eventIds.length > 3
    ? `${visible} · +${eventIds.length - 3} more`
    : visible;
};

// Raw candidates are read-only in Trace. Applying one directly would bypass the
// Curator, which is the only writer allowed to freeze a proposal into a review.
const AwaitingCandidate = ({ candidate, isDark }) => {
  const revision = positiveRevision(candidate.revision);
  const kind = boundedText(candidate.kind, 64) || "entry";
  const target = pathPresentation(candidate.target_path);
  const sensitivity = boundedText(candidate.sensitivity, 80).toLowerCase();
  const sensitive = Boolean(sensitivity) && sensitivity !== "normal";
  const description = sensitive
    ? "Sensitive candidate — description hidden in Trace."
    : boundedText(candidate.description, 900);
  const rationale = sensitive ? "" : boundedText(candidate.rationale, 900);
  const provenance = [
    boundedText(candidate.source_agent_run_id, 200)
      ? `run ${boundedText(candidate.source_agent_run_id, 200)}`
      : "",
    boundedText(candidate.source_tool_call_id, 200)
      ? `tool ${boundedText(candidate.source_tool_call_id, 200)}`
      : "",
    sourceEventLabel(candidate.source_event_ids),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ReviewCard isDark={isDark} testId="memory-v2-awaiting-candidate">
      <CardHeading title="Awaiting Memory Agent" revision={revision} />
      <ReviewMeta label="Proposal">
        <code style={{ fontFamily: mono }}>
          Create {kind} at {target.text || "unassigned path"}
        </code>
      </ReviewMeta>
      <ReviewMeta label="Summary">{description}</ReviewMeta>
      <ReviewMeta label="Why">{rationale}</ReviewMeta>
      <ReviewMeta label="Provenance">{provenance}</ReviewMeta>
      <BlockedNote>
        The Memory Agent curates this proposal before anyone can decide it.
      </BlockedNote>
    </ReviewCard>
  );
};

const ConflictReview = ({
  review,
  ownerChatId,
  spaceRevision,
  actionKey,
  onDecision,
  isDark,
}) => {
  const reviewId = boundedText(review.reviewId, 240);
  const revision = positiveRevision(review.revision);
  const candidateRevision = positiveRevision(review.candidateRevision);
  const candidateRef = boundedText(review.candidateRef, 400);
  const target = plainObject(review.target);
  const targetPath = pathPresentation(target.path);
  const targetSpaceId = boundedText(target.spaceId, 240);
  const targetEntryId = boundedText(target.entryId, 240);
  const expectedTargetRevision = positiveRevision(target.expectedRevision);
  const expectedSpaceRevision = positiveRevision(spaceRevision);
  const proposed = plainObject(review.proposed);
  const mode = boundedText(proposed.mode, 32).toLowerCase();
  const modeLabel = reviewModeLabel(mode);
  const kind = boundedText(proposed.kind, 64) || "entry";
  const description = boundedText(proposed.description, 900);
  const content = plainObject(proposed.content);
  const proposedContentRef = boundedText(content.ref, 1024);
  const mediaType = boundedText(content.mediaType, 120);
  const contentBytes = nonNegativeCount(content.bytes);
  const contentLabel = mediaType
    ? `${mediaType}${contentBytes === null ? "" : ` · ${contentBytes.toLocaleString()} bytes`}`
    : "";
  const diff = boundedDiffPreview(review.diffPreview);
  const hasDiffRef = Boolean(boundedText(review.diffRef, 400));
  const provenance = sourceEventLabel(proposed.sourceEventIds);
  const baseKey = `review:${reviewId}:r${revision}`;
  const busy = actionKey.startsWith(`${baseKey}:`);

  const canDecide =
    Boolean(reviewId && candidateRef && targetSpaceId && targetEntryId) &&
    Boolean(targetPath.text) &&
    !targetPath.unsafe &&
    Boolean(modeLabel) &&
    revision !== null &&
    candidateRevision !== null &&
    expectedTargetRevision !== null &&
    expectedSpaceRevision !== null;

  const blockedReason = (() => {
    if (canDecide) return "";
    if (targetPath.unsafe) {
      return "This proposal names a location outside chat memory and cannot be decided here.";
    }
    if (!modeLabel) {
      return "This proposal uses a change type this build cannot present, so it cannot be decided here.";
    }
    if (expectedSpaceRevision === null) {
      return "This review has no current target-space revision and cannot be decided yet.";
    }
    return "This review is missing the revisions required to decide it safely.";
  })();

  return (
    <ReviewCard isDark={isDark} testId="memory-v2-conflict-review">
      <CardHeading title="Memory conflict review" revision={revision} />
      <ReviewMeta label="Change">
        <code style={{ fontFamily: mono }}>
          {modeLabel || "Unrecognized change"} — {kind} at{" "}
          {targetPath.text || "unassigned path"}
          {expectedTargetRevision ? ` @ r${expectedTargetRevision}` : ""}
        </code>
      </ReviewMeta>
      <ReviewMeta label="Summary">{description}</ReviewMeta>
      <ReviewMeta label="Content">{contentLabel}</ReviewMeta>
      <ReviewMeta label="Candidate">
        {candidateRevision === null ? "" : `frozen at r${candidateRevision}`}
      </ReviewMeta>
      <ReviewMeta label="Provenance">{provenance}</ReviewMeta>
      {diff.text && (
        <pre
          data-testid="memory-v2-review-diff"
          style={{
            marginTop: 6,
            marginBottom: 0,
            padding: 7,
            maxHeight: 190,
            overflow: "auto",
            borderRadius: 7,
            border:
              "1px solid var(--pupu-card-border, rgba(127,127,127,0.16))",
            background: isDark ? "rgba(0,0,0,0.24)" : "rgba(0,0,0,0.035)",
            fontFamily: mono,
            fontSize: 10,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            userSelect: "text",
            opacity: 0.82,
          }}
        >
          {diff.text}
        </pre>
      )}
      {diff.text && diff.truncated && (
        <BlockedNote>
          Diff preview truncated — open Memory inspect for the full diff.
        </BlockedNote>
      )}
      {!diff.text && hasDiffRef && (
        <BlockedNote>No diff preview is available for this review.</BlockedNote>
      )}
      {hasDiffRef && (
        <ReviewContentReader
          ownerChatId={ownerChatId}
          refValue={review.diffRef}
          label="Read full diff"
          isDark={isDark}
        />
      )}
      {proposedContentRef && (
        <ReviewContentReader
          ownerChatId={ownerChatId}
          refValue={proposedContentRef}
          label="Read proposed content"
          isDark={isDark}
        />
      )}
      {!canDecide && <BlockedNote>{blockedReason}</BlockedNote>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <ActionButton
          tone="positive"
          disabled={Boolean(actionKey) || !canDecide}
          onClick={() => onDecision(review, "apply")}
        >
          {busy && actionKey.endsWith(":apply") ? "Accepting…" : "Accept"}
        </ActionButton>
        <ActionButton
          disabled={Boolean(actionKey) || !canDecide}
          onClick={() => onDecision(review, "reject")}
        >
          {busy && actionKey.endsWith(":reject") ? "Rejecting…" : "Reject"}
        </ActionButton>
      </div>
    </ReviewCard>
  );
};

const PromotionReview = ({ promotion, actionKey, onDecision, isDark }) => {
  const promotionId = boundedText(promotion.promotion_id, 240);
  const revision = positiveRevision(promotion.revision);
  const source = plainObject(promotion.source);
  const sourcePath = boundedText(source.path, 900) || "unknown source";
  const sourceRevision = positiveRevision(source.revision);
  const sourceEntryId = boundedText(source.entry_id, 240);
  const targetPath = boundedText(promotion.target_path, 900) || "unknown target";
  const targetEntryId = boundedText(promotion.target_entry_id, 240);
  const expectedTargetRevision = positiveRevision(
    promotion.expected_target_revision,
  );
  const baseKey = `promotion:${promotionId}:r${revision}`;
  const busy = actionKey.startsWith(`${baseKey}:`);
  const sourceLabel = [
    `${sourcePath}${sourceRevision ? ` @ r${sourceRevision}` : ""}`,
    sourceEntryId ? `entry ${sourceEntryId}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const diffLabel = targetEntryId
    ? `Update long-term ${targetPath}${
        expectedTargetRevision ? ` from r${expectedTargetRevision}` : ""
      }`
    : `Create long-term ${targetPath}`;

  return (
    <ReviewCard isDark={isDark}>
      <CardHeading title="Long-term promotion" revision={revision} />
      <ReviewMeta label="Diff">
        <code style={{ fontFamily: mono }}>{diffLabel}</code>
      </ReviewMeta>
      <ReviewMeta label="Provenance">{sourceLabel}</ReviewMeta>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <ActionButton
          tone="positive"
          disabled={Boolean(actionKey)}
          onClick={() => onDecision(promotion, "apply")}
        >
          {busy && actionKey.endsWith(":apply")
            ? "Confirming…"
            : "Confirm long-term"}
        </ActionButton>
        <ActionButton
          disabled={Boolean(actionKey)}
          onClick={() => onDecision(promotion, "reject")}
        >
          {busy && actionKey.endsWith(":reject") ? "Rejecting…" : "Reject"}
        </ActionButton>
      </div>
    </ReviewCard>
  );
};

export const MemoryV2PendingReviews = ({ ownerChatId, isDark }) => {
  const owner = boundedText(ownerChatId, 255);
  const available = Boolean(owner) && contextV2Bridge.isAvailable();
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const [state, setState] = useState({
    loading: false,
    loaded: false,
    candidates: [],
    reviews: [],
    promotions: [],
    spaces: [],
    error: null,
    actionKey: "",
  });

  const loadPending = useCallback(
    async ({ clearError = true } = {}) => {
      if (!available) return;
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setState((current) => ({
        ...current,
        loading: true,
        ...(clearError ? { error: null } : {}),
      }));
      try {
        const [
          candidatePayload,
          reviewPayload,
          promotionPayload,
          spacePayload,
        ] = await Promise.all([
          contextV2Bridge.listCandidates({
            ownerChatId: owner,
            status: "pending",
            limit: MAX_PENDING_ITEMS,
          }),
          contextV2Bridge.listCandidateReviews({
            ownerChatId: owner,
            status: "pending",
            limit: MAX_PENDING_ITEMS,
          }),
          contextV2Bridge.listPromotions({
            ownerChatId: owner,
            status: "pending",
            limit: MAX_PENDING_ITEMS,
          }),
          contextV2Bridge.listSpaces({ ownerChatId: owner }),
        ]);
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setState((current) => ({
          ...current,
          loading: false,
          loaded: true,
          candidates: pendingRecords(
            candidatePayload,
            "candidates",
            "candidate_id",
          ),
          reviews: pendingRecords(reviewPayload, "reviews", "reviewId"),
          promotions: pendingRecords(
            promotionPayload,
            "promotions",
            "promotion_id",
          ),
          spaces: Array.isArray(spacePayload?.spaces)
            ? spacePayload.spaces.slice(0, MAX_PENDING_ITEMS * 2)
            : [],
          ...(clearError ? { error: null } : {}),
        }));
      } catch (error) {
        if (!mountedRef.current || requestIdRef.current !== requestId) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: errorPresentation(error, "Pending memory reviews could not be loaded."),
        }));
      }
    },
    [available, owner],
  );

  useEffect(() => {
    mountedRef.current = true;
    if (available) loadPending();
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, [available, loadPending]);

  const spaceRevisionById = useMemo(() => {
    const revisions = new Map();
    state.spaces.forEach((space) => {
      const id = boundedText(space?.space_id, 240);
      const revision = positiveRevision(space?.revision);
      if (id && revision !== null) revisions.set(id, revision);
    });
    return revisions;
  }, [state.spaces]);

  const runDecision = useCallback(
    async (key, operation) => {
      setState((current) => ({ ...current, actionKey: key, error: null }));
      try {
        await operation();
        if (!mountedRef.current) return;
        setState((current) => ({ ...current, actionKey: "" }));
        await loadPending();
      } catch (error) {
        const presentation = errorPresentation(
          error,
          "The memory decision could not be saved.",
        );
        if (!mountedRef.current) return;
        setState((current) => ({
          ...current,
          actionKey: "",
          error: presentation,
        }));
        if (STALE_DECISION_CODES.includes(presentation.code)) {
          await loadPending({ clearError: false });
          if (mountedRef.current) {
            setState((current) => ({ ...current, error: presentation }));
          }
        }
      }
    },
    [loadPending],
  );

  // Accept / reject a Curator-frozen review. This is the ONLY decision path for
  // a candidate: `decideCandidate` is deliberately not called from this surface.
  const decideReview = useCallback(
    (review, decision) => {
      const reviewId = boundedText(review?.reviewId, 240);
      const candidateRef = boundedText(review?.candidateRef, 400);
      const expectedReviewRevision = positiveRevision(review?.revision);
      const expectedCandidateRevision = positiveRevision(
        review?.candidateRevision,
      );
      const target = plainObject(review?.target);
      const expectedTargetRevision = positiveRevision(target.expectedRevision);
      const spaceId = boundedText(target.spaceId, 240);
      const expectedSpaceRevision = positiveRevision(
        spaceRevisionById.get(spaceId),
      );
      if (
        !reviewId ||
        !candidateRef ||
        expectedReviewRevision === null ||
        expectedCandidateRevision === null ||
        expectedTargetRevision === null ||
        expectedSpaceRevision === null
      ) {
        return;
      }
      const key = `review:${reviewId}:r${expectedReviewRevision}:${decision}`;
      runDecision(key, () =>
        contextV2Bridge.decideCandidateReview({
          ownerChatId: owner,
          reviewId,
          decision,
          expectedReviewRevision,
          expectedCandidateRevision,
          expectedTargetRevision,
          expectedSpaceRevision,
          decisionReason: `user_trace_review_${decision}`,
          operationId: reviewOperationId({
            ownerChatId: owner,
            reviewId,
            candidateRef,
            decision,
            expectedReviewRevision,
            expectedCandidateRevision,
            expectedTargetRevision,
            expectedSpaceRevision,
          }),
        }),
      );
    },
    [owner, runDecision, spaceRevisionById],
  );

  const decidePromotion = useCallback(
    (promotion, decision) => {
      const promotionId = boundedText(promotion?.promotion_id, 240);
      const revision = positiveRevision(promotion?.revision);
      if (!promotionId || revision === null) return;
      const key = `promotion:${promotionId}:r${revision}:${decision}`;
      runDecision(key, () =>
        contextV2Bridge.decidePromotion({
          ownerChatId: owner,
          promotionId,
          decision,
          expectedRevision: revision,
          decisionReason: `user_trace_review_${decision}`,
          operationId: decisionOperationId({
            ownerChatId: owner,
            kind: "promotion",
            id: promotionId,
            revision,
            decision,
          }),
        }),
      );
    },
    [owner, runDecision],
  );

  const decidableCount = state.reviews.length + state.promotions.length;
  const awaitingCount = state.candidates.length;
  const countLabel = [
    decidableCount ? `${decidableCount} to decide` : "",
    awaitingCount ? `${awaitingCount} awaiting Memory Agent` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const isEmpty =
    state.loaded && decidableCount === 0 && awaitingCount === 0;

  if (!owner) return null;

  return (
    <div
      data-testid="memory-v2-pending-reviews"
      style={{
        marginTop: 10,
        paddingTop: 9,
        borderTop: "1px solid var(--pupu-card-border, rgba(127,127,127,0.18))",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            opacity: 0.72,
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          Pending memory decisions
          {countLabel && (
            <span
              data-testid="memory-v2-pending-count"
              style={{ marginLeft: 6, fontWeight: 400, opacity: 0.66 }}
            >
              {countLabel}
            </span>
          )}
        </span>
        {available && (
          <button
            type="button"
            disabled={state.loading || Boolean(state.actionKey)}
            onClick={() => loadPending()}
            style={{
              border: 0,
              padding: 0,
              background: "transparent",
              color: "inherit",
              opacity: state.loading ? 0.36 : 0.54,
              cursor: state.loading ? "default" : "pointer",
              fontSize: 10,
              flexShrink: 0,
            }}
          >
            {state.loading ? "Checking…" : "Refresh"}
          </button>
        )}
      </div>

      {!available && (
        <div role="status" style={{ marginTop: 6, fontSize: 10.5, opacity: 0.5 }}>
          Memory review service is unavailable.
        </div>
      )}

      {available && state.loading && !state.loaded && !state.error && (
        <div role="status" style={{ marginTop: 6, fontSize: 10.5, opacity: 0.5 }}>
          Loading pending memory decisions…
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          style={{
            marginTop: 7,
            padding: 7,
            borderRadius: 7,
            background: "rgba(190, 65, 65, 0.08)",
            color: "var(--pupu-danger, #b44)",
            fontSize: 10.5,
            lineHeight: 1.5,
            overflowWrap: "anywhere",
          }}
        >
          <code style={{ fontFamily: mono }}>{state.error.code}</code>
          {` · ${state.error.message}`}
        </div>
      )}

      {available && !state.loading && !state.error && isEmpty && (
        <div role="status" style={{ marginTop: 6, fontSize: 10.5, opacity: 0.5 }}>
          No pending memory decisions.
        </div>
      )}

      {state.reviews.map((review) => (
        <ConflictReview
          key={review.reviewId}
          review={review}
          ownerChatId={owner}
          spaceRevision={spaceRevisionById.get(
            boundedText(plainObject(review.target).spaceId, 240),
          )}
          actionKey={state.actionKey}
          onDecision={decideReview}
          isDark={isDark}
        />
      ))}

      {state.promotions.map((promotion) => (
        <PromotionReview
          key={promotion.promotion_id}
          promotion={promotion}
          actionKey={state.actionKey}
          onDecision={decidePromotion}
          isDark={isDark}
        />
      ))}

      {state.candidates.map((candidate) => (
        <AwaitingCandidate
          key={candidate.candidate_id}
          candidate={candidate}
          isDark={isDark}
        />
      ))}
    </div>
  );
};

export default MemoryV2PendingReviews;
