const MAX_STRING_LENGTH = 8192;
const MAX_ARRAY_LENGTH = 64;
const MAX_OBJECT_KEYS = 96;
const MAX_DEPTH = 6;

const BLOCKED_KEY_PATTERN =
  /(?:reasoning|chain[_-]?of[_-]?thought|hidden[_-]?thought|password|passwd|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;

const TOP_LEVEL_KEYS = Object.freeze([
  "schema_version",
  "requested_mode",
  "requested_rollout_mode",
  "effective_rollout_mode",
  "mode",
  "status",
  "trace_status",
  "journal_status",
  "reason",
  "real_context_window_tokens",
  "output_reserve_tokens",
  "transport_margin_tokens",
  "available_input_tokens",
  "compression_threshold_tokens",
  "message_budget_tokens",
  "predicted_total_tokens",
  "before_estimated_tokens",
  "after_estimated_tokens",
  "fixed_overhead_tokens",
  "source_message_count",
  "journal_event_count",
  "source_event_range",
  "compacted",
  "dropped_turn_count",
  "compacted_tool_result_count",
  "native_tool_pair_count",
  "journal_bootstrap_message_count",
  "neutral_envelope_injected",
  "checkpoint_created",
  "checkpoint_consolidation_candidate_created",
  "active_applied",
  "shadow_only",
  "persistence_degraded",
  "persistence_error_code",
  "error_code",
  "iteration",
  "canary_selected",
  "canary_percent",
  "canary_hash_strategy",
  "legacy",
  "legacy_v1",
  "checkpoint_ref",
  "checkpoint_refs",
  "artifact_ref",
  "artifact_refs",
  "handoff_ref",
  "handoff_refs",
  "content_ref",
  "references",
  "context_build",
  "latest_context_build",
  "memory_agent",
  "memory_agent_run",
  "memory_agent_runs",
  "curator",
  "curator_run",
  "curator_runs",
  "consolidation_job",
  "consolidation_jobs",
]);

const REF_PATTERNS = Object.freeze([
  /^pupu:\/\/memory\/[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^pupu:\/\/artifact\/[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^pupu:\/\/context\/event\/[A-Za-z0-9._:-]+(?:\/content)?$/,
  /^pupu:\/\/context\/checkpoint\/[A-Za-z0-9._:-]+$/,
  /^entry:[A-Za-z0-9._:-]+@[1-9][0-9]*$/,
  /^event(?:-content)?:[A-Za-z0-9._:-]+$/,
]);

const REF_CONTAINER_KEYS = Object.freeze([
  ["checkpoint_ref", "checkpoint"],
  ["checkpoint_refs", "checkpoint"],
  ["artifact_ref", "artifact"],
  ["artifact_refs", "artifact"],
  ["handoff_ref", "handoff"],
  ["handoff_refs", "handoff"],
  ["content_ref", "content"],
  ["references", "reference"],
]);

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const sanitizeNode = (value, depth = 0) => {
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    return value.slice(0, MAX_STRING_LENGTH);
  }
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) => sanitizeNode(item, depth + 1))
      .filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) return null;

  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(
    0,
    MAX_OBJECT_KEYS,
  )) {
    const key = String(rawKey).slice(0, 128);
    if (!key || BLOCKED_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeNode(rawValue, depth + 1);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
};

export const sanitizeMemoryV2TraceBundle = (raw) => {
  if (!isPlainObject(raw)) return null;
  const output = {};
  for (const key of TOP_LEVEL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const sanitized = sanitizeNode(raw[key]);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return Object.keys(output).length > 0 ? output : null;
};

const normalizedText = (value, maximum = 512) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

const finiteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const parsed = finiteNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
};

const titleCase = (value) => {
  const text = normalizedText(value, 80).replace(/[_-]+/g, " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
};

const resolveMode = (raw) => {
  const mode = normalizedText(
    raw.mode || raw.effective_rollout_mode || raw.requested_mode,
    48,
  ).toLowerCase();
  return mode || "off";
};

const resolveTraceStatus = (raw, mode, runStatus) => {
  const explicit = normalizedText(
    raw.trace_status || raw.journal_status || raw.status,
    48,
  ).toLowerCase();
  if (explicit === "complete" || explicit === "completed") return "Complete";
  if (explicit === "partial" || explicit === "failed" || explicit === "error") {
    return "Partial";
  }
  if (explicit === "legacy") return "Legacy";
  if (explicit === "unavailable") return "Unavailable";

  const outer = normalizedText(runStatus, 48).toLowerCase();
  if (["error", "failed", "cancelled", "partial"].includes(outer)) {
    return "Partial";
  }
  if (raw.legacy === true || raw.legacy_v1 === true || mode === "legacy") {
    return "Legacy";
  }
  if (
    raw.persistence_degraded === true ||
    normalizedText(raw.persistence_error_code) ||
    normalizedText(raw.error_code)
  ) {
    return "Partial";
  }
  if (
    mode === "off" ||
    mode === "unavailable" ||
    normalizedText(raw.reason).toLowerCase().includes("unavailable")
  ) {
    return "Unavailable";
  }
  return mode === "active" || mode === "shadow" ? "Complete" : "Unavailable";
};

const isReadableRef = (value) =>
  typeof value === "string" &&
  REF_PATTERNS.some((pattern) => pattern.test(value));

const refValueFrom = (value) => {
  if (isReadableRef(value)) return value;
  if (!isPlainObject(value)) return "";
  for (const key of [
    "uri",
    "ref",
    "content_ref",
    "artifact_ref",
    "checkpoint_ref",
    "handoff_ref",
    "full_output_ref",
  ]) {
    const candidate = refValueFrom(value[key]);
    if (candidate) return candidate;
  }
  return "";
};

const refMetadataFrom = (value) => {
  if (!isPlainObject(value)) return {};
  const bytes = firstFiniteNumber(
    value.bytes,
    value.byte_size,
    value.content_bytes,
  );
  return {
    ...(normalizedText(value.media_type || value.mime_type, 160)
      ? { mediaType: normalizedText(value.media_type || value.mime_type, 160) }
      : {}),
    ...(bytes !== null ? { bytes } : {}),
    ...(normalizedText(value.sha256 || value.content_sha256, 128)
      ? { sha256: normalizedText(value.sha256 || value.content_sha256, 128) }
      : {}),
  };
};

const collectRefsFromValue = (value, kind, output) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectRefsFromValue(item, kind, output));
    return;
  }
  const ref = refValueFrom(value);
  if (ref) {
    output.push({ kind, ref, ...refMetadataFrom(value) });
  }
};

