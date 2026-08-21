import { normalizeRendererRunBundleV1 } from "./run_bundle_v1";

export const CONTEXT_COMPOSITION_EXTENSION_KEY =
  "unchain.context/context_composition_v1";

const EXTENSION_SCHEMA = "unchain.context/context_composition_v1";
// v1: raw bytes/4 heuristic, no reconcile-scaling — every real call
// eventually stalls at quality="estimated" once tool schemas are attributed
// (see the v2 producer's own comment on CONTEXT_COMPOSITION_METHOD). v2:
// calibrated bytes/4.5 plus rescale-onto-the-billed-total when the estimate
// overshoots it. Both must stay accepted here — every receipt persisted
// before this method existed is permanently stamped v1, and opening one of
// those old chats must not fail composition normalization.
const SUPPORTED_METHODS = Object.freeze([
  "utf8_heuristic_v1",
  "utf8_heuristic_v2",
]);
const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export const CONTEXT_COMPOSITION_TAXONOMY = Object.freeze({
  instructions: Object.freeze([
    "core_system",
    "agent_instructions",
    "user_rules",
    "runtime_safety",
    "recipe_workflow",
  ]),
  skills: Object.freeze([
    "catalog_metadata",
    "loaded_body",
    "expanded_invocation",
  ]),
  tool_definitions: Object.freeze([
    "provider_schema",
    "prompt_guidance",
    "dynamic_tool",
  ]),
  conversation: Object.freeze([
    "current_input",
    "user_history",
    "assistant_history",
    "summary",
  ]),
  tool_activity: Object.freeze([
    "arguments",
    "results",
    "errors_observations",
  ]),
  memory: Object.freeze([
    "short_term_recall",
    "long_term_recall",
    "pending_memory",
  ]),
  task_state: Object.freeze([
    "pinned_state",
    "pending_interaction",
    "plan_state",
  ]),
  files_media: Object.freeze([
    "file_excerpt",
    "artifact",
    "image_media",
    "web_pdf",
  ]),
  agent_coordination: Object.freeze([
    "inherited_context",
    "handoff_summary",
    "child_instructions",
    "subagent_report_roster",
  ]),
  output_contract: Object.freeze([
    "response_schema",
    "format_instruction",
  ]),
});

const CATEGORY_ORDER = Object.freeze(Object.keys(CONTEXT_COMPOSITION_TAXONOMY));
const ROUTES = Object.freeze(["primary", "openai_previous_response_fallback"]);
const CONTEXT_MODES = Object.freeze([
  "semantic",
  "local_replay",
  "remote_continuation",
]);
const QUALITIES = Object.freeze([
  "reconciled_estimate",
  "estimated",
  "partial",
]);

/**
 * Fixed display order, deliberately NOT by size: fixed cost first, growing cost
 * last. Everything above Conversation is roughly the same every turn, so a
 * reader scanning top-to-bottom sees their standing overhead and then the one
 * slice that actually grows. Conversation is usually the largest group — with
 * it sitting mid-list the tail read as truncated.
 */
export const CONTEXT_COMPOSITION_GROUPS = Object.freeze([
  Object.freeze({
    id: "instructions",
    label: "Instructions",
    categories: Object.freeze(["instructions"]),
    color: "#8B7BE8",
  }),
  Object.freeze({
    id: "tools",
    label: "Tools",
    categories: Object.freeze(["tool_definitions", "tool_activity"]),
    color: "#5E9DE6",
  }),
  Object.freeze({
    id: "skills",
    label: "Skills",
    categories: Object.freeze(["skills"]),
    color: "#D76BA8",
  }),
  Object.freeze({
    id: "agent_coordination",
    label: "Agent Coordination",
    categories: Object.freeze(["agent_coordination"]),
    color: "#E28B52",
  }),
  Object.freeze({
    id: "output_contract",
    label: "Output Contract",
    categories: Object.freeze(["output_contract"]),
    color: "#8B96A8",
  }),
  Object.freeze({
    id: "memory_task_state",
    label: "Memory & Task State",
    categories: Object.freeze(["memory", "task_state"]),
    color: "#D7A84F",
  }),
  Object.freeze({
    id: "files_media",
    label: "Files & Media",
    categories: Object.freeze(["files_media"]),
    color: "#4FB8C8",
  }),
  Object.freeze({
    id: "conversation",
    label: "Conversation",
    categories: Object.freeze(["conversation"]),
    color: "#55B982",
  }),
]);

