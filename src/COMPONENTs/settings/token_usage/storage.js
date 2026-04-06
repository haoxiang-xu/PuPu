const STORAGE_KEY = "token_usage";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

const toFinitePositiveNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const normalizeTokenUsageRecord = (record) => {
  if (!isObject(record)) return null;

  let consumed_tokens = toFinitePositiveNumber(record.consumed_tokens);
  const input_tokens = toFinitePositiveNumber(record.input_tokens);
  const output_tokens = toFinitePositiveNumber(record.output_tokens);

  if (consumed_tokens <= 0 && (input_tokens > 0 || output_tokens > 0)) {
    consumed_tokens = input_tokens + output_tokens;
  }
  if (consumed_tokens <= 0) {
    return null;
  }

  return {
    timestamp: typeof record.timestamp === "number" ? record.timestamp : Date.now(),
    provider: typeof record.provider === "string" ? record.provider : "unknown",
    model: typeof record.model === "string" ? record.model : "unknown",
    model_id: typeof record.model_id === "string" ? record.model_id : "unknown",
    consumed_tokens,
    input_tokens,
    output_tokens,
    ...(toFinitePositiveNumber(record.cache_read_input_tokens) > 0
      ? { cache_read_input_tokens: toFinitePositiveNumber(record.cache_read_input_tokens) }
      : {}),
    ...(toFinitePositiveNumber(record.cache_creation_input_tokens) > 0
      ? { cache_creation_input_tokens: toFinitePositiveNumber(record.cache_creation_input_tokens) }
      : {}),
    ...(typeof record.max_context_window_tokens === "number" &&
    Number.isFinite(record.max_context_window_tokens)
      ? { max_context_window_tokens: record.max_context_window_tokens }
      : {}),
    ...(typeof record.chatId === "string" ? { chatId: record.chatId } : {}),
  };
};

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
 *           consumed_tokens?: number, input_tokens?: number, output_tokens?: number,
 *           max_context_window_tokens?: number, chatId?: string }} record
 */
export const appendTokenUsageRecord = (record) => {
  const normalized = normalizeTokenUsageRecord(record);
  if (!normalized) {
    return;
  }
  const root = readRoot();
  if (!Array.isArray(root.records)) {
    root.records = [];
  }
  root.records.push(normalized);
  writeRoot(root);
};

/** Return all stored records (oldest-first). */
export const readTokenUsageRecords = () => {
  const root = readRoot();
  if (!Array.isArray(root.records)) {
    return [];
  }
  return root.records
    .map((record) => normalizeTokenUsageRecord(record))
    .filter(Boolean);
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
