/* eslint-disable testing-library/prefer-screen-queries, jest/valid-title */

const fs = require("node:fs");
const path = require("node:path");

const { test, expect } = require("./fixtures/pupu_app");
const {
  CUSTOM_MODEL_ID,
  CUSTOM_PROVIDER_SLUG,
  LANES,
  MCP_TOOLKIT_ID,
  buildCustomProviderDefinition,
  buildMcpInstallPayload,
  forbiddenRuntimeLogFindings,
  parseJsonLines,
} = require("../scripts/test-api/deterministic-soak-lib.cjs");
const {
  buildAgentLongRunPrompt,
  expectedAgentLongRunChildRuns,
  expectedAgentLongRunToolCounts,
  resolveAgentLongRunProfile,
  validateAgentLongRunAuditEvidence,
} = require("../scripts/test-api/single-agent-long-run-lib.cjs");
const {
  createFakeOpenAIResponsesServer,
} = require("../scripts/test-api/fixtures/fake_openai_responses_server.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_FIXTURE_PATH = path.join(
  REPO_ROOT,
  "scripts/test-api/fixtures/deterministic_mcp_server.py",
);
const enabled = process.env.PUPU_SINGLE_AGENT_LONG_RUN === "1";
const profile = resolveAgentLongRunProfile(
  process.env.PUPU_AGENT_LONG_RUN_PROFILE || "quick",
);

