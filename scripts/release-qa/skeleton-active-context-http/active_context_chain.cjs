#!/usr/bin/env node
"use strict";

// External integration driver. Default mode is entirely offline. The product
// preload/Main modules stay real; only process launch, IPC, and vault are test
// seams. No HOME replacement, real vault, provider SDK, or application startup.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { execFileSync } = require("node:child_process");
const TEST_SCHEMA = require("./test-schema.json");
const SENTINEL_CREDENTIAL = TEST_SCHEMA.constants.sentinel_credential;

const SCHEMA = "pupu.external.active_context_chain.v1";
const OBSERVATION_SCHEMA = "qa.active-context-http-observation.v1";
const GUARD_SCHEMA = "pupu.external.active_context_guard.v1";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SOURCE_FILES = TEST_SCHEMA.source_files;
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const jsonDigest = (value) => digest(JSON.stringify(stable(value)));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const copy = (value) => JSON.parse(JSON.stringify(value));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const required = (value, name) => {
  assert.equal(typeof value, "string", `${name} is required`);
  assert.ok(value.length && value === value.trim(), `${name} must be explicit`);
  return value;
};
const exactId = (value, name) => {
  assert.match(required(value, name), IDENTIFIER, `${name} must be an exact HTTP identifier`);
  return value;
};

function argsFrom(argv) {
  const args = { mode: "preflight" };
  const allowed = new Set(["clone", "port", "token-file", "agent-id", "out", "chat-id", "run-id", "timeout-ms", "payload-capture", "server-guard", "server-observation", "transport", "main-registry", "memory-agent-config", "installed-site"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--preflight", "--run", "--verify"].includes(arg)) { args.mode = arg.slice(2); continue; }
    if (arg === "--allow-loopback-http") { args.allowLoopback = true; continue; }
    assert.ok(arg.startsWith("--") && allowed.has(arg.slice(2)), `Unknown argument: ${arg}`);
    assert.ok(i + 1 < argv.length && !argv[i + 1].startsWith("--"), `Missing value for ${arg}`);
    args[arg.slice(2)] = argv[++i];
  }
  args.clone = fs.realpathSync(required(args.clone, "--clone"));
  args.out = path.resolve(required(args.out, "--out"));
  assert.ok(args.out !== args.clone && !args.out.startsWith(args.clone + path.sep), "--out must be outside the product clone");
  args.agentId = exactId(args["agent-id"], "--agent-id");
  args.chatId = exactId(args["chat-id"] || `chat-${Date.now()}-active-context-http`, "--chat-id");
  args.runId = exactId(args["run-id"] || `active-context-${Date.now()}`, "--run-id");
  args.timeoutMs = Number(args["timeout-ms"] || 45000);
  assert.ok(Number.isSafeInteger(args.timeoutMs) && args.timeoutMs >= 1000 && args.timeoutMs <= 120000, "--timeout-ms must be 1000..120000");
  if (args.mode === "run") {
    assert.equal(args.allowLoopback, true, "--run also requires --allow-loopback-http");
    args.port = Number(required(args.port, "--port"));
    assert.ok(Number.isSafeInteger(args.port) && args.port >= 5879 && args.port <= 5895, "PORT must be in Main's real 5879..5895 range");
    required(args["token-file"], "--token-file");
    required(args["server-guard"], "--server-guard");
  }
  if (args.mode === "verify") {
    required(args.transport, "--transport");
    required(args["server-observation"], "--server-observation");
  }
  if (["run", "verify"].includes(args.mode)) args.installedSite = fs.realpathSync(required(args["installed-site"], "--installed-site"));
  fs.mkdirSync(args.out, { recursive: true });
  return args;
}

function sourceSnapshot(clone) {
  return {
    clone, node: process.version, platform: process.platform,
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: clone, encoding: "utf8" }).trim(),
    status: execFileSync("git", ["--no-optional-locks", "status", "--porcelain=v1"], { cwd: clone, encoding: "utf8" }).trim(),
    sha256: Object.fromEntries(SOURCE_FILES.map((name) => [name, digest(fs.readFileSync(path.join(clone, name)))])),
  };
}

