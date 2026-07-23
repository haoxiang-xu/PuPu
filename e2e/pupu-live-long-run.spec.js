/* eslint-disable testing-library/prefer-screen-queries, jest/valid-title */

const fs = require("node:fs");
const path = require("node:path");

const { test, expect } = require("./fixtures/pupu_app");
const {
  LIVE_DURATION_MS,
  LIVE_MATRIX,
  LIVE_MAX_ITERATIONS,
  LIVE_MIN_ITERATIONS,
  WEB_SOURCES,
  buildFyiCommand,
  buildIterationPrompt,
  buildMcpGatePrompt,
  buildMultiagentPrompt,
  buildQueueCommand,
  codingArtifact,
  collectAttemptEvidence,
  mcpLaneForCell,
  redactSecrets,
  summarizeTokenEvidence,
  validateAttemptIdentity,
} = require("../scripts/test-api/live-long-run-lib.cjs");
const {
  MCP_TOOLKIT_ID,
  buildMcpInstallPayload,
  forbiddenRuntimeLogFindings,
  parseJsonLines,
} = require("../scripts/test-api/deterministic-soak-lib.cjs");

const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_FIXTURE_PATH = path.join(
  REPO_ROOT,
  "scripts/test-api/fixtures/deterministic_mcp_server.py",
);
const enabled = process.env.PUPU_LIVE_LONG_RUN === "1";
const selectedCellId = String(process.env.PUPU_LIVE_CELL_ID || "").trim();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const poll = async (
  callback,
  { timeoutMs = 180000, intervalMs = 250, label = "condition" } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  let lastError;
  while (Date.now() < deadline) {
    try {
      lastValue = await callback();
      if (lastValue) return lastValue;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  const suffix = lastError
    ? `; last error: ${lastError.message}`
    : `; last value: ${JSON.stringify(lastValue)}`;
  throw new Error(`timed out waiting for ${label}${suffix}`);
};

const debugEval = async (testApi, code) => {
  const result = await testApi.post("/debug/eval", { code, await: true });
  if (!result?.ok) {
    throw new Error(result?.error?.message || "debug eval failed");
  }
  return result.value;
};

const completeOnboarding = async (appWindow) => {
  const startGate = appWindow.getByRole("button", {
    name: "Click anywhere to start",
  });
  if (await startGate.isVisible().catch(() => false)) await startGate.click();
  const setupDialog = appWindow.getByRole("dialog");
  if (await setupDialog.isVisible().catch(() => false)) {
    const skip = setupDialog.getByRole("button", { name: "Skip for now" });
    if (await skip.isVisible().catch(() => false)) await skip.click();
  }
};

const waitForBridge = (testApi, timeoutMs) =>
  poll(
    async () => {
      try {
        const state = await testApi.get("/debug/state");
        return state?.route ? state : null;
      } catch (_) {
        return null;
      }
    },
    { timeoutMs, label: "renderer Test API bridge" },
  );

const reloadAndWait = async ({ appWindow, testApi, timeoutMs }) => {
  await appWindow.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  await appWindow.waitForLoadState("domcontentloaded");
  return waitForBridge(testApi, timeoutMs);
};

const readJsonLinesIfPresent = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return parseJsonLines(fs.readFileSync(filePath, "utf8"));
};

const listRelativeFiles = (rootDir, currentDir = rootDir) => {
  if (!fs.existsSync(currentDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listRelativeFiles(rootDir, absolutePath));
    } else if (entry.isFile()) {
      files.push(path.relative(rootDir, absolutePath));
    }
  }
  return files.sort();
};