const GROUP_BY_CATEGORY = new Map(
  CONTEXT_COMPOSITION_GROUPS.flatMap((group) =>
    group.categories.map((category) => [category, group]),
  ),
);
const GROUP_ORDER = new Map(
  CONTEXT_COMPOSITION_GROUPS.map((group, index) => [group.id, index]),
);

class ContextCompositionContractError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ContextCompositionContractError";
  }
}

const fail = (path, message) => {
  throw new ContextCompositionContractError(path, message);
};

const isObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const exact = (value, keys, path) => {
  if (!isObject(value)) fail(path, "must be a plain object");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(path, "has an unexpected key set");
  }
};

const integer = (value, path, { positive = false, nullable = false } = {}) => {
  if (value === null && nullable) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < (positive ? 1 : 0) ||
    value > MAX_SAFE
  ) {
    fail(path, positive ? "must be a positive safe integer" : "must be a non-negative safe integer");
  }
  return value;
};

const enumValue = (value, allowed, path) => {
  if (!allowed.includes(value)) fail(path, "has an unsupported value");
  return value;
};

const validateCanonicalOrder = (values, order, path) => {
  let previous = -1;
  values.forEach((value) => {
    const current = order.indexOf(value);
    if (current < 0 || current <= previous) {
      fail(path, "must be unique and canonically ordered");
    }
    previous = current;
  });
};

