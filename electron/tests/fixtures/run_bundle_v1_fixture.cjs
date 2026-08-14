const {
  computeProviderCallReceiptSha256,
  computeRunBundleDigest,
} = require("../../shared/run_bundle_v1");

// Frozen from ../unchain/src/unchain/run_bundle.py's RunBundleReducer. These
// values make the shared fixture a producer-valid protocol artifact rather
// than a merely shape-valid renderer stub.
const HASH = Object.freeze({
  request: "a".repeat(64),
  anthropicRequest: "e".repeat(64),
  raw: "b".repeat(64),
  anthropicRaw: "f".repeat(64),
  providerRequest: "c".repeat(64),
  providerResponse: "d".repeat(64),
  anthropicProviderRequest: "1".repeat(64),
  anthropicProviderResponse: "2".repeat(64),
  receipt: "c390447c956e45581bc53461d772e32b599d4c1a278a4bd9baae374e9d648b3e",
  anthropicReceipt:
    "9470607ff1f64456f20ad2112afef6afacbfac7509d0c035ad5b86b0de5c7c61",
});

const ID = Object.freeze({
  bundle: "rb_086cd1dd09242db29b9ec52a5306772779914a796908b2b3177bdf357ec55bb4",
  openaiCall:
    "pc_89212239cee50c527ff256d235ee88b2b700d576e328a67517421aae55f81774",
  anthropicCall:
    "pc_13f439ef7faafa8027d4fc730a92deafe3506176398bfdc46a12b04165808018",
  openaiMetric:
    "me_65dac554aa78834f2da4036b1d2202b84d67d9590da8a3796d336a9bc553a407",
  anthropicMetric:
    "me_13d13c5c67634af26034b627b42fbbe868f0fbee84363cd11c3f7209b2153a13",
});

const PYTHON_DIGEST = Object.freeze({
  single: "33f1e5f0414e6be7974f98bed198d2a092ea78fb2f817863677d12b739a7bb22",
  multi: "97691e6c0f87ec4f13494bac022c000ad65b04470156997ccf37853f1e692b62",
  unavailable:
    "2dd09cd987ccf486548b20063142798c9bf4d302b413653f67719e70be875a1f",
});

const emptyMetricCounters = () => ({
  artifacts: 0,
  model_attempts: 0,
  iterations: 0,
  tool_calls: 0,
  tool_results: 0,
  interactions: 0,
  context_builds: 0,
  context_compactions: 0,
  errors: 0,
});

const metricEventForReceipt = (receipt) => ({
  metric_event_id:
    receipt.provider_call_id === ID.openaiCall
      ? ID.openaiMetric
      : ID.anthropicMetric,
  execution_id: receipt.identity.execution_id,
  attempt_id: receipt.identity.attempt_id,
  root_run_id: receipt.identity.root_run_id,
  owner_run_id: receipt.identity.owner_run_id,
  parent_run_id: receipt.identity.parent_run_id,
  kind: "model_attempt",
  subject_id: receipt.provider_call_id,
  outcome: receipt.status,
  error: null,
  evidence_refs: [],
});

const metricsForReceipts = (receipts) => {
  const events = receipts
    .map(metricEventForReceipt)
    .sort((left, right) => left.metric_event_id.localeCompare(right.metric_event_id));
  const direct = emptyMetricCounters();
  direct.model_attempts = events.length;
  return {
    algorithm: "unique_metric_event_set_union.v1",
    events,
    direct,
    descendant: emptyMetricCounters(),
    all: { ...direct },
  };
};

const usage = ({
  uncached = 400,
  cacheRead = 600,
  cacheWrite = null,
  cacheWrite5m = null,
  cacheWrite1h = null,
  input = 1000,
  visible = 150,
  reasoning = 50,
  output = 200,
  total = 1200,
  source = "provider_observed_partial",
} = {}) => ({
  input: {
    uncached_tokens: uncached,
    cache_read_tokens: cacheRead,
    cache_write_tokens: cacheWrite,
    cache_write_5m_tokens: cacheWrite5m,
    cache_write_1h_tokens: cacheWrite1h,
    total_tokens: input,
  },
  output: {
    visible_tokens: visible,
    reasoning_tokens: reasoning,
    total_tokens: output,
  },
  total_tokens: total,
  source,
});

const emptyUsage = () =>
  usage({
    uncached: null,
    cacheRead: null,
    cacheWrite: null,
    cacheWrite5m: null,
    cacheWrite1h: null,
    input: null,
    visible: null,
    reasoning: null,
    output: null,
    total: null,
    source: "unavailable",
  });

const coverage = (callIds, status = "complete", uncertainCallCount = 0) => ({
  status,
  receipt_count: callIds.length,
  observed_usage_count: status === "complete" ? callIds.length : 0,
  missing_usage_count: status === "complete" ? 0 : callIds.length,
  uncertain_call_count: uncertainCallCount,
  missing_usage_call_ids: status === "complete" ? [] : [...callIds].sort(),
});

const unavailableCost = () => ({
  status: "unavailable",
  basis: null,
  amount_nano_usd: null,
  currency: null,
  pricing_snapshot_ids: [],
});

const unavailablePricing = () => ({
  status: "unavailable",
  basis: null,
  snapshot: null,
  amount_nano_usd: null,
  reason: "pricing_snapshot_unavailable",
  input_multiplier_ppm: null,
  output_multiplier_ppm: null,
});

