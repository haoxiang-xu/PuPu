/**
 * Context pressure from provider receipts.
 *
 * Context Composition (`context_composition_v1`) explains *what* filled the
 * window, but it only exists once the runtime instruments a contribution
 * source. Provider usage receipts, by contrast, are emitted on every single
 * call — so "how full is the window" is answerable long before "what is in it".
 *
 * A receipt's recorded window takes precedence over the composer selection.
 * A missing window yields `null` pressure rather than a guessed denominator.
 */

import {
  CONTEXT_COMPOSITION_EXTENSION_KEY,
  normalizeContextCompositionExtension,
} from "./context_composition_v1";

const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const safeTokenCount = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

/**
 * The last physical call carries the whole conversation, so its input total IS
 * the current window occupancy. Summing calls would double-count the history.
 */
const selectAuthoritativeCall = (bundle) => {
  if (!isObject(bundle) || !Array.isArray(bundle.provider_calls)) return null;
  // Canonical bundles sort this set by opaque provider_call_id, not time.
  const calls = bundle.provider_calls.filter((call) =>
    isObject(call) &&
    isObject(call.usage?.input) &&
    safeTokenCount(call.usage.input.total_tokens) !== null,
  );
  calls.sort((left, right) => {
    const leftStarted = typeof left.timing?.started_at === "string"
      ? left.timing.started_at : "";
    const rightStarted = typeof right.timing?.started_at === "string"
      ? right.timing.started_at : "";
    const leftTime = Date.parse(leftStarted);
    const rightTime = Date.parse(rightStarted);
    const leftTimed = Number.isFinite(leftTime);
    const rightTimed = Number.isFinite(rightTime);
    if (leftTimed !== rightTimed) return leftTimed ? 1 : -1;
    // Preserve last-entry behavior for old receipts without timestamps.
    if (!leftTimed) return 0;
    // Date.parse normalizes UTC offsets but drops the runtime's microseconds.
    const leftFraction = leftStarted.match(/\.(\d+)/)?.[1] || "";
    const rightFraction = rightStarted.match(/\.(\d+)/)?.[1] || "";
    const precision = Math.max(leftFraction.length, rightFraction.length);
    return leftTime - rightTime ||
      leftFraction.padEnd(precision, "0").localeCompare(rightFraction.padEnd(precision, "0")) ||
      (left.identity?.iteration || 0) - (right.identity?.iteration || 0) ||
      (left.identity?.retry_ordinal || 0) - (right.identity?.retry_ordinal || 0) ||
      (left.provider_call_id || "").localeCompare(right.provider_call_id || "");
  });
  return calls[calls.length - 1] || null;
};

export const selectContextUsage = (bundle) => {
  const call = selectAuthoritativeCall(bundle);
  if (!call) return null;

  const input = call.usage.input;
  const inputTokens = safeTokenCount(input.total_tokens);
  const callCount = Array.isArray(bundle.provider_calls)
    ? bundle.provider_calls.filter(
        (item) => isObject(item) && isObject(item.usage?.input),
      ).length
    : 0;
  let reportedContextWindowTokens = null;
  const extension = call.extensions?.[CONTEXT_COMPOSITION_EXTENSION_KEY];
  if (extension !== undefined) {
    try {
      reportedContextWindowTokens =
        normalizeContextCompositionExtension(extension).context_window_tokens;
    } catch (_error) {
      // Invalid composition must not invalidate otherwise usable accounting.
    }
  }

  return {
    inputTokens,
    reportedContextWindowTokens,
    cacheReadTokens: safeTokenCount(input.cache_read_tokens),
    cacheWriteTokens: safeTokenCount(input.cache_write_tokens),
    uncachedTokens: safeTokenCount(input.uncached_tokens),
    callCount,
    provider:
      typeof call.provider?.name === "string" ? call.provider.name : "",
    model: typeof call.provider?.model === "string" ? call.provider.model : "",
  };
};

export const selectLatestContextUsage = (messages) => {
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const bundle = messages[index]?.meta?.bundle;
    if (!isObject(bundle)) continue;
    // Newest bundle wins even if it carries no usage — falling back to an older
    // call would present stale pressure as the current state of the chat.
    return selectContextUsage(bundle);
  }
  return null;
};

/**
 * Resolve the denominator from model capabilities. Returns null whenever the
 * catalog did not report one, which is a normal state (live Ollama models are
 * absent from the packaged capability file) and must stay distinguishable from
 * a real number.
 */
export const selectContextWindowTokens = (capabilities) => {
  if (!isObject(capabilities)) return null;
  const raw = capabilities.max_context_window_tokens;
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
    ? raw
    : null;
};

/**
 * Resolve the window currently configured for the composer. Built-in Ollama
 * models expose a selectable request window; other providers retain the
 * catalog-maximum denominator used by historical and general callers.
 */
export const selectActiveContextWindowTokens = (
  capabilities,
  { modelId, selectedContextWindow } = {},
) => {
  const normalizedModelId =
    typeof modelId === "string" ? modelId.trim() : "";
  const maximum = selectContextWindowTokens(capabilities);
  if (!normalizedModelId.startsWith("ollama:")) return maximum;

  const selected =
    typeof selectedContextWindow === "number" &&
    Number.isSafeInteger(selectedContextWindow) &&
    selectedContextWindow > 0
      ? selectedContextWindow
      : null;
  const declaredDefault = isObject(capabilities)
    ? capabilities.default_context_window_tokens
    : null;
  const fallback =
    typeof declaredDefault === "number" &&
    Number.isSafeInteger(declaredDefault) &&
    declaredDefault > 0
      ? declaredDefault
      : null;
  const requested = selected ?? fallback;
  if (requested === null) return null;
  return maximum === null ? requested : Math.min(requested, maximum);
};

export const buildContextUsageView = (usage, windowTokens, { modelId } = {}) => {
  if (!isObject(usage) || usage.inputTokens === null) return null;
  const recorded = safeTokenCount(usage.reportedContextWindowTokens);
  const selectedModel = typeof modelId === "string"
    ? modelId.trim().replace(/^custom\./, "")
    : null;
  const sameModel = selectedModel === null ||
    selectedModel === `${usage.provider}:${usage.model}`;
  // A model switch cannot change the window of an already completed call.
  const candidate = recorded > 0 ? recorded : sameModel ? windowTokens : null;
  const window =
    typeof candidate === "number" &&
    Number.isSafeInteger(candidate) &&
    candidate > 0
      ? candidate
      : null;
  return {
    ...usage,
    contextWindowTokens: window,
    // No window means no honest ratio. Callers render the absolute count.
    windowPressure: window === null ? null : usage.inputTokens / window,
    percentageAvailable: window !== null,
  };
};