const numericEnv = (name, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const raw = String(process.env[name] || "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const toolNamesForAttempt = (attempt) =>
  new Set(
    (attempt?.evidence?.tool_evidence || [])
      .map((item) => item.tool_name)
      .filter(Boolean),
  );

for (const cell of LIVE_MATRIX) {
  test.describe(`${cell.workload} / ${cell.modelId}`, () => {
    test.skip(
      !enabled || selectedCellId !== cell.id,
      "live model long runs are opt-in and selected one matrix cell per process",
    );

    test(`live-long-run ${cell.id}`, async ({ pupu }, testInfo) => {
      const durationMs = numericEnv(
        "PUPU_LIVE_DURATION_MS",
        LIVE_DURATION_MS,
        { min: 1000, max: 6 * 60 * 60 * 1000 },
      );
      const maxIterations = numericEnv(
        "PUPU_LIVE_MAX_ITERATIONS",
        LIVE_MAX_ITERATIONS,
        { min: LIVE_MIN_ITERATIONS, max: 100 },
      );
      const phaseTimeoutMs = numericEnv(
        "PUPU_LIVE_PHASE_TIMEOUT_MS",
        8 * 60 * 1000,
        { min: 30000, max: 30 * 60 * 1000 },
      );
      const bridgeTimeoutMs = numericEnv(
        "PUPU_LIVE_BRIDGE_TIMEOUT_MS",
        90 * 1000,
        { min: 10000, max: 5 * 60 * 1000 },
      );
      test.setTimeout(durationMs + 20 * 60 * 1000);

      const credential = String(
        process.env.PUPU_LIVE_PROVIDER_API_KEY || "",
      ).trim();
      if (!credential) {
        throw new Error(
          `missing isolated credential for ${cell.provider}; use the opt-in runner`,
        );
      }

      const reportPath = path.resolve(
        process.env.PUPU_LIVE_REPORT_PATH ||
          testInfo.outputPath(`${cell.id}-report.json`),
      );
      const reportDir = path.dirname(reportPath);
      const workspaceRoot = path.resolve(
        process.env.PUPU_LIVE_WORKSPACE_ROOT ||
          path.join(reportDir, "isolated-workspace"),
      );
      const mcpAuditPath = path.resolve(
        process.env.PUPU_LIVE_MCP_AUDIT_PATH ||
          path.join(reportDir, "mcp-audit.jsonl"),
      );
      fs.mkdirSync(reportDir, { recursive: true });
      fs.mkdirSync(workspaceRoot, { recursive: true });

      const { appWindow, testApi, processLogs, pageErrors } = pupu;
      const report = {
        schema_version: 1,
        kind: "pupu-live-model-long-run-cell",
        cell_id: cell.id,
        workload: cell.workload,
        provider: cell.provider,
        model_id: cell.modelId,
        qualification:
          durationMs >= LIVE_DURATION_MS ? "long-run" : "smoke-only",
        target_duration_ms: durationMs,
        max_iterations: maxIterations,
        status: "running",
        started_at: new Date().toISOString(),
        soak_started_at: null,
        soak_finished_at: null,
        soak_duration_ms: null,
        chat: null,
        attempts: [],
        queue_evidence: null,
        token_summary: null,
        tool_summary: null,
        mcp_audit: {
          path: cell.workload === "mcp" ? mcpAuditPath : null,
          records: 0,
        },
        reload_count: 0,
        fyi_sent: false,
        queue_sent: false,
        durable_pause_completed: false,
        multiagent_completed: false,
        assertions: [],
        forbidden_log_findings: [],
        page_errors: [],
        error: null,
      };
      const assertReport = (name, condition, details = {}) => {
        report.assertions.push({ name, ok: Boolean(condition), ...details });
        if (!condition) throw new Error(`assertion failed: ${name}`);
      };
      const persistReport = () => {
        const safeReport = redactSecrets(report, [credential]);
        fs.writeFileSync(
          reportPath,
          `${JSON.stringify(safeReport, null, 2)}\n`,
          "utf8",
        );
      };

      let chatId = "";
      let installedToolkitId = "";
      let thrownError = null;
      let rendererLogCursor = 0;
      let mainLogCursor = 0;
      const forbiddenFindings = new Set();

      const sampleRuntimeHealth = async (label) => {
        const [rendererLogs, mainLogs] = await Promise.all([
          testApi.get(
            `/debug/logs?source=renderer&n=1000&since=${rendererLogCursor}`,
          ),
          testApi.get(`/debug/logs?source=main&n=1000&since=${mainLogCursor}`),
        ]);
        for (const entry of rendererLogs.entries || []) {
          rendererLogCursor = Math.max(rendererLogCursor, Number(entry.ts) || 0);
        }
        for (const entry of mainLogs.entries || []) {
          mainLogCursor = Math.max(mainLogCursor, Number(entry.ts) || 0);
        }
        const text = [
          processLogs.join(""),
          ...(rendererLogs.entries || []).map((entry) => entry.msg || ""),
          ...(mainLogs.entries || []).map((entry) => entry.msg || ""),
        ].join("\n");
        for (const finding of forbiddenRuntimeLogFindings(text)) {
          forbiddenFindings.add(finding);
        }
        report.forbidden_log_findings = [...forbiddenFindings];
        assertReport(
          `runtime health ${label}`,
          report.forbidden_log_findings.length === 0,
          { findings: report.forbidden_log_findings },
        );
      };

      const activateChat = async () => {
        await testApi.post(`/chats/${encodeURIComponent(chatId)}/activate`);
        await poll(
          async () => {
            const state = await testApi.get("/debug/state");
            return state.active_chat_id === chatId;
          },
          { timeoutMs: bridgeTimeoutMs, label: `activate ${chatId}` },
        );
      };

      const reloadActiveChat = async (label) => {
        await reloadAndWait({ appWindow, testApi, timeoutMs: bridgeTimeoutMs });
        report.reload_count += 1;
        await activateChat();
        await sampleRuntimeHealth(`reload:${label}`);
      };

      const sendComposerCommand = async (command) => {
        await activateChat();
        const composer = appWindow.locator("textarea").first();
        await expect(composer).toBeVisible({ timeout: bridgeTimeoutMs });
        await composer.fill(command);
        await composer.press("Enter");
        await poll(async () => (await composer.inputValue()) === "", {
          timeoutMs: 10000,
          label: `composer clear for ${command.slice(0, 20)}`,
        });
      };

      const getRun = (attempt) =>
        testApi.get(
          `/chats/${encodeURIComponent(chatId)}/runs/${encodeURIComponent(attempt.attempt_id)}`,
        );

      const startAttempt = async ({ phase, iteration, prompt }) => {
        await activateChat();
        const startedAt = Date.now();
        const started = await testApi.post(
          `/chats/${encodeURIComponent(chatId)}/runs`,
          { text: prompt },
        );
        const attempt = {
          phase,
          iteration,
          chat_id: started.chat_id || null,
          execution_id: started.execution_id || null,
          attempt_id: started.attempt_id || null,
          status: started.status || "running",
          started_at: new Date(startedAt).toISOString(),
          finished_at: null,
          duration_ms: null,
          message_id: null,
          error: null,
          evidence: null,
        };
        report.attempts.push(attempt);
        assertReport(
          `${phase} returned exact start identity`,
          attempt.chat_id === chatId &&
            attempt.execution_id === chatId &&
            typeof attempt.attempt_id === "string" &&
            attempt.attempt_id.length > 0,
          {
            chat_id: attempt.chat_id,
            execution_id: attempt.execution_id,
            attempt_id: attempt.attempt_id,
          },
        );
        persistReport();
        return attempt;
      };

      const finishAttempt = async (attempt) => {
        const snapshot = await poll(
          async () => {
            const current = await getRun(attempt);
            return current.status === "running" ? null : current;
          },
          { timeoutMs: phaseTimeoutMs, label: `${attempt.phase} completion` },
        );
        const finishedAt = Date.now();
        attempt.status = snapshot.status;
        attempt.finished_at = new Date(finishedAt).toISOString();
        attempt.duration_ms =
          finishedAt - new Date(attempt.started_at).getTime();
        attempt.message_id = snapshot.message_id || null;
        attempt.error = snapshot.error || null;
        assertReport(
          `${attempt.phase} completed`,
          snapshot.status === "completed",
          { status: snapshot.status, error: snapshot.error || null },
        );

        const evidence = await poll(
          async () => {
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const found = collectAttemptEvidence({
              detail,
              attempt,
              expectedChatId: chatId,
            });
            return found.found ? found : null;
          },
          {
            timeoutMs: bridgeTimeoutMs,
            label: `${attempt.phase} persisted evidence`,
          },
        );
        attempt.evidence = evidence;
        const identityFailures = validateAttemptIdentity({
          evidence,
          attempt,
          chatId,
        });
        assertReport(
          `${attempt.phase} persisted exact chat/attempt/session identity`,
          identityFailures.length === 0,
          { failures: identityFailures },
        );
        persistReport();
        return evidence;
      };

      const waitForToolStarted = async (attempt, toolName) =>
        poll(
          async () => {
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const evidence = collectAttemptEvidence({
              detail,
              attempt,
              expectedChatId: chatId,
            });
            return evidence.tool_evidence.some(
              (item) =>
                item.type === "tool_call" && item.tool_name === toolName,
            )
              ? evidence
              : null;
          },
          { timeoutMs: phaseTimeoutMs, label: `${toolName} tool start` },
        );

      const waitForQueueEvidence = async () => {
        const marker = `LIVE_QUEUE_OK cell=${cell.id} model=${cell.modelId}`;
        const result = await poll(
          async () => {
            const [state, detail] = await Promise.all([
              testApi.get(`/debug/state?chat_id=${encodeURIComponent(chatId)}`),
              testApi.get(`/chats/${encodeURIComponent(chatId)}`),
            ]);
            const message = (detail.messages || []).find(
              (item) =>
                item?.role === "assistant" &&
                typeof item.content === "string" &&
                item.content.includes(marker),
            );
            return !state.is_streaming && message ? { detail, message } : null;
          },
          { timeoutMs: phaseTimeoutMs, label: "durable queued follow-up" },
        );
        const meta = result.message.meta || {};
        report.queue_evidence = {
          marker,
          message_id: result.message.id || null,
          attempt_id: meta.attemptId || null,
          request_id: meta.requestId || null,
          execution_session_id: meta.executionSessionId || null,
        };
        assertReport(
          "queued follow-up persisted exact chat/session identity",
          Boolean(
            report.queue_evidence.attempt_id &&
              report.queue_evidence.request_id &&
              report.queue_evidence.execution_session_id === chatId,
          ),
          report.queue_evidence,
        );
      };

      const runDurableGate = async () => {
        const attempt = await startAttempt({
          phase: "durable-gate",
          iteration: null,
          prompt: buildMcpGatePrompt({ cell }),
        });
        await poll(
          async () => {
            try {
              const pending = await debugEval(
                testApi,
                `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
                  session_id: attempt.execution_id,
                })})`,
              );
              return pending && pending.status !== "none" ? pending : null;
            } catch (_) {
              return null;
            }
          },
          { timeoutMs: phaseTimeoutMs, label: "durable MCP approval gate" },
        );
        await reloadActiveChat("durable-mcp-approval");
        const allow = appWindow.getByRole("button", { name: "Allow once" }).last();
        await expect(allow).toBeVisible({ timeout: bridgeTimeoutMs });
        await allow.click();
        const evidence = await finishAttempt(attempt);
        assertReport(
          "durable gate retained soak_gate tool evidence",
          toolNamesForAttempt(attempt).has("soak_gate"),
          { tools: [...toolNamesForAttempt(attempt)] },
        );
        assertReport(
          "durable gate returned its marker",
          evidence.content.includes(`LIVE_GATE_OK cell=${cell.id}`),
        );
        report.durable_pause_completed = true;
      };

      const runMultiagent = async () => {
        const attempt = await startAttempt({
          phase: "multiagent",
          iteration: null,
          prompt: buildMultiagentPrompt({ cell }),
        });
        const evidence = await finishAttempt(attempt);
        const tools = toolNamesForAttempt(attempt);
        const serialized = JSON.stringify(evidence);
        assertReport(
          "multi-agent batch tool executed",
          tools.has("spawn_worker_batch"),
          { tools: [...tools] },
        );
        assertReport(
          "multi-agent child evidence was persisted",
          evidence.subagent_evidence.length >= 2 ||
            (serialized.includes("live-observer-a") &&
              serialized.includes("live-observer-b")),
          { child_count: evidence.subagent_evidence.length },
        );
        assertReport(
          "multi-agent result marker was returned",
          evidence.content.includes(`LIVE_MULTIAGENT_OK cell=${cell.id}`),
        );
        report.multiagent_completed = true;
      };

      const waitUntil = async (targetTime, label) => {
        let nextHealthSample = Date.now();
        while (Date.now() < targetTime) {
          if (Date.now() >= nextHealthSample) {
            await sampleRuntimeHealth(label);
            persistReport();
            nextHealthSample = Date.now() + 30000;
          }
          await sleep(Math.min(5000, Math.max(1, targetTime - Date.now())));
        }
      };

      try {
        await completeOnboarding(appWindow);
        await waitForBridge(testApi, bridgeTimeoutMs);

        await debugEval(
          testApi,
          `
            const root = JSON.parse(localStorage.getItem("settings") || "{}");
            root.model_providers = {
              ...(root.model_providers || {}),
              ${JSON.stringify(cell.settingsKey)}: ${JSON.stringify(credential)},
            };
            root.runtime = {
              ...(root.runtime || {}),
              workspace_root: ${JSON.stringify(workspaceRoot)},
            };
            localStorage.setItem("settings", JSON.stringify(root));
            localStorage.setItem("toolkit_auto_approve", JSON.stringify({
              version: 2,
              toolkits: ["core"],
              tools: ["core:write", "core:edit", "core:shell"],
            }));
            return { configured: true };
          `,
        );
        await reloadAndWait({ appWindow, testApi, timeoutMs: bridgeTimeoutMs });

        const catalog = await testApi.get("/catalog/models");
        const exactModel = (catalog.models || []).find(
          (model) => model.id === cell.modelId,
        );
        assertReport(
          `catalog exposes exact model ${cell.modelId}`,
          Boolean(exactModel),
        );

        if (cell.workload === "mcp") {
          const pythonPath = String(process.env.PUPU_LIVE_PYTHON || "").trim();
          assertReport("MCP Python interpreter is present", Boolean(pythonPath));
          const installPayload = buildMcpInstallPayload({
            pythonPath,
            fixturePath: MCP_FIXTURE_PATH,
            workspaceRoot,
            auditPath: mcpAuditPath,
            timeScale: Number(process.env.PUPU_LIVE_MCP_TIME_SCALE || "0.1"),
          });
          const installed = await debugEval(
            testApi,
            `return window.unchainAPI.installMcpToolkit(${JSON.stringify(
              installPayload,
            )})`,
          );
          installedToolkitId = installed?.toolkit?.toolkitId || "";
          assertReport(
            "deterministic MCP fixture installed",
            installedToolkitId === MCP_TOOLKIT_ID,
            { installed_toolkit_id: installedToolkitId },
          );
        }

        const created = await testApi.post("/chats", {
          title: `live-long-run-${cell.id}`,
          model: cell.modelId,
        });
        chatId = created.chat_id;
        report.chat = {
          chat_id: chatId,
          model_id: cell.modelId,
          execution_session_id: chatId,
          workspace_root: workspaceRoot,
          toolkit_ids:
            cell.workload === "mcp" ? [MCP_TOOLKIT_ID] : ["core"],
        };
        await testApi.post(`/chats/${encodeURIComponent(chatId)}/model`, {
          model_id: cell.modelId,
        });
        await testApi.post(`/chats/${encodeURIComponent(chatId)}/toolkits`, {
          toolkit_ids: report.chat.toolkit_ids,
        });
        await activateChat();

        if (cell.workload === "mcp") await runDurableGate();
        if (cell.workload === "coding" || cell.workload === "web") {
          await runMultiagent();
        }

        const soakStartedAt = Date.now();
        const deadline = soakStartedAt + durationMs;
        report.soak_started_at = new Date(soakStartedAt).toISOString();

        let completedIterations = 0;
        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
          const scheduledAt =
            soakStartedAt + Math.floor((iteration * durationMs) / maxIterations);
          await waitUntil(scheduledAt, `cadence-before-${iteration}`);
          if (Date.now() >= deadline && completedIterations >= LIVE_MIN_ITERATIONS) {
            break;
          }

          const control = iteration === 0 && cell.workload !== "web";
          const attempt = await startAttempt({
            phase: `iteration-${iteration}`,
            iteration,
            prompt: buildIterationPrompt({
              cell,
              iteration,
              workspaceRoot,
              control,
            }),
          });

          if (iteration === 0 && cell.workload !== "web") {
            await waitForToolStarted(
              attempt,
              cell.workload === "coding" ? "shell" : "soak_wait",
            );
            await sendComposerCommand(buildFyiCommand(cell));
            report.fyi_sent = true;
            await sendComposerCommand(buildQueueCommand(cell));
            report.queue_sent = true;
            await reloadActiveChat("control-fyi-queue");
          } else if (iteration % 3 === 0) {
            await reloadActiveChat(`periodic-${iteration}`);
          }

          const evidence = await finishAttempt(attempt);
          const marker = `LIVE_LONG_RUN_OK cell=${cell.id} model=${cell.modelId} iteration=${iteration}`;
          assertReport(
            `iteration ${iteration} returned its exact marker`,
            evidence.content.includes(marker),
          );
          const tools = toolNamesForAttempt(attempt);

          if (cell.workload === "coding") {
            const artifact = codingArtifact({ cell, iteration, workspaceRoot });
            const artifactText = fs.existsSync(artifact.absolutePath)
              ? fs.readFileSync(artifact.absolutePath, "utf8")
              : "";
            assertReport(
              `iteration ${iteration} produced isolated coding artifact`,
              artifactText.trim() === artifact.marker,
              { artifact: artifact.filename },
            );
            assertReport(
              `iteration ${iteration} used coding tools`,
              ["write", "edit", "shell"].some((name) => tools.has(name)),
              { tools: [...tools] },
            );
            if (control) {
              assertReport(
                "control iteration exercised real shell sleep",
                tools.has("shell"),
                { tools: [...tools] },
              );
            }
          }

          if (cell.workload === "mcp") {
            const expectedTool = control ? "soak_wait" : "soak_checkpoint";
            assertReport(
              `iteration ${iteration} used ${expectedTool}`,
              tools.has(expectedTool),
              { tools: [...tools] },
            );
          }

          if (cell.workload === "web") {
            const source = WEB_SOURCES[iteration % WEB_SOURCES.length];
            assertReport(
              `iteration ${iteration} used real web_fetch`,
              tools.has("web_fetch"),
              { tools: [...tools] },
            );
            assertReport(
              `iteration ${iteration} retained source/result evidence`,
              evidence.content.includes(source.url) &&
                JSON.stringify(evidence.tool_evidence).includes(source.url),
              { source_url: source.url },
            );
          }

          if (control) {
            assertReport(
              "FYI survived the active run and reload",
              evidence.content.includes(`LIVE_FYI cell=${cell.id}`),
            );
            await waitForQueueEvidence();
          }

          completedIterations += 1;
          await sampleRuntimeHealth(`iteration-${iteration}`);
          persistReport();
        }

        assertReport(
          "cell completed multiple workload iterations",
          completedIterations >= LIVE_MIN_ITERATIONS,
          { completed_iterations: completedIterations },
        );
        await waitUntil(deadline, "final-duration-hold");
        const soakFinishedAt = Date.now();
        report.soak_finished_at = new Date(soakFinishedAt).toISOString();
        report.soak_duration_ms = soakFinishedAt - soakStartedAt;
        assertReport(
          "cell reached its requested long-run duration",
          report.soak_duration_ms >= durationMs,
          { duration_ms: report.soak_duration_ms },
        );

        const detail = await testApi.get(`/chats/${encodeURIComponent(chatId)}`);
        assertReport("chat retained exact selected model", detail.model === cell.modelId, {
          persisted_model: detail.model,
        });
        assertReport(
          "every tracked attempt completed",
          report.attempts.every((attempt) => attempt.status === "completed"),
        );

        if (cell.workload === "coding") {
          const expectedFiles = report.attempts
            .filter((attempt) => Number.isSafeInteger(attempt.iteration))
            .map((attempt) =>
              codingArtifact({
                cell,
                iteration: attempt.iteration,
                workspaceRoot,
              }).filename,
            )
            .sort();
          const actualFiles = listRelativeFiles(workspaceRoot);
          assertReport(
            "coding model left only the expected isolated artifacts",
            JSON.stringify(actualFiles) === JSON.stringify(expectedFiles),
            { expected_files: expectedFiles, actual_files: actualFiles },
          );
        }

        report.token_summary = summarizeTokenEvidence(report.attempts);
        report.tool_summary = report.attempts.reduce(
          (summary, attempt) => {
            for (const evidence of attempt.evidence?.tool_evidence || []) {
              const bucket =
                evidence.type === "tool_call" ? "calls_by_name" : "results_by_name";
              const name = evidence.tool_name || "unknown";
              summary[bucket][name] = (summary[bucket][name] || 0) + 1;
            }
            return summary;
          },
          { calls_by_name: {}, results_by_name: {} },
        );
        assertReport(
          "every real-model attempt persisted token usage evidence",
          report.token_summary.records_with_usage === report.attempts.length,
          report.token_summary,
        );
        assertReport(
          "every attempt reports the exact requested model without fallback",
          report.attempts.every(
            (attempt) =>
              attempt.evidence?.token_evidence?.model === cell.modelId,
          ),
          {
            reported_models: report.attempts.map(
              (attempt) => attempt.evidence?.token_evidence?.model || null,
            ),
          },
        );

        if (cell.workload === "mcp") {
          const records = readJsonLinesIfPresent(mcpAuditPath);
          report.mcp_audit.records = records.length;
          const lane = mcpLaneForCell(cell);
          assertReport(
            "MCP audit recorded a completed scaled wait",
            records.some(
              (record) =>
                record.lane === lane &&
                record.tool === "soak_wait" &&
                record.status === "ok",
            ),
          );
          assertReport(
            "MCP audit recorded repeated checkpoint iterations",
            records.filter(
              (record) =>
                record.lane === lane &&
                record.tool === "soak_checkpoint" &&
                record.status === "ok",
            ).length >= LIVE_MIN_ITERATIONS - 1,
          );
        }

        await sampleRuntimeHealth("final");
        report.page_errors = [...pageErrors];
        assertReport("renderer emitted no uncaught page errors", pageErrors.length === 0, {
          page_errors: pageErrors,
        });
        report.status = "passed";
      } catch (error) {
        thrownError = error;
        report.status = "failed";
        report.error = {
          name: error?.name || "Error",
          message: error?.message || String(error),
          stack: error?.stack || "",
        };
      } finally {
        if (installedToolkitId) {
          await debugEval(
            testApi,
            `return window.unchainAPI.deleteMcpToolkit(${JSON.stringify(
              installedToolkitId,
            )})`,
          ).catch(() => {});
        }
        report.finished_at = new Date().toISOString();
        report.page_errors = [...pageErrors];
        if (cell.workload === "mcp") {
          report.mcp_audit.records = readJsonLinesIfPresent(mcpAuditPath).length;
        }
        persistReport();
        await testInfo.attach(`Live long-run report ${cell.id}`, {
          path: reportPath,
          contentType: "application/json",
        });
        if (cell.workload === "mcp" && fs.existsSync(mcpAuditPath)) {
          await testInfo.attach(`MCP audit ${cell.id}`, {
            path: mcpAuditPath,
            contentType: "application/x-ndjson",
          });
        }
      }

      if (thrownError) throw thrownError;
    });
  });
}
