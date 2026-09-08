import assert from "node:assert/strict";
import test from "node:test";

import {
  CELL_CATALOG,
  CYCLE_POOL,
  EVIDENCE_SCHEMA,
  OBSERVED_KEYS,
  SINK_KINDS,
  buildCycleSchedule,
  buildEvidence,
  buildTextSse,
  buildToolCallSse,
  emptyObserved,
  evaluateCell,
  evaluateHandleGrowth,
  scanForSecrets,
  secretVariantsFor,
} from "./windows-installed-sink-matrix-lib.mjs";

const cellById = (id) => CELL_CATALOG.find((cell) => cell.id === id);

const successObserved = (kind) => ({
  ...emptyObserved(),
  streamStatus: "done",
  toolResult: {
    ok: true,
    denied: false,
    receipt_id: "rcpt_1",
    exit_category: kind === "mcp_schema_secret" ? null : "success",
    returncode: kind === "mcp_schema_secret" ? null : 0,
    error: null,
  },
  receipt: { status: "completed", outcome_code: "completed" },
  intent: { status: "completed", sink_kind: kind },
  dialog: { found: true, action: "Allow" },
  workerSpawned: true,
  survivors: 0,
  sentinelPresent: false,
  providerCalls: 2,
  mcpReceiptCount: kind === "mcp_schema_secret" ? 1 : null,
  pendingRevived: null,
  receiptRowsBefore: null,
  receiptRowsAfter: null,
});

test("catalog covers the three declared sink kinds with success and fault cells", () => {
  assert.deepEqual([...SINK_KINDS], [
    "shell_secret_env",
    "shell_secret_stdin",
    "mcp_schema_secret",
  ]);
  const ids = CELL_CATALOG.map((cell) => cell.id);
  assert.deepEqual(ids, [
    "env.success",
    "stdin.success",
    "mcp.success",
    "env.nonzero",
    "stdin.timeout",
    "env.native_cancel",
    "env.renderer_deny",
    "stdin.kill_worker",
    "env.kill_supervisor",
    "mcp.kill_parent",
    "env.cold_restart_then_success",
  ]);
  for (const kind of SINK_KINDS) {
    assert.ok(CELL_CATALOG.some((cell) => cell.kind === kind && cell.fault === "none"));
  }
  assert.ok(CYCLE_POOL.every((id) => cellById(id)));
  assert.ok(!CYCLE_POOL.includes("mcp.kill_parent"));
  assert.ok(!CYCLE_POOL.includes("env.cold_restart_then_success"));
  for (const cell of CELL_CATALOG) {
    assert.deepEqual(Object.keys(cell).sort(), [
      "expected",
      "fault",
      "id",
      "kind",
      "sentinel",
    ]);
  }
});

test("cycle schedule is deterministic, bounded to the pool and well mixed", () => {
  const first = buildCycleSchedule({ cycles: 100, seed: 195 });
  const second = buildCycleSchedule({ cycles: 100, seed: 195 });
  assert.deepEqual(first, second);
  assert.equal(first.length, 100);
  assert.ok(first.every((id) => CYCLE_POOL.includes(id)));
  const counts = new Map();
  for (const id of first) counts.set(id, (counts.get(id) || 0) + 1);
  for (const id of CYCLE_POOL) {
    assert.ok((counts.get(id) || 0) >= 6, `${id} scheduled ${counts.get(id) || 0} times`);
  }
  const successes = first.filter((id) => cellById(id).fault === "none").length;
  assert.ok(successes >= 40, `only ${successes} success cells`);
  assert.notDeepEqual(buildCycleSchedule({ cycles: 100, seed: 196 }), first);
  assert.throws(() => buildCycleSchedule({ cycles: 5, seed: 1 }), /at least/);
});