function dependencies(clone) {
  return {
    ...require(path.join(clone, "electron/shared/channels.js")),
    ...require(path.join(clone, "electron/preload/stream/unchain_stream_client.js")),
    ...require(path.join(clone, "electron/main/services/unchain/skeleton_credentials.js")),
  };
}

function payloadTemplate(args) {
  let payload;
  let provenance;
  if (args["payload-capture"]) {
    const file = path.resolve(args["payload-capture"]);
    const captured = readJson(file);
    // Accept either one exact page payload or the explicitly identified raw
    // baseline observer's first page bridge payload, never an inferred shape.
    payload = copy(captured?.beforeResend?.bridge?.[0] || captured);
    assert.equal(typeof payload.message, "string", "Capture must contain a page request");
    provenance = { file, sha256: digest(fs.readFileSync(file)), captured_path: captured?.beforeResend?.bridge?.[0] ? "beforeResend.bridge[0]" : "$" };
  } else {
    payload = {
      threadId: args.chatId, owner_chat_id: args.chatId, memory_v2_requested: true,
      memory_agent_config: { displayName: "Memory Agent", additionalInstructions: "", provider: "", modelId: "" },
      context_v2_history: [], message: "", history: [], attachments: [],
      options: { modelId: "", toolkits: [], skills: { include_user_dirs: false }, agent_orchestration: { mode: "default" } },
      trace_level: "minimal",
    };
    provenance = { capture: null, origin: "Hand-built fixture from current use_chat_stream.js public send contract; not a real Chat capture" };
  }
  // Deliberate integration fixture mappings, not a claim that a new real page
  // emitted these values. Preserve the public shape while isolating capabilities.
  payload.threadId = args.chatId;
  delete payload.thread_id;
  payload.owner_chat_id = args.chatId;
  payload.memory_v2_requested = true;
  payload.memory_agent_config = { displayName: "Memory Agent", additionalInstructions: "", provider: "", modelId: "" };
  payload.history = [];
  payload.attachments = [];
  payload.context_v2_history = [];
  payload.options = { ...(payload.options || {}), modelId: "", memory_enabled: true,
    toolkits: [], skills: { include_user_dirs: false }, disable_workspace_root: true,
    skeleton_selection: { schema: "pupu.skeleton_chat_selection.v1", kind: "resource", resource_id: args.agentId } };
  delete payload.options.recipe_name;
  delete payload.options.skeleton_credentials;
  delete payload.options.skeleton_credential_scope;
  delete payload.options.workspaceRoot;
  delete payload.options.workspace_root;
  delete payload.options.workspace_roots;
  delete payload.mode;
  delete payload.interaction_id;
  delete payload.source_attempt_id;
  delete payload.continued_from_run_id;
  if (args["memory-agent-config"]) {
    const file = path.resolve(args["memory-agent-config"]);
    payload.memory_agent_config = validateMemoryConfig(readJson(file));
    provenance.memory_agent_config = { file, sha256: digest(fs.readFileSync(file)) };
  }
  return { payload, provenance, mappings: ["explicit chat/owner/resource IDs", "empty composer model; Kernel owns models", "memory_v2_requested=true; memory_enabled=true", "runtime MemoryAgent config must be explicit from host guard or supplied config file", "no attachments, workspace, user skills, or selected user toolkits", "fresh normal sends only; no mutation/resume", "both history/context_v2_history stay empty: server Journal alone must supply prior turn to second SDK wire"] };
}

function validateMemoryConfig(config) {
  closed(config, TEST_SCHEMA.closed_fields.memory_agent_config, "MemoryAgent config");
  const fields = TEST_SCHEMA.closed_fields.memory_agent_config;
  assert.ok(fields.every((key) => typeof config[key] === "string"));
  assert.ok(["openai", "anthropic", "gemini", "ollama"].includes(config.provider), "Choose an explicit official provider from the host's real profile seed");
  exactId(config.modelId, "MemoryAgent modelId");
  return copy(config);
}

function turnPayload(base, args, ordinal) {
  const body = copy(base);
  body.attempt_id = `${args.runId}-turn-${ordinal}`;
  exactId(body.attempt_id, "attempt_id");
  body.message = ordinal === 1 ? "Independent active HTTP first message" : "Independent active HTTP second message";
  body.history = [];
  body.context_v2_history = [];
  return body;
}

