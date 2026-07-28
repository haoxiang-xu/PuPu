const fs = require("node:fs");
const path = require("node:path");

const { test, expect } = require("./fixtures/pupu_app");
const {
  CUSTOM_MODEL_ID,
  CUSTOM_PROVIDER_SLUG,
  LANES,
  MCP_TOOLKIT_ID,
  SOAK_AGENT_MAX_ITERATIONS,
  buildCustomProviderDefinition,
  buildMcpInstallPayload,
  buildSoakPrompt,
  forbiddenRuntimeLogFindings,
  parseJsonLines,
  resolveSoakProfile,
  validateAuditEvidence,
  validateChatIsolation,
  validateMultiAgentAuditEvidence,
} = require("../scripts/test-api/deterministic-soak-lib.cjs");
const {
  createFakeOpenAIResponsesServer,
} = require("../scripts/test-api/fixtures/fake_openai_responses_server.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const MCP_FIXTURE_PATH = path.join(
  REPO_ROOT,
  "scripts/test-api/fixtures/deterministic_mcp_server.py",
);
const enabled = process.env.PUPU_DETERMINISTIC_SOAK === "1";
const multiAgentOnly = process.env.PUPU_SOAK_MULTI_AGENT_ONLY === "1";
const profile = resolveSoakProfile(process.env.PUPU_SOAK_PROFILE || "quick");

test.skip(
  !enabled,
  "deterministic soak is opt-in; use scripts/test-api/run-deterministic-soak.mjs",
);

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const matchesTestApiError = (
  error,
  { status, code, isolatedWorldMessage = "" },
) => {
  const observedCode = error?.body?.error?.code || error?.code || "";
  if (error?.status === status && observedCode === code) return true;
  return (
    Boolean(isolatedWorldMessage) &&
    error?.status === 500 &&
    observedCode === "handler_error" &&
    error?.message === isolatedWorldMessage
  );
};

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

const readJsonlIfPresent = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return parseJsonLines(fs.readFileSync(filePath, "utf8"));
};

const waitForTestBridge = async (testApi, timeoutMs) =>
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
  const state = await waitForTestBridge(testApi, timeoutMs);
  await completeOnboarding(appWindow, timeoutMs);
  await poll(
    async () =>
      appWindow
        .locator("[data-chat-id]")
        .first()
        .getAttribute("data-chat-id")
        .catch(() => null),
    { timeoutMs, label: "Chat React surface after reload" },
  );
  return state;
};

const completeOnboarding = async (appWindow, timeoutMs = 10000) => {
  const boundedTimeoutMs = Math.min(timeoutMs, 10000);
  const startGate = appWindow.getByRole("button", {
    name: "Click anywhere to start",
  });
  const gateVisible = await startGate
    .waitFor({ state: "visible", timeout: boundedTimeoutMs })
    .then(() => true)
    .catch(() => false);
  if (gateVisible) {
    await startGate.click({ timeout: boundedTimeoutMs });
    await startGate
      .waitFor({ state: "hidden", timeout: boundedTimeoutMs })
      .catch(() => {});
  }
  const skip = appWindow.getByRole("button", {
    name: "Skip for now",
    exact: true,
  });
  if ((await skip.count()) > 0) {
    const setupDialog = appWindow.getByRole("dialog").filter({ has: skip });
    await expect(setupDialog).toHaveCount(1, { timeout: boundedTimeoutMs });
    await skip.click({ timeout: boundedTimeoutMs });
    // Modal keeps its full-screen pointer interceptor mounted for the 260 ms
    // exit animation. Do not report the app ready until that exact setup
    // dialog is physically gone.
    await expect(setupDialog).toHaveCount(0, { timeout: boundedTimeoutMs });
  }
};

const serializedMessageContent = (detail) =>
  JSON.stringify(detail?.messages || []);

