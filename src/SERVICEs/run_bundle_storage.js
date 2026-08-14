import {
  RUN_BUNDLE_V1_SCHEMA,
  normalizeRendererRunBundleV1,
} from "./run_bundle_v1";
import {
  isRunBundleStorageBridgeAvailable,
  runBundleStorageBridge,
} from "./bridges/run_bundle_storage_bridge";
import { normalizeCompletionDiagnosticsV1 } from "./completion_diagnostics_v1";

export const isRunBundleStorageAvailable = () =>
  isRunBundleStorageBridgeAvailable();

/**
 * Persist one strictly admitted RunBundle. There is deliberately no
 * localStorage or token_usage_records fallback: those stores are legacy
 * evidence and remain read-only once v1 production is enabled.
 */
const validateRunBundleUpsertAck = (result, bundle) => {
  if (
    !result ||
    result.ok !== true ||
    result.bundleId !== bundle.bundle_id ||
    result.revision !== bundle.revision ||
    result.bundleDigest !== bundle.bundle_digest
  ) {
    const error = new Error(
      "[run_bundle_storage_invalid] RunBundle UPSERT acknowledgement is invalid",
    );
    error.code = "run_bundle_storage_invalid";
    throw error;
  }
  return result;
};

export const persistRunBundleV1 = (rawBundle) => {
  const bundle = normalizeRendererRunBundleV1(rawBundle);
  return runBundleStorageBridge
    .upsert(bundle)
    .then((result) => validateRunBundleUpsertAck(result, bundle));
};

/**
 * Narrow adapter for the stream done seam. Legacy bundles are ignored rather
 * than append-counted; a canonical v1 bundle is validated before IPC.
 */
export const persistDoneRunBundleV1 = (done) => {
  const hasBundle =
    done &&
    typeof done === "object" &&
    !Array.isArray(done) &&
    Object.prototype.hasOwnProperty.call(done, "bundle");
  if (!hasBundle || done.bundle === null || done.bundle === undefined) {
    return Promise.resolve({
      ok: true,
      status: "legacy_read_only",
    });
  }
  const bundle = done.bundle;
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    const error = new Error(
      "[run_bundle_stream_invalid] done.bundle must be an object",
    );
    error.code = "run_bundle_stream_invalid";
    throw error;
  }
  if (!Object.prototype.hasOwnProperty.call(bundle, "schema")) {
    return Promise.resolve({
      ok: true,
      status: "legacy_read_only",
    });
  }
  if (bundle.schema !== RUN_BUNDLE_V1_SCHEMA) {
    const error = new Error(
      "[run_bundle_stream_invalid] done.bundle uses an unsupported schema",
    );
    error.code = "run_bundle_stream_invalid";
    throw error;
  }
  return persistRunBundleV1(bundle);
};

/**
 * Terminal accounting barrier used by foreground and reattached streams.
 * Diagnostics are admitted first, then canonical usage is durably keyed in
 * Electron. Callers may only publish status=done after this promise resolves.
 */
export const admitDoneRunAccountingV1 = (done = {}) => {
  const completionDiagnostics = normalizeCompletionDiagnosticsV1(
    done?.completion_diagnostics,
  );
  const rawBundle =
    done?.bundle && typeof done.bundle === "object" && !Array.isArray(done.bundle)
      ? done.bundle
      : null;
  const canonicalBundle =
    rawBundle?.schema === RUN_BUNDLE_V1_SCHEMA
      ? normalizeRendererRunBundleV1(rawBundle)
      : null;
  const persistence = persistDoneRunBundleV1(done);

  // Pure legacy completions have no durable v1 accounting boundary to cross.
  // Keep their established synchronous terminal semantics so an unrelated
  // microtask cannot reopen run-generation or queue-relay races. Diagnostics
  // admission above is also synchronous and fail-closed.
  if (!canonicalBundle) {
    return {
      bundle: rawBundle,
      completionDiagnostics,
      ledger: {
        ok: true,
        status: "legacy_read_only",
      },
    };
  }

  return Promise.resolve(persistence).then((ledger) => ({
    bundle: canonicalBundle || rawBundle,
    completionDiagnostics,
    ledger,
  }));
};