export const normalizeContextCompositionExtension = (value) => {
  exact(
    value,
    [
      "schema",
      "method",
      "quality",
      "context_window_tokens",
      "wire",
      "categories",
      "attributed_tokens",
      "residual_tokens",
      "coverage",
    ],
    "composition",
  );
  if (value.schema !== EXTENSION_SCHEMA) fail("composition.schema", "is unsupported");
  enumValue(value.method, SUPPORTED_METHODS, "composition.method");
  enumValue(value.quality, QUALITIES, "composition.quality");
  integer(value.context_window_tokens, "composition.context_window_tokens", {
    positive: true,
    nullable: true,
  });

  exact(
    value.wire,
    ["envelope_sha256", "route_name", "route_sha256", "context_mode"],
    "composition.wire",
  );
  if (!SHA256.test(value.wire.envelope_sha256)) {
    fail("composition.wire.envelope_sha256", "must be a prefixed lowercase SHA-256");
  }
  if (!SHA256.test(value.wire.route_sha256)) {
    fail("composition.wire.route_sha256", "must be a prefixed lowercase SHA-256");
  }
  enumValue(value.wire.route_name, ROUTES, "composition.wire.route_name");
  enumValue(value.wire.context_mode, CONTEXT_MODES, "composition.wire.context_mode");

  if (!Array.isArray(value.categories) || value.categories.length > 10) {
    fail("composition.categories", "must be a bounded array");
  }
  validateCanonicalOrder(
    value.categories.map((category) => category?.id),
    CATEGORY_ORDER,
    "composition.categories",
  );
  let categoryTokenTotal = 0;
  let categorySourceTotal = 0;
  value.categories.forEach((category, categoryIndex) => {
    const path = `composition.categories[${categoryIndex}]`;
    exact(category, ["id", "tokens", "source_count", "subtypes"], path);
    const allowedSubtypes = CONTEXT_COMPOSITION_TAXONOMY[category.id];
    if (!allowedSubtypes) fail(`${path}.id`, "is unsupported");
    integer(category.tokens, `${path}.tokens`, { positive: true });
    integer(category.source_count, `${path}.source_count`, { positive: true });
    if (
      !Array.isArray(category.subtypes) ||
      category.subtypes.length < 1 ||
      category.subtypes.length > allowedSubtypes.length
    ) {
      fail(`${path}.subtypes`, "must be a bounded non-empty array");
    }
    validateCanonicalOrder(
      category.subtypes.map((subtype) => subtype?.id),
      allowedSubtypes,
      `${path}.subtypes`,
    );
    let subtypeTokenTotal = 0;
    let subtypeSourceTotal = 0;
    category.subtypes.forEach((subtype, subtypeIndex) => {
      const subtypePath = `${path}.subtypes[${subtypeIndex}]`;
      exact(subtype, ["id", "tokens", "source_count"], subtypePath);
      integer(subtype.tokens, `${subtypePath}.tokens`, { positive: true });
      integer(subtype.source_count, `${subtypePath}.source_count`, {
        positive: true,
      });
      subtypeTokenTotal += subtype.tokens;
      subtypeSourceTotal += subtype.source_count;
      if (!Number.isSafeInteger(subtypeTokenTotal) || !Number.isSafeInteger(subtypeSourceTotal)) {
        fail(subtypePath, "sum exceeds the safe integer range");
      }
    });
    if (category.tokens !== subtypeTokenTotal) {
      fail(`${path}.tokens`, "must equal the subtype token sum");
    }
    if (category.source_count !== subtypeSourceTotal) {
      fail(`${path}.source_count`, "must equal the subtype source sum");
    }
    categoryTokenTotal += category.tokens;
    categorySourceTotal += category.source_count;
    if (
      !Number.isSafeInteger(categoryTokenTotal) ||
      !Number.isSafeInteger(categorySourceTotal)
    ) {
      fail(path, "category sum exceeds the safe integer range");
    }
  });

  integer(value.attributed_tokens, "composition.attributed_tokens");
  integer(value.residual_tokens, "composition.residual_tokens", { nullable: true });
  if (value.attributed_tokens !== categoryTokenTotal) {
    fail("composition.attributed_tokens", "must equal the category token sum");
  }

  exact(
    value.coverage,
    ["status", "manifest_items", "matched_items", "wire_surfaces", "matched_surfaces"],
    "composition.coverage",
  );
  enumValue(value.coverage.status, ["complete", "partial"], "composition.coverage.status");
  ["manifest_items", "matched_items", "wire_surfaces", "matched_surfaces"].forEach(
    (key) => integer(value.coverage[key], `composition.coverage.${key}`),
  );
  if (value.coverage.matched_items !== categorySourceTotal) {
    fail(
      "composition.coverage.matched_items",
      "must equal the admitted category source count",
    );
  }
  if (
    value.coverage.wire_surfaces > 4 ||
    value.coverage.matched_surfaces > 4
  ) {
    fail("composition.coverage", "wire surface counts exceed the closed domain");
  }
  if (
    value.coverage.matched_items > value.coverage.manifest_items ||
    value.coverage.matched_surfaces > value.coverage.wire_surfaces
  ) {
    fail("composition.coverage", "matched counts cannot exceed declared counts");
  }
  const coverageComplete =
    value.coverage.matched_items === value.coverage.manifest_items &&
    value.coverage.matched_surfaces === value.coverage.wire_surfaces;
  if ((value.coverage.status === "complete") !== coverageComplete) {
    fail("composition.coverage.status", "does not match the declared counters");
  }
  if (
    value.quality === "reconciled_estimate" &&
    (!coverageComplete || value.residual_tokens === null)
  ) {
    fail("composition.quality", "reconciled estimates require complete coverage and residual");
  }
  if (
    value.quality === "estimated" &&
    (!coverageComplete || value.residual_tokens !== null)
  ) {
    fail("composition.quality", "estimates require complete coverage and a null residual");
  }
  if (
    value.quality === "partial" &&
    (coverageComplete || value.residual_tokens !== null)
  ) {
    fail("composition.quality", "partial composition requires partial coverage and a null residual");
  }

  return JSON.parse(JSON.stringify(value));
};

const tokenOrNull = (value) =>
  Number.isSafeInteger(value) && value >= 0 ? value : null;

const checkedSum = (left, right) => {
  const total = left + right;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
};

const callInfo = (receipt, index) => ({
  key: `call-${index + 1}`,
  provider: receipt.provider.name,
  model: receipt.provider.model,
  iteration: receipt.identity.iteration,
  retryOrdinal: receipt.identity.retry_ordinal,
  status: receipt.status,
});