test("Responses SSE builders produce a completed function_call and a completed text turn", () => {
  const sse = buildToolCallSse({
    responseId: "resp_1",
    model: "pupu-fake-responses-v1",
    callId: "call_1",
    name: "shell",
    argumentsObject: { action: "run", command: "cmd /c exit 7", secret_env: { TOKEN: "vh_abc" } },
  });
  const frames = sse
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("event: "))
    .map((chunk) => JSON.parse(chunk.split("\ndata: ")[1]));
  assert.equal(frames[0].type, "response.created");
  const done = frames.find((frame) => frame.type === "response.function_call_arguments.done");
  assert.equal(done.name, "shell");
  assert.deepEqual(JSON.parse(done.arguments).secret_env, { TOKEN: "vh_abc" });
  const completed = frames.at(-1);
  assert.equal(completed.type, "response.completed");
  assert.equal(completed.response.status, "completed");
  assert.equal(completed.response.output[0].type, "function_call");
  assert.equal(completed.response.output[0].call_id, "call_1");
  assert.ok(sse.endsWith("data: [DONE]\n\n"));

  const text = buildTextSse({ responseId: "resp_2", model: "m", text: "SINK_CELL_DONE env.success" });
  const textFrames = text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("event: "))
    .map((chunk) => JSON.parse(chunk.split("\ndata: ")[1]));
  const textCompleted = textFrames.at(-1);
  assert.equal(textCompleted.response.output[0].type, "message");
  assert.equal(textCompleted.response.output[0].content[0].text, "SINK_CELL_DONE env.success");
});

test("secret scan reports encoded variants by digest only and never the plaintext", () => {
  const plaintext = "PUPU-SINK-c29tZS1zeW50aGV0aWMtc2VjcmV0";
  const variants = secretVariantsFor([plaintext]);
  assert.ok(variants.includes(plaintext));
  assert.ok(variants.includes(Buffer.from(plaintext, "utf8").toString("base64")));
  const result = scanForSecrets({
    texts: {
      clean: "nothing here",
      raw: `token=${plaintext}`,
      b64: `x ${Buffer.from(plaintext, "utf8").toString("base64")} y`,
      hex: Buffer.from(plaintext, "utf8").toString("hex"),
    },
    variants,
  });
  assert.equal(result.scanned, 4);
  assert.deepEqual(result.hits.map((hit) => hit.label).sort(), ["b64", "hex", "raw"]);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(plaintext));
  assert.ok(!serialized.includes(Buffer.from(plaintext, "utf8").toString("base64")));
  for (const hit of result.hits) {
    assert.match(hit.variant_sha256_prefix, /^[0-9a-f]{16}$/);
  }
});

test("evaluateCell accepts exact success observations and rejects each drift", () => {
  for (const id of ["env.success", "stdin.success", "mcp.success"]) {
    const cell = cellById(id);
    const verdict = evaluateCell({ cell, observed: successObserved(cell.kind) });
    assert.deepEqual(verdict, { pass: true, reasons: [] }, id);
  }
  const cell = cellById("env.success");
  const drifts = [
    ["survivor", { survivors: 1 }],
    ["sentinel", { sentinelPresent: true }],
    ["receipt", { receipt: { status: "indeterminate", outcome_code: "x" } }],
    ["exit", { toolResult: { ...successObserved(cell.kind).toolResult, exit_category: "nonzero" } }],
    ["dialog", { dialog: { found: false, action: "Allow" } }],
    ["stream", { streamStatus: "failed" }],
    ["kind", { intent: { status: "completed", sink_kind: "shell_secret_stdin" } }],
  ];
  for (const [label, patch] of drifts) {
    const verdict = evaluateCell({ cell, observed: { ...successObserved(cell.kind), ...patch } });
    assert.equal(verdict.pass, false, label);
    assert.ok(verdict.reasons.length >= 1, label);
  }
  assert.throws(
    () => evaluateCell({ cell, observed: { ...successObserved(cell.kind), extra: 1 } }),
    /observed keys/,
  );
});

