"use strict";
// Every accepted/rejected object below is deliberately SYNTHETIC. This tests
// validator behavior, not a product run, SDK call, durable End or provider.
const assert = require("node:assert/strict");
const path = require("node:path");
const { argsFrom, sourceSnapshot, verifyObservation, jsonDigest } = require("./active_context_chain.cjs");
const SCHEMA = require("./test-schema.json");
const [clone, out, installedSite] = process.argv.slice(2);
assert.ok(clone && out && installedSite, "Provide explicit clone, external out, and installed site");
const source = sourceSnapshot(clone);
const base = ["--run", "--clone", clone, "--agent-id", "offline.test.agent", "--out", out,
  "--port", "5879", "--token-file", "/not-read-by-these-controls", "--run-id", "offline-negative", "--chat-id", "chat-offline-negative"];
const results = [];
const check = (name, body) => { body(); results.push({ name, pass: true }); };
const copy = (value) => JSON.parse(JSON.stringify(value));

function fixtures() {
  const scope = { schema: "pupu.skeleton_credential_scope.v1", mode: "start", session_id: "chat-offline-negative", owner_chat_id: "chat-offline-negative",
    interaction_id: "", source_attempt_id: "", selection_digest: "d".repeat(64), workflows_digest: "e".repeat(64), launch_digest: "", memory_provider: "openai" };
  const profile = { id: "openai:synthetic-validator-only", credential_ref: "openai", provider: "openai", model: "synthetic-validator-only", protocol: "openai-responses", endpoint: "https://api.openai.com/v1" };
  const transport = { schema: "pupu.external.active_context_chain.v1", transport_passed: true, failure: null,
    run_id: "offline-negative", chat_id: "chat-offline-negative", agent_id: "offline.test.agent", source_after: copy(source),
    turns: [1, 2].map((ordinal) => ({ attempt_id: `attempt-${ordinal}`, message: `question-${ordinal}`, final_text: `reply-${ordinal}`, done: { cancelled: false } })) };
  transport.requests = transport.turns.flatMap((turn) => [
    { path: "/skeleton_credentials/requirements", status: 200,
      body: { session_id: transport.chat_id, selection: { resource_id: transport.agent_id } },
      response: { kind: "skeleton", profiles: [copy(profile)], scope: copy(scope) } },
    { path: "/chat/stream/v4", body: { attempt_id: turn.attempt_id, history: [], context_v2_history: [], options: { skeleton_credential_scope: copy(scope) } } },
  ]);
  const wire = { input: "question-1 reply-1 question-2", model: profile.model };
  const identity = {
    host_head: source.head, host_source_hashes: copy(source.sha256), wheel_sha256: SCHEMA.constants.wheel_sha256,
    runtime_manifest: copy(SCHEMA.expected_runtime_manifest), HOME_environment_changed: false,
    loaded_unchain_origins: Object.fromEntries(SCHEMA.required_unchain_origins.map((name) => [name, path.join(installedSite, ...name.split("."), "__init__.py")])),
    loaded_host_origins: Object.fromEntries(SCHEMA.required_host_origins.map((name) => [name, path.join(clone, "unchain_runtime/server", name + ".py")])),
    data_root: path.join(out, "synthetic-data-path-only"), resource_root: path.join(out, "synthetic-resources-path-only"),
    app_factory: "app.create_app", SDK_behavior_substitutions: ["openai.OpenAI"],
  };
  const observation = { schema: "qa.active-context-http-observation.v1", phase: "server-observation", identity,
    turns: transport.turns.map((turn) => ({ attempt_id: turn.attempt_id, session_id: transport.chat_id, owner_chat_id: transport.chat_id,
      issued_scope_digest: jsonDigest(scope),
      launch: { root_run_id: turn.attempt_id, graph_id: "synthetic-graph", descriptor_sha256: "a".repeat(64),
        status: "completed", root_committed: true, end_message: turn.final_text, completed_node_ids: ["end"], end_node_id: "end", end_output_sha256: "b".repeat(64),
        root_final_receipts: [{}], root_terminal_receipts: [{}], selection_digest: scope.selection_digest, workflows_digest: scope.workflows_digest },
      sdk_calls: [{ role: "kernel", provider: "openai", model: "synthetic-validator-only", endpoint: "https://api.openai.com/v1", credential_label: "official:openai",
        max_retries: 0, request_sha256: jsonDigest(wire), wire: copy(wire) }], memory_factory_selections: [],
      provider_network_call_count: 0, paid_api_call_count: 0, memory_sdk_call_count: 0, filesystem_guard_violations: [], network_guard_violations: [] })) };
  return { transport, observation };
}
const invoke = ({ transport, observation }) => verifyObservation(transport, observation, { installedSite });