const compareReceiptsByStart = (left, right) => {
  const leftStarted =
    typeof left?.timing?.started_at === "string" ? left.timing.started_at : "";
  const rightStarted =
    typeof right?.timing?.started_at === "string" ? right.timing.started_at : "";
  return (
    leftStarted.localeCompare(rightStarted) ||
    left.identity.iteration - right.identity.iteration ||
    left.identity.retry_ordinal - right.identity.retry_ordinal ||
    left.provider_call_id.localeCompare(right.provider_call_id)
  );
};

const receiptsByStart = (receipts) =>
  [...receipts].sort(compareReceiptsByStart);

const groupCategories = (categories, denominator) => {
  const groups = new Map();
  categories.forEach((category) => {
    const definition = GROUP_BY_CATEGORY.get(category.id);
    if (!definition) return;
    const current = groups.get(definition.id) || {
      id: definition.id,
      label: definition.label,
      color: definition.color,
      tokens: 0,
      sourceCount: 0,
      subtypes: [],
    };
    current.tokens += category.tokens;
    current.sourceCount += category.source_count;
    category.subtypes.forEach((subtype) => {
      current.subtypes.push({
        id: subtype.id,
        categoryId: category.id,
        tokens: subtype.tokens,
        sourceCount: subtype.source_count,
      });
    });
    groups.set(definition.id, current);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      share:
        Number.isSafeInteger(denominator) && denominator > 0
          ? group.tokens / denominator
          : null,
      subtypes: group.subtypes,
    }))
    .sort(
      (left, right) =>
        GROUP_ORDER.get(left.id) - GROUP_ORDER.get(right.id),
    );
};

const unavailable = (scope, reason, calls = []) => ({
  available: false,
  scope,
  reason,
  calls,
  percentageAvailable: false,
  groups: [],
});

const extensionForReceipt = (receipt) => {
  if (!Object.prototype.hasOwnProperty.call(receipt.extensions, CONTEXT_COMPOSITION_EXTENSION_KEY)) {
    return { status: "missing", extension: null };
  }
  try {
    return {
      status: "valid",
      extension: normalizeContextCompositionExtension(
        receipt.extensions[CONTEXT_COMPOSITION_EXTENSION_KEY],
      ),
    };
  } catch (_error) {
    return { status: "invalid", extension: null };
  }
};

const modelCallView = (bundle, callKey) => {
  const orderedReceipts = receiptsByStart(bundle.provider_calls);
  const calls = orderedReceipts.map(callInfo);
  const requestedIndex = calls.findIndex((call) => call.key === callKey);
  if (callKey !== null && requestedIndex < 0) {
    return unavailable("model_call", "extension_invalid", calls);
  }
  const selectedIndex = callKey === null ? calls.length - 1 : requestedIndex;
  const receipt = orderedReceipts[selectedIndex];
  if (!receipt) return unavailable("model_call", "extension_missing", calls);
  const admitted = extensionForReceipt(receipt);
  if (admitted.status !== "valid") {
    return unavailable(
      "model_call",
      admitted.status === "invalid" ? "extension_invalid" : "extension_missing",
      calls,
    );
  }
  const extension = admitted.extension;
  const providerInputTokens = tokenOrNull(receipt.usage?.input?.total_tokens);
  const reconciled =
    extension.quality === "reconciled_estimate" &&
    providerInputTokens !== null &&
    extension.attributed_tokens <= providerInputTokens &&
    extension.residual_tokens === providerInputTokens - extension.attributed_tokens;
  if (extension.quality === "reconciled_estimate" && !reconciled) {
    return unavailable("model_call", "extension_invalid", calls);
  }
  const contextWindowTokens = extension.context_window_tokens;
  const percentageAvailable = reconciled && contextWindowTokens !== null;
  return {
    available: true,
    reason: null,
    scope: "model_call",
    calls,
    selectedCallKey: calls[selectedIndex].key,
    call: calls[selectedIndex],
    callCount: 1,
    agentCount: 1,
    providerTotalQuality: providerInputTokens === null ? "unavailable" : "reported",
    providerInputTokens,
    compositionQuality: extension.quality,
    coverage: extension.coverage,
    attributedTokens: extension.attributed_tokens,
    residualTokens: extension.residual_tokens,
    contextWindowTokens,
    /* percentageAvailable gates PER-CATEGORY shares: splitting a total across
       categories is only honest once attribution reconciles.
       Window pressure is a different question — how full the window is needs
       only the provider total and the window size, and stays true however
       little of it we managed to attribute. Tying the two together used to
       blank out the percentage on every partial turn, while the ring outside
       kept showing one from the same numbers. */
    percentageAvailable,
    windowPressure:
      providerInputTokens !== null && contextWindowTokens !== null
        ? providerInputTokens / contextWindowTokens
        : null,
    peakWindowPressure:
      providerInputTokens !== null && contextWindowTokens !== null
        ? providerInputTokens / contextWindowTokens
        : null,
    groups: groupCategories(
      extension.categories,
      percentageAvailable ? providerInputTokens : null,
    ),
  };
};

