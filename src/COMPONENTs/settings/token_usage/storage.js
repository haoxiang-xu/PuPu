const STORAGE_KEY = "token_usage";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const readRoot = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeRoot = (root) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
};

/**
 * Append a single token-usage record.
 *
 * @param {{ timestamp: number, provider: string, model: string, model_id: string,
 *           consumed_tokens: number, max_context_window_tokens?: number, chatId?: string }} record
 */
export const appendTokenUsageRecord = (record) => {
  if (
    !record ||
    typeof record.consumed_tokens !== "number" ||
    !Number.isFinite(record.consumed_tokens) ||
    record.consumed_tokens <= 0
  ) {
    return;
  }
  const root = readRoot();
  if (!Array.isArray(root.records)) {
    root.records = [];
  }
  root.records.push({
    timestamp:
      typeof record.timestamp === "number" ? record.timestamp : Date.now(),
    provider: typeof record.provider === "string" ? record.provider : "unknown",
    model: typeof record.model === "string" ? record.model : "unknown",
    model_id: typeof record.model_id === "string" ? record.model_id : "unknown",
    consumed_tokens: record.consumed_tokens,
    ...(typeof record.max_context_window_tokens === "number"
      ? { max_context_window_tokens: record.max_context_window_tokens }
      : {}),
    ...(typeof record.chatId === "string" ? { chatId: record.chatId } : {}),
  });
  writeRoot(root);
};

/** Return all stored records (oldest-first). */
export const readTokenUsageRecords = () => {
  const root = readRoot();
  return Array.isArray(root.records) ? root.records : [];
};

/** Remove every record. */
export const clearTokenUsageRecords = () => {
  writeRoot({ records: [] });
};

/** Return records whose timestamp falls within [startMs, endMs]. */
export const getTokenUsageByDateRange = (startMs, endMs) => {
  return readTokenUsageRecords().filter(
    (r) => r.timestamp >= startMs && r.timestamp <= endMs,
  );
};