check("Synthetic valid verifier control is accepted before any negative mutation", () => {
  const result = invoke(fixtures()); assert.equal(result.verdict, "VALIDATOR_ACCEPTED"); assert.equal(result.integration_verdict, "INCOMPLETE");
});
check("HTTP run is not armed by --run alone", () => assert.throws(() => argsFrom(base), /allow-loopback-http/));
check("HTTP run cannot omit independent server offline guard", () => assert.throws(() => argsFrom([...base, "--allow-loopback-http"]), /server-guard/));
check("Missing server observation cannot become PASS", () => { const f = fixtures(); f.observation = {}; assert.throws(() => invoke(f), /CLOSED/); });
check("Changed attempt cannot become PASS", () => { const f = fixtures(); f.observation.turns[0].attempt_id = "wrong-attempt"; assert.throws(() => invoke(f), /attempt/); });
check("Absent independent SDK measurement cannot become zero or PASS", () => { const f = fixtures(); delete f.observation.turns[0].sdk_calls; assert.throws(() => invoke(f), /CLOSED/); });
check("Uncommitted End cannot pass merely because transport completed", () => { const f = fixtures(); f.observation.turns[0].launch.root_committed = false; assert.throws(() => invoke(f), /has not committed/); });
check("active_context_required terminal error can never become PASS", () => { const f = fixtures(); f.transport.turns[0].done.error = { code: "skeleton_active_context_required" }; assert.throws(() => invoke(f)); });
check("Changed wheel cannot become PASS", () => { const f = fixtures(); f.observation.identity.wheel_sha256 = "c".repeat(64); assert.throws(() => invoke(f), /Wrong fixed wheel/); });
check("Changed runtime manifest cannot become PASS", () => { const f = fixtures(); f.observation.identity.runtime_manifest.manifest_digest = "sha256:" + "c".repeat(64); assert.throws(() => invoke(f), /Wrong fixed runtime manifest/); });
check("Offsite Unchain import cannot become PASS", () => { const f = fixtures(); f.observation.identity.loaded_unchain_origins.unchain = path.join(clone, "unchain_runtime/server/app.py"); assert.throws(() => invoke(f), /Offsite module origin/); });
check("Missing required module origin cannot become PASS", () => { const f = fixtures(); delete f.observation.identity.loaded_unchain_origins["unchain.context"]; assert.throws(() => invoke(f), /missing required module origin/); });
check("Unknown observation envelope field cannot become PASS", () => { const f = fixtures(); f.observation.unrecognized = true; assert.throws(() => invoke(f), /CLOSED/); });
check("Caller history reinjection cannot self-prove Journal retention", () => { const f = fixtures(); f.transport.requests[3].body.context_v2_history = [{ role: "user", content: "question-1" }]; assert.throws(() => invoke(f)); });
check("Missing first user and End in second SDK wire cannot become PASS", () => { const f = fixtures(); f.observation.turns[1].sdk_calls[0].wire.input = "question-2"; f.observation.turns[1].sdk_calls[0].request_sha256 = jsonDigest(f.observation.turns[1].sdk_calls[0].wire); assert.throws(() => invoke(f), /Second actual SDK wire/); });
check("Wrong observed SDK model cannot pass correct scope/history", () => { const f = fixtures(); f.observation.turns[1].sdk_calls[0].model = "wrong-composer-model"; assert.throws(() => invoke(f), /actual discovered Kernel target/); });
check("Wrong actual SDK wire model cannot hide behind correct telemetry", () => { const f = fixtures(); f.observation.turns[1].sdk_calls[0].wire.model = "wrong-composer-model"; f.observation.turns[1].sdk_calls[0].request_sha256 = jsonDigest(f.observation.turns[1].sdk_calls[0].wire); assert.throws(() => invoke(f), /Actual SDK wire model/); });
console.log(JSON.stringify({ preparation_controls: results, integration_verdict: "NOT_RUN", synthetic_validator_inputs_only: true }, null, 2));