const runTreeView = (bundle) => {
  const receiptById = new Map(
    bundle.provider_calls.map((receipt) => [receipt.provider_call_id, receipt]),
  );
  const receipts = bundle.aggregation.all_call_ids.map((callId) => receiptById.get(callId));
  const calls = receiptsByStart(receipts.filter(Boolean)).map(callInfo);
  const admitted = receipts.map((receipt) =>
    receipt ? extensionForReceipt(receipt) : { status: "invalid", extension: null },
  );
  const validPairs = receipts
    .map((receipt, index) => {
      const item = admitted[index];
      if (receipt && item.status === "valid") {
        const extension = item.extension;
        const input = tokenOrNull(receipt.usage?.input?.total_tokens);
        if (
          extension.quality === "reconciled_estimate" &&
          (input === null ||
            extension.attributed_tokens > input ||
            extension.residual_tokens !== input - extension.attributed_tokens)
        ) {
          admitted[index] = { status: "invalid", extension: null };
        }
      }
      return { receipt, admitted: admitted[index] };
    })
    .filter((pair) => pair.receipt && pair.admitted.status === "valid");
  if (validPairs.length === 0) {
    return unavailable(
      "run_tree",
      admitted.some((item) => item.status === "invalid")
        ? "extension_invalid"
        : "extension_missing",
      calls,
    );
  }

  const categoryMap = new Map();
  let attributedTokens = 0;
  let deliveredInputTokens = 0;
  let allProviderTotals = true;
  let allReconciled = validPairs.length === receipts.length;
  let residualTokens = 0;
  let overflow = false;
  receipts.forEach((receipt) => {
    const input = receipt
      ? tokenOrNull(receipt.usage?.input?.total_tokens)
      : null;
    if (input === null) {
      allProviderTotals = false;
      return;
    }
    const nextDeliveredInputTokens = checkedSum(deliveredInputTokens, input);
    if (nextDeliveredInputTokens === null) {
      overflow = true;
      return;
    }
    deliveredInputTokens = nextDeliveredInputTokens;
  });
  validPairs.forEach(({ receipt, admitted: item }) => {
    const extension = item.extension;
    const nextAttributedTokens = checkedSum(
      attributedTokens,
      extension.attributed_tokens,
    );
    if (nextAttributedTokens === null) {
      overflow = true;
    } else {
      attributedTokens = nextAttributedTokens;
    }
    const input = tokenOrNull(receipt.usage?.input?.total_tokens);
    if (input === null) {
      allReconciled = false;
    }
    if (
      extension.quality !== "reconciled_estimate" ||
      input === null ||
      extension.attributed_tokens > input ||
      extension.residual_tokens !== input - extension.attributed_tokens
    ) {
      allReconciled = false;
    } else {
      const nextResidualTokens = checkedSum(
        residualTokens,
        extension.residual_tokens,
      );
      if (nextResidualTokens === null) {
        overflow = true;
      } else {
        residualTokens = nextResidualTokens;
      }
    }
    extension.categories.forEach((category) => {
      const current = categoryMap.get(category.id) || {
        id: category.id,
        tokens: 0,
        source_count: 0,
        subtypes: new Map(),
      };
      const nextCategoryTokens = checkedSum(current.tokens, category.tokens);
      const nextCategorySources = checkedSum(
        current.source_count,
        category.source_count,
      );
      if (nextCategoryTokens === null || nextCategorySources === null) {
        overflow = true;
      } else {
        current.tokens = nextCategoryTokens;
        current.source_count = nextCategorySources;
      }
      category.subtypes.forEach((subtype) => {
        const subtypeCurrent = current.subtypes.get(subtype.id) || {
          id: subtype.id,
          tokens: 0,
          source_count: 0,
        };
        const nextSubtypeTokens = checkedSum(
          subtypeCurrent.tokens,
          subtype.tokens,
        );
        const nextSubtypeSources = checkedSum(
          subtypeCurrent.source_count,
          subtype.source_count,
        );
        if (nextSubtypeTokens === null || nextSubtypeSources === null) {
          overflow = true;
        } else {
          subtypeCurrent.tokens = nextSubtypeTokens;
          subtypeCurrent.source_count = nextSubtypeSources;
        }
        current.subtypes.set(subtype.id, subtypeCurrent);
      });
      categoryMap.set(category.id, current);
    });
  });

  if (overflow) {
    return unavailable("run_tree", "extension_invalid", calls);
  }

  const categories = CATEGORY_ORDER.filter((id) => categoryMap.has(id)).map((id) => {
    const category = categoryMap.get(id);
    return {
      id,
      tokens: category.tokens,
      source_count: category.source_count,
      subtypes: CONTEXT_COMPOSITION_TAXONOMY[id]
        .filter((subtype) => category.subtypes.has(subtype))
        .map((subtype) => category.subtypes.get(subtype)),
    };
  });
  const incomplete =
    validPairs.length !== receipts.length ||
    validPairs.some(({ admitted: item }) => item.extension.coverage.status === "partial");
  const incompleteReason = admitted.some((item) => item.status === "invalid")
    ? "extension_invalid"
    : admitted.some((item) => item.status === "missing")
      ? "extension_missing"
      : null;
  const compositionQuality = incomplete
    ? "partial"
    : allReconciled
      ? "reconciled_estimate"
      : "estimated";
  return {
    available: true,
    reason: incomplete ? incompleteReason : null,
    scope: "run_tree",
    calls,
    selectedCallKey: null,
    call: null,
    callCount: receipts.length,
    agentCount: new Set(receipts.filter(Boolean).map((receipt) => receipt.identity.owner_run_id)).size,
    providerTotalQuality: allProviderTotals ? "reported" : "unavailable",
    providerInputTokens: allProviderTotals ? deliveredInputTokens : null,
    deliveredInputTokens: allProviderTotals ? deliveredInputTokens : null,
    compositionQuality,
    coverage: { status: incomplete ? "partial" : "complete" },
    attributedTokens,
    residualTokens: allReconciled ? residualTokens : null,
    contextWindowTokens: null,
    percentageAvailable: false,
    windowPressure: null,
    peakWindowPressure: null,
    groups: groupCategories(categories, null),
  };
};