test.skip(
  !enabled,
  "single-root-execution long run is opt-in; use scripts/test-api/run-single-agent-long-run.mjs",
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const poll = async (
  callback,
  { timeoutMs = 30000, intervalMs = 200, label = "condition" } = {},
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

const writeJson = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const assistantForAttempt = (detail, attemptId) =>
  (detail?.messages || []).find(
    (message) =>
      message?.role === "assistant" &&
      message?.meta?.attemptId === attemptId,
  ) || null;

test("three parallel root agents remain one attempt while tools and subagents run", async ({
  pupu,
}, testInfo) => {
  test.setTimeout(profile.testTimeoutMs);

  const { appWindow, testApi, processLogs, pageErrors } = pupu;
  const reportDir = path.resolve(
    process.env.PUPU_AGENT_LONG_RUN_REPORT_DIR ||
      testInfo.outputPath("single-agent-long-run"),
  );
  const reportPath = path.resolve(
    process.env.PUPU_AGENT_LONG_RUN_REPORT_PATH ||
      path.join(reportDir, "agent-long-run-report.json"),
  );
  const fakeAuditPath = path.resolve(
    process.env.PUPU_AGENT_LONG_RUN_FAKE_AUDIT_PATH ||
      path.join(reportDir, "fake-llm-audit.jsonl"),
  );
  const mcpAuditPath = path.resolve(
    process.env.PUPU_AGENT_LONG_RUN_MCP_AUDIT_PATH ||
      path.join(reportDir, "mcp-audit.jsonl"),
  );
  const pythonPath = String(
    process.env.PUPU_AGENT_LONG_RUN_PYTHON || "",
  ).trim();
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    schema_version: 1,
    kind: "pupu-single-root-execution-long-run",
    profile: profile.name,
    qualification: profile.name === "full" ? "agent-long-run" : "smoke-only",
    status: "running",
    root_tool_calls_per_agent: profile.rootToolCalls,
    root_max_iterations: profile.rootMaxIterations,
    minimum_root_duration_ms: profile.minimumRootDurationMs,
    parallel_root_agents: LANES.length,
    started_at: new Date().toISOString(),
    finished_at: null,
    chats: [],
    controls: {
      fyi: [],
      btw: [],
      renderer_sleep_simulation: null,
      live_approval: [],
    },
    audits: {
      fake_llm: { path: fakeAuditPath, records: 0 },
      mcp: { path: mcpAuditPath, records: 0 },
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
  const persistReport = () => writeJson(reportPath, report);

  let fakeServer = null;
  let installedToolkitId = "";
  let thrownError = null;
  const chatsByLane = new Map();

  const sampleRuntimeHealth = async (label) => {
    const [rendererLogs, mainLogs] = await Promise.all([
      testApi.get("/debug/logs?source=renderer&n=1000"),
      testApi.get("/debug/logs?source=main&n=1000"),
    ]);
    const findings = forbiddenRuntimeLogFindings(
      [
        processLogs.join(""),
        ...(rendererLogs.entries || []).map((entry) => entry.msg || ""),
        ...(mainLogs.entries || []).map((entry) => entry.msg || ""),
      ].join("\n"),
    );
    report.forbidden_log_findings = [
      ...new Set([...report.forbidden_log_findings, ...findings]),
    ];
    assertReport(`runtime health ${label}`, findings.length === 0, {
      findings,
    });
  };

  const activateChat = async (chat) => {
    const activation = await testApi.post(
      `/chats/${encodeURIComponent(chat.chat_id)}/activate`,
    );
    assertReport(
      `lane ${chat.lane} activation returned exact ownership`,
      activation?.active_chat_id === chat.chat_id,
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
        return state?.active_chat_id === chat.chat_id &&
          domChatId === chat.chat_id
          ? state
          : null;
      },
      {
        timeoutMs: profile.bridgeTimeoutMs,
        label: `lane ${chat.lane} exact active chat`,
      },
    );
  };

  const getRun = (chat) =>
    testApi.get(
      `/chats/${encodeURIComponent(chat.chat_id)}/runs/${encodeURIComponent(
        chat.attempt.attempt_id,
      )}`,
    );

  const sendComposerCommand = async (chat, command) => {
    await activateChat(chat);
    const composer = appWindow.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: profile.bridgeTimeoutMs });
    await composer.fill(command);
    await composer.press("Enter");
    await poll(async () => (await composer.inputValue()) === "", {
      timeoutMs: 10000,
      label: `composer clear for ${command}`,
    });
  };

  const waitForInitialWait = (lane) =>
    poll(
      () => {
        const records = readJsonLinesIfPresent(mcpAuditPath);
        return records.some(
          (record) =>
            record.lane === lane &&
            record.tool === "soak_wait" &&
            record.status === "started",
        )
          ? true
          : null;
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${lane} first in-run wait`,
      },
    );

  const approveLiveGate = async (chat) => {
    await activateChat(chat);
    const chatRoot = appWindow.locator(`[data-chat-id="${chat.chat_id}"]`);
    const allow = chatRoot.getByRole("button", {
      name: "Allow once",
      exact: true,
    });
    await expect(allow).toBeVisible({ timeout: profile.phaseTimeoutMs });

    const before = await getRun(chat);
    assertReport(
      `lane ${chat.lane} live pause retained the original attempt`,
      before?.attempt_id === chat.attempt.attempt_id &&
        before?.execution_id === chat.chat_id &&
        before?.status === "running",
      { before },
    );
    const durablePending = await debugEval(
      testApi,
      `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
        session_id: chat.chat_id,
      })})`,
    );
    assertReport(
      `lane ${chat.lane} approval is live-only, not a durable resume`,
      !durablePending || durablePending.status === "none",
      { durable_pending: durablePending || null },
    );

    await allow.click({ timeout: profile.bridgeTimeoutMs });
    await expect(allow).toHaveCount(0, { timeout: profile.bridgeTimeoutMs });
    report.controls.live_approval.push({
      lane: chat.lane,
      chat_id: chat.chat_id,
      attempt_id: chat.attempt.attempt_id,
      approved_at: new Date().toISOString(),
      durable: false,
    });
  };

  try {
    await completeOnboarding(appWindow, profile.bridgeTimeoutMs);
    await waitForBridge(testApi, profile.bridgeTimeoutMs);
    assertReport("MCP Python interpreter was provided", Boolean(pythonPath));
    assertReport(
      "root max-iteration budget is the single-run profile budget",
      process.env.UNCHAIN_MAX_ITERATIONS === String(profile.rootMaxIterations),
      {
        configured: process.env.UNCHAIN_MAX_ITERATIONS || null,
        expected: profile.rootMaxIterations,
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
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: "Unchain sidecar readiness",
      },
    );
    assertReport("Unchain sidecar is ready", runtimeStatus.ready);

    fakeServer = createFakeOpenAIResponsesServer({ auditPath: fakeAuditPath });
    const fakeReady = await fakeServer.start();
    const customProvider = buildCustomProviderDefinition(fakeReady.baseUrl);
    await debugEval(
      testApi,
      `
        const root = JSON.parse(localStorage.getItem("settings") || "{}");
        const providers = root.model_providers && typeof root.model_providers === "object"
          ? root.model_providers
          : {};
        root.feature_flags = {
          ...(root.feature_flags || {}),
          enable_custom_model_providers: true,
        };
        root.memory = {
          ...(root.memory || {}),
          enabled: false,
        };
        root.model_providers = {
          ...providers,
          custom_providers: [${JSON.stringify(customProvider)}],
          custom_provider_secrets: {
            ...(providers.custom_provider_secrets || {}),
            ${JSON.stringify(CUSTOM_PROVIDER_SLUG)}: "pupu-fixture-key",
          },
        };
        localStorage.setItem("settings", JSON.stringify(root));
        localStorage.setItem("toolkit_auto_approve", JSON.stringify({
          version: 2,
          toolkits: ["core"],
          tools: [],
        }));
        return { configured: true };
      `,
    );
    await reloadAndWait({
      appWindow,
      testApi,
      timeoutMs: profile.bridgeTimeoutMs,
    });

    const providerProbe = await debugEval(
      testApi,
      `return window.unchainAPI.testCustomProvider(${JSON.stringify(
        customProvider,
      )}, "pupu-fixture-key")`,
    );
    assertReport("fake provider passes the real connection probe", providerProbe?.ok);

    const installPayload = buildMcpInstallPayload({
      pythonPath,
      fixturePath: MCP_FIXTURE_PATH,
      workspaceRoot: REPO_ROOT,
      auditPath: mcpAuditPath,
      timeScale: Number(
        process.env.PUPU_AGENT_LONG_RUN_TIME_SCALE || profile.timeScale,
      ),
    });
    const installed = await debugEval(
      testApi,
      `return window.unchainAPI.installMcpToolkit(${JSON.stringify(
        installPayload,
      )})`,
    );
    installedToolkitId = installed?.toolkit?.toolkitId || "";
    assertReport(
      "deterministic MCP installed with its exact toolkit id",
      installedToolkitId === MCP_TOOLKIT_ID,
      { installed_toolkit_id: installedToolkitId },
    );

    for (const lane of LANES) {
      const created = await testApi.post("/chats", {
        title: `single-agent-long-run-${lane}`,
        model: CUSTOM_MODEL_ID,
      });
      const chat = {
        lane,
        chat_id: created.chat_id,
        attempt: null,
        detail: null,
      };
      chatsByLane.set(lane, chat);
      report.chats.push(chat);
      await testApi.post(`/chats/${encodeURIComponent(chat.chat_id)}/model`, {
        model_id: CUSTOM_MODEL_ID,
      });
      await testApi.post(
        `/chats/${encodeURIComponent(chat.chat_id)}/toolkits`,
        { toolkit_ids: [MCP_TOOLKIT_ID] },
      );
    }

    for (const lane of LANES) {
      const chat = chatsByLane.get(lane);
      await activateChat(chat);
      const startedAt = Date.now();
      let transitionRetries = 0;
      const started = await poll(
        async () => {
          try {
            return await testApi.post(
              `/chats/${encodeURIComponent(chat.chat_id)}/runs`,
              {
                text: buildAgentLongRunPrompt({
                  lane,
                  rootToolCalls: profile.rootToolCalls,
                }),
              },
            );
          } catch (error) {
            const code = error?.body?.error?.code || error?.code || "";
            if (
              code === "durable_interaction_in_progress" ||
              error?.message === "This chat is restoring an interrupted run."
            ) {
              transitionRetries += 1;
              return null;
            }
            throw error;
          }
        },
        {
          timeoutMs: profile.bridgeTimeoutMs,
          label: `lane ${lane} start transition`,
        },
      );
      chat.attempt = {
        chat_id: started.chat_id || null,
        execution_id: started.execution_id || null,
        attempt_id: started.attempt_id || null,
        started_at: new Date(startedAt).toISOString(),
        finished_at: null,
        duration_ms: null,
        status: started.status || "running",
        transition_retries: transitionRetries,
      };
      assertReport(
        `lane ${lane} started exactly one root identity`,
        chat.attempt.chat_id === chat.chat_id &&
          chat.attempt.execution_id === chat.chat_id &&
          typeof chat.attempt.attempt_id === "string" &&
          chat.attempt.attempt_id.length > 0,
        { attempt: chat.attempt },
      );
    }
    assertReport(
      "three parallel roots have three distinct attempts",
      new Set(
        report.chats.map((chat) => chat.attempt?.attempt_id).filter(Boolean),
      ).size === LANES.length,
    );
    persistReport();

    await Promise.all(LANES.map((lane) => waitForInitialWait(lane)));
    assertReport(
      "all three roots overlapped inside their first quiet tool wait",
      (
        await Promise.all(report.chats.map((chat) => getRun(chat)))
      ).every((run) => run.status === "running"),
    );

    for (const lane of LANES) {
      const chat = chatsByLane.get(lane);
      await sendComposerCommand(
        chat,
        `/fyi AGENT_LONG_RUN_FYI lane=${lane}`,
      );
      report.controls.fyi.push({
        lane,
        attempt_id: chat.attempt.attempt_id,
        sent_at: new Date().toISOString(),
      });
      await sendComposerCommand(chat, `/btw SOAK_BTW lane=${lane}`);
      report.controls.btw.push({
        lane,
        root_attempt_id: chat.attempt.attempt_id,
        sent_at: new Date().toISOString(),
      });
    }
    await poll(
      () =>
        LANES.every((lane) =>
          fakeServer.requests.some(
            (record) => record.label === "btw" && record.lane === lane,
          ),
        )
          ? true
          : null,
      {
        timeoutMs: profile.bridgeTimeoutMs,
        label: "three BTW side-agent responses",
      },
    );

    const sleepSimulationStartedAt = Date.now();
    const identitiesBeforeReload = Object.fromEntries(
      report.chats.map((chat) => [
        chat.lane,
        {
          chat_id: chat.chat_id,
          execution_id: chat.attempt.execution_id,
          attempt_id: chat.attempt.attempt_id,
        },
      ]),
    );
    await sleep(profile.name === "full" ? 5000 : 1000);
    await reloadAndWait({
      appWindow,
      testApi,
      timeoutMs: profile.bridgeTimeoutMs,
    });
    const sleepSimulationFinishedAt = Date.now();
    for (const chat of report.chats) {
      await activateChat(chat);
      const afterReload = await getRun(chat);
      assertReport(
        `lane ${chat.lane} renderer reattached the original root attempt`,
        afterReload?.attempt_id === chat.attempt.attempt_id &&
          afterReload?.execution_id === chat.chat_id &&
          afterReload?.status === "running",
        {
          expected: identitiesBeforeReload[chat.lane],
          after_reload: afterReload,
        },
      );
    }
    report.controls.renderer_sleep_simulation = {
      kind: "renderer-detach-quiet-io-gap",
      actual_os_sleep: false,
      started_at: new Date(sleepSimulationStartedAt).toISOString(),
      finished_at: new Date(sleepSimulationFinishedAt).toISOString(),
      gap_ms: sleepSimulationFinishedAt - sleepSimulationStartedAt,
      root_identities: identitiesBeforeReload,
    };
    await sampleRuntimeHealth("after renderer sleep simulation");
    persistReport();

    for (const lane of LANES) {
      await approveLiveGate(chatsByLane.get(lane));
    }

    await Promise.all(
      report.chats.map(async (chat) => {
        const terminal = await poll(
          async () => {
            const current = await getRun(chat);
            return current.status === "running" ? null : current;
          },
          {
            timeoutMs: profile.phaseTimeoutMs,
            label: `lane ${chat.lane} single root completion`,
          },
        );
        const finishedAt = Date.now();
        chat.attempt.finished_at = new Date(finishedAt).toISOString();
        chat.attempt.duration_ms =
          finishedAt - new Date(chat.attempt.started_at).getTime();
        chat.attempt.status = terminal.status;
        chat.attempt.message_id = terminal.message_id || null;
        chat.attempt.content = terminal.content || "";
        assertReport(
          `lane ${chat.lane} original root attempt completed`,
          terminal.status === "completed",
          { terminal },
        );
        assertReport(
          `lane ${chat.lane} root itself exceeded the profile duration`,
          chat.attempt.duration_ms >= profile.minimumRootDurationMs,
          {
            duration_ms: chat.attempt.duration_ms,
            minimum_ms: profile.minimumRootDurationMs,
          },
        );
      }),
    );

    const fakeRecords = readJsonLinesIfPresent(fakeAuditPath);
    const mcpRecords = readJsonLinesIfPresent(mcpAuditPath);
    report.audits.fake_llm.records = fakeRecords.length;
    report.audits.mcp.records = mcpRecords.length;
    const auditFailures = validateAgentLongRunAuditEvidence({
      fakeRecords,
      mcpRecords,
      rootToolCalls: profile.rootToolCalls,
    });
    assertReport(
      "fake LLM and MCP audits prove every root step exactly once",
      auditFailures.length === 0,
      { failures: auditFailures },
    );

    const expectedToolCounts = expectedAgentLongRunToolCounts(
      profile.rootToolCalls,
    );
    for (const chat of report.chats) {
      const detail = await testApi.get(
        `/chats/${encodeURIComponent(chat.chat_id)}`,
      );
      chat.detail = detail;
      const assistant = assistantForAttempt(
        detail,
        chat.attempt.attempt_id,
      );
      assertReport(
        `lane ${chat.lane} persisted one assistant for the original attempt`,
        Boolean(assistant),
      );
      const meta = assistant?.meta || {};
      assertReport(
        `lane ${chat.lane} persisted exact root identity without resume`,
        meta.attemptId === chat.attempt.attempt_id &&
          meta.requestId === chat.attempt.attempt_id &&
          meta.executionSessionId === chat.chat_id,
        { meta },
      );
      assertReport(
        `lane ${chat.lane} final came from the long root state machine`,
        String(assistant?.content || "").includes(
          `AGENT_LONG_RUN_OK lane=${chat.lane} root_tool_calls=${profile.rootToolCalls} saw_fyi=true`,
        ),
        { content: assistant?.content || "" },
      );

      const rootFrames = Array.isArray(assistant?.traceFrames)
        ? assistant.traceFrames
        : [];
      const rootRunIds = new Set(
        rootFrames.map((frame) => frame?.run_id).filter(Boolean),
      );
      const streamStarts = rootFrames.filter(
        (frame) => frame?.type === "stream_started",
      );
      const runStarts = rootFrames.filter(
        (frame) => frame?.type === "run_started",
      );
      const rootToolFrames = rootFrames.filter(
        (frame) => frame?.type === "tool_call",
      );
      const rootToolFrameByCallId = new Map();
      for (const frame of rootToolFrames) {
        const callId = String(frame?.payload?.call_id || "").trim();
        if (callId && !rootToolFrameByCallId.has(callId)) {
          rootToolFrameByCallId.set(callId, frame);
        }
      }
      const uniqueRootToolFrames = [...rootToolFrameByCallId.values()];
      const rootDoneFrames = rootFrames.filter(
        (frame) => frame?.type === "done",
      );
      assertReport(
        `lane ${chat.lane} has one root stream and one root run start`,
        streamStarts.length === 1 &&
          runStarts.length === 1 &&
          rootDoneFrames.length === 1 &&
          streamStarts[0]?.payload?.thread_id === chat.chat_id &&
          runStarts[0]?.payload?.run_id === chat.attempt.attempt_id,
        {
          stream_starts: streamStarts.length,
          run_starts: runStarts.length,
          done_frames: rootDoneFrames.length,
        },
      );
      assertReport(
        `lane ${chat.lane} every root frame kept the original attempt id`,
        rootRunIds.size === 1 &&
          rootRunIds.has(chat.attempt.attempt_id),
        { root_run_ids: [...rootRunIds] },
      );
      assertReport(
        `lane ${chat.lane} persisted every root tool call in one attempt`,
        uniqueRootToolFrames.length === profile.rootToolCalls,
        {
          observed_frames: rootToolFrames.length,
          observed_unique_calls: uniqueRootToolFrames.length,
          expected: profile.rootToolCalls,
        },
      );
      for (const [toolName, expectedCount] of Object.entries(
        expectedToolCounts,
      )) {
        assertReport(
          `lane ${chat.lane} root ${toolName} count is exact`,
          uniqueRootToolFrames.filter(
            (frame) => frame?.payload?.tool_name === toolName,
          ).length === expectedCount,
          { expected: expectedCount },
        );
      }

      const subagentFrames =
        assistant?.subagentFrames &&
        typeof assistant.subagentFrames === "object"
          ? assistant.subagentFrames
          : {};
      const subagentMeta =
        assistant?.subagentMetaByRunId &&
        typeof assistant.subagentMetaByRunId === "object"
          ? assistant.subagentMetaByRunId
          : {};
      const childRunIds = Object.keys(subagentFrames);
      const expectedChildRuns = expectedAgentLongRunChildRuns(
        profile.rootToolCalls,
      );
      assertReport(
        `lane ${chat.lane} retained every expected child run`,
        childRunIds.length === expectedChildRuns &&
          Object.keys(subagentMeta).length === expectedChildRuns,
        {
          observed: childRunIds.length,
          expected: expectedChildRuns,
        },
      );
      assertReport(
        `lane ${chat.lane} child branches are isolated from root frames`,
        childRunIds.every(
          (childRunId) =>
            childRunId !== chat.attempt.attempt_id &&
            childRunId.startsWith(`${chat.chat_id}:`) &&
            (subagentFrames[childRunId] || []).every(
              (frame) => frame?.run_id === childRunId,
            ),
        ),
        { child_run_ids: childRunIds },
      );
      const modes = new Set(
        Object.values(subagentMeta).map((entry) => entry?.mode),
      );
      const templates = new Set(
        Object.values(subagentMeta).map((entry) => entry?.template),
      );
      assertReport(
        `lane ${chat.lane} exercised worker and delegate subagents`,
        modes.has("worker") && modes.has("delegate"),
        { modes: [...modes] },
      );
      assertReport(
        `lane ${chat.lane} exercised all three subagent templates`,
        ["soak-explore-a", "soak-explore-b", "soak-explore-c"].every(
          (template) => templates.has(template),
        ),
        { templates: [...templates] },
      );
      const latestChildTimestamp = Math.max(
        0,
        ...Object.values(subagentFrames)
          .flat()
          .map((frame) => Number(frame?.ts) || 0),
      );
      assertReport(
        `lane ${chat.lane} root completed only after child activity joined`,
        Number(rootDoneFrames[0]?.ts || 0) >= latestChildTimestamp,
        {
          root_done_ts: rootDoneFrames[0]?.ts || null,
          latest_child_ts: latestChildTimestamp,
        },
      );

      const serialized = JSON.stringify(detail);
      for (const otherLane of LANES.filter(
        (lane) => lane !== chat.lane,
      )) {
        assertReport(
          `lane ${chat.lane} contains no lane ${otherLane} content`,
          !serialized.includes(`lane=${otherLane}`),
        );
      }
    }

    assertReport(
      "the harness started exactly one root attempt per chat",
      report.chats.every((chat) => Boolean(chat.attempt)) &&
        report.chats.length === LANES.length,
      { root_attempt_count: report.chats.length },
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
    if (installedToolkitId) {
      await debugEval(
        testApi,
        `return window.unchainAPI.deleteMcpToolkit(${JSON.stringify(
          installedToolkitId,
        )})`,
      ).catch(() => {});
    }
    if (fakeServer) await fakeServer.stop().catch(() => {});
    report.finished_at = new Date().toISOString();
    report.page_errors = [...pageErrors];
    report.audits.fake_llm.records =
      readJsonLinesIfPresent(fakeAuditPath).length;
    report.audits.mcp.records = readJsonLinesIfPresent(mcpAuditPath).length;
    persistReport();
    await testInfo.attach("Single root execution long-run report", {
      path: reportPath,
      contentType: "application/json",
    });
    if (fs.existsSync(fakeAuditPath)) {
      await testInfo.attach("Single-agent fake LLM audit", {
        path: fakeAuditPath,
        contentType: "application/x-ndjson",
      });
    }
    if (fs.existsSync(mcpAuditPath)) {
      await testInfo.attach("Single-agent MCP audit", {
        path: mcpAuditPath,
        contentType: "application/x-ndjson",
      });
    }
  }

  if (thrownError) throw thrownError;
});