function writeNew(out, name, value) {
  const file = path.join(out, name);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  return file;
}

function checkClientOffline(args, deps, base) {
  const sends = [];
  const bus = new EventEmitter();
  const client = deps.createMisoStreamClient({
    send: (channel, envelope) => sends.push({ channel, envelope }),
    on: bus.on.bind(bus), removeListener: bus.removeListener.bind(bus), invoke: async () => { throw new Error("offline invoke forbidden"); },
  });
  const first = turnPayload(base, args, 1);
  const second = turnPayload(base, args, 2);
  for (const body of [first, second]) {
    const handle = client.startStreamV4(body, {});
    const sent = sends.at(-1);
    assert.equal(sent.channel, deps.CHANNELS.UNCHAIN.STREAM_START_V4);
    assert.deepEqual(sent.envelope.payload, body);
    assert.equal(handle.executionId, args.chatId);
    assert.equal(handle.attemptId, body.attempt_id);
    const query = deps.buildSkeletonCredentialQuery(body);
    assert.equal(query.session_id, args.chatId);
    assert.equal(query.owner_chat_id, args.chatId);
    assert.equal(query.selection.resource_id, args.agentId);
    assert.equal(query.mode, "start");
    assert.equal(query.interaction_id, "");
    assert.equal(query.source_attempt_id, "");
    assert.deepEqual(body.history, []);
    assert.deepEqual(body.context_v2_history, []);
    bus.emit(deps.CHANNELS.UNCHAIN.STREAM_EVENT, {}, { requestId: handle.requestId, event: "done", data: { execution_id: args.chatId, attempt_id: body.attempt_id, cancelled: false } });
  }
  assert.equal(client.__debug.getActiveListenerCount(), 0);
  return { checks: 2, networking: "NOT_RUN", first, second, assertion_scope: "Real preload serialization + real Main query helper only; synthetic done used solely to clean offline listeners" };
}

function pinnedNet(port) {
  return { createServer() {
    const listeners = new Map(); let chosen;
    return { unref() {}, once: (event, fn) => listeners.set(event, fn),
      listen(candidate) { chosen = candidate; setImmediate(() => listeners.get(candidate === port ? "listening" : "error")?.(new Error("test port pin"))); },
      address: () => ({ port: chosen }), close: (fn) => fn?.() };
  } };
}

function fakeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter();
  proc.pid = 4321; proc.kill = () => { proc.killed = true; };
  return proc;
}

function redact(value, token) {
  if (Array.isArray(value)) return value.map((row) => redact(row, token));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, row]) => [key,
    /api.?key|authorization|auth.?token|secret|token_file/i.test(key) ? "<withheld>" : redact(row, token)]));
  if (typeof value === "string") return value.replaceAll(token, "<withheld>").replaceAll(SENTINEL_CREDENTIAL, "<sentinel withheld>");
  return value;
}

function closed(value, fields, name) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), `${name} must be an object`);
  assert.deepEqual(Reflect.ownKeys(value).sort(), fields.slice().sort(), `${name} CLOSED field set mismatch`);
}

