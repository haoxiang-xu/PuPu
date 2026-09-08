// Platform-independent core of the Windows installed-candidate Vault sink
// matrix (issue #195, implementation plan phase 2 step 6 / AC-012, SEQ-004).
//
// Everything here is a pure function so the cell semantics, the cycle
// schedule, the loopback provider frames, the secret scan and the evidence
// shape can be unit-tested on any platform. The Windows-only driver
// (windows-installed-sink-matrix.mjs) observes the installed app and feeds
// those observations to `evaluateCell`; the strict consumer
// (verify-windows-installed-sink-evidence.mjs) re-checks the produced
// evidence independently.

import crypto from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { secretVariants } = require(
  path.join(ROOT, "electron", "main", "services", "memory_vault", "secret_variants.js"),
);

export const EVIDENCE_SCHEMA = "pupu.windows-installed-sink-matrix.v1";
export const PLATFORM = "win32-x64";

export const SINK_KINDS = Object.freeze([
  "shell_secret_env",
  "shell_secret_stdin",
  "mcp_schema_secret",
]);

// Exact key set the driver must fill for every cell (null where a key does
// not apply). `evaluateCell` refuses any other shape so a driver that forgets
// to observe something cannot pass by omission.
export const OBSERVED_KEYS = Object.freeze([
  "streamStatus", // "done" | "failed" | "error" | "interrupted"
  "toolResult", // normalized vault_sink_use result or null
  "receipt", // { status, outcome_code } from vault_use_receipts, or null
  "intent", // { status, sink_kind } from vault_use_intents, or null
  "dialog", // { found, action } from windows-native-confirm.ps1
  "workerSpawned", // a --vault-sink-worker process was observed during the cell
  "survivors", // candidate-tree processes alive after the cell settled
  "sentinelPresent", // a delayed sentinel file appeared
  "providerCalls", // loopback provider requests during the cell
  "mcpReceiptCount", // fake MCP server receipt lines (mcp cells) or null
  "pendingRevived", // after relaunch, the killed interaction came back as pending
  "receiptRowsBefore", // vault_use_receipts row count before (cold-restart cell) or null
  "receiptRowsAfter",
]);

export const emptyObserved = () =>
  Object.fromEntries(OBSERVED_KEYS.map((key) => [key, null]));

const cell = (id, kind, fault, sentinel, expected) =>
  Object.freeze({ id, kind, fault, sentinel, expected: Object.freeze(expected) });

