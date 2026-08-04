import { useEffect, useState } from "react";
import contextV2Bridge, {
  parseContextV2ErrorCode,
} from "../../SERVICEs/bridges/context_v2_bridge";

export const JOURNAL_RELOAD_PAGE_SIZE = 500;
export const JOURNAL_RELOAD_MAX_PAGES = 20;
export const JOURNAL_RELOAD_MAX_EVENTS = 10000;

const CHECKPOINT_REF_RE =
  /^pupu:\/\/context\/checkpoint\/[A-Za-z0-9._:-]+$/;
const ARTIFACT_REF_RE =
  /^pupu:\/\/artifact\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/;
const BUNDLE_REF_PATTERNS = [
  /^pupu:\/\/memory\/[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  ARTIFACT_REF_RE,
  /^pupu:\/\/context\/event\/[A-Za-z0-9._:-]+(?:\/content)?$/,
  CHECKPOINT_REF_RE,
  /^entry:[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^event(?:-content)?:[A-Za-z0-9._:-]+$/,
];
const CURATOR_EVENT_TYPES = new Set([
  "memory.curator.enqueued",
  "memory.curator.noop",
  "memory.curator.isolated",
  "memory.curator.pending",
  "memory.curator.failed",
  "memory.curator.started",
  "memory.curator.completed",
]);

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const boundedText = (value, maximum = 240) =>
  typeof value === "string"
    ? value
        // Explicitly strip C0 controls and bidi controls from Trace labels.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "")
        .trim()
        .slice(0, maximum)
    : "";

const identifierText = (value, maximum = 240) => {
  const text = boundedText(value, maximum);
  return /^[A-Za-z0-9][A-Za-z0-9._:/+-]*$/.test(text) ? text : "";
};

const ownerIdentifier = (value) => {
  const text = boundedText(value, 255);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(text) ? text : "";
};

const finiteNonNegative = (value, maximum = Number.MAX_SAFE_INTEGER) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= maximum
    ? value
    : null;

const integerCursor = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

const refString = (value, pattern) => {
  if (typeof value === "string") {
    const ref = boundedText(value, 1024);
    return pattern.test(ref) ? ref : "";
  }
  if (!isObject(value)) return "";
  for (const key of [
    "uri",
    "ref",
    "checkpoint_ref",
    "artifact_ref",
    "handoff_ref",
    "content_ref",
  ]) {
    const ref = refString(value[key], pattern);
    if (ref) return ref;
  }
  return "";
};

const refMetadata = (value) => {
  if (!isObject(value)) return {};
  const mediaType = boundedText(value.media_type || value.mime_type, 160);
  const bytes = finiteNonNegative(
    value.bytes ?? value.byte_size ?? value.content_bytes,
  );
  const sha256 = boundedText(value.sha256 || value.content_sha256, 128);
  return {
    ...(mediaType ? { mediaType } : {}),
    ...(bytes !== null ? { bytes } : {}),
    ...(/^[a-f0-9]{64}$/i.test(sha256) ? { sha256 } : {}),
  };
};

const collectAllowedRef = (output, value, kind, pattern) => {
  if (Array.isArray(value)) {
    value.slice(0, 64).forEach((item) =>
      collectAllowedRef(output, item, kind, pattern),
    );
    return;
  }
  const ref = refString(value, pattern);
  if (!ref) return;
  const existing = output.get(ref);
  output.set(ref, {
    kind,
    ref,
    ...refMetadata(value),
    ...(existing || {}),
  });
};

const titleCase = (value) => {
  const text = identifierText(value, 80).replace(/[_.-]+/g, " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const statusForCuratorEvent = (eventType, explicit) => {
  const status = titleCase(explicit);
  if (status) return status;
  if (eventType === "memory.curator.started") return "Running";
  if (eventType === "memory.curator.completed") return "Completed";
  if (eventType === "memory.curator.failed") return "Failed";
  if (eventType === "memory.curator.noop") return "NoOp";
  if (eventType === "memory.curator.isolated") return "Isolated";
  return "Pending";
};

const curatorRunFrom = (record, event, eventType) => {
  const model = isObject(event.model) ? event.model : {};
  const eventId = identifierText(record.event_id, 240);
  const runId = identifierText(event.run_id || record.run_id, 240);
  const jobId = identifierText(event.job_id, 240);
  const id = runId || jobId || eventId;
  if (!id) return null;
  const consumedTokens = finiteNonNegative(
    event.consumed_tokens ?? event.token_usage,
  );
  const cost = finiteNonNegative(event.cost_usd ?? event.cost, 1000000);
  return {
    id,
    status: statusForCuratorEvent(eventType, event.status),
    trigger: identifierText(event.trigger, 160),
    provider: identifierText(event.provider || model.provider, 120),
    model: identifierText(
      event.model_id || model.model_id || model.modelId,
      200,
    ),
    version: identifierText(event.model_version || model.model_version, 120),
    consumedTokens,
    inputTokens: null,
    outputTokens: null,
    cost,
    currency: "USD",
    diff: "",
    errorCode: identifierText(event.error_code, 160),
    error: "",
    reason: identifierText(event.reason, 240),
    undo: "",
    refs: [],
    _cursor: integerCursor(record.cursor ?? record.store_seq) || 0,
  };
};

const projectCanonicalEvent = (record, refs, curatorRuns) => {
  if (!isObject(record) || !isObject(record.event)) return false;
  const event = record.event;
  const eventType = identifierText(record.type, 128);
  const innerType = identifierText(event.type, 128);
  if (!eventType || (innerType && innerType !== eventType)) return false;

  if (eventType === "context.build") {
    const payload = isObject(event.payload) ? event.payload : {};
    const diagnostics = isObject(payload.diagnostics)
      ? payload.diagnostics
      : {};
    collectAllowedRef(
      refs,
      payload.checkpoint_ref,
      "checkpoint",
      CHECKPOINT_REF_RE,
    );
    collectAllowedRef(
      refs,
      payload.checkpoint_refs,
      "checkpoint",
      CHECKPOINT_REF_RE,
    );
    collectAllowedRef(
      refs,
      diagnostics.checkpoint_ref,
      "checkpoint",
      CHECKPOINT_REF_RE,
    );
    collectAllowedRef(
      refs,
      diagnostics.checkpoint_refs,
      "checkpoint",
      CHECKPOINT_REF_RE,
    );
    return true;
  }

  if (eventType === "artifact.recorded" || eventType === "handoff.recorded") {
    const payload = isObject(event.payload) ? event.payload : {};
    const kind = eventType === "handoff.recorded" ? "handoff" : "artifact";
    for (const key of [
      "artifact_ref",
      "artifact_refs",
      "handoff_ref",
      "handoff_refs",
      "content_ref",
    ]) {
      collectAllowedRef(refs, payload[key], kind, ARTIFACT_REF_RE);
    }
    return true;
  }

  if (CURATOR_EVENT_TYPES.has(eventType)) {
    const run = curatorRunFrom(record, event, eventType);
    if (run) {
      const existing = curatorRuns.get(run.id);
      if (!existing || run._cursor >= existing._cursor) {
        curatorRuns.set(run.id, run);
      }
    }
    return true;
  }

  return false;
};

const finalizeProjection = ({
  ownerChatId,
  status,
  reason,
  errorCode = "",
  pagesRead,
  eventsScanned,
  refs,
  curatorRuns,
}) => ({
  ownerChatId,
  status,
  reason,
  errorCode,
  pagesRead,
  eventsScanned,
  refs: Array.from(refs.values()).slice(0, 512),
  agentRuns: Array.from(curatorRuns.values())
    .sort((left, right) => left._cursor - right._cursor)
    .slice(-128)
    .map(({ _cursor, ...run }) => run),
});

const failedProjection = ({
  ownerChatId,
  error,
  pagesRead,
  eventsScanned,
  refs,
  curatorRuns,
  reason = "journal_reload_failed",
}) =>
  finalizeProjection({
    ownerChatId,
    status: eventsScanned > 0 ? "Partial" : "Unavailable",
    reason,
    errorCode: parseContextV2ErrorCode(error) || "context_v2_journal_unavailable",
    pagesRead,
    eventsScanned,
    refs,
    curatorRuns,
  });

export const loadCanonicalMemoryV2Journal = async ({
  ownerChatId,
  listEvents = contextV2Bridge.listEvents,
  isCancelled = () => false,
}) => {
  const owner = ownerIdentifier(ownerChatId);
  const refs = new Map();
  const curatorRuns = new Map();
  if (!owner || typeof listEvents !== "function") {
    return finalizeProjection({
      ownerChatId: owner,
      status: "Unavailable",
      reason: "journal_reload_unavailable",
      errorCode: "context_v2_unavailable",
      pagesRead: 0,
      eventsScanned: 0,
      refs,
      curatorRuns,
    });
  }

  let after = 0;
  let pagesRead = 0;
  let eventsScanned = 0;
  while (pagesRead < JOURNAL_RELOAD_MAX_PAGES) {
    if (isCancelled()) {
      return finalizeProjection({
        ownerChatId: owner,
        status: eventsScanned > 0 ? "Partial" : "Unavailable",
        reason: "journal_reload_cancelled",
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
      });
    }
    let payload;
    try {
      payload = await listEvents({
        ownerChatId: owner,
        after,
        limit: JOURNAL_RELOAD_PAGE_SIZE,
        includePayload: true,
      });
    } catch (error) {
      return failedProjection({
        ownerChatId: owner,
        error,
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
      });
    }
    pagesRead += 1;

    if (
      !isObject(payload) ||
      (payload.owner_chat_id && payload.owner_chat_id !== owner) ||
      !Array.isArray(payload.events)
    ) {
      return failedProjection({
        ownerChatId: owner,
        error: null,
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
        reason: "journal_reload_invalid_page",
      });
    }

    const remaining = JOURNAL_RELOAD_MAX_EVENTS - eventsScanned;
    const records = payload.events.slice(
      0,
      Math.max(0, Math.min(remaining, JOURNAL_RELOAD_PAGE_SIZE)),
    );
    records.forEach((record) => projectCanonicalEvent(record, refs, curatorRuns));
    eventsScanned += records.length;

    const hasMore = payload.has_more === true;
    if (payload.events.length > records.length || (hasMore && eventsScanned >= JOURNAL_RELOAD_MAX_EVENTS)) {
      return finalizeProjection({
        ownerChatId: owner,
        status: "Partial",
        reason: "journal_reload_limit_reached",
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
      });
    }
    if (!hasMore) {
      return finalizeProjection({
        ownerChatId: owner,
        status: "Complete",
        reason: "journal_reload_complete",
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
      });
    }

    const nextAfter = integerCursor(payload.next_after);
    if (records.length === 0 || nextAfter === null || nextAfter <= after) {
      return finalizeProjection({
        ownerChatId: owner,
        status: eventsScanned > 0 ? "Partial" : "Unavailable",
        reason: "journal_reload_cursor_stalled",
        errorCode: "context_v2_invalid_cursor",
        pagesRead,
        eventsScanned,
        refs,
        curatorRuns,
      });
    }
    after = nextAfter;
  }

  return finalizeProjection({
    ownerChatId: owner,
    status: "Partial",
    reason: "journal_reload_limit_reached",
    pagesRead,
    eventsScanned,
    refs,
    curatorRuns,
  });
};

const mergeRefs = (baseRefs, recoveredRefs) => {
  const merged = new Map();
  for (const item of [...(baseRefs || []), ...(recoveredRefs || [])]) {
    if (!isObject(item)) continue;
    const ref = boundedText(item.ref, 1024);
    if (!BUNDLE_REF_PATTERNS.some((pattern) => pattern.test(ref))) continue;
    const current = merged.get(ref);
    merged.set(ref, current ? { ...item, ...current, ref } : { ...item, ref });
  }
  return Array.from(merged.values()).slice(0, 512);
};

const runStatusRank = (value) => {
  const status = boundedText(value, 32).toLowerCase();
  if (["completed", "complete", "failed", "isolated", "noop"].includes(status)) {
    return 3;
  }
  if (["running", "leased"].includes(status)) return 2;
  if (status === "pending") return 1;
  return 0;
};

const mergeRuns = (baseRuns, recoveredRuns) => {
  const merged = new Map();
  (baseRuns || []).forEach((run) => {
    if (isObject(run) && boundedText(run.id, 240)) merged.set(run.id, run);
  });
  (recoveredRuns || []).forEach((run) => {
    if (!isObject(run) || !boundedText(run.id, 240)) return;
    const current = merged.get(run.id);
    const recoveredIsNewer =
      !current || runStatusRank(run.status) >= runStatusRank(current.status);
    merged.set(
      run.id,
      current
        ? {
            ...run,
            ...current,
            status: recoveredIsNewer
              ? run.status || current.status
              : current.status || run.status,
            trigger: run.trigger || current.trigger,
            provider: run.provider || current.provider,
            model: run.model || current.model,
            version: run.version || current.version,
            consumedTokens: recoveredIsNewer
              ? run.consumedTokens ?? current.consumedTokens
              : current.consumedTokens ?? run.consumedTokens,
            inputTokens: recoveredIsNewer
              ? run.inputTokens ?? current.inputTokens
              : current.inputTokens ?? run.inputTokens,
            outputTokens: recoveredIsNewer
              ? run.outputTokens ?? current.outputTokens
              : current.outputTokens ?? run.outputTokens,
            cost: recoveredIsNewer
              ? run.cost ?? current.cost
              : current.cost ?? run.cost,
            reason: recoveredIsNewer
              ? run.reason || current.reason
              : current.reason || run.reason,
            errorCode: recoveredIsNewer
              ? run.errorCode || current.errorCode
              : current.errorCode || run.errorCode,
            refs: mergeRefs(current.refs, run.refs),
          }
        : run,
    );
  });
  return Array.from(merged.values()).slice(0, 128);
};

export const mergeMemoryV2AuditWithJournal = (audit, projection) => {
  if (!isObject(audit)) return audit;
  if (!isObject(projection)) return audit;
  return {
    ...audit,
    refs: mergeRefs(audit.refs, projection.refs),
    agentRuns: mergeRuns(audit.agentRuns, projection.agentRuns),
    journalReload: {
      status: boundedText(projection.status, 32),
      reason: identifierText(projection.reason, 160),
      errorCode: identifierText(projection.errorCode, 160),
      pagesRead: integerCursor(projection.pagesRead),
      eventsScanned: integerCursor(projection.eventsScanned),
    },
  };
};

export const MemoryV2CanonicalJournalReload = ({
  ownerChatId,
  onProjection,
}) => {
  const owner = ownerIdentifier(ownerChatId);
  const [projection, setProjection] = useState({
    status: "Loading",
    reason: "journal_reload_loading",
    errorCode: "",
    pagesRead: 0,
    eventsScanned: 0,
  });

  useEffect(() => {
    let cancelled = false;
    if (!owner) return () => {};
    if (!contextV2Bridge.isAvailable()) {
      const unavailable = {
        ownerChatId: owner,
        status: "Unavailable",
        reason: "journal_reload_unavailable",
        errorCode: "context_v2_unavailable",
        pagesRead: 0,
        eventsScanned: 0,
        refs: [],
        agentRuns: [],
      };
      setProjection(unavailable);
      if (typeof onProjection === "function") onProjection(unavailable);
      return () => {};
    }
    setProjection({
      status: "Loading",
      reason: "journal_reload_loading",
      errorCode: "",
      pagesRead: 0,
      eventsScanned: 0,
    });
    loadCanonicalMemoryV2Journal({
      ownerChatId: owner,
      isCancelled: () => cancelled,
    }).then((result) => {
      if (cancelled) return;
      setProjection(result);
      if (typeof onProjection === "function") onProjection(result);
    });
    return () => {
      cancelled = true;
    };
  }, [onProjection, owner]);

  if (!owner) return null;
  const metrics = [
    `${projection.pagesRead || 0} page${projection.pagesRead === 1 ? "" : "s"}`,
    `${projection.eventsScanned || 0} events`,
  ].join(" · ");
  return (
    <div
      data-testid="memory-v2-journal-reload"
      style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid var(--pupu-card-border, rgba(127,127,127,0.18))",
        fontSize: 10.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ display: "flex", gap: 7, justifyContent: "space-between" }}>
        <span style={{ opacity: 0.58 }}>Canonical journal reload</span>
        <span style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", opacity: 0.68 }}>
          {projection.status}
        </span>
      </div>
      <div style={{ marginTop: 2, opacity: 0.44 }}>{metrics}</div>
      {projection.status !== "Complete" && projection.status !== "Loading" && (
        <div role="status" style={{ marginTop: 3, opacity: 0.62 }}>
          {[projection.reason, projection.errorCode].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
};

export default MemoryV2CanonicalJournalReload;