function validateIdentity(identity, source, installedSite) {
  closed(identity, TEST_SCHEMA.closed_fields.identity, "observer identity");
  assert.equal(identity.host_head, source.head, "Wrong host commit");
  closed(identity.host_source_hashes, SOURCE_FILES, "host source hashes");
  assert.deepEqual(identity.host_source_hashes, source.sha256, "Wrong host source hashes");
  assert.equal(identity.HOME_environment_changed, false);
  assert.equal(identity.wheel_sha256, TEST_SCHEMA.constants.wheel_sha256, "Wrong fixed wheel");
  assert.deepEqual(identity.runtime_manifest, TEST_SCHEMA.expected_runtime_manifest, "Wrong fixed runtime manifest");
  assert.ok(typeof installedSite === "string" && path.isAbsolute(installedSite), "Explicit installed-site is required");
  const under = (value, root) => value === root || value.startsWith(root + path.sep);
  for (const [field, requiredNames, root] of [
    ["loaded_unchain_origins", TEST_SCHEMA.required_unchain_origins, installedSite],
    ["loaded_host_origins", TEST_SCHEMA.required_host_origins, path.join(source.clone, "unchain_runtime/server")],
  ]) {
    const origins = identity[field];
    assert.ok(origins && typeof origins === "object" && !Array.isArray(origins) && Object.keys(origins).length > 0, `${field} must not be empty`);
    assert.ok(requiredNames.every((name) => Object.hasOwn(origins, name)), `${field} is missing required module origin`);
    for (const [name, value] of Object.entries(origins)) {
      assert.equal(typeof value, "string", `Invalid origin for ${name}`);
      assert.ok(path.isAbsolute(value), `Origin must be absolute for ${name}`);
      assert.ok(under(fs.realpathSync(value), fs.realpathSync(root)), `Offsite module origin for ${name}`);
      if (field === "loaded_unchain_origins") assert.ok(name === "unchain" || name.startsWith("unchain."), "Unrelated module cannot stand in for Unchain origin");
    }
  }
  assert.equal(identity.app_factory, "app.create_app");
  assert.ok(Array.isArray(identity.SDK_behavior_substitutions) && identity.SDK_behavior_substitutions.includes("openai.OpenAI"), "Native offline SDK substitution must be recorded");
  for (const field of ["data_root", "resource_root"]) assert.ok(typeof identity[field] === "string" && path.isAbsolute(identity[field]), `Missing absolute ${field}`);
}