// `expected` vocabulary (consumed only by evaluateCell):
//   stream: allowed streamStatus values
//   tool: "success" | "denied" | "not_success" | "absent"
//   exit: required exit_category for a shell success/nonzero/timeout, or null
//   returncode: required returncode, null, or "any"
//   receipt: allowed receipt statuses; a `null` entry allows a missing receipt
//   intent: allowed intent statuses or "any"
//   dialog: "Allow" | "Cancel" | "none"
//   worker: true | false | "any"
//   providerCalls: "two" | "min1"
//   mcpReceipt: 1 | "max1" | null (null = must be null, i.e. not an MCP cell)
//   pendingRevived: false | null
//   receiptRows: "increment" | null
export const CELL_CATALOG = Object.freeze([
  cell("env.success", "shell_secret_env", "none", false, {
    stream: ["done"], tool: "success", exit: "success", returncode: 0,
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("stdin.success", "shell_secret_stdin", "none", false, {
    stream: ["done"], tool: "success", exit: "success", returncode: 0,
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("mcp.success", "mcp_schema_secret", "none", false, {
    stream: ["done"], tool: "success", exit: null, returncode: "any",
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: 1, pendingRevived: null, receiptRows: null,
  }),
  cell("env.nonzero", "shell_secret_env", "nonzero_exit", false, {
    stream: ["done"], tool: "success", exit: "nonzero", returncode: 7,
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("stdin.timeout", "shell_secret_stdin", "timeout", true, {
    stream: ["done"], tool: "success", exit: "timeout", returncode: "any",
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("env.native_cancel", "shell_secret_env", "native_cancel", false, {
    stream: ["done"], tool: "denied", exit: null, returncode: "any",
    receipt: ["denied", null], intent: ["denied"], dialog: "Cancel", worker: false,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("env.renderer_deny", "shell_secret_env", "renderer_deny", false, {
    stream: ["done"], tool: "denied", exit: null, returncode: "any",
    receipt: ["denied", null], intent: ["denied"], dialog: "none", worker: false,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("stdin.kill_worker", "shell_secret_stdin", "kill_worker", true, {
    stream: ["done", "failed"], tool: "not_success", exit: null, returncode: "any",
    receipt: ["completed", "indeterminate"], intent: "any", dialog: "Allow", worker: true,
    providerCalls: "min1", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("env.kill_supervisor", "shell_secret_env", "kill_supervisor", true, {
    stream: ["done", "failed"], tool: "not_success", exit: null, returncode: "any",
    receipt: ["completed", "indeterminate"], intent: "any", dialog: "Allow", worker: true,
    providerCalls: "min1", mcpReceipt: null, pendingRevived: null, receiptRows: null,
  }),
  cell("mcp.kill_parent", "mcp_schema_secret", "kill_parent", false, {
    stream: ["interrupted"], tool: "absent", exit: null, returncode: "any",
    receipt: ["indeterminate"], intent: ["indeterminate"], dialog: "Allow", worker: true,
    providerCalls: "min1", mcpReceipt: "max1", pendingRevived: false, receiptRows: null,
  }),
  cell("env.cold_restart_then_success", "shell_secret_env", "none", false, {
    stream: ["done"], tool: "success", exit: "success", returncode: 0,
    receipt: ["completed"], intent: ["completed"], dialog: "Allow", worker: true,
    providerCalls: "two", mcpReceipt: null, pendingRevived: null, receiptRows: "increment",
  }),
]);

// Cells eligible for the 100-cycle mix: everything that leaves the same app
// process alive. Parent kill and cold restart are run once each, outside the
// loop, because they change the process identity the handle samples track.
export const CYCLE_POOL = Object.freeze([
  "env.success",
  "stdin.success",
  "mcp.success",
  "env.nonzero",
  "stdin.timeout",
  "env.native_cancel",
  "stdin.kill_worker",
  "env.kill_supervisor",
]);

export const MIN_PER_POOL_CELL = 6;
export const MIN_SUCCESS_CELLS = 40;

const catalogById = new Map(CELL_CATALOG.map((entry) => [entry.id, entry]));

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const buildCycleSchedule = ({ cycles = 100, seed = 195 } = {}) => {
  const count = Number(cycles);
  const minimum = CYCLE_POOL.length * MIN_PER_POOL_CELL;
  if (!Number.isInteger(count) || count < minimum) {
    throw new Error(`cycle schedule needs at least ${minimum} cycles`);
  }
  if (!Number.isInteger(Number(seed))) {
    throw new Error("cycle schedule seed must be an integer");
  }
  const random = mulberry32(Number(seed));
  const successIds = CYCLE_POOL.filter((id) => catalogById.get(id).fault === "none");
  const faultIds = CYCLE_POOL.filter((id) => catalogById.get(id).fault !== "none");
  const schedule = [];
  for (const id of CYCLE_POOL) {
    for (let index = 0; index < MIN_PER_POOL_CELL; index += 1) schedule.push(id);
  }
  while (schedule.length < count) {
    const pool = random() < 0.6 ? successIds : faultIds;
    schedule.push(pool[Math.floor(random() * pool.length)]);
  }
  // Deterministically top up successes so the mix always satisfies the
  // documented floor, then shuffle so faults are interleaved.
  let successes = schedule.filter((id) => catalogById.get(id).fault === "none").length;
  let cursor = schedule.length - 1;
  let roundRobin = 0;
  while (successes < Math.min(MIN_SUCCESS_CELLS, count) && cursor >= 0) {
    if (catalogById.get(schedule[cursor]).fault !== "none") {
      const counts = new Map(schedule.map((id) => [id, 0]));
      for (const id of schedule) counts.set(id, counts.get(id) + 1);
      if (counts.get(schedule[cursor]) > MIN_PER_POOL_CELL) {
        schedule[cursor] = successIds[roundRobin % successIds.length];
        roundRobin += 1;
        successes += 1;
      }
    }
    cursor -= 1;
  }
  for (let index = schedule.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [schedule[index], schedule[swap]] = [schedule[swap], schedule[index]];
  }
  return schedule;
};

// ---- Responses API loopback frames -----------------------------------------
// Shapes mirror scripts/test-api/fixtures/fake_openai_responses_server.js so
// the packaged app's OpenAI-compatible client sees exactly what the soak
// fixture produces; only the tool call payload is under harness control.

const usage = Object.freeze({
  input_tokens: 1,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 2,
});

const baseResponse = ({ id, model, output, status }) => ({
  id,
  object: "response",
  created_at: 0,
  status,
  background: false,
  error: null,
  incomplete_details: null,
  instructions: null,
  max_output_tokens: null,
  max_tool_calls: null,
  model,
  output,
  parallel_tool_calls: true,
  previous_response_id: null,
  prompt_cache_key: null,
  reasoning: { effort: null, summary: null },
  safety_identifier: null,
  service_tier: "default",
  store: true,
  temperature: null,
  text: { format: { type: "text" }, verbosity: "medium" },
  tool_choice: "auto",
  tools: [],
  top_logprobs: 0,
  top_p: null,
  truncation: "disabled",
  usage: status === "completed" ? usage : null,
});

const serializeSse = (events) =>
  `${events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("")}data: [DONE]\n\n`;

export const buildToolCallSse = ({
  responseId,
  model,
  callId,
  name,
  argumentsObject,
}) => {
  if (!responseId || !model || !callId || !name || typeof argumentsObject !== "object") {
    throw new Error("buildToolCallSse: responseId, model, callId, name, argumentsObject are required");
  }
  const argumentText = JSON.stringify(argumentsObject);
  const itemId = `fc_${callId}`;
  const inProgressItem = {
    id: itemId,
    type: "function_call",
    status: "in_progress",
    arguments: "",
    call_id: callId,
    name,
  };
  const completedItem = { ...inProgressItem, status: "completed", arguments: argumentText };
  const pending = baseResponse({ id: responseId, model, output: [], status: "in_progress" });
  const completed = baseResponse({ id: responseId, model, output: [completedItem], status: "completed" });
  return serializeSse([
    { type: "response.created", sequence_number: 0, response: pending },
    { type: "response.in_progress", sequence_number: 1, response: pending },
    { type: "response.output_item.added", sequence_number: 2, output_index: 0, item: inProgressItem },
    {
      type: "response.function_call_arguments.delta",
      sequence_number: 3,
      item_id: itemId,
      output_index: 0,
      delta: argumentText,
    },
    {
      type: "response.function_call_arguments.done",
      sequence_number: 4,
      item_id: itemId,
      output_index: 0,
      name,
      arguments: argumentText,
    },
    { type: "response.output_item.done", sequence_number: 5, output_index: 0, item: completedItem },
    { type: "response.completed", sequence_number: 6, response: completed },
  ]);
};

export const buildTextSse = ({ responseId, model, text }) => {
  if (!responseId || !model || typeof text !== "string") {
    throw new Error("buildTextSse: responseId, model, text are required");
  }
  const itemId = `msg_${responseId}`;
  const completedPart = { type: "output_text", annotations: [], logprobs: [], text };
  const inProgressItem = { id: itemId, type: "message", status: "in_progress", role: "assistant", content: [] };
  const completedItem = { ...inProgressItem, status: "completed", content: [completedPart] };
  const pending = baseResponse({ id: responseId, model, output: [], status: "in_progress" });
  const completed = baseResponse({ id: responseId, model, output: [completedItem], status: "completed" });
  return serializeSse([
    { type: "response.created", sequence_number: 0, response: pending },
    { type: "response.in_progress", sequence_number: 1, response: pending },
    { type: "response.output_item.added", sequence_number: 2, output_index: 0, item: inProgressItem },
    {
      type: "response.content_part.added",
      sequence_number: 3,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", annotations: [], logprobs: [], text: "" },
    },
    {
      type: "response.output_text.delta",
      sequence_number: 4,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      delta: text,
      logprobs: [],
    },
    {
      type: "response.output_text.done",
      sequence_number: 5,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      text,
      logprobs: [],
    },
    {
      type: "response.content_part.done",
      sequence_number: 6,
      item_id: itemId,
      output_index: 0,
      content_index: 0,
      part: completedPart,
    },
    { type: "response.output_item.done", sequence_number: 7, output_index: 0, item: completedItem },
    { type: "response.completed", sequence_number: 8, response: completed },
  ]);
};

// ---- Secret scan -------------------------------------------------------------

export const secretVariantsFor = (plaintexts = []) => secretVariants(plaintexts, []);

const digestPrefix = (value) =>
  crypto.createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);

// `texts` is a label → text map. Hits carry only a digest prefix of the
// matched variant, never the variant or the plaintext.
export const scanForSecrets = ({ texts, variants }) => {
  if (!texts || typeof texts !== "object" || !Array.isArray(variants)) {
    throw new Error("scanForSecrets: texts map and variants array are required");
  }
  const hits = [];
  let scanned = 0;
  for (const [label, raw] of Object.entries(texts)) {
    scanned += 1;
    const text = typeof raw === "string" ? raw : String(raw ?? "");
    const folded = text.toLowerCase();
    for (const variant of variants) {
      if (typeof variant !== "string" || variant.length === 0) continue;
      const matched =
        text.includes(variant) ||
        (variant.toLowerCase().length === variant.length &&
          folded.length === text.length &&
          folded.includes(variant.toLowerCase()));
      if (matched) {
        hits.push({ label, variant_sha256_prefix: digestPrefix(variant) });
        break;
      }
    }
  }
  return { scanned, hits };
};

// ---- Cell evaluation -----------------------------------------------------------

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export const evaluateCell = ({ cell: entry, observed }) => {
  if (!entry || !catalogById.has(entry.id)) {
    throw new Error("evaluateCell: unknown cell");
  }
  if (!isObject(observed)) throw new Error("evaluateCell: observed keys must be an object");
  const keys = Object.keys(observed).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...OBSERVED_KEYS].sort())) {
    throw new Error("evaluateCell: observed keys must exactly match OBSERVED_KEYS");
  }
  const expected = entry.expected;
  const reasons = [];
  const fail = (reason) => reasons.push(reason);

  if (!expected.stream.includes(observed.streamStatus)) {
    fail(`streamStatus ${observed.streamStatus} not in ${expected.stream.join("/")}`);
  }

  const tool = observed.toolResult;
  switch (expected.tool) {
    case "success":
      if (!isObject(tool) || tool.ok !== true || tool.denied === true) {
        fail("tool result is not a clean success");
      } else {
        if (expected.exit !== null && tool.exit_category !== expected.exit) {
          fail(`exit_category ${tool.exit_category} != ${expected.exit}`);
        }
        if (expected.returncode !== "any" && tool.returncode !== expected.returncode) {
          fail(`returncode ${tool.returncode} != ${expected.returncode}`);
        }
        if (typeof tool.receipt_id !== "string" || !tool.receipt_id) {
          fail("success without receipt_id");
        }
      }
      break;
    case "denied":
      if (!isObject(tool) || tool.denied !== true || tool.ok === true) {
        fail("tool result is not a denial");
      }
      break;
    case "not_success":
      if (isObject(tool) && tool.ok === true && tool.exit_category === "success") {
        fail("a faulted execution reported a clean success");
      }
      break;
    case "absent":
      if (tool !== null) fail("tool result must be absent");
      break;
    default:
      throw new Error(`evaluateCell: unknown tool expectation ${expected.tool}`);
  }

  const allowedReceipts = expected.receipt.filter((value) => value !== null);
  const receiptMayBeMissing = expected.receipt.includes(null);
  if (observed.receipt === null) {
    if (!receiptMayBeMissing) fail("receipt row missing");
  } else if (!isObject(observed.receipt) || !allowedReceipts.includes(observed.receipt.status)) {
    fail(`receipt status ${observed.receipt?.status} not in ${allowedReceipts.join("/")}`);
  }

  if (!isObject(observed.intent)) {
    fail("intent row missing");
  } else {
    if (observed.intent.sink_kind !== entry.kind) {
      fail(`intent sink_kind ${observed.intent.sink_kind} != ${entry.kind}`);
    }
    if (expected.intent !== "any" && !expected.intent.includes(observed.intent.status)) {
      fail(`intent status ${observed.intent.status} not in ${expected.intent.join("/")}`);
    }
  }

  const dialog = observed.dialog;
  if (expected.dialog === "none") {
    if (!isObject(dialog) || dialog.found !== false) fail("a native dialog appeared where none may");
  } else if (!isObject(dialog) || dialog.found !== true || dialog.action !== expected.dialog) {
    fail(`native dialog not driven with ${expected.dialog}`);
  }

  if (expected.worker !== "any" && observed.workerSpawned !== expected.worker) {
    fail(`workerSpawned ${observed.workerSpawned} != ${expected.worker}`);
  }

  if (observed.survivors !== 0) fail(`survivors ${observed.survivors}`);
  if (observed.sentinelPresent !== false) fail("delayed sentinel appeared");

  if (expected.providerCalls === "two" && observed.providerCalls !== 2) {
    fail(`providerCalls ${observed.providerCalls} != 2`);
  }
  if (expected.providerCalls === "min1" && !(observed.providerCalls >= 1)) {
    fail("providerCalls < 1");
  }

  if (expected.mcpReceipt === null) {
    if (observed.mcpReceiptCount !== null) fail("mcpReceiptCount must be null for a shell cell");
  } else if (expected.mcpReceipt === "max1") {
    if (!(Number.isInteger(observed.mcpReceiptCount) && observed.mcpReceiptCount <= 1)) {
      fail("MCP receipt written more than once");
    }
  } else if (observed.mcpReceiptCount !== expected.mcpReceipt) {
    fail(`mcpReceiptCount ${observed.mcpReceiptCount} != ${expected.mcpReceipt}`);
  }

  if (expected.pendingRevived === false && observed.pendingRevived !== false) {
    fail("killed interaction was revived as pending");
  }
  if (expected.pendingRevived === null && observed.pendingRevived !== null) {
    fail("pendingRevived observed on a cell that does not restart");
  }

  if (expected.receiptRows === "increment") {
    if (
      !Number.isInteger(observed.receiptRowsBefore) ||
      observed.receiptRowsAfter !== observed.receiptRowsBefore + 1
    ) {
      fail("receipt rows did not grow by exactly one across the cold restart");
    }
  } else if (observed.receiptRowsBefore !== null || observed.receiptRowsAfter !== null) {
    fail("receipt row counts observed on a cell without a restart");
  }

  return { pass: reasons.length === 0, reasons };
};

// ---- Handle growth -------------------------------------------------------------

export const evaluateHandleGrowth = ({ samples, maxGrowth = 300 }) => {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error("evaluateHandleGrowth: at least two samples are required");
  }
  const first = samples[0];
  const last = samples.at(-1);
  const growth = {
    app_handles: last.app_handles - first.app_handles,
    sidecar_handles: last.sidecar_handles - first.sidecar_handles,
  };
  const pass =
    Number.isFinite(growth.app_handles) &&
    Number.isFinite(growth.sidecar_handles) &&
    growth.app_handles <= maxGrowth &&
    growth.sidecar_handles <= maxGrowth;
  return {
    pass,
    first: { app_handles: first.app_handles, sidecar_handles: first.sidecar_handles },
    last: { app_handles: last.app_handles, sidecar_handles: last.sidecar_handles },
    growth,
    samples: samples.length,
    max_growth: maxGrowth,
  };
};

// ---- Evidence assembly -----------------------------------------------------------

const IDENTITY_KEYS = Object.freeze([
  "pupu_revision",
  "unchain_revision",
  "installer_sha256",
  "installed_app_sha256",
  "installed_asar_sha256",
  "installed_sidecar_sha256",
  "wheel_sha256",
  "runtime_manifest_digest",
]);
export const EVIDENCE_IDENTITY_KEYS = IDENTITY_KEYS;

const ENVIRONMENT_KEYS = Object.freeze([
  "os_version",
  "node_version",
  "install_root",
  "profile_path",
]);
export const EVIDENCE_ENVIRONMENT_KEYS = ENVIRONMENT_KEYS;

const requireExactKeys = (value, keys, label) => {
  if (!isObject(value)) throw new Error(`buildEvidence: ${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`buildEvidence: ${label} keys must be exactly ${wanted.join(",")}`);
  }
};

export const CELL_STATUSES = Object.freeze(["PASS", "FAIL", "NOT_RUN", "N/A"]);

export const buildEvidence = ({
  identity,
  environment,
  cells,
  cycles,
  protocol,
  handleGrowth,
  secretScan,
  generatedAt = new Date().toISOString(),
}) => {
  requireExactKeys(identity, IDENTITY_KEYS, "identity");
  requireExactKeys(environment, ENVIRONMENT_KEYS, "environment");
  if (!Array.isArray(cells) || cells.length !== CELL_CATALOG.length) {
    throw new Error("buildEvidence: one cell record per catalog entry is required");
  }
  const cellIds = cells.map((entry) => entry.id);
  if (JSON.stringify(cellIds) !== JSON.stringify(CELL_CATALOG.map((entry) => entry.id))) {
    throw new Error("buildEvidence: cell ids must match the catalog order");
  }
  const normalizedCells = cells.map((entry) => {
    if (!CELL_STATUSES.includes(entry.status)) {
      throw new Error(`buildEvidence: cell ${entry.id} has status ${entry.status}`);
    }
    requireExactKeys(entry.observed, OBSERVED_KEYS, `cell ${entry.id} observed`);
    return {
      id: entry.id,
      kind: catalogById.get(entry.id).kind,
      status: entry.status,
      reasons: Array.isArray(entry.reasons) ? [...entry.reasons] : [],
      observed: { ...entry.observed },
    };
  });
  requireExactKeys(
    cycles,
    ["count", "seed", "schedule", "failures", "survivors_total", "sentinels_total"],
    "cycles",
  );
  if (!Array.isArray(cycles.schedule) || cycles.schedule.length !== cycles.count) {
    throw new Error("buildEvidence: cycles.schedule length must equal cycles.count");
  }
  const perCellCounts = Object.fromEntries(CYCLE_POOL.map((id) => [id, 0]));
  for (const id of cycles.schedule) {
    if (!(id in perCellCounts)) throw new Error(`buildEvidence: schedule id ${id} is not in the pool`);
    perCellCounts[id] += 1;
  }
  requireExactKeys(protocol, ["oversize", "bad_frame", "evidence_path"], "protocol");
  requireExactKeys(
    handleGrowth,
    ["pass", "first", "last", "growth", "samples", "max_growth"],
    "handleGrowth",
  );
  requireExactKeys(secretScan, ["scanned", "hits"], "secretScan");
  return {
    schema: EVIDENCE_SCHEMA,
    generated_at: generatedAt,
    platform: PLATFORM,
    identity: { ...identity },
    environment: { ...environment },
    cells: normalizedCells,
    cycles: {
      count: cycles.count,
      seed: cycles.seed,
      schedule_sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(cycles.schedule), "utf8")
        .digest("hex"),
      per_cell_counts: perCellCounts,
      failures: [...cycles.failures],
      survivors_total: cycles.survivors_total,
      sentinels_total: cycles.sentinels_total,
    },
    protocol: { ...protocol },
    handle_growth: { ...handleGrowth },
    secret_scan: { scanned: secretScan.scanned, hits: [...secretScan.hits] },
    executed_tests: normalizedCells.length + cycles.count + 2,
  };
};
