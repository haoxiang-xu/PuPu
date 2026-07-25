/* eslint-disable testing-library/prefer-screen-queries, jest/valid-title */

const fs = require("node:fs");
const path = require("node:path");

const { test, expect } = require("./fixtures/pupu_app");
const {
  LIVE_DURATION_MS,
  LIVE_GATE_CHECKPOINT,
  LIVE_MATRIX,
  LIVE_ROOT_MAX_ITERATIONS,
  LIVE_WAIT_COUNT,
  LIVE_WAIT_MILLISECONDS,
  LIVE_WORKLOAD_STEP_COUNT,
  WEB_SOURCES,
  buildFyiCommand,
  buildLiveRootPlan,
  buildLiveRootPrompt,
  codingArtifact,
  collectAttemptEvidence,
  computeLiveMcpTimeScale,
  expectedLiveRootToolCounts,
  liveCompletionMarker,
  liveFyiMarker,
  mcpLaneForCell,
  parseLiveToolArguments,
  postJsonOnce,
  redactSecrets,
  summarizeTokenEvidence,
  uniqueRootToolCallFrames,
  uniqueToolCallEvidence,
  validateAttemptIdentity,
  validateObservedRootPlanPrefix,
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

const consumeCredentialHandoff = () => {
  if (!enabled) return null;
  const handoffPath = String(
    process.env.PUPU_LIVE_PROVIDER_CREDENTIAL_FILE || "",
  ).trim();
  if (!handoffPath) {
    throw new Error("live provider credential handoff path is missing");
  }
  const resolved = path.resolve(handoffPath);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error("live credential handoff is not a file");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new Error("live credential handoff must be mode 0600");
  }
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8"));
  fs.rmSync(resolved, { force: true });
  delete process.env.PUPU_LIVE_PROVIDER_CREDENTIAL_FILE;
  if (
    parsed?.cell_id !== selectedCellId ||
    typeof parsed?.credential !== "string" ||
    !parsed.credential.trim()
  ) {
    throw new Error("live credential handoff identity is invalid");
  }
  return {
    cellId: parsed.cell_id,
    settingsKey: parsed.settings_key,
    credential: parsed.credential.trim(),
  };
};

const credentialHandoff = consumeCredentialHandoff();

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const fatalPollError = (message) => {
  const error = new Error(message);
  error.fatal = true;
  return error;
};

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
      if (error?.fatal) throw error;
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

const completeOnboarding = async (appWindow, timeoutMs = 10000) => {
  const boundedTimeoutMs = Math.min(timeoutMs, 10000);
  const startGate = appWindow.getByRole("button", {
    name: "Click anywhere to start",
  });
  if (
    await startGate
      .waitFor({ state: "visible", timeout: boundedTimeoutMs })
      .then(() => true)
      .catch(() => false)
  ) {
    await startGate.click({ timeout: boundedTimeoutMs });
  }
  const skip = appWindow.getByRole("button", {
    name: "Skip for now",
    exact: true,
  });
  if ((await skip.count()) > 0) {
    const dialog = appWindow.getByRole("dialog").filter({ has: skip });
    await skip.click({ timeout: boundedTimeoutMs });
    await expect(dialog).toHaveCount(0, { timeout: boundedTimeoutMs });
  }
};

const waitForBridge = (testApi, timeoutMs) =>
  poll(
    async () => {
      const state = await testApi.get("/debug/state");
      return state && typeof state.window_state === "object" ? state : null;
    },
    { timeoutMs, label: "renderer Test API bridge" },
  );

const reloadAndWait = async ({ appWindow, testApi, timeoutMs }) => {
  await appWindow.reload({ waitUntil: "domcontentloaded", timeout: timeoutMs });
  await appWindow.waitForLoadState("domcontentloaded");
  await completeOnboarding(appWindow, timeoutMs);
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

const numericEnv = (
  name,
  fallback,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) => {
  const raw = String(process.env[name] || "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const positiveNumberEnv = (name, fallback) => {
  const raw = String(process.env[name] || "").trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
};

const countFrames = (frames, type) =>
  frames.filter((frame) => frame?.type === type).length;

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
};

const sameJson = (left, right) =>
  JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));

const boundedAttemptEvidence = (evidence) => ({
  found: evidence.found,
  message_id: evidence.message_id,
  status: evidence.status,
  content: evidence.content,
  identity: evidence.identity,
  token_evidence: evidence.token_evidence,
  root_tool_evidence: evidence.root_tool_evidence,
  subagent_evidence: evidence.subagent_evidence,
});