test("evaluateCell encodes the fault semantics of each catalog cell", () => {
  const base = successObserved("shell_secret_env");
  const nonzero = evaluateCell({
    cell: cellById("env.nonzero"),
    observed: { ...base, toolResult: { ...base.toolResult, exit_category: "nonzero", returncode: 7 } },
  });
  assert.equal(nonzero.pass, true, JSON.stringify(nonzero));
  assert.equal(
    evaluateCell({
      cell: cellById("env.nonzero"),
      observed: { ...base, toolResult: { ...base.toolResult, exit_category: "nonzero", returncode: 1 } },
    }).pass,
    false,
  );

  const stdinBase = successObserved("shell_secret_stdin");
  const timeout = evaluateCell({
    cell: cellById("stdin.timeout"),
    observed: { ...stdinBase, toolResult: { ...stdinBase.toolResult, exit_category: "timeout", returncode: null } },
  });
  assert.equal(timeout.pass, true, JSON.stringify(timeout));
  assert.equal(
    evaluateCell({
      cell: cellById("stdin.timeout"),
      observed: { ...stdinBase, sentinelPresent: true, toolResult: { ...stdinBase.toolResult, exit_category: "timeout", returncode: null } },
    }).pass,
    false,
  );

  const cancel = evaluateCell({
    cell: cellById("env.native_cancel"),
    observed: {
      ...base,
      toolResult: { ok: false, denied: true, receipt_id: null, exit_category: null, returncode: null, error: null },
      receipt: { status: "denied", outcome_code: "vault_native_confirmation_denied" },
      intent: { status: "denied", sink_kind: "shell_secret_env" },
      dialog: { found: true, action: "Cancel" },
      workerSpawned: false,
    },
  });
  assert.equal(cancel.pass, true, JSON.stringify(cancel));
  assert.equal(
    evaluateCell({
      cell: cellById("env.native_cancel"),
      observed: {
        ...base,
        toolResult: { ok: false, denied: true, receipt_id: null, exit_category: null, returncode: null, error: null },
        receipt: { status: "denied", outcome_code: "vault_native_confirmation_denied" },
        intent: { status: "denied", sink_kind: "shell_secret_env" },
        dialog: { found: true, action: "Cancel" },
        workerSpawned: true,
      },
    }).pass,
    false,
    "a cancelled use must never spawn a worker",
  );

  const deny = evaluateCell({
    cell: cellById("env.renderer_deny"),
    observed: {
      ...base,
      toolResult: { ok: false, denied: true, receipt_id: null, exit_category: null, returncode: null, error: null },
      receipt: null,
      intent: { status: "denied", sink_kind: "shell_secret_env" },
      dialog: { found: false, action: "Probe" },
      workerSpawned: false,
    },
  });
  assert.equal(deny.pass, true, JSON.stringify(deny));

  const killWorker = evaluateCell({
    cell: cellById("stdin.kill_worker"),
    observed: {
      ...stdinBase,
      streamStatus: "done",
      toolResult: { ok: false, denied: false, receipt_id: null, exit_category: null, returncode: null, error: "vault_worker_protocol_error" },
      receipt: { status: "indeterminate", outcome_code: "execution_indeterminate" },
      intent: { status: "indeterminate", sink_kind: "shell_secret_stdin" },
    },
  });
  assert.equal(killWorker.pass, true, JSON.stringify(killWorker));
  assert.equal(
    evaluateCell({
      cell: cellById("stdin.kill_worker"),
      observed: { ...stdinBase },
    }).pass,
    false,
    "a killed worker cannot report a clean success",
  );

  const mcpBase = successObserved("mcp_schema_secret");
  const killParent = evaluateCell({
    cell: cellById("mcp.kill_parent"),
    observed: {
      ...mcpBase,
      streamStatus: "interrupted",
      toolResult: null,
      receipt: { status: "indeterminate", outcome_code: "process_recovery_indeterminate" },
      intent: { status: "indeterminate", sink_kind: "mcp_schema_secret" },
      pendingRevived: false,
      mcpReceiptCount: 0,
      providerCalls: 1,
    },
  });
  assert.equal(killParent.pass, true, JSON.stringify(killParent));
  assert.equal(
    evaluateCell({
      cell: cellById("mcp.kill_parent"),
      observed: {
        ...mcpBase,
        streamStatus: "interrupted",
        toolResult: null,
        receipt: { status: "indeterminate", outcome_code: "process_recovery_indeterminate" },
        intent: { status: "indeterminate", sink_kind: "mcp_schema_secret" },
        pendingRevived: true,
        mcpReceiptCount: 0,
        providerCalls: 1,
      },
    }).pass,
    false,
    "an indeterminate use must not be revived as pending",
  );

  const cold = evaluateCell({
    cell: cellById("env.cold_restart_then_success"),
    observed: { ...base, receiptRowsBefore: 3, receiptRowsAfter: 4 },
  });
  assert.equal(cold.pass, true, JSON.stringify(cold));
  assert.equal(
    evaluateCell({
      cell: cellById("env.cold_restart_then_success"),
      observed: { ...base, receiptRowsBefore: 3, receiptRowsAfter: 3 },
    }).pass,
    false,
  );
});