function verifyObservation(transport, observation, { installedSite } = {}) {
  assert.equal(transport.schema, SCHEMA);
  assert.equal(transport.transport_passed, true);
  assert.equal(transport.failure, null, "An active-context or other transport error cannot become PASS");
  assert.equal(transport.turns.length, 2);
  closed(observation, TEST_SCHEMA.closed_fields.observation, "server observation");
  assert.equal(observation.schema, OBSERVATION_SCHEMA);
  assert.equal(observation.phase, "server-observation");
  validateIdentity(observation.identity, transport.source_after, installedSite);
  assert.ok(Array.isArray(observation.turns)); assert.equal(observation.turns.length, 2);
  let providerCount = 0; let externalCount = 0; let memoryCount = 0;
  const usedDiscovery = new Set();
  for (let index = 0; index < transport.turns.length; index += 1) {
    const issued = transport.turns[index];
    const observed = observation.turns[index];
    closed(observed, TEST_SCHEMA.closed_fields.turn, "server turn");
    assert.equal(observed.attempt_id, issued.attempt_id);
    assert.equal(observed.session_id, transport.chat_id);
    assert.equal(observed.owner_chat_id, transport.chat_id);
    closed(observed.launch, TEST_SCHEMA.closed_fields.launch, "durable launch observation");
    assert.equal(observed.launch.root_run_id, issued.attempt_id);
    assert.equal(observed.launch.status, "completed");
    assert.equal(observed.launch.root_committed, true, "Durable graph End has not committed root result");
    assert.equal(observed.launch.end_message, issued.final_text);
    assert.ok(Array.isArray(observed.launch.root_final_receipts)); assert.equal(observed.launch.root_final_receipts.length, 1);
    assert.ok(Array.isArray(observed.launch.root_terminal_receipts)); assert.equal(observed.launch.root_terminal_receipts.length, 1);
    assert.ok(Array.isArray(observed.launch.completed_node_ids) && observed.launch.completed_node_ids.includes(observed.launch.end_node_id));
    for (const field of ["descriptor_sha256", "end_output_sha256"]) assert.match(observed.launch[field], /^[a-f0-9]{64}$/, `Invalid measured ${field}`);
    assert.ok(Array.isArray(observed.sdk_calls), "Host must report actual provider calls; never default missing counts to zero");
    assert.ok(observed.sdk_calls.length > 0, "No independently observed SDK call for turn");
    for (const call of observed.sdk_calls) {
      closed(call, TEST_SCHEMA.closed_fields.sdk_call, "SDK call observation");
      assert.ok(["kernel", "memory"].includes(call.role), "SDK role must identify actual Kernel versus MemoryAgent invocation");
      for (const field of ["provider", "model", "endpoint", "credential_label"]) required(call[field], `SDK ${field}`);
      assert.equal(call.max_retries, 0);
      assert.match(call.request_sha256, /^[a-f0-9]{64}$/);
      assert.ok(call.wire && typeof call.wire === "object");
      assert.equal(call.request_sha256, jsonDigest(call.wire), "SDK wire digest differs from actual retained wire");
      assert.ok(!JSON.stringify(call).includes(SENTINEL_CREDENTIAL), "Raw credential sentinel leaked into observation");
    }
    assert.ok(Array.isArray(observed.memory_factory_selections));
    assert.ok(Number.isSafeInteger(observed.provider_network_call_count)); assert.equal(observed.provider_network_call_count, 0);
    assert.ok(Number.isSafeInteger(observed.paid_api_call_count)); assert.equal(observed.paid_api_call_count, 0);
    assert.ok(Number.isSafeInteger(observed.memory_sdk_call_count) && observed.memory_sdk_call_count >= 0);
    assert.equal(observed.memory_sdk_call_count, observed.sdk_calls.filter((call) => call.role === "memory").length, "MemoryAgent count must come from distinguished actual calls");
    for (const field of ["filesystem_guard_violations", "network_guard_violations"]) { assert.ok(Array.isArray(observed[field])); assert.equal(observed[field].length, 0); }
    providerCount += observed.sdk_calls.length; externalCount += observed.provider_network_call_count; memoryCount += observed.memory_sdk_call_count;
    const dispatchIndex = transport.requests.findIndex((row) => row.path === "/chat/stream/v4" && row.body?.attempt_id === issued.attempt_id);
    const dispatch = transport.requests[dispatchIndex];
    assert.ok(dispatch);
    const discoveryIndex = transport.requests.findLastIndex((row, at) => at < dispatchIndex && row.path === "/skeleton_credentials/requirements");
    assert.ok(discoveryIndex >= 0 && !usedDiscovery.has(discoveryIndex), "Each turn needs its own preceding actual discovery");
    usedDiscovery.add(discoveryIndex);
    const discovery = transport.requests[discoveryIndex];
    assert.equal(discovery.status, 200);
    assert.equal(discovery.body.session_id, transport.chat_id);
    assert.equal(discovery.body.selection.resource_id, transport.agent_id);
    assert.equal(discovery.response?.kind, "skeleton");
    const profiles = discovery.response?.profiles;
    assert.ok(Array.isArray(profiles) && profiles.length === 1, "Stage A must discover exactly one actual Kernel profile");
    closed(profiles[0], TEST_SCHEMA.closed_fields.credential_profile, "discovered Kernel profile");
    const kernelCalls = observed.sdk_calls.filter((call) => call.role === "kernel");
    assert.equal(kernelCalls.length, 1, "Single-Kernel Stage A must make exactly one observed Kernel call");
    for (const field of ["provider", "model", "endpoint"]) assert.equal(kernelCalls[0][field], profiles[0][field], `SDK ${field} must match actual discovered Kernel target`);
    assert.equal(kernelCalls[0].wire.model, profiles[0].model, "Actual SDK wire model must match discovered Kernel");
    assert.equal(observed.issued_scope_digest, jsonDigest(dispatch.body.options.skeleton_credential_scope), "Observer did not inspect the issued exact Main scope");
    assert.equal(observed.launch.selection_digest, dispatch.body.options.skeleton_credential_scope.selection_digest);
    assert.equal(observed.launch.workflows_digest, dispatch.body.options.skeleton_credential_scope.workflows_digest);
    assert.deepEqual(dispatch.body.context_v2_history, []); assert.deepEqual(dispatch.body.history, []);
    assert.equal(issued.done.cancelled, false); assert.ok(!issued.done.error);
  }
  const strings = [];
  const collectStrings = (value) => { if (typeof value === "string") strings.push(value); else if (value && typeof value === "object") Object.values(value).forEach(collectStrings); };
  observation.turns[1].sdk_calls.filter((call) => call.role === "kernel").forEach((call) => collectStrings(call.wire));
  for (const expected of [transport.turns[0].message, transport.turns[0].final_text, transport.turns[1].message]) {
    assert.ok(strings.some((text) => text.includes(expected)), "Second actual SDK wire must contain server-owned prior user/End reply and current user input");
  }
  assert.notEqual(transport.turns[0].attempt_id, transport.turns[1].attempt_id);
  return { verdict: "VALIDATOR_ACCEPTED", integration_verdict: "INCOMPLETE", observed_sdk_calls: providerCount, observed_memory_sdk_calls: memoryCount,
    observed_external_network_requests: externalCount,
    assertion_scope: "Prepared validator only: supplied End summary, receipt counts, SDK wires and identity; real observer and raw Journal identity/cursor/schema checks are NOT_IMPLEMENTED and cannot qualify an integration PASS" };
}