export const hasContextCompositionEvidence = (bundle) =>
  Boolean(
    bundle &&
      bundle.schema === "unchain.run_bundle.v1" &&
      Array.isArray(bundle.provider_calls) &&
      bundle.provider_calls.some(
        (receipt) =>
          isObject(receipt) &&
          isObject(receipt.extensions) &&
          Object.prototype.hasOwnProperty.call(
            receipt.extensions,
            CONTEXT_COMPOSITION_EXTENSION_KEY,
          ),
      ),
  );

export const selectLatestContextCompositionBundle = (messages) => {
  if (!Array.isArray(messages)) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const bundle = messages[index]?.meta?.bundle;
    if (!isObject(bundle)) continue;

    // The newest completed bundle is authoritative for the composer. If it
    // predates Context Composition (or is malformed), do not fall back to an
    // older call and present stale pressure as the current chat state.
    return hasContextCompositionEvidence(bundle) ? bundle : null;
  }

  return null;
};

export const selectContextCompositionView = (
  bundle,
  { scope = "model_call", callKey = null } = {},
) => {
  if (!hasContextCompositionEvidence(bundle)) return null;
  if (!["model_call", "run_tree"].includes(scope)) {
    return unavailable("model_call", "extension_invalid");
  }
  let normalized;
  try {
    normalized = normalizeRendererRunBundleV1(bundle);
  } catch (_error) {
    return unavailable(scope, "extension_invalid");
  }
  return scope === "run_tree"
    ? runTreeView(normalized)
    : modelCallView(normalized, callKey);
};