test("handle growth is judged on first versus last sample with a bounded delta", () => {
  const samples = Array.from({ length: 100 }, (_, index) => ({
    cycle: index + 1,
    app_handles: 900 + index,
    sidecar_handles: 300 + Math.floor(index / 2),
  }));
  const verdict = evaluateHandleGrowth({ samples, maxGrowth: 300 });
  assert.equal(verdict.pass, true);
  assert.equal(verdict.growth.app_handles, 99);
  assert.equal(verdict.growth.sidecar_handles, 49);
  const leaking = evaluateHandleGrowth({
    samples: samples.map((sample) => ({ ...sample, app_handles: 900 + sample.cycle * 5 })),
    maxGrowth: 300,
  });
  assert.equal(leaking.pass, false);
  assert.throws(() => evaluateHandleGrowth({ samples: samples.slice(0, 1), maxGrowth: 300 }), /two samples/);
});

test("buildEvidence emits the exact top-level key set and observed key set", () => {
  const cells = CELL_CATALOG.map((cell) => ({
    id: cell.id,
    kind: cell.kind,
    status: "PASS",
    reasons: [],
    observed: successObserved(cell.kind),
  }));
  const evidence = buildEvidence({
    identity: {
      pupu_revision: "9aeb93020e2a4f7c50736520f447241c8f997d8d",
      unchain_revision: "0680312b92d6856b2271302c23b9279a6b85c546",
      installer_sha256: `sha256:${"a".repeat(64)}`,
      installed_app_sha256: `sha256:${"b".repeat(64)}`,
      installed_asar_sha256: `sha256:${"c".repeat(64)}`,
      installed_sidecar_sha256: `sha256:${"d".repeat(64)}`,
      wheel_sha256: `sha256:${"e".repeat(64)}`,
      runtime_manifest_digest: `sha256:${"f".repeat(64)}`,
    },
    environment: {
      os_version: "10.0.22000",
      node_version: "v22.0.0",
      install_root: "C:/Users/x/AppData/Local/Programs/PuPu",
      profile_path: "D:/evidence/安装态 sink 矩阵 profile",
    },
    cells,
    cycles: {
      count: 100,
      seed: 195,
      schedule: buildCycleSchedule({ cycles: 100, seed: 195 }),
      failures: [],
      survivors_total: 0,
      sentinels_total: 0,
    },
    protocol: { oversize: "PASS", bad_frame: "PASS", evidence_path: "sidecar-supervisor-probe.json" },
    handleGrowth: evaluateHandleGrowth({
      samples: [
        { cycle: 1, app_handles: 900, sidecar_handles: 300 },
        { cycle: 100, app_handles: 950, sidecar_handles: 320 },
      ],
      maxGrowth: 300,
    }),
    secretScan: { scanned: 250, hits: [] },
  });
  assert.equal(evidence.schema, EVIDENCE_SCHEMA);
  assert.deepEqual(Object.keys(evidence).sort(), [
    "cells",
    "cycles",
    "environment",
    "executed_tests",
    "generated_at",
    "handle_growth",
    "identity",
    "platform",
    "protocol",
    "schema",
    "secret_scan",
  ]);
  assert.equal(evidence.platform, "win32-x64");
  assert.equal(evidence.executed_tests, CELL_CATALOG.length + 100 + 2);
  assert.deepEqual(Object.keys(evidence.cells[0].observed).sort(), [...OBSERVED_KEYS].sort());
  assert.deepEqual(Object.keys(evidence.cycles).sort(), [
    "count",
    "failures",
    "per_cell_counts",
    "schedule_sha256",
    "seed",
    "sentinels_total",
    "survivors_total",
  ]);
  assert.match(evidence.cycles.schedule_sha256, /^[0-9a-f]{64}$/);
  assert.throws(
    () => buildEvidence({ identity: {}, environment: {}, cells, cycles: {}, protocol: {}, handleGrowth: {}, secretScan: {} }),
    /identity/,
  );
});