const collectRefs = (raw, extraSources = []) => {
  const refs = [];
  const sources = [
    raw,
    raw.context_build,
    raw.latest_context_build,
    ...extraSources,
  ].filter(isPlainObject);
  for (const source of sources) {
    for (const [key, kind] of REF_CONTAINER_KEYS) {
      collectRefsFromValue(source[key], kind, refs);
    }
  }
  const seen = new Set();
  return refs.filter((item) => {
    if (seen.has(item.ref)) return false;
    seen.add(item.ref);
    return true;
  });
};

const safeStructuredText = (value, maximum = 6000) => {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.trim().slice(0, maximum);
  try {
    return JSON.stringify(value, null, 2).slice(0, maximum);
  } catch {
    return "";
  }
};

const agentRunSources = (raw) => {
  const sources = [];
  for (const key of [
    "memory_agent_runs",
    "curator_runs",
    "consolidation_jobs",
  ]) {
    if (Array.isArray(raw[key])) sources.push(...raw[key]);
  }
  for (const key of [
    "memory_agent",
    "memory_agent_run",
    "curator",
    "curator_run",
    "consolidation_job",
  ]) {
    if (isPlainObject(raw[key])) sources.push(raw[key]);
  }
  return sources.filter(isPlainObject);
};

const presentAgentRun = (run, index) => {
  const tokens = isPlainObject(run.tokens) ? run.tokens : {};
  const cost = isPlainObject(run.cost) ? run.cost : {};
  const error = isPlainObject(run.error) ? run.error : {};
  const model = normalizedText(run.model || run.model_id, 200);
  const provider = normalizedText(run.provider, 120);
  const version = normalizedText(run.model_version || run.version, 120);
  const consumedTokens = firstFiniteNumber(
    run.consumed_tokens,
    run.token_count,
    tokens.consumed_tokens,
    tokens.total,
  );
  const inputTokens = firstFiniteNumber(
    run.input_tokens,
    tokens.input_tokens,
    tokens.input,
  );
  const outputTokens = firstFiniteNumber(
    run.output_tokens,
    tokens.output_tokens,
    tokens.output,
  );
  const costValue = firstFiniteNumber(run.cost_usd, cost.usd, cost.amount);
  const id = normalizedText(run.run_id || run.job_id || run.operation_id, 240);
  return {
    id: id || `memory-agent-${index + 1}`,
    status: titleCase(run.status) || "Unknown",
    trigger: normalizedText(run.trigger_reason || run.trigger, 1000),
    provider,
    model,
    version,
    consumedTokens,
    inputTokens,
    outputTokens,
    cost: costValue,
    currency: normalizedText(run.currency || cost.currency, 16) || "USD",
    diff: safeStructuredText(run.write_diff || run.diff),
    errorCode: normalizedText(run.error_code || error.code, 160),
    error: normalizedText(run.error_message || error.message, 2000),
    reason: normalizedText(run.reason, 1000),
    undo: safeStructuredText(
      run.undo || run.undo_ref || run.undo_operation_id || run.operation_id,
      2000,
    ),
    refs: collectRefs(run),
  };
};