for (const cell of LIVE_MATRIX) {
  test.describe(`${cell.workload} / ${cell.modelId}`, () => {
    test.skip(
      !enabled || selectedCellId !== cell.id,
      "live model long runs are opt-in and selected one matrix cell per process",
    );

    test(`live-single-root-long-run ${cell.id}`, async ({ pupu }, testInfo) => {
      const durationMs = numericEnv(
        "PUPU_LIVE_DURATION_MS",
        LIVE_DURATION_MS,
        { min: 1000, max: 6 * 60 * 60 * 1000 },
      );
      const phaseTimeoutMs = numericEnv(
        "PUPU_LIVE_PHASE_TIMEOUT_MS",
        durationMs + 12 * 60 * 1000,
        { min: 30000, max: 7 * 60 * 60 * 1000 },
      );
      const bridgeTimeoutMs = numericEnv(
        "PUPU_LIVE_BRIDGE_TIMEOUT_MS",
        90 * 1000,
        { min: 10000, max: 5 * 60 * 1000 },
      );
      const configuredTimeScale = positiveNumberEnv(
        "PUPU_LIVE_MCP_TIME_SCALE",
        computeLiveMcpTimeScale(durationMs),
      );
      test.setTimeout(phaseTimeoutMs + 8 * 60 * 1000);

      const credential =
        credentialHandoff?.cellId === cell.id
          ? credentialHandoff.credential
          : "";
      if (
        !credential ||
        credentialHandoff?.settingsKey !== cell.settingsKey
      ) {
        throw new Error(
          `missing isolated credential for ${cell.provider}; use the opt-in runner`,
        );
      }
      const pythonPath = String(process.env.PUPU_LIVE_PYTHON || "").trim();

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

      const rootPlan = buildLiveRootPlan({ cell, workspaceRoot });
      const expectedToolCounts = expectedLiveRootToolCounts({
        cell,
        workspaceRoot,
      });
      const expectedModelRequests = rootPlan.length + 1;
      const { appWindow, testApi, processLogs, pageErrors } = pupu;
      const report = {
        schema_version: 2,
        kind: "pupu-live-model-single-root-long-run-cell",
        cell_id: cell.id,
        workload: cell.workload,
        provider: cell.provider,
        model_id: cell.modelId,
        qualification:
          durationMs >= LIVE_DURATION_MS ? "agent-long-run" : "smoke-only",
        target_root_duration_ms: durationMs,
        root_attempts_expected: 1,
        root_tool_calls_expected: rootPlan.length,
        root_model_requests_expected: expectedModelRequests,
        root_max_iterations: LIVE_ROOT_MAX_ITERATIONS,
        in_run_waits_expected: LIVE_WAIT_COUNT,
        mcp_time_scale: configuredTimeScale,
        status: "running",
        started_at: new Date().toISOString(),
        finished_at: null,
        chat: null,
        attempts: [],
        controls: {
          fyi: null,
          renderer_sleep_simulation: null,
          confirmations: [],
          failure_cancel: null,
        },
        token_summary: null,
        tool_summary: null,
        subagent_summary: null,
        mcp_audit: {
          path: mcpAuditPath,
          records: 0,
        },
        assertions: [],
        forbidden_log_findings: [],
        page_errors: [],
        error: null,
      };
      const assertReport = (name, condition, details = {}) => {
        report.assertions.push({ name, ok: Boolean(condition), ...details });
        if (!condition) throw new Error(`assertion failed: ${name}`);
      };
      const ensureRootPlanPrefix = (evidence, label) => {
        const validation = validateObservedRootPlanPrefix({
          frames: evidence.root_frames,
          plan: rootPlan,
        });
        if (!validation.ok) {
          throw fatalPollError(
            `root deviated from the fixed plan during ${label}: ${validation.failures.join("; ")}`,
          );
        }
        return validation;
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
      let activeAttempt = null;
      let installedToolkitId = "";
      let thrownError = null;
      let rendererLogCursor = 0;
      let mainLogCursor = 0;
      let processLogCredentialLeak = false;
      const forbiddenFindings = new Set();
      const originalProcessLogPush = processLogs.push.bind(processLogs);
      const sanitizeProcessLog = (value) => {
        const text = String(value || "");
        if (credential && text.includes(credential)) {
          processLogCredentialLeak = true;
        }
        return credential
          ? text.split(credential).join("[REDACTED]")
          : text;
      };
      const initialProcessLog = processLogs.join("");
      processLogs.splice(0, processLogs.length);
      processLogs.push = (...entries) => {
        const combined = `${processLogs.join("")}${entries
          .map((entry) => String(entry || ""))
          .join("")}`;
        processLogs.splice(0, processLogs.length);
        return originalProcessLogPush(sanitizeProcessLog(combined));
      };
      processLogs.push(initialProcessLog);

      const sampleRuntimeHealth = async (label) => {
        const [rendererLogs, mainLogs] = await Promise.all([
          testApi.get(
            `/debug/logs?source=renderer&n=1000&since=${rendererLogCursor}`,
          ),
          testApi.get(
            `/debug/logs?source=main&n=1000&since=${mainLogCursor}`,
          ),
        ]);
        for (const entry of rendererLogs.entries || []) {
          rendererLogCursor = Math.max(
            rendererLogCursor,
            Number(entry.ts) || 0,
          );
        }
        for (const entry of mainLogs.entries || []) {
          mainLogCursor = Math.max(mainLogCursor, Number(entry.ts) || 0);
        }
        const text = [
          processLogs.join(""),
          ...(rendererLogs.entries || []).map((entry) => entry.msg || ""),
          ...(mainLogs.entries || []).map((entry) => entry.msg || ""),
        ].join("\n");
        if (
          processLogCredentialLeak ||
          (credential && text.includes(credential))
        ) {
          forbiddenFindings.add("live_provider_credential_leak");
        }
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
        const activation = await testApi.post(
          `/chats/${encodeURIComponent(chatId)}/activate`,
        );
        assertReport(
          "activation returned exact chat ownership",
          activation?.active_chat_id === chatId,
          { activation },
        );
        await poll(
          async () => {
            const [state, domChatId] = await Promise.all([
              testApi.get("/debug/state"),
              appWindow
                .locator("[data-chat-id]")
                .first()
                .getAttribute("data-chat-id")
                .catch(() => null),
            ]);
            return state?.active_chat_id === chatId && domChatId === chatId
              ? state
              : null;
          },
          { timeoutMs: bridgeTimeoutMs, label: `activate ${chatId}` },
        );
      };

      const getRun = (attempt) =>
        testApi.get(
          `/chats/${encodeURIComponent(chatId)}/runs/${encodeURIComponent(
            attempt.attempt_id,
          )}`,
        );

      const sendComposerCommand = async (command) => {
        await activateChat();
        const composer = appWindow.locator("textarea").first();
        await expect(composer).toBeVisible({ timeout: bridgeTimeoutMs });
        await composer.fill(command);
        await composer.press("Enter");
        await poll(async () => (await composer.inputValue()) === "", {
          timeoutMs: 10000,
          label: `composer clear for ${command.slice(0, 32)}`,
        });
      };

      const waitForFirstRootWait = (attempt) =>
        poll(
          async () => {
            const current = await getRun(attempt);
            if (current.status !== "running") {
              throw fatalPollError(
                `root terminated before first wait: ${current.status}`,
              );
            }
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            ensureRootPlanPrefix(
              collectAttemptEvidence({
                detail,
                attempt,
                expectedChatId: chatId,
              }),
              "first wait",
            );
            const records = readJsonLinesIfPresent(mcpAuditPath);
            const started = records.find(
              (record) =>
                record.tool === "soak_wait" &&
                record.lane === mcpLaneForCell(cell) &&
                record.status === "started",
            );
            return started || null;
          },
          {
            timeoutMs: Math.min(phaseTimeoutMs, 5 * 60 * 1000),
            label: "first in-run root wait",
          },
        );

      try {
        await completeOnboarding(appWindow, bridgeTimeoutMs);
        await waitForBridge(testApi, bridgeTimeoutMs);
        assertReport("MCP Python interpreter is present", Boolean(pythonPath));
        assertReport(
          "root max-iteration budget is fixed for one long run",
          process.env.UNCHAIN_MAX_ITERATIONS ===
            String(LIVE_ROOT_MAX_ITERATIONS),
          {
            configured: process.env.UNCHAIN_MAX_ITERATIONS || null,
            expected: LIVE_ROOT_MAX_ITERATIONS,
          },
        );
        const minimumTimeScale = computeLiveMcpTimeScale(durationMs);
        assertReport(
          "in-run wait scale can satisfy the requested root duration",
          configuredTimeScale + Number.EPSILON >= minimumTimeScale,
          {
            configured: configuredTimeScale,
            minimum: minimumTimeScale,
          },
        );

        const runtimeStatus = await poll(
          async () => {
            const status = await debugEval(
              testApi,
              "return window.unchainAPI.getStatus()",
            );
            return status?.ready ? status : null;
          },
          { timeoutMs: phaseTimeoutMs, label: "Unchain sidecar readiness" },
        );
        assertReport("Unchain sidecar is ready", runtimeStatus.ready);

        await debugEval(
          testApi,
          `
            const root = JSON.parse(localStorage.getItem("settings") || "{}");
            root.memory = {
              ...(root.memory || {}),
              enabled: false,
            };
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
              toolkits: [],
              tools: [],
            }));
            return { configured: true };
          `,
        );
        await reloadAndWait({
          appWindow,
          testApi,
          timeoutMs: bridgeTimeoutMs,
        });

        const catalog = await testApi.get("/catalog/models");
        const exactModel = (catalog.models || []).find(
          (model) => model.id === cell.modelId,
        );
        assertReport(
          `catalog exposes exact model ${cell.modelId}`,
          Boolean(exactModel),
        );

        const installPayload = buildMcpInstallPayload({
          pythonPath,
          fixturePath: MCP_FIXTURE_PATH,
          workspaceRoot,
          auditPath: mcpAuditPath,
          timeScale: configuredTimeScale,
        });
        const installed = await debugEval(
          testApi,
          `return window.unchainAPI.installMcpToolkit(${JSON.stringify(
            installPayload,
          )})`,
        );
        installedToolkitId = installed?.toolkit?.toolkitId || "";
        assertReport(
          "deterministic MCP fixture installed for in-run waits",
          installedToolkitId === MCP_TOOLKIT_ID,
          { installed_toolkit_id: installedToolkitId },
        );

        const created = await testApi.post("/chats", {
          title: `live-single-root-long-run-${cell.id}`,
          model: cell.modelId,
        });
        chatId = created.chat_id;
        report.chat = {
          chat_id: chatId,
          model_id: cell.modelId,
          execution_session_id: chatId,
          workspace_root: workspaceRoot,
          toolkit_ids: [MCP_TOOLKIT_ID, "core"],
        };
        await testApi.post(`/chats/${encodeURIComponent(chatId)}/model`, {
          model_id: cell.modelId,
        });
        await testApi.post(`/chats/${encodeURIComponent(chatId)}/toolkits`, {
          toolkit_ids: report.chat.toolkit_ids,
        });
        await activateChat();

        const emptyChatBeforeStart = await testApi.get(
          `/chats/${encodeURIComponent(chatId)}`,
        );
        assertReport(
          "new live chat has no pre-existing assistant attempt",
          !(emptyChatBeforeStart.messages || []).some(
            (message) => message?.role === "assistant",
          ),
        );
        const rootStartedAt = Date.now();
        let rootStartHttpAttemptCount = 0;
        const started = await postJsonOnce(
          testApi,
          `/chats/${encodeURIComponent(chatId)}/runs`,
          {
            text: buildLiveRootPrompt({ cell, workspaceRoot }),
          },
          () => {
            rootStartHttpAttemptCount += 1;
          },
        );
        const attempt = {
          phase: "single-root-long-run",
          chat_id: started.chat_id || null,
          execution_id: started.execution_id || null,
          attempt_id: started.attempt_id || null,
          status: started.status || "running",
          started_at: new Date(rootStartedAt).toISOString(),
          finished_at: null,
          duration_ms: null,
          message_id: started.message_id || null,
          transition_retries: 0,
          error: null,
          evidence: null,
        };
        activeAttempt = attempt;
        report.attempts.push(attempt);
        const inspectRootOwnership = (chatDetail) => {
          const assistantMessages = (chatDetail.messages || []).filter(
            (message) => message?.role === "assistant",
          );
          const attemptIds = new Set(
            assistantMessages
              .map((message) =>
                String(message?.meta?.attemptId || "").trim(),
              )
              .filter(Boolean),
          );
          const traceFrames = assistantMessages.flatMap((message) =>
            Array.isArray(message?.traceFrames)
              ? message.traceFrames
              : [],
          );
          return {
            attemptIds,
            streamStarts: traceFrames.filter(
              (frame) => frame?.type === "stream_started",
            ),
            runStarts: traceFrames.filter(
              (frame) => frame?.type === "run_started",
            ),
          };
        };
        const isOnlyInitialRoot = (ownership) =>
          ownership.attemptIds.size === 1 &&
          ownership.attemptIds.has(attempt.attempt_id) &&
          ownership.streamStarts.length === 1 &&
          ownership.streamStarts[0]?.run_id === attempt.attempt_id &&
          ownership.runStarts.length === 1 &&
          ownership.runStarts[0]?.payload?.run_id ===
            attempt.attempt_id;
        assertReport(
          "one root start returned exact chat/execution/attempt identity",
          attempt.chat_id === chatId &&
            attempt.execution_id === chatId &&
            typeof attempt.attempt_id === "string" &&
            attempt.attempt_id.length > 0,
          { attempt },
        );
        assertReport(
          "the harness issued one non-retried root mutation",
          rootStartHttpAttemptCount === 1 && report.attempts.length === 1,
          {
            root_start_http_attempt_count: rootStartHttpAttemptCount,
            root_attempt_count: report.attempts.length,
          },
        );
        await poll(
          async () => {
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const partial = collectAttemptEvidence({
              detail,
              attempt,
              expectedChatId: chatId,
            });
            ensureRootPlanPrefix(partial, "authoritative run start");
            return partial.root_frames.some(
              (frame) =>
                frame?.type === "run_started" &&
                frame?.payload?.run_id === attempt.attempt_id,
            )
              ? true
              : null;
          },
          {
            timeoutMs: bridgeTimeoutMs,
            label: "authoritative root run start",
          },
        );
        const rootAnchor = await getRun(attempt);
        attempt.message_id =
          attempt.message_id || rootAnchor?.message_id || null;
        assertReport(
          "root anchor includes one stable assistant message id",
          Boolean(attempt.message_id) &&
            rootAnchor?.attempt_id === attempt.attempt_id &&
            rootAnchor?.execution_id === chatId,
          { message_id: attempt.message_id },
        );
        const clearedCredential = await debugEval(
          testApi,
          `
            const root = JSON.parse(localStorage.getItem("settings") || "{}");
            if (root.model_providers && typeof root.model_providers === "object") {
              delete root.model_providers[${JSON.stringify(cell.settingsKey)}];
            }
            localStorage.setItem("settings", JSON.stringify(root));
            return {
              setting_present: Boolean(
                root.model_providers &&
                root.model_providers[${JSON.stringify(cell.settingsKey)}]
              ),
              serialized_contains_secret: JSON.stringify(root).includes(
                ${JSON.stringify(credential)}
              ),
            };
          `,
        );
        assertReport(
          "provider credential was cleared before any renderer reload",
          clearedCredential?.setting_present === false &&
            clearedCredential?.serialized_contains_secret === false,
          { cleared: true },
        );
        persistReport();

        const firstWait = await waitForFirstRootWait(attempt);
        const beforeControl = await getRun(attempt);
        assertReport(
          "root is still running inside its first tool wait",
          beforeControl?.status === "running" &&
            beforeControl?.attempt_id === attempt.attempt_id &&
            beforeControl?.execution_id === chatId,
          { before_control: beforeControl, first_wait: firstWait },
        );

        const fyiNonce = attempt.attempt_id;
        const fyiMarker = liveFyiMarker(cell, fyiNonce);
        await sendComposerCommand(buildFyiCommand(cell, fyiNonce));
        report.controls.fyi = {
          marker: fyiMarker,
          attempt_id: attempt.attempt_id,
          sent_at: new Date().toISOString(),
        };
        await poll(
          async () => {
            const current = await getRun(attempt);
            if (current.status !== "running") {
              throw fatalPollError(
                `root terminated before FYI resolution: ${current.status}`,
              );
            }
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const partial = collectAttemptEvidence({
              detail,
              attempt,
              expectedChatId: chatId,
            });
            ensureRootPlanPrefix(partial, "FYI injection");
            return partial.root_frames.some(
              (frame) =>
                frame?.type === "fyi_injected" &&
                Array.isArray(frame?.payload?.messages) &&
                frame.payload.messages.some(
                  (message) =>
                    message?.origin === "user" &&
                    String(message?.text || "").includes(fyiMarker),
                ),
            )
              ? partial
              : null;
          },
          {
            timeoutMs: Math.min(phaseTimeoutMs, 5 * 60 * 1000),
            label: "authoritative FYI injection into original root",
          },
        );
        assertReport(
          "FYI was resolved by the original root before reload",
          true,
          { marker: fyiMarker },
        );

        const confirmationSteps = rootPlan.filter((step) =>
          ["write", "web_fetch", "soak_gate"].includes(step.tool),
        );
        const delegateStepNumber = rootPlan.find(
          (step) => step.tool === "delegate_to_subagent",
        ).step;
        const firstPostDelegateWait = rootPlan.find(
          (step) =>
            step.step > delegateStepNumber && step.tool === "soak_wait",
        );
        const preReloadConfirmations = confirmationSteps.filter(
          (step) => step.step <= delegateStepNumber,
        );
        const postReloadConfirmations = confirmationSteps.filter(
          (step) => step.step > delegateStepNumber,
        );

        const approvePlannedStep = async (plannedStep) => {
          const chatRoot = appWindow.locator(`[data-chat-id="${chatId}"]`);
          const allow = chatRoot.getByRole("button", {
            name: "Allow once",
            exact: true,
          });
          const pending = await poll(
            async () => {
              const current = await getRun(attempt);
              if (current.status !== "running") {
                throw fatalPollError(
                  `root terminated before ${plannedStep.tool} confirmation: ${current.status}`,
                );
              }
              const detail = await testApi.get(
                `/chats/${encodeURIComponent(chatId)}`,
              );
              const partial = collectAttemptEvidence({
                detail,
                attempt,
                expectedChatId: chatId,
              });
              ensureRootPlanPrefix(
                partial,
                `${plannedStep.tool} confirmation`,
              );
              const calls = uniqueRootToolCallFrames(partial.root_frames);
              const candidate = calls[calls.length - 1];
              const confirmationFrame = partial.root_frames.find(
                (frame) =>
                  frame?.type === "tool_call" &&
                  frame?.payload?.call_id === candidate?.payload?.call_id &&
                  frame?.payload?.requires_confirmation === true,
              );
              return candidate &&
                confirmationFrame &&
                (await allow.isVisible().catch(() => false))
                ? { candidate, confirmationFrame, partial }
                : null;
            },
            {
              timeoutMs: phaseTimeoutMs,
              label: `${plannedStep.tool} live confirmation`,
            },
          );
          const observedArguments = parseLiveToolArguments(pending.candidate);
          assertReport(
            `confirmation ${plannedStep.step} matches the exact planned tool`,
            pending.candidate?.payload?.tool_name === plannedStep.tool &&
              sameJson(observedArguments, plannedStep.arguments),
            {
              expected_tool: plannedStep.tool,
              observed_tool: pending.candidate?.payload?.tool_name || null,
              expected_arguments: plannedStep.arguments,
              observed_arguments: observedArguments,
            },
          );
          const callId = pending.candidate.payload.call_id;
          const beforeApproval = await getRun(attempt);
          assertReport(
            `confirmation ${plannedStep.step} retained the original root`,
            beforeApproval?.status === "running" &&
              beforeApproval?.attempt_id === attempt.attempt_id &&
              beforeApproval?.execution_id === chatId &&
              (!attempt.message_id ||
                beforeApproval?.message_id === attempt.message_id),
            { before_approval: beforeApproval },
          );

          if (plannedStep.tool === "soak_gate") {
            const gateAuditsBefore = readJsonLinesIfPresent(
              mcpAuditPath,
            ).filter(
              (record) =>
                record.tool === "soak_gate" && record.status === "ok",
            );
            assertReport(
              "gate had not executed before explicit approval",
              gateAuditsBefore.length === 0,
            );
            const durablePending = await debugEval(
              testApi,
              `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
                session_id: chatId,
              })})`,
            );
            assertReport(
              "gate approval is live-only, not a durable resume",
              !durablePending || durablePending.status === "none",
              { durable_pending: durablePending || null },
            );
          }

          await allow.click({ timeout: bridgeTimeoutMs });
          const toolResult = await poll(
            async () => {
              const current = await getRun(attempt);
              if (current.status !== "running") {
                throw fatalPollError(
                  `root terminated before ${plannedStep.tool} result: ${current.status}`,
                );
              }
              const detail = await testApi.get(
                `/chats/${encodeURIComponent(chatId)}`,
              );
              const partial = collectAttemptEvidence({
                detail,
                attempt,
                expectedChatId: chatId,
              });
              ensureRootPlanPrefix(partial, `${plannedStep.tool} result`);
              return (
                partial.root_frames.find(
                  (frame) =>
                    frame?.type === "tool_result" &&
                    frame?.payload?.call_id === callId,
                ) || null
              );
            },
            {
              timeoutMs: Math.min(phaseTimeoutMs, 5 * 60 * 1000),
              label: `${plannedStep.tool} result after approval`,
            },
          );
          assertReport(
            `confirmation ${plannedStep.step} produced one successful result`,
            toolResult?.payload?.status === "success" &&
              Number(toolResult.seq || 0) >
                Number(pending.candidate.seq || 0),
            { call_id: callId, result_status: toolResult?.payload?.status },
          );
          report.controls.confirmations.push({
            step: plannedStep.step,
            tool: plannedStep.tool,
            call_id: callId,
            confirmation_id:
              pending.confirmationFrame.payload.confirmation_id || null,
            approved_at: new Date().toISOString(),
            durable: false,
          });
        };

        for (const plannedStep of preReloadConfirmations) {
          await approvePlannedStep(plannedStep);
        }

        const childrenBeforeReload = await poll(
          async () => {
            const current = await getRun(attempt);
            if (current.status !== "running") {
              throw fatalPollError(
                `root terminated before child join: ${current.status}`,
              );
            }
            const detail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const partial = collectAttemptEvidence({
              detail,
              attempt,
              expectedChatId: chatId,
            });
            ensureRootPlanPrefix(partial, "child join");
            const childMeta = Object.values(partial.subagent_meta_by_run_id);
            const audit = readJsonLinesIfPresent(mcpAuditPath);
            const activePostDelegateWait = audit.find(
              (record) =>
                record.tool === "soak_wait" &&
                record.status === "started" &&
                Number(record.tool_ordinal || 0) >=
                  Number(firstPostDelegateWait?.wait_index || 0) + 1 &&
                !audit.some(
                  (candidate) =>
                    candidate.tool === "soak_wait" &&
                    candidate.status === "ok" &&
                    candidate.call_ordinal === record.call_ordinal,
                ),
            );
            return childMeta.length === 3 &&
              childMeta.every((entry) => entry?.status === "completed") &&
              activePostDelegateWait
              ? { partial, activePostDelegateWait }
              : null;
          },
          {
            timeoutMs: phaseTimeoutMs,
            label: "worker and delegate join inside a later root wait",
          },
        );

        const runtimeEventIdsBeforeReloadByRun = Object.fromEntries(
          [
            [
              attempt.attempt_id,
              childrenBeforeReload.partial.root_frames,
            ],
            ...Object.entries(
              childrenBeforeReload.partial.child_frames_by_run_id,
            ),
          ].map(([runId, frames]) => [
            runId,
            frames
              .map((frame) => frame?.payload?.runtime_event_id)
              .filter(Boolean),
          ]),
        );
        const activeWaitBeforeReload =
          childrenBeforeReload.activePostDelegateWait;
        assertReport(
          "renderer detach begins during an active in-run quiet wait",
          Boolean(activeWaitBeforeReload),
          { active_wait_call: activeWaitBeforeReload?.call_ordinal || null },
        );
        const pendingBeforeReload = await debugEval(
          testApi,
          `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
            session_id: chatId,
          })})`,
        );
        assertReport(
          "renderer detach never crosses a durable interaction",
          !pendingBeforeReload || pendingBeforeReload.status === "none",
          { pending: pendingBeforeReload || null },
        );
        const sleepSimulationStartedAt = Date.now();
        const identityBeforeReload = {
          chat_id: chatId,
          execution_id: attempt.execution_id,
          attempt_id: attempt.attempt_id,
          message_id: attempt.message_id,
        };
        await reloadAndWait({
          appWindow,
          testApi,
          timeoutMs: bridgeTimeoutMs,
        });
        await activateChat();
        const afterReload = await getRun(attempt);
        const sleepSimulationFinishedAt = Date.now();
        assertReport(
          "renderer reload reattached the original running root",
          afterReload?.status === "running" &&
            afterReload?.attempt_id === attempt.attempt_id &&
            afterReload?.execution_id === chatId &&
            (!attempt.message_id ||
              afterReload?.message_id === attempt.message_id),
          { expected: identityBeforeReload, after_reload: afterReload },
        );
        const replayEventIdsByRun = await poll(
          async () => {
            const replayDetail = await testApi.get(
              `/chats/${encodeURIComponent(chatId)}`,
            );
            const replayEvidence = collectAttemptEvidence({
              detail: replayDetail,
              attempt,
              expectedChatId: chatId,
            });
            ensureRootPlanPrefix(replayEvidence, "renderer replay");
            const replayFramesByRun = {
              [attempt.attempt_id]: replayEvidence.root_frames,
              ...replayEvidence.child_frames_by_run_id,
            };
            const replayEventIdsByRun = Object.fromEntries(
              Object.entries(replayFramesByRun).map(([runId, frames]) => [
                runId,
                frames
                  .map((frame) => frame?.payload?.runtime_event_id)
                  .filter(Boolean),
              ]),
            );
            const priorEntries = Object.entries(
              runtimeEventIdsBeforeReloadByRun,
            );
            const duplicated = priorEntries.some(
              ([runId, priorEventIds]) =>
                priorEventIds.some(
                  (eventId) =>
                    (replayEventIdsByRun[runId] || []).filter(
                      (candidate) => candidate === eventId,
                    ).length > 1,
                ),
            );
            if (duplicated) {
              throw fatalPollError(
                "renderer replay duplicated a prior root or child event",
              );
            }
            const retained = priorEntries.every(
              ([runId, priorEventIds]) =>
                Array.isArray(replayEventIdsByRun[runId]) &&
                priorEventIds.every(
                  (eventId) =>
                    replayEventIdsByRun[runId].filter(
                      (candidate) => candidate === eventId,
                    ).length === 1,
                ),
            );
            return retained ? replayEventIdsByRun : null;
          },
          {
            timeoutMs: bridgeTimeoutMs,
            label: "root and child replay hydration",
          },
        );
        assertReport(
          "reload replay retained every prior root and child event exactly once",
          true,
          {
            prior_event_counts: Object.fromEntries(
              Object.entries(runtimeEventIdsBeforeReloadByRun).map(
                ([runId, eventIds]) => [runId, eventIds.length],
              ),
            ),
            replay_event_counts: Object.fromEntries(
              Object.entries(replayEventIdsByRun).map(
                ([runId, eventIds]) => [runId, eventIds.length],
              ),
            ),
          },
        );
        report.controls.renderer_sleep_simulation = {
          kind: "renderer-detach-after-child-join-during-root-run",
          actual_os_sleep: false,
          started_at: new Date(sleepSimulationStartedAt).toISOString(),
          finished_at: new Date(sleepSimulationFinishedAt).toISOString(),
          gap_ms: sleepSimulationFinishedAt - sleepSimulationStartedAt,
          root_identity: identityBeforeReload,
        };
        await sampleRuntimeHealth("after FYI, child join, and reload");
        persistReport();

        for (const plannedStep of postReloadConfirmations) {
          await approvePlannedStep(plannedStep);
        }
        persistReport();

        let nextHealthSample = Date.now();
        let nextPlanPrefixSample = Date.now();
        const terminal = await poll(
          async () => {
            if (Date.now() >= nextHealthSample) {
              await sampleRuntimeHealth("root-running");
              persistReport();
              nextHealthSample = Date.now() + 30000;
            }
            const current = await getRun(attempt);
            if (
              current.status !== "running" ||
              Date.now() >= nextPlanPrefixSample
            ) {
              const runningDetail = await testApi.get(
                `/chats/${encodeURIComponent(chatId)}`,
              );
              ensureRootPlanPrefix(
                collectAttemptEvidence({
                  detail: runningDetail,
                  attempt,
                  expectedChatId: chatId,
                }),
                "root completion wait",
              );
              nextPlanPrefixSample = Date.now() + 10000;
            }
            return current.status === "running" ? null : current;
          },
          {
            timeoutMs: phaseTimeoutMs,
            intervalMs: 1000,
            label: "single root completion",
          },
        );
        const rootFinishedAt = Date.now();
        attempt.status = terminal.status;
        attempt.finished_at = new Date(rootFinishedAt).toISOString();
        attempt.duration_ms = rootFinishedAt - rootStartedAt;
        attempt.message_id = terminal.message_id || attempt.message_id;
        attempt.error = terminal.error || null;
        assertReport(
          "the original root attempt completed",
          terminal.status === "completed",
          { terminal },
        );
        assertReport(
          "the root attempt itself reached the requested duration",
          attempt.duration_ms >= durationMs,
          {
            duration_ms: attempt.duration_ms,
            minimum_ms: durationMs,
          },
        );

        const inactiveRoot = await poll(
          async () => {
            const [state, chatDetail] = await Promise.all([
              testApi.get(
                `/debug/state?chat_id=${encodeURIComponent(chatId)}`,
              ),
              testApi.get(`/chats/${encodeURIComponent(chatId)}`),
            ]);
            const ownership = inspectRootOwnership(chatDetail);
            if (!isOnlyInitialRoot(ownership)) {
              throw fatalPollError(
                "a second root identity appeared while the initial root settled",
              );
            }
            return state?.is_streaming === false
              ? { detail: chatDetail, state }
              : null;
          },
          {
            timeoutMs: 10000,
            intervalMs: 250,
            label: "initial root inactive state",
          },
        );
        let detail = inactiveRoot.detail;
        const quietWindowStartedAt = Date.now();
        const quietWindowDurationMs = 10000;
        let quietWindowSamples = 0;
        while (
          Date.now() - quietWindowStartedAt <
          quietWindowDurationMs
        ) {
          const [state, chatDetail] = await Promise.all([
            testApi.get(
              `/debug/state?chat_id=${encodeURIComponent(chatId)}`,
            ),
            testApi.get(`/chats/${encodeURIComponent(chatId)}`),
          ]);
          const ownership = inspectRootOwnership(chatDetail);
          if (
            state?.is_streaming !== false ||
            !isOnlyInitialRoot(ownership)
          ) {
            throw fatalPollError(
              "a late stream or second root appeared after initial completion",
            );
          }
          detail = chatDetail;
          quietWindowSamples += 1;
          await sleep(500);
        }
        assertReport(
          "post-completion quiet window retained one inactive root",
          quietWindowSamples >= 10,
          {
            duration_ms: Date.now() - quietWindowStartedAt,
            samples: quietWindowSamples,
          },
        );
        const evidence = collectAttemptEvidence({
          detail,
          attempt,
          expectedChatId: chatId,
        });
        const identityFailures = validateAttemptIdentity({
          evidence,
          attempt,
          chatId,
        });
        assertReport(
          "persisted root kept exact chat/attempt/session identity",
          identityFailures.length === 0,
          { failures: identityFailures },
        );
        assertReport(
          "persisted request id equals the one accepted root attempt",
          evidence.identity.request_id === attempt.attempt_id,
          { identity: evidence.identity },
        );
        assertReport(
          "single root returned its completion and FYI markers",
          evidence.content.includes(
            liveCompletionMarker(cell, rootPlan.length),
          ) && evidence.content.includes(fyiMarker),
          { content: evidence.content },
        );
        assertReport(
          "chat retained the exact selected model without fallback",
          detail.model === cell.modelId &&
            evidence.token_evidence.model === cell.modelId,
          {
            persisted_model: detail.model,
            usage_model: evidence.token_evidence.model,
          },
        );

        const rootFrames = evidence.root_frames;
        const rootRunIds = new Set(
          rootFrames.map((frame) => frame?.run_id).filter(Boolean),
        );
        const streamStarts = rootFrames.filter(
          (frame) => frame?.type === "stream_started",
        );
        const runStarts = rootFrames.filter(
          (frame) => frame?.type === "run_started",
        );
        const doneFrames = rootFrames.filter(
          (frame) => frame?.type === "done",
        );
        const rootErrors = rootFrames.filter(
          (frame) => frame?.type === "error",
        );
        assertReport(
          "one stream start, one root start, and one root completion persisted",
          streamStarts.length === 1 &&
            runStarts.length === 1 &&
            doneFrames.length === 1 &&
            rootErrors.length === 0 &&
            streamStarts[0]?.payload?.thread_id === chatId &&
            runStarts[0]?.payload?.run_id === attempt.attempt_id,
          {
            stream_starts: streamStarts.length,
            run_starts: runStarts.length,
            done_frames: doneFrames.length,
            error_frames: rootErrors.length,
          },
        );
        assertReport(
          "every root frame stayed on the original attempt id",
          rootRunIds.size === 1 && rootRunIds.has(attempt.attempt_id),
          { root_run_ids: [...rootRunIds] },
        );
        const runtimeEventIds = rootFrames.map(
          (frame) => frame?.payload?.runtime_event_id,
        );
        const rootSeqs = rootFrames.map((frame) => Number(frame?.seq || 0));
        assertReport(
          "root replay contains unique runtime events in strict sequence",
          runtimeEventIds.every(Boolean) &&
            new Set(runtimeEventIds).size === runtimeEventIds.length &&
            rootSeqs.every(
              (seq, index) => index === 0 || seq > rootSeqs[index - 1],
            ),
          {
            frame_count: rootFrames.length,
            runtime_event_count: new Set(runtimeEventIds).size,
          },
        );
        const ownedAssistantMessages = (detail.messages || []).filter(
          (message) =>
            message?.role === "assistant" &&
            message?.meta?.attemptId === attempt.attempt_id,
        );
        const finalRootOwnership = inspectRootOwnership(detail);
        assertReport(
          "chat persisted one assistant owner for the one root attempt",
          ownedAssistantMessages.length === 1 &&
            ownedAssistantMessages[0]?.id === evidence.message_id &&
            isOnlyInitialRoot(finalRootOwnership),
          {
            owner_count: ownedAssistantMessages.length,
            owner_ids: ownedAssistantMessages.map((message) => message.id),
            persisted_attempt_ids: [
              ...finalRootOwnership.attemptIds,
            ],
            all_stream_start_count:
              finalRootOwnership.streamStarts.length,
            all_run_start_count: finalRootOwnership.runStarts.length,
          },
        );

        const rootToolCalls = uniqueToolCallEvidence(
          evidence.root_tool_evidence,
        );
        const rootToolCallFrames = uniqueRootToolCallFrames(rootFrames);
        const callIds = rootToolCallFrames.map(
          (frame) => frame?.payload?.call_id,
        );
        assertReport(
          "all planned root tools ran inside one attempt exactly once",
          rootToolCalls.length === rootPlan.length &&
            rootToolCallFrames.length === rootPlan.length &&
            callIds.every(Boolean) &&
            new Set(callIds).size === callIds.length,
          {
            observed: rootToolCallFrames.length,
            expected: rootPlan.length,
          },
        );
        for (const [index, plannedStep] of rootPlan.entries()) {
          const callFrame = rootToolCallFrames[index];
          const callId = callFrame?.payload?.call_id;
          const results = rootFrames.filter(
            (frame) =>
              frame?.type === "tool_result" &&
              frame?.payload?.call_id === callId,
          );
          const resultFrame = results[0];
          const nextCallFrame = rootToolCallFrames[index + 1];
          assertReport(
            `root step ${plannedStep.step} exact tool, args, and call/result order`,
            callFrame?.payload?.tool_name === plannedStep.tool &&
              sameJson(
                parseLiveToolArguments(callFrame),
                plannedStep.arguments,
              ) &&
              results.length === 1 &&
              resultFrame?.payload?.status === "success" &&
              Number(callFrame?.seq || 0) <
                Number(resultFrame?.seq || 0) &&
              (!nextCallFrame ||
                Number(resultFrame?.seq || 0) <
                  Number(nextCallFrame?.seq || 0)),
            {
              expected_tool: plannedStep.tool,
              observed_tool: callFrame?.payload?.tool_name || null,
              expected_arguments: plannedStep.arguments,
              observed_arguments: callFrame
                ? parseLiveToolArguments(callFrame)
                : null,
              result_count: results.length,
            },
          );
        }
        for (const [toolName, expectedCount] of Object.entries(
          expectedToolCounts,
        )) {
          assertReport(
            `root ${toolName} count is exact`,
            rootToolCalls.filter(
              (record) => record.tool_name === toolName,
            ).length === expectedCount,
            { expected: expectedCount },
          );
        }

        const modelRequestFrames = countFrames(rootFrames, "request_messages");
        const modelResponseFrames = countFrames(
          rootFrames,
          "response_received",
        );
        const iterationStartedFrames = countFrames(
          rootFrames,
          "iteration_started",
        );
        const rootRequestRecords = rootFrames.filter(
          (frame) => frame?.type === "request_messages",
        );
        const rootResponseRecords = rootFrames.filter(
          (frame) => frame?.type === "response_received",
        );
        assertReport(
          "root made one sequential provider request per tool plus final",
          modelRequestFrames === expectedModelRequests &&
            modelResponseFrames === expectedModelRequests &&
            iterationStartedFrames === expectedModelRequests,
          {
            request_messages: modelRequestFrames,
            response_received: modelResponseFrames,
            iteration_started: iterationStartedFrames,
            expected: expectedModelRequests,
          },
        );
        const rawRootModelId = cell.modelId.split(":").slice(1).join(":");
        const acceptedRootUsageModels = new Set([
          cell.modelId,
          rawRootModelId,
        ]);
        assertReport(
          "every root provider turn used the selected provider and model",
          rootRequestRecords.every(
            (frame) => frame?.payload?.provider === cell.provider,
          ) &&
            rootResponseRecords.every(
              (frame) =>
                acceptedRootUsageModels.has(
                  frame?.payload?.usage?.model,
                ) &&
                Number(frame?.payload?.usage?.consumed_tokens) > 0,
            ),
          {
            request_providers: [
              ...new Set(
                rootRequestRecords.map(
                  (frame) => frame?.payload?.provider,
                ),
              ),
            ],
            usage_models: [
              ...new Set(
                rootResponseRecords.map(
                  (frame) => frame?.payload?.usage?.model,
                ),
              ),
            ],
          },
        );
        const firstModelRequest = rootFrames.find(
          (frame) => frame?.type === "request_messages",
        );
        const exposedTools = new Set(
          firstModelRequest?.payload?.tool_names || [],
        );
        const plannedTools = new Set(
          rootPlan.map((step) => step.tool),
        );
        const allowedInfrastructureTools = new Set([
          "ask_user_question",
          "soak_probe",
          "delegate_to_subagent",
          "handoff_to_subagent",
          "spawn_worker_batch",
          "spawn_agent_thread",
          "send_agent_message",
          "wait_agent_messages",
          "close_agent_thread",
          "write_agent_board",
          "read_agent_board",
          "return_handoff_to_subagent",
          "return_to_parent",
        ]);
        const allowedExposedTools = new Set([
          ...plannedTools,
          ...allowedInfrastructureTools,
        ]);
        assertReport(
          "effective root inventory is the exact recipe plus fixed agent infrastructure",
          [...plannedTools].every((toolName) =>
            exposedTools.has(toolName),
          ) &&
            [...exposedTools].every(
              (toolName) => allowedExposedTools.has(toolName),
            ),
          {
            planned_tools: [...plannedTools].sort(),
            exposed_tools: [...exposedTools].sort(),
            allowed_tools: [...allowedExposedTools].sort(),
          },
        );
        assertReport(
          "the unknown FYI nonce was injected by the user into this root",
          rootFrames.some(
            (frame) =>
              frame?.type === "fyi_injected" &&
              Array.isArray(frame?.payload?.messages) &&
              frame.payload.messages.some(
                (message) =>
                  message?.origin === "user" &&
                  String(message?.text || "").includes(fyiMarker),
              ),
          ),
          { marker: fyiMarker },
        );

        const childFramesByRunId = evidence.child_frames_by_run_id;
        const childMetaByRunId = evidence.subagent_meta_by_run_id;
        const childRunIds = Object.keys(childFramesByRunId);
        const childModes = new Set(
          Object.values(childMetaByRunId).map((entry) => entry?.mode),
        );
        const childTemplates = new Set(
          Object.values(childMetaByRunId).map((entry) => entry?.template),
        );
        const allRootAndChildRuntimeEventIds = [
          ...runtimeEventIds,
          ...Object.values(childFramesByRunId)
            .flat()
            .map((frame) => frame?.payload?.runtime_event_id),
        ];
        assertReport(
          "runtime event IDs are globally unique across root and children",
          allRootAndChildRuntimeEventIds.every(Boolean) &&
            new Set(allRootAndChildRuntimeEventIds).size ===
              allRootAndChildRuntimeEventIds.length,
          {
            runtime_event_count:
              allRootAndChildRuntimeEventIds.length,
          },
        );
        assertReport(
          "one worker batch and one delegate produced exactly three children",
          childRunIds.length === 3 &&
            Object.keys(childMetaByRunId).length === 3 &&
            childModes.has("worker") &&
            childModes.has("delegate"),
          {
            child_run_ids: childRunIds,
            modes: [...childModes],
          },
        );
        assertReport(
          "all three distinct live subagent templates executed",
          ["live-observer-a", "live-observer-b", "live-observer-c"].every(
            (template) => childTemplates.has(template),
          ),
          { templates: [...childTemplates] },
        );
        const expectedChildByTemplate = {
          "live-observer-a": {
            mode: "worker",
            marker: `LIVE_CHILD_OK cell=${cell.id} observer=A`,
          },
          "live-observer-b": {
            mode: "worker",
            marker: `LIVE_CHILD_OK cell=${cell.id} observer=B`,
          },
          "live-observer-c": {
            mode: "delegate",
            marker: `LIVE_CHILD_OK cell=${cell.id} observer=C`,
          },
        };
        assertReport(
          "every child branch is linked to the original root and isolated",
          childRunIds.every((childRunId) => {
            const frames = childFramesByRunId[childRunId] || [];
            const meta = childMetaByRunId[childRunId] || {};
            const expectedChild = expectedChildByTemplate[meta.template];
            const lifecycleStarts = frames.filter(
              (frame) => frame?.type === "subagent_started",
            );
            const lifecycleCompletions = frames.filter(
              (frame) => frame?.type === "subagent_completed",
            );
            const lifecycle = [
              ...lifecycleStarts,
              ...lifecycleCompletions,
            ];
            const childRuntimeEventIds = frames.map(
              (frame) => frame?.payload?.runtime_event_id,
            );
            const childSeqs = frames.map((frame) =>
              Number(frame?.seq || 0),
            );
            const finalMessages = frames.filter(
              (frame) => frame?.type === "final_message",
            );
            const childResponses = frames.filter(
              (frame) => frame?.type === "response_received",
            );
            const childRequests = frames.filter(
              (frame) => frame?.type === "request_messages",
            );
            const rawModelId = cell.modelId.split(":").slice(1).join(":");
            const acceptedUsageModels = new Set([
              cell.modelId,
              rawModelId,
            ]);
            const boundaryStarts = lifecycleStarts.filter(
              (frame) =>
                frame?.payload?.template === meta.template &&
                frame?.payload?.mode === meta.mode,
            );
            const modelStarts = lifecycleStarts.filter(
              (frame) =>
                frame?.payload?.provider === cell.provider &&
                acceptedUsageModels.has(frame?.payload?.model),
            );
            const boundaryCompletions = lifecycleCompletions.filter(
              (frame) =>
                frame?.payload?.template === meta.template &&
                frame?.payload?.mode === meta.mode,
            );
            const modelCompletions = lifecycleCompletions.filter(
              (frame) =>
                acceptedUsageModels.has(
                  frame?.payload?.usage?.model,
                ) &&
                Number(
                  frame?.payload?.usage?.consumed_tokens,
                ) > 0,
            );
            const classifiedLifecycleIds = new Set(
              [
                ...boundaryStarts,
                ...modelStarts,
                ...modelCompletions,
                ...boundaryCompletions,
              ].map((frame) => frame?.payload?.runtime_event_id),
            );
            return (
              Boolean(expectedChild) &&
              childRunId !== attempt.attempt_id &&
              childRunId.startsWith(`${chatId}:`) &&
              frames.every((frame) => frame?.run_id === childRunId) &&
              meta.mode === expectedChild.mode &&
              meta.status === "completed" &&
              frames.every((frame) => frame?.type !== "tool_call") &&
              childRequests.length === 1 &&
              childRequests[0]?.payload?.provider === cell.provider &&
              Array.isArray(childRequests[0]?.payload?.tool_names) &&
              childRequests[0].payload.tool_names.includes("soak_probe") &&
              childRequests[0].payload.tool_names.every((toolName) =>
                [
                  "soak_probe",
                  "ask_user_question",
                  "return_to_parent",
                ].includes(toolName),
              ) &&
              childResponses.length === 1 &&
              acceptedUsageModels.has(
                childResponses[0]?.payload?.usage?.model,
              ) &&
              Number(
                childResponses[0]?.payload?.usage?.consumed_tokens,
              ) > 0 &&
              finalMessages.length === 1 &&
              String(finalMessages[0]?.payload?.content || "").trim() ===
                expectedChild.marker &&
              lifecycleStarts.length === 2 &&
              lifecycleCompletions.length === 2 &&
              boundaryStarts.length === 1 &&
              modelStarts.length === 1 &&
              boundaryCompletions.length === 1 &&
              modelCompletions.length === 1 &&
              classifiedLifecycleIds.size === 4 &&
              Number(boundaryStarts[0]?.seq || 0) <
                Number(modelStarts[0]?.seq || 0) &&
              Number(modelStarts[0]?.seq || 0) <
                Number(modelCompletions[0]?.seq || 0) &&
              Number(modelCompletions[0]?.seq || 0) <
                Number(boundaryCompletions[0]?.seq || 0) &&
              lifecycle.every(
                (frame) =>
                  frame?.payload?.root_run_id === attempt.attempt_id &&
                  frame?.payload?.child_run_id === childRunId,
              ) &&
              childRuntimeEventIds.every(Boolean) &&
              new Set(childRuntimeEventIds).size ===
                childRuntimeEventIds.length &&
              childSeqs.every(
                (seq, index) =>
                  index === 0 || seq > childSeqs[index - 1],
              )
            );
          }),
          { child_run_ids: childRunIds },
        );
        const latestChildTimestamp = Math.max(
          0,
          ...Object.values(childFramesByRunId)
            .flat()
            .map((frame) => Number(frame?.ts) || 0),
        );
        assertReport(
          "root completed only after all child activity joined",
          Number(doneFrames[0]?.ts || 0) >= latestChildTimestamp,
          {
            root_done_ts: doneFrames[0]?.ts || null,
            latest_child_ts: latestChildTimestamp,
          },
        );

        if (cell.workload === "coding") {
          const expectedFiles = Array.from(
            { length: LIVE_WORKLOAD_STEP_COUNT },
            (_, iteration) =>
              codingArtifact({ cell, iteration, workspaceRoot }),
          );
          for (const artifact of expectedFiles) {
            const artifactText = fs.existsSync(artifact.absolutePath)
              ? fs.readFileSync(artifact.absolutePath, "utf8")
              : "";
            assertReport(
              `coding artifact ${artifact.filename} is exact`,
              artifactText.trim() === artifact.marker,
            );
          }
          assertReport(
            "coding root left only its three expected artifacts",
            JSON.stringify(listRelativeFiles(workspaceRoot)) ===
              JSON.stringify(
                expectedFiles.map((artifact) => artifact.filename).sort(),
              ),
            {
              actual_files: listRelativeFiles(workspaceRoot),
            },
          );
        }

        if (cell.workload === "web") {
          const webCallFrames = rootToolCallFrames.filter(
            (frame) => frame?.payload?.tool_name === "web_fetch",
          );
          assertReport(
            "web root fetched and received evidence from all fixed sources",
            WEB_SOURCES.every((source, index) => {
              const callFrame = webCallFrames[index];
              const resultFrame = rootFrames.find(
                (frame) =>
                  frame?.type === "tool_result" &&
                  frame?.payload?.call_id ===
                    callFrame?.payload?.call_id,
              );
              const result = resultFrame?.payload?.result;
              let finalHost = "";
              let requestedHost = "";
              try {
                finalHost = new URL(result?.final_url || "").hostname.replace(
                  /^www\./,
                  "",
                );
                requestedHost = new URL(source.url).hostname.replace(
                  /^www\./,
                  "",
                );
              } catch (_) {
                finalHost = "";
              }
              return (
                parseLiveToolArguments(callFrame).url === source.url &&
                resultFrame?.payload?.status === "success" &&
                result?.ok === true &&
                Number(result?.status_code) >= 200 &&
                Number(result?.status_code) < 300 &&
                finalHost === requestedHost &&
                JSON.stringify(result).includes(source.evidence)
              );
            }),
            { sources: WEB_SOURCES.map((source) => source.url) },
          );
        }

        const mcpRecords = readJsonLinesIfPresent(mcpAuditPath);
        report.mcp_audit.records = mcpRecords.length;
        const lane = mcpLaneForCell(cell);
        const completedWaits = mcpRecords.filter(
          (record) =>
            record.lane === lane &&
            record.tool === "soak_wait" &&
            record.status === "ok",
        );
        const startedWaits = mcpRecords.filter(
          (record) =>
            record.lane === lane &&
            record.tool === "soak_wait" &&
            record.status === "started",
        );
        assertReport(
          "MCP audit proves every in-run wait started and completed once",
          startedWaits.length === LIVE_WAIT_COUNT &&
            completedWaits.length === LIVE_WAIT_COUNT,
          {
            started: startedWaits.length,
            completed: completedWaits.length,
            expected: LIVE_WAIT_COUNT,
          },
        );
        assertReport(
          "each audited wait used the fixed parameter and configured scale",
          completedWaits.every(
            (record) =>
              record.args?.milliseconds === LIVE_WAIT_MILLISECONDS &&
              record.detail?.time_scale === configuredTimeScale &&
              record.detail?.effective_milliseconds ===
                LIVE_WAIT_MILLISECONDS * configuredTimeScale,
          ),
        );
        assertReport(
          "MCP audit proves one live approval gate",
          mcpRecords.filter(
            (record) =>
              record.lane === lane &&
              record.tool === "soak_gate" &&
              record.status === "ok" &&
              record.args?.checkpoint === LIVE_GATE_CHECKPOINT,
          ).length === 1,
        );
        const checkpoints = mcpRecords.filter(
          (record) =>
            record.lane === lane &&
            record.tool === "soak_checkpoint" &&
            record.status === "ok",
        );
        assertReport(
          "every cell recorded three monotonic in-run checkpoints",
          checkpoints.length === 3 &&
            JSON.stringify(
              checkpoints.map((record) => record.args?.iteration),
            ) === JSON.stringify([0, 1, 2]),
          { iterations: checkpoints.map((record) => record.args?.iteration) },
        );
        const probes = mcpRecords.filter(
          (record) =>
            record.lane === lane &&
            record.tool === "soak_probe" &&
            record.status === "ok",
        );
        assertReport(
          "only the MCP workload used the three planned root probes",
          cell.workload === "mcp"
            ? probes.length === LIVE_WORKLOAD_STEP_COUNT &&
                JSON.stringify(
                  probes.map((record) => record.args?.iteration),
                ) === JSON.stringify([0, 1, 2])
            : probes.length === 0,
          { probe_count: probes.length },
        );
        const allowedAuditTools = new Set([
          "soak_wait",
          "soak_gate",
          "soak_checkpoint",
          ...(cell.workload === "mcp" ? ["soak_probe"] : []),
        ]);
        assertReport(
          "MCP audit contains no unplanned root or child tool",
          mcpRecords.every((record) => allowedAuditTools.has(record.tool)),
          {
            observed_tools: [
              ...new Set(mcpRecords.map((record) => record.tool)),
            ],
          },
        );

        attempt.evidence = boundedAttemptEvidence(evidence);
        report.token_summary = summarizeTokenEvidence([attempt]);
        report.tool_summary = {
          root_calls_by_name: Object.fromEntries(
            Object.keys(expectedToolCounts).map((toolName) => [
              toolName,
              rootToolCalls.filter(
                (record) => record.tool_name === toolName,
              ).length,
            ]),
          ),
          root_model_requests: modelRequestFrames,
        };
        report.subagent_summary = {
          child_runs: childRunIds.length,
          modes: [...childModes].sort(),
          templates: [...childTemplates].sort(),
        };
        assertReport(
          "single real-model root persisted aggregate token usage",
          report.token_summary.records_with_usage === 1 &&
            report.token_summary.consumed_tokens > 0,
          report.token_summary,
        );

        const finalPending = await debugEval(
          testApi,
          `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
            session_id: chatId,
          })})`,
        );
        assertReport(
          "no durable interaction or resume remains after completion",
          !finalPending || finalPending.status === "none",
          { final_pending: finalPending || null },
        );
        await sampleRuntimeHealth("final");
        report.page_errors = [...pageErrors];
        assertReport(
          "renderer emitted no uncaught page errors",
          pageErrors.length === 0,
          { page_errors: pageErrors },
        );
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
        if (
          report.status !== "passed" &&
          chatId &&
          activeAttempt?.attempt_id
        ) {
          const cancellation = {
            attempted: false,
            status_before: null,
            status_after: null,
            error: null,
          };
          try {
            const beforeCancel = await getRun(activeAttempt);
            cancellation.status_before = beforeCancel?.status || null;
            if (beforeCancel?.status === "running") {
              cancellation.attempted = true;
              await testApi.post(
                `/chats/${encodeURIComponent(chatId)}/runs/${encodeURIComponent(
                  activeAttempt.attempt_id,
                )}/cancel`,
                { reason: "live_long_run_harness_failure" },
              );
              const afterCancel = await poll(
                async () => {
                  const current = await getRun(activeAttempt);
                  return current?.status !== "running" ? current : null;
                },
                {
                  timeoutMs: 15000,
                  intervalMs: 250,
                  label: "failed live root cancellation",
                },
              );
              cancellation.status_after = afterCancel?.status || null;
            } else {
              cancellation.status_after = beforeCancel?.status || null;
            }
          } catch (cancelError) {
            cancellation.error =
              cancelError?.message || String(cancelError);
          }
          report.controls.failure_cancel = cancellation;
        }
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
        report.mcp_audit.records =
          readJsonLinesIfPresent(mcpAuditPath).length;
        persistReport();
        await testInfo.attach(`Live single-root report ${cell.id}`, {
          path: reportPath,
          contentType: "application/json",
        });
        if (fs.existsSync(mcpAuditPath)) {
          await testInfo.attach(`MCP audit ${cell.id}`, {
            path: mcpAuditPath,
            contentType: "application/x-ndjson",
          });
        }
        const joinedProcessLog = processLogs.join("");
        processLogs.splice(
          0,
          processLogs.length,
          sanitizeProcessLog(joinedProcessLog),
        );
      }

      if (thrownError) throw thrownError;
    });
  });
}
