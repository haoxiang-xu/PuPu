/**
 * Context pressure from provider accounting alone.
 *
 * Context Composition (`context_composition_v1`) explains *what* filled the
 * window, but it only exists once the runtime instruments a contribution
 * source. Provider usage receipts, by contrast, are emitted on every single
 * call — so "how full is the window" is answerable long before "what is in it".
 *
 * This module reads only the accounting half. It never estimates: a missing
 * window size yields `null` pressure rather than a guessed denominator.
 */

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
  for (let index = bundle.provider_calls.length - 1; index >= 0; index -= 1) {
    const call = bundle.provider_calls[index];
    if (!isObject(call)) continue;
    const input = call.usage?.input;
    if (!isObject(input)) continue;
    if (safeTokenCount(input.total_tokens) === null) continue;
    return call;
  }
  return null;
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

  return {
    inputTokens,
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

export const buildContextUsageView = (usage, windowTokens) => {
  if (!isObject(usage) || usage.inputTokens === null) return null;
  const window =
    typeof windowTokens === "number" &&
    Number.isSafeInteger(windowTokens) &&
    windowTokens > 0
      ? windowTokens
      : null;
  return {
    ...usage,
    contextWindowTokens: window,
    // No window means no honest ratio. Callers render the absolute count.
    windowPressure: window === null ? null : usage.inputTokens / window,
    percentageAvailable: window !== null,
  };
};