export const queryRunBundles = async (query = {}) => {
  const result = await runBundleStorageBridge.query(query);
  if (!result || result.ok !== true || !Array.isArray(result.records)) {
    const error = new Error(
      "[run_bundle_storage_invalid] RunBundle query returned an invalid envelope",
    );
    error.code = "run_bundle_storage_invalid";
    throw error;
  }
  return result.records.map((record) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(
        "[run_bundle_storage_invalid] RunBundle query record is invalid",
      );
    }
    const expectedKeys = ["bundle", "usageSlices", "createdAt", "updatedAt"];
    const actualKeys = Object.keys(record).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== [...expectedKeys].sort()[index])
    ) {
      throw new Error(
        "[run_bundle_storage_invalid] RunBundle query record has unknown fields",
      );
    }
    const bundle = normalizeRendererRunBundleV1(record.bundle);
    if (JSON.stringify(record.usageSlices) !== JSON.stringify(bundle.usage_slices)) {
      throw new Error(
        "[run_bundle_storage_invalid] RunBundle query slices do not match the bundle",
      );
    }
    if (
      !Number.isSafeInteger(record.createdAt) ||
      record.createdAt < 0 ||
      !Number.isSafeInteger(record.updatedAt) ||
      record.updatedAt < 0
    ) {
      throw new Error(
        "[run_bundle_storage_invalid] RunBundle query timestamps are invalid",
      );
    }
    return { ...record, bundle };
  });
};

export const clearRunBundles = (options = {}) =>
  runBundleStorageBridge.clear(options);

const SETTINGS_QUERY_PAGE_SIZE = 5000;
const SETTINGS_QUERY_MAX_BUNDLES = 50000;

const completedProviderCallTimestamp = (receipt) => {
  const raw = receipt?.timing?.completed_at || receipt?.timing?.started_at || null;
  if (typeof raw !== "string") return null;
  const timestamp = Date.parse(raw);
  return Number.isSafeInteger(timestamp) && timestamp >= 0 ? timestamp : null;
};

const presentationRecordFromReceipt = (receipt, bundle) => {
  const timestamp = completedProviderCallTimestamp(receipt);
  if (timestamp === null) return null;
  const usage = receipt.usage;
  return {
    timestamp,
    provider: receipt.provider.name,
    model: receipt.provider.model,
    model_id: `${receipt.provider.name}:${receipt.provider.model}`,
    service_tier: receipt.provider.service_tier,
    consumed_tokens: usage.total_tokens,
    input_tokens: usage.input.total_tokens,
    output_tokens: usage.output.total_tokens,
    cache_read_input_tokens: usage.input.cache_read_tokens,
    cache_creation_input_tokens: usage.input.cache_write_tokens,
    reasoning_output_tokens: usage.output.reasoning_tokens,
    provider_call_id: receipt.provider_call_id,
    usage_source: usage.source,
    status: receipt.status,
    chatId: bundle.identity.execution_id,
  };
};

/**
 * Project canonical receipts into the existing Settings chart record shape.
 * Every provider_call_id is counted once across overlapping root/child
 * bundles. Cache and reasoning stay annotations/subsets of the provider
 * totals; unknown counts remain null.
 */
export const projectRunBundleTokenUsage = (records, query = {}) => {
  if (!Array.isArray(records)) {
    throw new Error(
      "[run_bundle_storage_invalid] Settings projection requires records",
    );
  }
  const startMs = Number.isSafeInteger(query.startMs) ? query.startMs : null;
  const endMs = Number.isSafeInteger(query.endMs) ? query.endMs : null;
  const receiptById = new Map();
  records.forEach((record) => {
    const bundle = record.bundle;
    bundle.provider_calls.forEach((receipt) => {
      const immutable = JSON.stringify(receipt);
      const prior = receiptById.get(receipt.provider_call_id);
      if (prior && prior.immutable !== immutable) {
        const error = new Error(
          "[run_bundle_storage_corrupt] provider_call_id has conflicting receipts",
        );
        error.code = "run_bundle_storage_corrupt";
        throw error;
      }
      if (!prior) receiptById.set(receipt.provider_call_id, { receipt, bundle, immutable });
    });
  });
  return [...receiptById.values()]
    .map(({ receipt, bundle }) => presentationRecordFromReceipt(receipt, bundle))
    .filter(
      (record) =>
        record !== null &&
        (startMs === null || record.timestamp >= startMs) &&
        (endMs === null || record.timestamp <= endMs),
    )
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp ||
        left.provider_call_id.localeCompare(right.provider_call_id),
    );
};

/** Read at most the newest 50k canonical bundles, oldest presentation first. */
export const queryRunBundleTokenUsage = async (query = {}) => {
  const records = [];
  for (
    let offset = 0;
    offset < SETTINGS_QUERY_MAX_BUNDLES;
    offset += SETTINGS_QUERY_PAGE_SIZE
  ) {
    const page = await queryRunBundles({
      startMs: query.startMs,
      endMs: query.endMs,
      limit: SETTINGS_QUERY_PAGE_SIZE,
      offset,
    });
    records.push(...page);
    if (page.length < SETTINGS_QUERY_PAGE_SIZE) break;
  }
  return projectRunBundleTokenUsage(records, query);
};