async function runChain(args, deps, base, before) {
  assert.equal(before.status, "", "Freeze a clean product candidate before integration execution");
  const guardFile = path.resolve(args["server-guard"]);
  const guard = readJson(guardFile);
  const origin = `http://127.0.0.1:${args.port}`;
  closed(guard, TEST_SCHEMA.closed_fields.ready, "server readiness guard");
  assert.equal(guard.schema, GUARD_SCHEMA);
  assert.equal(guard.phase, "ready");
  assert.equal(guard.run_id, args.runId);
  assert.equal(guard.origin, origin);
  assert.equal(guard.offline_sdk_installed, true, "Host offline SDK installation must be independently established before run");
  assert.equal(guard.external_network_blocked, true, "Host must deny outbound provider network before run");
  validateIdentity(guard.identity, before, args.installedSite);
  const token = fs.readFileSync(path.resolve(args["token-file"]), "utf8").trim();
  assert.ok(token && !/[\r\n]/.test(token), "Token file must hold one nonempty token");
  assert.equal(token, SENTINEL_CREDENTIAL, "Only the shared offline sentinel may be used by this test driver");
  // Configure only this driver process's DEV readiness expectation. The host is
  // separately started by the orchestrator and its real status must agree.
  Object.assign(process.env, { PUPU_FEATURE_MEMORY_V2: "all", PUPU_MEMORY_V2_MODE: "all",
    PUPU_MEMORY_V2_CANARY_PERCENT: "100", PUPU_CONTEXT_V2_STORE_OWNER: "unchain",
    PUPU_MEMORY_V2_READ_ONLY_DEGRADED: "0", UNCHAIN_PYTHON_BIN: process.execPath });
  const originalFetch = global.fetch;
  const requests = []; const ipcSends = []; const envelopes = []; const vaultReads = [];
  const allowedPaths = new Set(["/health", "/context/v2/status", "/computer-use/status", "/skeleton_credentials/requirements", "/chat/stream/v4"]);
  const guardedFetch = async (url, options = {}) => {
    const target = new URL(url);
    assert.equal(target.origin, origin, "Driver network restricted to explicit loopback host");
    assert.ok(allowedPaths.has(target.pathname), `Unexpected Main HTTP path: ${target.pathname}`);
    const record = { path: target.pathname, method: options.method || "GET" };
    if (typeof options.body === "string") record.body = JSON.parse(options.body);
    requests.push(record);
    const answer = await originalFetch(url, { ...options, redirect: "error" });
    record.status = answer.status;
    if (target.pathname === "/skeleton_credentials/requirements" || target.pathname === "/context/v2/status" || target.pathname === "/health") {
      record.response = await answer.clone().json();
    }
    return answer;
  };
  global.fetch = guardedFetch;
  const bus = new EventEmitter();
  const sender = { id: 21, isDestroyed: () => false, getType: () => "window", send(channel, envelope) {
    envelopes.push({ channel, envelope }); bus.emit(channel, {}, envelope);
  } };
  const { createUnchainService } = require(path.join(args.clone, "electron/main/services/unchain/service.js"));
  const registry = args["main-registry"] ? readJson(args["main-registry"]) : { status: "missing" };
  const settings = { getSecretStorageStatus: () => "available", readModelProviderRegistry: () => registry,
    readDecryptedProviderSecret(kind, id) { vaultReads.push({ kind, id }); return SENTINEL_CREDENTIAL; } };
  const service = createUnchainService({
    app: { isPackaged: false, getAppPath: () => args.clone, getPath: () => path.join(args.out, "main-stub-userdata"), getVersion: () => "0.2.0" },
    fs, path, spawn: () => fakeProcess(),
    spawnSync: () => ({ status: 0, stdout: JSON.stringify({ version: "3.12.10", major: 3, minor: 12, missing: [] }) }),
    crypto: { randomBytes: () => ({ toString: () => token }) }, net: pinnedNet(args.port),
    streamRequestImpl: guardedFetch, webContents: { fromId: () => sender, getAllWebContents: () => [sender] },
    runtimeService: { validateWorkspaceRootPath: () => ({ valid: false, reason: "No workspace in this bounded integration" }) },
    settingsStorageService: settings, getAppIsQuitting: () => true,
  });
  const client = deps.createMisoStreamClient({
    on: bus.on.bind(bus), removeListener: bus.removeListener.bind(bus),
    invoke: async () => { throw new Error("Unexpected invoke: first/second sends do not attach/resume"); },
    send(channel, envelope) {
      ipcSends.push({ channel, envelope });
      if (channel === deps.CHANNELS.UNCHAIN.STREAM_START_V4) service.handleStreamStartV4({ sender }, envelope);
      else if (channel === deps.CHANNELS.UNCHAIN.STREAM_CANCEL) service.handleStreamCancel({ sender }, envelope);
      else throw new Error(`Unexpected IPC command: ${channel}`);
    },
  });
  const turns = [];
  let failure = null;
  let serviceStatus = null;
  try {
    await service.startMiso();
    const status = service.getMisoStatusPayload();
    serviceStatus = status;
    assert.equal(status.status, "ready", "Real sidecar health/protocol must be ready");
    assert.equal(status.memoryV2?.ready, true, "Real Main Context V2 readiness must pass");
    assert.equal(status.memoryV2?.rolloutMode, "all");
    assert.equal(status.memoryV2?.runtimeProtocolDigest, TEST_SCHEMA.constants.runtime_manifest_digest);
    for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
      const payload = turnPayload(base, args, ordinal);
      const runtimeEvents = []; let handle; let timer;
      const done = await new Promise((resolve, reject) => {
        timer = setTimeout(() => { handle?.cancel(); reject(new Error(`Turn ${ordinal} timed out without real terminal`)); }, args.timeoutMs);
        handle = client.startStreamV4(payload, {
          onRuntimeEvent: (event) => runtimeEvents.push(copy(event)),
          onDone: resolve,
          onError: (error) => reject(Object.assign(new Error(error.message || error.code), error)),
        });
      }).finally(() => clearTimeout(timer));
      assert.equal(done.cancelled, false);
      assert.equal(done.execution_id, args.chatId);
      assert.equal(done.attempt_id, payload.attempt_id);
      assert.ok(!done.error, `Terminal error: ${JSON.stringify(done.error)}`);
      assert.ok(!runtimeEvents.some((event) => ["run.failed", "run.suspended"].includes(event.type)), "Run did not reach ordinary End");
      const completed = runtimeEvents.filter((event) => event.type === "run.completed" && event.run_id === payload.attempt_id && event.payload?.status === "completed");
      assert.equal(completed.length, 1, "Exactly one root run.completed must reach real preload callback");
      const finals = runtimeEvents.filter((event) => event.type === "step.completed" && event.run_id === payload.attempt_id && typeof event.payload?.final_text === "string");
      assert.equal(finals.length, 1, "Exactly one final root reply must reach real preload callback");
      assert.ok(finals[0].payload.final_text.length > 0);
      const callSet = requests.filter((row) => row.path === "/chat/stream/v4" && row.body?.attempt_id === payload.attempt_id);
      assert.equal(callSet.length, 1); assert.equal(callSet[0].status, 200);
      assert.equal(callSet[0].body.options.modelId, "");
      assert.equal(callSet[0].body.options.skeleton_selection.resource_id, args.agentId);
      assert.ok(callSet[0].body.options.skeleton_credential_scope);
      assert.ok(callSet[0].body.options.skeleton_credentials);
      turns.push({ ordinal, message: payload.message, attempt_id: payload.attempt_id,
        final_text: finals[0].payload.final_text, runtime_events: runtimeEvents, done, handle: { requestId: handle.requestId, executionId: handle.executionId, attemptId: handle.attemptId } });
      // Main removes the active attempt in its real finally after onDone.
      const settleUntil = Date.now() + 2000;
      while (service.__debug?.activeStreamCount?.() > 0 && Date.now() < settleUntil) await sleep(5);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(requests.filter((row) => row.path === "/skeleton_credentials/requirements").length, 2);
    const rendererWire = JSON.stringify({ ipcSends, envelopes });
    assert.ok(!rendererWire.includes(SENTINEL_CREDENTIAL), "Vault sentinel leaked across renderer boundary");
    assert.ok(!JSON.stringify(ipcSends).includes("skeleton_credentials"), "Renderer supplied credential fields");
  } catch (error) {
    failure = { code: error.code || "driver_assertion_failed", message: error.message };
  } finally { global.fetch = originalFetch; }
  const after = sourceSnapshot(args.clone);
  assert.deepEqual(after, before, "Product source/HEAD/status changed during run");
  const receipt = { schema: SCHEMA, run_id: args.runId, chat_id: args.chatId, agent_id: args.agentId,
    verdict: failure ? "FAIL" : "INCOMPLETE", transport_passed: failure === null,
    server_observation: "NOT_RUN", provider_call_count: null,
    limits: "No final acceptance without independent server observation; no real provider/native/packaged app claims",
    source_before: before, source_after: after, server_guard_sha256: digest(fs.readFileSync(guardFile)),
    launch_stubbed: true, vault_sentinels_only: true, home_environment_replaced: false,
    service_status: serviceStatus, requests, ipc_sends: ipcSends, renderer_envelopes: envelopes, vault_reads: vaultReads, turns, failure };
  writeNew(args.out, "transport.json", redact(receipt, token));
  if (failure) throw Object.assign(new Error(failure.message), { code: failure.code });
  return { verdict: "INCOMPLETE", transport_passed: true, server_observation: "NOT_RUN", provider_call_count: null };
}