const openaiReceipt = () => ({
  schema: "unchain.provider_call_usage.v1",
  provider_call_id: ID.openaiCall,
  identity: {
    execution_id: "chat-1",
    attempt_id: "attempt-1",
    root_run_id: "run-root",
    owner_run_id: "run-root",
    parent_run_id: null,
    iteration: 1,
    retry_ordinal: 0,
    purpose: "agent.turn",
    request_sha256: HASH.request,
    route: "responses.create",
  },
  provider: { name: "openai", model: "gpt-5.6", service_tier: null },
  status: "completed",
  timing: {
    started_at: "2026-08-13T20:00:00.100000000Z",
    completed_at: "2026-08-13T20:00:00.900000000Z",
  },
  provider_ids: {
    request_id_sha256: HASH.providerRequest,
    response_id_sha256: HASH.providerResponse,
  },
  billing_dimensions: {
    billing_surface: null,
    batch: null,
    inference_geo: null,
  },
  usage: usage(),
  raw_usage_sha256: HASH.raw,
  pricing: unavailablePricing(),
  extensions: {},
});

const anthropicReceipt = () => ({
  schema: "unchain.provider_call_usage.v1",
  provider_call_id: ID.anthropicCall,
  identity: {
    execution_id: "chat-1",
    attempt_id: "attempt-1",
    root_run_id: "run-root",
    owner_run_id: "run-root",
    parent_run_id: null,
    iteration: 2,
    retry_ordinal: 0,
    purpose: "agent.turn",
    request_sha256: HASH.anthropicRequest,
    route: "messages.create",
  },
  provider: {
    name: "anthropic",
    model: "claude-sonnet-4-6",
    service_tier: "standard",
  },
  status: "completed",
  timing: {
    started_at: "2026-08-13T20:00:00.200000000Z",
    completed_at: "2026-08-13T20:00:00.800000000Z",
  },
  provider_ids: {
    request_id_sha256: HASH.anthropicProviderRequest,
    response_id_sha256: HASH.anthropicProviderResponse,
  },
  billing_dimensions: {
    billing_surface: null,
    batch: null,
    inference_geo: null,
  },
  usage: usage({
    uncached: 250,
    cacheRead: 0,
    cacheWrite: 100,
    cacheWrite5m: 60,
    cacheWrite1h: 40,
    input: 350,
    visible: 90,
    reasoning: 10,
    output: 100,
    total: 450,
    source: "provider_observed",
  }),
  raw_usage_sha256: HASH.anthropicRaw,
  pricing: unavailablePricing(),
  extensions: {},
});

const buildRunBundleV1 = ({
  revision = 1,
  multiModel = false,
  unavailable = false,
} = {}) => {
  const openai = openaiReceipt();
  if (unavailable) {
    openai.status = "uncertain";
    openai.timing.completed_at = null;
    openai.usage = emptyUsage();
    openai.raw_usage_sha256 = null;
  }
  const receipts = multiModel ? [anthropicReceipt(), openai] : [openai];
  const callIds = receipts.map((item) => item.provider_call_id).sort();
  const allUsage = unavailable
    ? emptyUsage()
    : multiModel
      ? usage({
          uncached: 650,
          cacheRead: 600,
          cacheWrite: null,
          cacheWrite5m: null,
          cacheWrite1h: null,
          input: 1350,
          visible: 240,
          reasoning: 60,
          output: 300,
          total: 1650,
          source: "provider_observed_partial",
        })
      : usage();
  const slices = receipts
    .map((item) => ({
      provider: item.provider.name,
      model: item.provider.model,
      service_tier: item.provider.service_tier,
      call_ids: [item.provider_call_id],
      usage: item.usage,
      coverage: coverage(
        [item.provider_call_id],
        item.status === "completed" ? "complete" : "unavailable",
        item.status === "uncertain" ? 1 : 0,
      ),
      cost: unavailableCost(),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
  const bundle = {
    schema: "unchain.run_bundle.v1",
    bundle_id: ID.bundle,
    revision,
    bundle_digest: "0".repeat(64),
    identity: {
      execution_id: "chat-1",
      attempt_id: "attempt-1",
      root_run_id: "run-root",
      run_id: "run-root",
      parent_run_id: null,
      relation: "root",
    },
    lifecycle: {
      status: unavailable ? "uncertain" : "completed",
      started_at: "2026-08-13T20:00:00Z",
      completed_at: "2026-08-13T20:00:01Z",
      continued_from_run_id: null,
    },
    descriptor: {
      model: "gpt-5.6",
      display_model: "GPT-5.6",
      active_agent: "root",
      agent_orchestration: "default",
      iteration: 2,
    },
    metrics: metricsForReceipts(receipts),
    provider_calls: receipts,
    children: [],
    aggregation: {
      algorithm: "provider_call_set_union.v1",
      direct_call_ids: callIds,
      descendant_call_ids: [],
      all_call_ids: callIds,
      direct_usage: allUsage,
      descendant_usage: emptyUsage(),
      all_usage: allUsage,
    },
    usage_slices: slices,
    coverage: coverage(callIds, unavailable ? "unavailable" : "complete", unavailable ? 1 : 0),
    cost: unavailableCost(),
    legacy: { status: "canonical", source: null, reason: null },
    evidence: {
      receipt_sha256s: receipts
        .map((item) => computeProviderCallReceiptSha256(item))
        .sort(),
      raw_usage_sha256s: receipts
        .map((item) => item.raw_usage_sha256)
        .filter((digest) => digest !== null)
        .sort(),
      pricing_snapshot_ids: [],
    },
    extensions: {},
  };
  bundle.bundle_digest = computeRunBundleDigest(bundle);
  return JSON.parse(JSON.stringify(bundle));
};

module.exports = {
  HASH,
  ID,
  PYTHON_DIGEST,
  buildRunBundleV1,
  coverage,
  emptyUsage,
  unavailableCost,
  usage,
};