test("three-chat deterministic long-run preserves exact ownership across control paths", async ({
  pupu,
}, testInfo) => {
  test.setTimeout(profile.testTimeoutMs);

  const { appWindow, testApi, processLogs, pageErrors } = pupu;
  const reportDir = path.resolve(
    process.env.PUPU_SOAK_REPORT_DIR ||
      testInfo.outputPath("deterministic-soak"),
  );
  const reportPath = path.resolve(
    process.env.PUPU_SOAK_REPORT_PATH ||
      path.join(reportDir, "soak-report.json"),
  );
  const fakeAuditPath = path.resolve(
    process.env.PUPU_FAKE_LLM_AUDIT_PATH ||
      path.join(reportDir, "fake-llm-audit.jsonl"),
  );
  const mcpAuditPath = path.resolve(
    process.env.PUPU_SOAK_AUDIT_PATH || path.join(reportDir, "mcp-audit.jsonl"),
  );
  const pythonPath = process.env.PUPU_SOAK_PYTHON || "";
  fs.mkdirSync(reportDir, { recursive: true });

  const report = {
    schema_version: 1,
    kind: "pupu-deterministic-three-chat-soak",
    profile: profile.name,
    mode: multiAgentOnly ? "multi-agent-only" : "full-control-paths",
    status: "running",
    target_duration_ms: profile.targetDurationMs,
    duration_tolerance_ms: profile.durationToleranceMs,
    started_at: new Date().toISOString(),
    soak_started_at: null,
    soak_finished_at: null,
    soak_duration_ms: null,
    reload_count: 0,
    steady_iterations: 0,
    agent_max_iterations: SOAK_AGENT_MAX_ITERATIONS,
    assertions: [],
    control_timeline: [],
    chats: [],
    audits: {
      fake_llm: { path: fakeAuditPath, records: 0 },
      mcp: { path: mcpAuditPath, records: 0 },
    },
    forbidden_log_findings: [],
    page_errors: [],
    error: null,
  };
  const assertion = (name, details = {}) => {
    report.assertions.push({ name, ok: true, ...details });
  };
  const assertTrue = (name, value, details = {}) => {
    expect(Boolean(value), name).toBe(true);
    assertion(name, details);
  };

  let fakeServer = null;
  let installedToolkitId = "";
  let thrownError = null;
  const chatsByLane = new Map();
  const accumulatedForbiddenFindings = new Set();

  const sampleRuntimeHealth = async (label) => {
    const [rendererLogs, mainLogs] = await Promise.all([
      testApi.get("/debug/logs?source=renderer&n=1000"),
      testApi.get("/debug/logs?source=main&n=1000"),
    ]);
    const sampledText = [
      processLogs.join(""),
      ...(rendererLogs.entries || []).map((entry) => entry.msg || ""),
      ...(mainLogs.entries || []).map((entry) => entry.msg || ""),
    ].join("\n");
    const findings = forbiddenRuntimeLogFindings(sampledText);
    for (const finding of findings) accumulatedForbiddenFindings.add(finding);
    report.forbidden_log_findings = [...accumulatedForbiddenFindings];
    if (findings.length) {
      throw new Error(
        `forbidden runtime log during ${label}: ${findings.join(" | ")}`,
      );
    }
  };

  const captureControlState = async (label, details = {}) => {
    const state = await testApi.get("/debug/state").catch(() => null);
    const domChatId = await appWindow
      .locator("[data-chat-id]")
      .first()
      .getAttribute("data-chat-id")
      .catch(() => null);
    const composerText = await appWindow
      .locator("textarea")
      .first()
      .inputValue()
      .catch(() => null);
    const localState = await appWindow
      .evaluate(() => {
        const raw = localStorage.getItem("pupu.queued_turn_outbox.v1") || "";
        let outbox = null;
        try {
          outbox = raw ? JSON.parse(raw) : null;
        } catch (_) {
          outbox = { parse_error: true, raw: raw.slice(0, 1000) };
        }
        const queuePile = document.querySelector(
          '[role="group"][aria-label="Queued messages"]',
        );
        return {
          outbox,
          queue_pile_text: queuePile?.textContent || "",
        };
      })
      .catch(() => ({ outbox: null, queue_pile_text: "" }));
    const fakeRequestTail = (fakeServer?.requests || [])
      .slice(-12)
      .map((entry) => ({
        ordinal: entry.ordinal,
        label: entry.label,
        lane: entry.lane,
        phase: entry.phase,
        child_outcome: entry.child_outcome,
        previous_response_id: entry.body?.previous_response_id || "",
        input_preview: JSON.stringify(entry.body?.input || []).slice(0, 1200),
      }));
    const shouldCaptureRuntimeLogs = [
      "after-wait-reload",
      "after-wait-completion",
      "queued-successor-completed",
      "test-failure",
    ].includes(label);
    const runtimeLogTail = shouldCaptureRuntimeLogs
      ? await Promise.all([
          testApi.get("/debug/logs?source=renderer&n=1000"),
          testApi.get("/debug/logs?source=main&n=1000"),
        ]).then(([rendererLogs, mainLogs]) =>
          [
            ...(rendererLogs.entries || []).map((entry) => ({
              source: "renderer",
              ...entry,
            })),
            ...(mainLogs.entries || []).map((entry) => ({
              source: "main",
              ...entry,
            })),
          ]
            .filter((entry) =>
              /queue|relay|lease|stream|execution|durable|error|fail/i.test(
                entry.msg || "",
              ),
            )
            .sort((left, right) => Number(left.ts || 0) - Number(right.ts || 0))
            .slice(-120),
        )
      : [];
    report.control_timeline.push({
      at: new Date().toISOString(),
      label,
      active_chat_id: state?.active_chat_id || null,
      dom_chat_id: domChatId,
      composer_text: composerText,
      queue_outbox: localState.outbox,
      queue_pile_text: localState.queue_pile_text,
      fake_request_tail: fakeRequestTail,
      ...(shouldCaptureRuntimeLogs ? { runtime_log_tail: runtimeLogTail } : {}),
      ...details,
    });
  };

  const reloadAndAudit = async (label) => {
    const state = await reloadAndWait({
      appWindow,
      testApi,
      timeoutMs: profile.bridgeTimeoutMs,
    });
    report.reload_count += 1;
    await sampleRuntimeHealth(`reload:${label}`);
    return state;
  };

  const activateChat = async (chat) => {
    const activation = await testApi.post(
      `/chats/${encodeURIComponent(chat.chat_id)}/activate`,
    );
    if (
      activation?.active_chat_id !== chat.chat_id ||
      typeof activation?.node_id !== "string" ||
      !activation.node_id
    ) {
      throw new Error(
        `activate lane ${chat.lane} returned a non-exact owner: ${JSON.stringify(activation)}`,
      );
    }

    let lastObservation = null;
    try {
      await poll(
        async () => {
          const state = await testApi.get("/debug/state");
          const domChatId = await appWindow
            .locator("[data-chat-id]")
            .first()
            .getAttribute("data-chat-id")
            .catch(() => null);
          lastObservation = {
            expected_chat_id: chat.chat_id,
            storage_active_chat_id: state?.active_chat_id || null,
            dom_chat_id: domChatId,
            route: state?.route || "",
          };
          return state.active_chat_id === chat.chat_id &&
            domChatId === chat.chat_id
            ? lastObservation
            : null;
        },
        {
          timeoutMs: profile.bridgeTimeoutMs,
          label: `activate lane ${chat.lane} in storage and React surface`,
        },
      );
    } catch (error) {
      const knownChats = await testApi.get("/chats").catch(() => null);
      throw new Error(
        `${error.message}; activation=${JSON.stringify(activation)}; last_observation=${JSON.stringify(lastObservation)}; known_chats=${JSON.stringify(knownChats)}`,
        { cause: error },
      );
    }
  };

  const startRun = async (chat, phase, iteration) => {
    await activateChat(chat);
    const prompt = buildSoakPrompt({ lane: chat.lane, phase, iteration });
    const startedAt = Date.now();
    let transitionRetries = 0;
    const started = await poll(
      async () => {
        try {
          return await testApi.post(
            `/chats/${encodeURIComponent(chat.chat_id)}/runs`,
            { text: prompt },
          );
        } catch (error) {
          const transitionCode = error?.body?.error?.code || error?.code || "";
          // Custom Error fields are stripped when a renderer handler rejects
          // across Electron's isolated-world bridge, leaving only this exact
          // status/code/message tuple at the HTTP Test API boundary.
          const isExactTransition = matchesTestApiError(error, {
            status: 409,
            code: "durable_interaction_in_progress",
            isolatedWorldMessage: "This chat is restoring an interrupted run.",
          });
          if (isExactTransition) {
            transitionRetries += 1;
            return null;
          }
          return {
            __startError: new Error(
              `start run failed: ${JSON.stringify({
                status: error?.status || null,
                code: transitionCode || null,
                message: error?.message || null,
              })}`,
              { cause: error },
            ),
          };
        }
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${chat.lane} ${phase} terminal cleanup`,
      },
    );
    if (started?.__startError) throw started.__startError;
    assertTrue(
      `lane ${chat.lane} ${phase} received exact run identity`,
      started?.chat_id === chat.chat_id &&
        typeof started?.attempt_id === "string" &&
        started.attempt_id &&
        typeof started?.execution_id === "string" &&
        started.execution_id,
    );
    const attempt = {
      lane: chat.lane,
      phase,
      iteration,
      chat_id: chat.chat_id,
      execution_id: started.execution_id,
      attempt_id: started.attempt_id,
      status: started.status || "running",
      transition_retries: transitionRetries,
      started_at: startedAt,
      finished_at: null,
    };
    chat.attempts.push(attempt);
    return attempt;
  };

  const getRun = (attempt) =>
    testApi.get(
      `/chats/${encodeURIComponent(attempt.chat_id)}/runs/${encodeURIComponent(attempt.attempt_id)}`,
    );

  const getPendingInteraction = (attempt) =>
    debugEval(
      testApi,
      `return window.unchainAPI.getPendingInteraction(${JSON.stringify({
        session_id: attempt.execution_id,
      })})`,
    );

  const waitForRunning = async (attempt) =>
    poll(
      async () => {
        const snapshot = await getRun(attempt);
        if (snapshot.status === "running") return snapshot;
        if (["failed", "cancelled", "interrupted"].includes(snapshot.status)) {
          throw new Error(
            `lane ${attempt.lane} ${attempt.phase} ended early: ${JSON.stringify(snapshot)}`,
          );
        }
        return null;
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${attempt.lane} ${attempt.phase} running`,
      },
    );

  const waitForCompleted = async (
    attempt,
    { activate = true, rejectPendingRootInteraction = false } = {},
  ) => {
    if (activate) await activateChat(chatsByLane.get(attempt.lane));
    const snapshot = await poll(
      async () => {
        if (rejectPendingRootInteraction) {
          const pending = await getPendingInteraction(attempt);
          if (pending && pending.status !== "none") {
            throw new Error(
              `child boundary leaked into root interaction UI for lane ${attempt.lane} ${attempt.phase}: ${JSON.stringify(pending)}`,
            );
          }
        }
        const current = await getRun(attempt);
        return current.status === "running" ? null : current;
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${attempt.lane} ${attempt.phase} completion`,
      },
    );
    attempt.status = snapshot.status;
    attempt.finished_at = Date.now();
    attempt.message_id = snapshot.message_id || null;
    attempt.content = snapshot.content || "";
    assertTrue(
      `lane ${attempt.lane} ${attempt.phase} completed`,
      snapshot.status === "completed",
      { status: snapshot.status },
    );
    assertTrue(
      `lane ${attempt.lane} ${attempt.phase} retained its own final marker`,
      String(snapshot.content || "").includes(`lane=${attempt.lane}`),
    );
    return { ...snapshot, lane: attempt.lane };
  };

  const startParallel = async (phase, iteration) => {
    const attempts = [];
    for (const lane of LANES) {
      attempts.push(await startRun(chatsByLane.get(lane), phase, iteration));
    }
    const attemptIds = attempts.map((attempt) => attempt.attempt_id);
    const executionIds = attempts.map((attempt) => attempt.execution_id);
    assertTrue(
      `${phase} uses three unique attempt ids`,
      new Set(attemptIds).size === LANES.length,
    );
    assertTrue(
      `${phase} uses three isolated execution ids`,
      new Set(executionIds).size === LANES.length,
    );
    return attempts;
  };

  const waitParallel = async (attempts, options = {}) => {
    const results = [];
    try {
      for (const attempt of attempts) {
        results.push(await waitForCompleted(attempt, options));
      }
      return results;
    } finally {
      const phases = [...new Set(attempts.map((attempt) => attempt.phase))];
      await sampleRuntimeHealth(
        `waitParallel:${phases.join(",") || "unknown"}`,
      );
    }
  };

  const runParallel = async (phase, iteration, options = {}) => {
    const attempts = await startParallel(phase, iteration);
    return waitParallel(attempts, options);
  };

  const sendComposerCommand = async (chat, command) => {
    await activateChat(chat);
    const composer = appWindow.locator("textarea").first();
    await expect(composer).toBeVisible({ timeout: profile.bridgeTimeoutMs });
    await captureControlState("composer-before-fill", {
      lane: chat.lane,
      intended_chat_id: chat.chat_id,
      command,
    });
    await composer.fill(command);
    await poll(async () => (await composer.inputValue()) === command, {
      timeoutMs: 10000,
      label: `composer contains ${command}`,
    });
    await captureControlState("composer-after-fill", {
      lane: chat.lane,
      intended_chat_id: chat.chat_id,
      command,
    });
    await composer.press("Enter");
    await poll(async () => (await composer.inputValue()) === "", {
      timeoutMs: 10000,
      label: `composer clear for ${command}`,
    });
    await captureControlState("composer-after-submit", {
      lane: chat.lane,
      intended_chat_id: chat.chat_id,
      command,
    });
  };

  const waitForQueueResult = async (chat) => {
    await activateChat(chat);
    return poll(
      async () => {
        const state = await testApi.get(
          `/debug/state?chat_id=${encodeURIComponent(chat.chat_id)}`,
        );
        const detail = await testApi.get(
          `/chats/${encodeURIComponent(chat.chat_id)}`,
        );
        const hasQueue = serializedMessageContent(detail).includes(
          `SOAK_QUEUE_OK lane=${chat.lane}`,
        );
        return !state.is_streaming && hasQueue ? detail : null;
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${chat.lane} queued follow-up`,
      },
    );
  };

  const waitForPendingGate = async (attempt) =>
    poll(
      async () => {
        try {
          const pending = await getPendingInteraction(attempt);
          return pending && pending.status !== "none" ? pending : null;
        } catch (_) {
          return null;
        }
      },
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: `lane ${attempt.lane} durable gate`,
      },
    );

  const approveVisibleGate = async (attempt, expectedPending) => {
    const chat = chatsByLane.get(attempt.lane);
    await activateChat(chat);
    const pendingBeforeApproval = await waitForPendingGate(attempt);
    const expectedPendingId =
      expectedPending?.interaction_id || expectedPending?.confirmation_id || "";
    const pendingBeforeApprovalId =
      pendingBeforeApproval?.interaction_id ||
      pendingBeforeApproval?.confirmation_id ||
      "";
    assertTrue(
      `lane ${attempt.lane} retained its exact durable gate after reload`,
      Boolean(expectedPendingId) && pendingBeforeApprovalId === expectedPendingId,
      { expected_pending: expectedPending, actual_pending: pendingBeforeApproval },
    );
    const expectedToolCall =
      pendingBeforeApproval?.presentation?.tool_call ||
      expectedPending?.presentation?.tool_call ||
      {};
    const expectedCallId =
      typeof expectedToolCall.call_id === "string"
        ? expectedToolCall.call_id.trim()
        : "";
    const expectedSessionId =
      pendingBeforeApproval?.session_id ||
      expectedPending?.session_id ||
      attempt.execution_id;
    assertTrue(
      `lane ${attempt.lane} durable gate exposes its exact call identity`,
      Boolean(expectedCallId),
      {
        expected_pending: expectedPending,
        actual_pending: pendingBeforeApproval,
      },
    );

    let stableReplaySignature = "";
    let stableReplayObservations = 0;
    const runBeforeClick = await poll(
      async () => {
        const run = await getRun(attempt);
        const debug = run?.confirmation_debug || {};
        const pendingRef = debug.pending_requests_ref?.[expectedPendingId];
        const pendingRendered =
          debug.pending_requests_rendered?.[expectedPendingId];
        const uiRef = debug.ui_state_ref?.[expectedPendingId];
        const uiRendered = debug.ui_state_rendered?.[expectedPendingId];
        const runtime = debug.runtime || {};
        const traceFrames = Array.isArray(debug.trace_frames)
          ? debug.trace_frames
          : [];
        const matchingTraceFrames = traceFrames.filter(
          (frame) => frame?.call_id === expectedCallId,
        );
        const bareFrameIndex = matchingTraceFrames.findIndex(
          (frame) =>
            !frame.confirmation_id && frame.requires_confirmation !== true,
        );
        const confirmationFrameIndex = matchingTraceFrames.findIndex(
          (frame) =>
            frame.confirmation_id === expectedPendingId &&
            frame.requires_confirmation === true,
        );
        const requestMatches = (request) =>
          request?.confirmation_id === expectedPendingId &&
          request?.call_id === expectedCallId &&
          request?.session_id === expectedSessionId;
        const uiIsIdleAndUnresolved = (uiState) =>
          uiState?.status === "idle" && uiState?.resolved === false;
        const replayIsStable =
          requestMatches(pendingRef) &&
          requestMatches(pendingRendered) &&
          uiIsIdleAndUnresolved(uiRef) &&
          uiIsIdleAndUnresolved(uiRendered) &&
          runtime.confirmation_id_by_call_id?.[expectedCallId] ===
            expectedPendingId &&
          runtime.confirmation_call_id_by_id?.[expectedPendingId] ===
            expectedCallId &&
          runtime.session_id_by_confirmation_id?.[expectedPendingId] ===
            expectedSessionId &&
          bareFrameIndex >= 0 &&
          confirmationFrameIndex > bareFrameIndex;
        if (!replayIsStable) {
          stableReplaySignature = "";
          stableReplayObservations = 0;
          return null;
        }

        const replaySignature = JSON.stringify(matchingTraceFrames);
        if (replaySignature === stableReplaySignature) {
          stableReplayObservations += 1;
        } else {
          stableReplaySignature = replaySignature;
          stableReplayObservations = 1;
        }
        return stableReplayObservations >= 2 ? run : null;
      },
      {
        timeoutMs: profile.bridgeTimeoutMs,
        label: `lane ${attempt.lane} stable durable-gate replay`,
      },
    );
    await captureControlState("gate-before-click", {
      lane: attempt.lane,
      intended_chat_id: chat.chat_id,
      attempt_id: attempt.attempt_id,
      confirmation_debug: runBeforeClick.confirmation_debug || null,
    });
    let allow = null;
    try {
      const chatRoot = appWindow.locator(`[data-chat-id="${chat.chat_id}"]`);
      await expect(chatRoot).toHaveCount(1, {
        timeout: profile.bridgeTimeoutMs,
      });
      allow = chatRoot.getByRole("button", {
        name: "Allow once",
        exact: true,
      });
      await expect(allow).toHaveCount(1, { timeout: profile.bridgeTimeoutMs });
      await expect(allow).toBeVisible({ timeout: profile.bridgeTimeoutMs });
      await expect(allow).toBeEnabled({ timeout: profile.bridgeTimeoutMs });
      await allow.click({ timeout: profile.bridgeTimeoutMs });
    } catch (error) {
      const runAfterFailure = await getRun(attempt).catch(() => null);
      const detailAfterFailure = await testApi
        .get(`/chats/${encodeURIComponent(chat.chat_id)}`)
        .catch(() => null);
      await captureControlState("gate-click-failure", {
        lane: attempt.lane,
        intended_chat_id: chat.chat_id,
        attempt_id: attempt.attempt_id,
        confirmation_debug: runAfterFailure?.confirmation_debug || null,
        message_tail: (detailAfterFailure?.messages || []).slice(-3),
        error: error?.message || String(error),
      });
      throw error;
    }
    await expect(allow).toHaveCount(0, { timeout: profile.bridgeTimeoutMs });
    const acceptedPending = await poll(
      async () => {
        const pending = await getPendingInteraction(attempt).catch(() => null);
        return pending && ["receipt_recorded", "none"].includes(pending.status)
          ? pending
          : null;
      },
      {
        timeoutMs: profile.bridgeTimeoutMs,
        label: `lane ${attempt.lane} exact gate receipt`,
      },
    );
    if (acceptedPending.status === "receipt_recorded") {
      const acceptedPendingId =
        acceptedPending.interaction_id || acceptedPending.confirmation_id || "";
      assertTrue(
        `lane ${attempt.lane} recorded the exact durable gate receipt`,
        acceptedPendingId === expectedPendingId,
        { expected_pending: expectedPending, accepted_pending: acceptedPending },
      );
    }
  };

  try {
    await completeOnboarding(appWindow);
    const testBridgeSurface = await appWindow.evaluate(() => ({
      available: typeof window.__pupuTestBridge === "object",
      keys:
        typeof window.__pupuTestBridge === "object"
          ? Object.keys(window.__pupuTestBridge).sort()
          : [],
    }));
    assertTrue(
      "renderer preload exposed the Test API bridge",
      testBridgeSurface.available,
      testBridgeSurface,
    );
    await waitForTestBridge(testApi, profile.bridgeTimeoutMs);
    assertTrue(
      "deterministic runtime uses the fixed two-turn agent budget",
      process.env.UNCHAIN_MAX_ITERATIONS === String(SOAK_AGENT_MAX_ITERATIONS),
      { configured: process.env.UNCHAIN_MAX_ITERATIONS || null },
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
    assertTrue(
      "Unchain sidecar is ready before provider setup",
      runtimeStatus.ready,
    );

    fakeServer = createFakeOpenAIResponsesServer({ auditPath: fakeAuditPath });
    const fakeReady = await fakeServer.start();
    const customProvider = buildCustomProviderDefinition(fakeReady.baseUrl);

    await poll(
      async () =>
        debugEval(
          testApi,
          `
            const snapshot = window.settingsStorageAPI?.bootstrap?.();
            return snapshot?.available === true &&
              snapshot?.migration?.state === "complete"
              ? { ready: true }
              : null;
          `,
        ),
      {
        timeoutMs: profile.phaseTimeoutMs,
        label: "settings SQL migration completion",
      },
    );
    const persistenceSetup = await debugEval(
      testApi,
      `
        const storage = window.settingsStorageAPI;
        const before = storage.bootstrap();
        const namespaces = before.namespaces || {};
        const featureFlags = await storage.setNamespace("feature_flags", {
          ...(namespaces.feature_flags || {}),
          enable_custom_model_providers: true,
        });
        const modelProviders = await storage.setNamespace("model_providers", {
          ...(namespaces.model_providers || {}),
          custom_providers: [${JSON.stringify(customProvider)}],
        });
        const legacyRoot = JSON.parse(
          localStorage.getItem("settings") || "{}"
        );
        const legacyProviders =
          legacyRoot.model_providers &&
          typeof legacyRoot.model_providers === "object"
            ? legacyRoot.model_providers
            : {};
        legacyRoot.model_providers = {
          ...legacyProviders,
          custom_provider_secrets: {
            ...(legacyProviders.custom_provider_secrets || {}),
            ${JSON.stringify(CUSTOM_PROVIDER_SLUG)}: "pupu-fixture-key",
          },
        };
        localStorage.setItem("settings", JSON.stringify(legacyRoot));
        const credential = await storage.setProviderCredential(
          "custom_provider",
          ${JSON.stringify(`custom.${CUSTOM_PROVIDER_SLUG}`)},
          "pupu-fixture-key"
        );
        const after = storage.bootstrap();
        return {
          feature_flags: featureFlags,
          model_providers: modelProviders,
          credential,
          configured_credentials: after.configuredCredentials || [],
          legacy_contains_secret: String(
            localStorage.getItem("settings") || ""
          ).includes("pupu-fixture-key"),
        };
      `,
    );
    const customCredentialId = `custom.${CUSTOM_PROVIDER_SLUG}`;
    const credentialAuthorityReady =
      (persistenceSetup?.credential?.status === "stored" &&
        persistenceSetup?.configured_credentials?.includes(
          customCredentialId,
        )) ||
      (persistenceSetup?.credential?.status === "legacy-only" &&
        !persistenceSetup?.configured_credentials?.includes(
          customCredentialId,
        ));
    assertTrue(
      "deterministic fixture persisted through SQL-authoritative settings and write-only credential APIs",
      persistenceSetup?.feature_flags?.ok === true &&
        persistenceSetup?.model_providers?.ok === true &&
        persistenceSetup?.credential?.ok === true &&
        credentialAuthorityReady &&
        persistenceSetup?.legacy_contains_secret === true,
      { persistence_setup: persistenceSetup },
    );
    await reloadAndAudit("provider-configuration");

    const providerProbe = await debugEval(
      testApi,
      `return window.unchainAPI.testCustomProvider(${JSON.stringify(
        customProvider,
      )}, "pupu-fixture-key")`,
    );
    assertTrue(
      `fake custom provider passes the real connection probe: ${JSON.stringify(providerProbe)}`,
      providerProbe?.ok,
      { probe: providerProbe || null },
    );

    const models = await testApi.get("/catalog/models");
    assertTrue(
      "backend model catalog remains reachable after custom-provider setup",
      Array.isArray(models.models),
      {
        model_count: Array.isArray(models.models) ? models.models.length : null,
      },
    );
    const storedCustomModel = await debugEval(
      testApi,
      `
        const snapshot = window.settingsStorageAPI.bootstrap();
        const providers = snapshot.namespaces?.model_providers || {};
        const definition = (providers.custom_providers || []).find(
          (item) => item && item.id === ${JSON.stringify(CUSTOM_PROVIDER_SLUG)},
        );
        return definition && definition.enabled === true
          && definition.models.some((model) => model.id === ${JSON.stringify(
            CUSTOM_MODEL_ID.split(":").slice(1).join(":"),
          )});
      `,
    );
    assertTrue(
      "exact fake custom model definition survived renderer reload",
      storedCustomModel,
    );

    assertTrue("MCP Python interpreter was provided", Boolean(pythonPath));
    const installPayload = buildMcpInstallPayload({
      pythonPath,
      fixturePath: MCP_FIXTURE_PATH,
      workspaceRoot: REPO_ROOT,
      auditPath: mcpAuditPath,
      timeScale: Number(process.env.PUPU_SOAK_TIME_SCALE || profile.timeScale),
    });
    const installed = await debugEval(
      testApi,
      `return window.unchainAPI.installMcpToolkit(${JSON.stringify(
        installPayload,
      )})`,
    );
    installedToolkitId = installed?.toolkit?.toolkitId || MCP_TOOLKIT_ID;
    assertTrue(
      "deterministic MCP installed with its exact toolkit id",
      installedToolkitId === MCP_TOOLKIT_ID,
    );
    const installedCatalog = await debugEval(
      testApi,
      "return window.unchainAPI.listMcpToolkits()",
    );
    const installedToolkit = (installedCatalog?.toolkits || []).find(
      (toolkit) => toolkit.toolkitId === MCP_TOOLKIT_ID,
    );
    const installedToolNames = new Set(
      (installedToolkit?.tools || []).map((tool) => tool.name),
    );
    for (const name of [
      "soak_probe",
      "soak_wait",
      "soak_gate",
      "soak_checkpoint",
      "soak_fail_once",
    ]) {
      assertTrue(
        `deterministic MCP exposes ${name}`,
        installedToolNames.has(name),
      );
    }

    for (const lane of LANES) {
      const created = await testApi.post("/chats", {
        title: `deterministic-soak-${lane}`,
        model: CUSTOM_MODEL_ID,
      });
      const chat = {
        lane,
        chat_id: created.chat_id,
        title: `deterministic-soak-${lane}`,
        attempts: [],
        detail: null,
      };
      chatsByLane.set(lane, chat);
      report.chats.push(chat);
      await testApi.post(`/chats/${encodeURIComponent(chat.chat_id)}/model`, {
        model_id: CUSTOM_MODEL_ID,
      });
      await testApi.post(
        `/chats/${encodeURIComponent(chat.chat_id)}/toolkits`,
        {
          toolkit_ids: [MCP_TOOLKIT_ID],
        },
      );
    }
    assertTrue(
      "created exactly three independently addressable chats",
      chatsByLane.size === 3,
    );

    const soakStartedAt = Date.now();
    report.soak_started_at = new Date(soakStartedAt).toISOString();

    if (!multiAgentOnly) {
      await runParallel("probe", 0);
      await runParallel("steady", 0);
      await runParallel("checkpoint", 0);

      const waitAttempts = await startParallel("wait", 0);
      await Promise.all(waitAttempts.map((attempt) => waitForRunning(attempt)));

      for (let index = 0; index < waitAttempts.length; index += 1) {
        const owner = waitAttempts[index];
        const foreign = waitAttempts[(index + 1) % waitAttempts.length];
        let lookupError = null;
        try {
          await testApi.get(
            `/chats/${encodeURIComponent(owner.chat_id)}/runs/${encodeURIComponent(foreign.attempt_id)}`,
          );
        } catch (error) {
          lookupError = error;
        }
        assertTrue(
          `lane ${owner.lane} rejects a foreign attempt lookup: ${JSON.stringify(
            {
              status: lookupError?.status || null,
              code: lookupError?.body?.error?.code || null,
              message: lookupError?.message || null,
            },
          )}`,
          matchesTestApiError(lookupError, {
            status: 404,
            code: "run_not_found",
            isolatedWorldMessage: `run ${foreign.attempt_id} was not found for chat ${owner.chat_id}`,
          }),
        );

        let cancelError = null;
        try {
          await testApi.post(
            `/chats/${encodeURIComponent(owner.chat_id)}/runs/${encodeURIComponent(foreign.attempt_id)}/cancel`,
          );
        } catch (error) {
          cancelError = error;
        }
        assertTrue(
          `lane ${owner.lane} rejects a foreign attempt cancellation`,
          matchesTestApiError(cancelError, {
            status: 409,
            code: "attempt_mismatch",
            isolatedWorldMessage: `attempt ${foreign.attempt_id} does not own chat ${owner.chat_id}`,
          }),
        );
        const stillOwned = await getRun(owner);
        assertTrue(
          `lane ${owner.lane} remains running after foreign cancellation`,
          stillOwned.status === "running",
        );
      }

      for (const lane of LANES) {
        const chat = chatsByLane.get(lane);
        await sendComposerCommand(chat, `/fyi SOAK_FYI lane=${lane}`);
        await sendComposerCommand(chat, `/btw SOAK_BTW lane=${lane}`);
        await sendComposerCommand(chat, `/queue SOAK_QUEUE lane=${lane}`);
        await poll(
          () =>
            fakeServer.requests.some(
              (record) => record.label === "btw" && record.lane === lane,
            ),
          { timeoutMs: 30000, label: `lane ${lane} BTW side request` },
        );
      }

      assertTrue(
        "at least one wait attempt remained live before renderer reload",
        (
          await Promise.all(waitAttempts.map((attempt) => getRun(attempt)))
        ).some((snapshot) => snapshot.status === "running"),
      );
      await captureControlState("before-wait-reload", {
        wait_attempts: waitAttempts.map((attempt) => ({
          lane: attempt.lane,
          chat_id: attempt.chat_id,
          attempt_id: attempt.attempt_id,
        })),
      });
      await reloadAndAudit("wait-with-fyi-btw-and-queued-outbox");
      await captureControlState("after-wait-reload");
      await waitParallel(waitAttempts);
      await captureControlState("after-wait-completion");
      for (const lane of LANES) {
        const detail = await waitForQueueResult(chatsByLane.get(lane));
        await captureControlState("queued-successor-completed", {
          lane,
          intended_chat_id: chatsByLane.get(lane).chat_id,
          message_tail: (detail.messages || []).slice(-4).map((message) => ({
            role: message?.role || "",
            status: message?.status || "",
            content: message?.content || "",
            attempt_id: message?.meta?.attemptId || "",
            request_id: message?.meta?.requestId || "",
            execution_session_id: message?.meta?.executionSessionId || "",
            queue_client_operation_id:
              message?.meta?.queueClientOperationId || "",
            interjections: message?.interjections || [],
            trace_frames: (message?.traceFrames || []).filter((frame) =>
              ["fyi_injected", "side_answer"].includes(frame?.type),
            ),
          })),
        });
        assertTrue(
          `lane ${lane} completed its queued follow-up after wait reattach`,
          serializedMessageContent(detail).includes(
            `SOAK_QUEUE_OK lane=${lane}`,
          ),
        );
      }

      const gateAttempts = await startParallel("gate", 0);
      const pendingGates = await Promise.all(
        gateAttempts.map((attempt) => waitForPendingGate(attempt)),
      );
      assertTrue(
        "all three durable gates expose distinct pending interactions",
        new Set(
          pendingGates.map(
            (pending) => pending.interaction_id || pending.confirmation_id,
          ),
        ).size === LANES.length,
      );
      await reloadAndAudit("durable-gates");
      const chatsAfterGateReload = await testApi.get("/chats");
      const knownChatIdsAfterGateReload = new Set(
        (chatsAfterGateReload.chats || []).map((chat) => chat.id),
      );
      assertTrue(
        "all three chats remain addressable after durable-gate reload",
        LANES.every((lane) =>
          knownChatIdsAfterGateReload.has(chatsByLane.get(lane).chat_id),
        ),
        { known_chat_ids: [...knownChatIdsAfterGateReload] },
      );
      for (const [index, attempt] of gateAttempts.entries()) {
        await approveVisibleGate(attempt, pendingGates[index]);
      }
      await waitParallel(gateAttempts);

      await runParallel("fail-once", 0);
      await runParallel("fail-once", 1);
    }
    for (const [phase, expectedOutcome] of [
      ["multiagent", "completed:3"],
      ["child-question", "needs_clarification:3"],
      ["child-approval", "subagent_tool_approval_unsupported:3"],
      ["child-max", "max_iterations:3"],
    ]) {
      const results = await runParallel(phase, 0, {
        rejectPendingRootInteraction: true,
      });
      for (const result of results) {
        assertTrue(
          `lane ${result.lane || "?"} ${phase} parent converged from exact child outcome`,
          String(result.content || "").includes(
            `child_outcome=${expectedOutcome}`,
          ),
          { content: result.content || "" },
        );
      }
    }
    if (!multiAgentOnly) {
      await runParallel("checkpoint", 1);

      let steadyIteration = 1;
      let nextPeriodicReloadAt = profile.periodicReloadIntervalMs
        ? soakStartedAt + profile.periodicReloadIntervalMs
        : Number.POSITIVE_INFINITY;
      const deadline = soakStartedAt + profile.targetDurationMs;
      while (Date.now() + 5000 < deadline) {
        if (
          Date.now() >= nextPeriodicReloadAt &&
          deadline - Date.now() > 90000
        ) {
          const periodicWait = await startParallel("wait", steadyIteration);
          await Promise.all(
            periodicWait.map((attempt) => waitForRunning(attempt)),
          );
          await reloadAndAudit(`periodic-wait-${steadyIteration}`);
          await waitParallel(periodicWait);
          nextPeriodicReloadAt += profile.periodicReloadIntervalMs;
          continue;
        }

        await runParallel("steady", steadyIteration);
        if (steadyIteration % 10 === 0 && Date.now() + 5000 < deadline) {
          await runParallel("checkpoint", steadyIteration);
        }
        steadyIteration += 1;
        report.steady_iterations = steadyIteration;
        if (profile.steadyCadenceMs > 0) await sleep(profile.steadyCadenceMs);
      }
      if (Date.now() < deadline) await sleep(deadline - Date.now());

      const soakFinishedAt = Date.now();
      report.soak_finished_at = new Date(soakFinishedAt).toISOString();
      report.soak_duration_ms = soakFinishedAt - soakStartedAt;
      assertTrue(
        `soak reached the ${profile.name} target duration`,
        report.soak_duration_ms >= profile.targetDurationMs,
        { duration_ms: report.soak_duration_ms },
      );
      assertTrue(
        "soak duration stayed inside the strict overrun tolerance",
        report.soak_duration_ms <=
          profile.targetDurationMs + profile.durationToleranceMs,
        { duration_ms: report.soak_duration_ms },
      );
    } else {
      const soakFinishedAt = Date.now();
      report.soak_finished_at = new Date(soakFinishedAt).toISOString();
      report.soak_duration_ms = soakFinishedAt - soakStartedAt;
      assertion("focused multi-agent boundary suite completed", {
        duration_ms: report.soak_duration_ms,
      });
    }

    const listedChats = await testApi.get("/chats");
    const listedIds = new Set((listedChats.chats || []).map((chat) => chat.id));
    for (const lane of LANES) {
      const chat = chatsByLane.get(lane);
      assertTrue(`lane ${lane} chat still exists`, listedIds.has(chat.chat_id));
      chat.detail = await testApi.get(
        `/chats/${encodeURIComponent(chat.chat_id)}`,
      );
    }

    let chatFailures = [];
    if (multiAgentOnly) {
      const chatIds = report.chats.map((chat) => chat.chat_id).filter(Boolean);
      const attemptIds = report.chats.flatMap((chat) =>
        chat.attempts.map((attempt) => attempt.attempt_id).filter(Boolean),
      );
      if (new Set(chatIds).size !== LANES.length) {
        chatFailures.push("three unique chat ids were not retained");
      }
      if (new Set(attemptIds).size !== attemptIds.length) {
        chatFailures.push("attempt ids were reused across chats or phases");
      }
      for (const chat of report.chats) {
        const serialized = JSON.stringify(chat.detail || {});
        if (!serialized.includes(`lane=${chat.lane}`)) {
          chatFailures.push(`lane ${chat.lane} is missing its own marker`);
        }
        for (const otherLane of LANES.filter((lane) => lane !== chat.lane)) {
          if (serialized.includes(`lane=${otherLane}`)) {
            chatFailures.push(
              `lane ${chat.lane} chat contains lane ${otherLane} content`,
            );
          }
        }
        if (chat.attempts.some((attempt) => attempt.status !== "completed")) {
          chatFailures.push(`lane ${chat.lane} has a non-completed attempt`);
        }
      }
    } else {
      chatFailures = validateChatIsolation(report.chats);
    }
    assertTrue(
      "chat and attempt identity isolation remained exact",
      chatFailures.length === 0,
      { failures: chatFailures },
    );

    const fakeRecords = readJsonlIfPresent(fakeAuditPath);
    const mcpRecords = readJsonlIfPresent(mcpAuditPath);
    report.audits.fake_llm.records = fakeRecords.length;
    report.audits.mcp.records = mcpRecords.length;
    const auditFailures = multiAgentOnly
      ? validateMultiAgentAuditEvidence(
          { fakeRecords, mcpRecords },
          { expectedRootGateCalls: 0 },
        )
      : validateAuditEvidence({ fakeRecords, mcpRecords });
    assertTrue(
      multiAgentOnly
        ? "fake LLM and MCP audits contain every multi-agent boundary path"
        : "fake LLM and MCP audits contain every required control path",
      auditFailures.length === 0,
      { failures: auditFailures },
    );

    await sampleRuntimeHealth("final-evidence");
    report.page_errors = [...pageErrors];
    assertTrue(
      "no execution lease conflict, resume loop, or unexpected mismatch appeared",
      report.forbidden_log_findings.length === 0,
      { findings: report.forbidden_log_findings },
    );
    assertTrue(
      "renderer emitted no uncaught page errors",
      pageErrors.length === 0,
      {
        errors: pageErrors,
      },
    );
    report.status = "passed";
  } catch (error) {
    thrownError = error;
    await captureControlState("test-failure", {
      error: error?.message || String(error),
    }).catch(() => {});
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
    report.audits.fake_llm.records = readJsonlIfPresent(fakeAuditPath).length;
    report.audits.mcp.records = readJsonlIfPresent(mcpAuditPath).length;
    report.page_errors = [...pageErrors];
    fs.writeFileSync(
      reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    await testInfo.attach("Deterministic soak report", {
      path: reportPath,
      contentType: "application/json",
    });
    for (const [name, auditPath] of [
      ["Fake LLM audit", fakeAuditPath],
      ["Deterministic MCP audit", mcpAuditPath],
    ]) {
      if (fs.existsSync(auditPath)) {
        await testInfo.attach(name, {
          path: auditPath,
          contentType: "application/x-ndjson",
        });
      }
    }
  }

  if (thrownError) throw thrownError;
});