async function main(argv = process.argv.slice(2)) {
  const args = argsFrom(argv);
  const before = sourceSnapshot(args.clone);
  if (args.mode === "verify") {
    const transport = readJson(args.transport);
    assert.equal(transport.agent_id, args.agentId);
    assert.equal(transport.source_after.clone, args.clone);
    assert.equal(before.head, transport.source_after.head);
    assert.deepEqual(before.sha256, transport.source_after.sha256);
    const observation = readJson(args["server-observation"]);
    const result = verifyObservation(transport, observation, { installedSite: args.installedSite });
    writeNew(args.out, "verification.json", { schema: SCHEMA, ...result, node: process.version,
      transport_sha256: digest(fs.readFileSync(args.transport)), server_observation_sha256: digest(fs.readFileSync(args["server-observation"])), source: before });
    console.log(JSON.stringify(result)); return;
  }
  const deps = dependencies(args.clone);
  const template = payloadTemplate(args);
  if (args.mode === "run") {
    const guardFile = path.resolve(args["server-guard"]);
    const guardConfig = validateMemoryConfig(readJson(guardFile).memory_agent_config);
    if (args["memory-agent-config"]) assert.deepEqual(template.payload.memory_agent_config, guardConfig, "Explicit memory config must agree with independently seeded host guard");
    template.payload.memory_agent_config = guardConfig;
    template.provenance.memory_agent_config = { file: guardFile, json_pointer: "memory_agent_config", sha256: digest(fs.readFileSync(guardFile)) };
  }
  const offline = checkClientOffline(args, deps, template.payload);
  const afterOffline = sourceSnapshot(args.clone);
  assert.deepEqual(afterOffline, before, "Product source/HEAD/status changed during offline preflight");
  writeNew(args.out, "preflight.json", { schema: SCHEMA, mode: args.mode, preparation: "PASS", integration_verdict: "NOT_RUN",
    http_started: false, providers_started: false, application_started: false, home_environment_replaced: false,
    source: before, source_after: afterOffline, payload_provenance: template.provenance, explicit_mappings: template.mappings, offline });
  if (args.mode === "run") console.log(JSON.stringify(await runChain(args, deps, template.payload, before)));
  else console.log(JSON.stringify({ preparation: "PASS", integration_verdict: "NOT_RUN", source_head: before.head, node: process.version, offline_payloads: 2 }));
}

module.exports = { argsFrom, sourceSnapshot, payloadTemplate, turnPayload, checkClientOffline, validateIdentity, verifyObservation, jsonDigest, main };
if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ verdict: "FAIL", code: error.code || "driver_error", message: error.message }));
  process.exitCode = 1;
});