export const presentMemoryV2Audit = (raw, { runStatus = "" } = {}) => {
  const safe = sanitizeMemoryV2TraceBundle(raw);
  if (!safe) return null;
  const mode = resolveMode(safe);
  const status = resolveTraceStatus(safe, mode, runStatus);
  const predictedTokens = firstFiniteNumber(
    safe.predicted_total_tokens,
    safe.before_estimated_tokens,
  );
  const availableTokens = finiteNumber(safe.available_input_tokens);
  const pressurePercent =
    predictedTokens !== null && availableTokens !== null && availableTokens > 0
      ? Math.round((predictedTokens / availableTokens) * 1000) / 10
      : null;
  const sourceRange = isPlainObject(safe.source_event_range)
    ? {
        firstEventId: normalizedText(
          safe.source_event_range.first_event_id,
          240,
        ),
        lastEventId: normalizedText(safe.source_event_range.last_event_id, 240),
        eventCount: firstFiniteNumber(safe.source_event_range.event_count),
      }
    : null;
  const agentRuns = agentRunSources(safe).map(presentAgentRun);

  return {
    schemaVersion: normalizedText(safe.schema_version, 120),
    mode,
    modeLabel: titleCase(mode) || "Off",
    status,
    reason: normalizedText(safe.reason, 1000),
    errorCode: normalizedText(
      safe.persistence_error_code || safe.error_code,
      160,
    ),
    activeApplied: safe.active_applied === true,
    shadowOnly: safe.shadow_only === true || mode === "shadow",
    pressure: {
      predictedTokens,
      availableTokens,
      percent: pressurePercent,
      thresholdTokens: finiteNumber(safe.compression_threshold_tokens),
      realWindowTokens: finiteNumber(safe.real_context_window_tokens),
      outputReserveTokens: finiteNumber(safe.output_reserve_tokens),
      transportMarginTokens: finiteNumber(safe.transport_margin_tokens),
    },
    compression: {
      compacted: typeof safe.compacted === "boolean" ? safe.compacted : null,
      checkpointCreated:
        typeof safe.checkpoint_created === "boolean"
          ? safe.checkpoint_created
          : null,
      beforeTokens: finiteNumber(safe.before_estimated_tokens),
      afterTokens: finiteNumber(safe.after_estimated_tokens),
      droppedTurns: finiteNumber(safe.dropped_turn_count),
      compactedToolResults: finiteNumber(safe.compacted_tool_result_count),
      sourceRange,
    },
    refs: collectRefs(safe, agentRuns),
    agentRuns,
  };
};

export const isMemoryV2TraceBundle = (raw) =>
  sanitizeMemoryV2TraceBundle(raw) !== null;
