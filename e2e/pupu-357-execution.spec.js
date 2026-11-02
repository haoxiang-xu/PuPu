const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./qa357/packaged_app");

/* #357 real-App acceptance on the delivered candidate (PR #466).
 *
 * Every step is one of two kinds, and the attached ledger says which:
 *   seed — data put in place through the real preload/Main/Store path, from the
 *          real producer's own requests and exports checked into the repo
 *          (managed_hook_source_capture.json, workflow_call_capture.json,
 *          hook_tool_set_capture.json) or from the bridge's own replies
 *          (a publication's revision id). Never a hand-made producer reply.
 *   ui   — what a person does: clicks, typing, a file chosen in the import
 *          dialog, drags, Save, a restart.
 * Readbacks go through the same v2 bridge the editor uses. Only the qualified namespace-local TLS fixture may answer; no real provider
 * or key. The seeded graph is disclosed separately from real UI sends.
 *
 * It drives the PACKAGED Linux App (e2e/qa357/packaged_app.js), whose Main
 * launches the one fixed sidecar binary of the pair, and must run on a
 * disposable hosted Linux user with no external route, like the #351/#352
 * controls. */
test.skip(process.env.PUPU_357_ACCEPTANCE !== "1" || process.env.GITHUB_ACTIONS !== "true"
  || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.RUNNER_OS !== "Linux",
"Run the #357 exact-pair acceptance control on its disposable Linux user");

const ROOT = path.resolve(__dirname, "..");
const hookCapture = require("../src/SERVICEs/managed_hook_source_capture.json");
const callCapture = require("../src/COMPONENTs/agents/pages/recipes_page/workflow_call_capture.json");
const toolSetCapture = require("../src/COMPONENTs/agents/pages/recipes_page/hook_tool_set_capture.json");
const copy = (value) => JSON.parse(JSON.stringify(value));
const caseOf = (name) => copy(hookCapture.cases.find((item) => item.name === name));
const rowOf = (capture, name) => copy(capture.rows.find((item) => item.case === name).reply);
const PYTHON_ID = "qa-357-python";
const PYTHON_BIN = process.env.UNCHAIN_PYTHON_BIN;

const ledger = [];
const step = (kind, what, detail = {}) => ledger.push({ at: new Date().toISOString(), kind, what, ...detail });
test.beforeEach(() => { ledger.length = 0; });
// Attached even when a step fails, so a stopped run still says how far it got.
test.afterEach(async ({}, testInfo) => {
  await testInfo.attach("ledger (seed vs ui)", { body: Buffer.from(JSON.stringify(ledger, null, 2)), contentType: "application/json" });
});

const enterApp = async (page) => {
  const gate = page.getByRole("button", { name: "Click anywhere to start" });
  await expect(gate).toBeVisible({ timeout: 120000 });
  await gate.click();
  await expect(gate).toBeHidden();
  const skip = page.getByRole("button", { name: "Skip for now", exact: true });
  if (await skip.isVisible()) await skip.click();
};

const openAgents = async (page) => {
  const sidebar = page.getByRole("button", { name: "Open sidebar", exact: true });
  // As in the #352 control: only the title-bar toggle uses the fixture adapter.
  if (await sidebar.isVisible()) await sidebar.dispatchEvent("click");
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByTestId("agent-explorer")).toBeVisible();
};

/* Exactly one library row with this name, or the run stops: a guess between
   two rows is not evidence about either. */
const openResource = async (page, name) => {
  const rows = page.getByTestId("agent-explorer").getByText(name, { exact: true });
  await expect(rows).toHaveCount(1);
  // The explorer re-renders while the library refreshes; retry a detached row.
  await expect(async () => { await rows.click({ timeout: 5000 }); }).toPass({ timeout: 60000 });
  await expect(page.getByTestId("skeleton-node-start")).toBeVisible();
};

const pressNode = async (page, id) => page.getByTestId(`skeleton-node-${id}`).click();
/* Click an empty stretch of canvas, which clears the selection and closes the
   floating detail panel that otherwise covers the right of the canvas. */
const closeDetail = async (page) => {
  const box = await page.getByTestId("skeleton-workspace").boundingBox();
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.22);
  await expect(page.getByTestId("skeleton-detail-panel-shell").getByRole("textbox")).toHaveCount(0);
};
const saveNow = async (page) => {
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  // The control center re-renders as the session settles; retry a detached button.
  await expect(async () => { await page.getByRole("button", { name: "Save", exact: true }).click({ timeout: 5000 }); }).toPass({ timeout: 60000 });
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
};
const getV2 = (page, id) => page.evaluate((resourceId) => window.unchainAPI.getManagedSkeletonResource(resourceId), id);
const attachJson = (testInfo, name, value) =>
  testInfo.attach(name, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: "application/json" });
const attachShot = async (testInfo, page, name) =>
  testInfo.attach(name, { body: await page.screenshot(), contentType: "image/png" });
const textAt = (aggregate, nodePath) => {
  const entry = aggregate.sources_manifest.entries.find((row) => JSON.stringify(row.node_path) === JSON.stringify(nodePath));
  return entry ? aggregate.contents.find((row) => row.sha256 === entry.sha256).text : undefined;
};
const pick = async (page, container, label) => {
  await container.getByRole("combobox").first().click();
  const lists = page.getByRole("listbox");
  await lists.last().getByText(label, { exact: false }).first().click();
};

/* Production builds ignore stored feature flags (src/SERVICEs/feature_flags.js
   readFeatureFlags), so the packaged App gets enable_user_access_to_agents from
   its build snapshot (PUPU_BUILD_FEATURE_SNAPSHOT_PATH, recorded by the
   workflow). This only records that input; nothing is written here. */
const enableAgents = async (page) => {
  await expect.poll(async () => page.evaluate(() => window.settingsStorageAPI.bootstrap().available)).toBe(true);
  step("build", "feature flag enable_user_access_to_agents from the packaged build snapshot (production ignores stored flags)");
};

test("#357 Code, Workflow Call and Hooks execute through the real chat entry (qualified loopback TLS, fixed sentinel only)", async ({ pupu }, testInfo) => {
  test.setTimeout(300000);
  const page = () => pupu.appWindow;
  try {
    await enterApp(page());
    await enableAgents(page());
    const profiles = await page().evaluate(() => window.unchainAPI.listSkeletonKernelProfiles());
    await attachJson(testInfo, "kernel-profiles (producer reply)", profiles);

    /* UI: import the root Workflow and register the Python, as above. */
    await openAgents(page());
    const root = caseOf("root");
    const rootFile = path.join(process.env.TMPDIR || ROOT, "qa-357-exec-root.json");
    fs.writeFileSync(rootFile, root.exported.source_json, "utf8");
    step("seed", "real producer export (managed_hook_source_capture root) written for the dialog");
    await page().getByRole("button", { name: "Import an Agent or Workflow" }).click();
    const dialog = page().getByTestId("import-resource-modal");
    await dialog.getByTestId("import-file-input").setInputFiles(rootFile);
    await expect(dialog.getByTestId("import-preview")).toBeVisible();
    await dialog.getByRole("button", { name: "Name a Python…" }).click();
    await dialog.getByPlaceholder("profile name, e.g. pupu-tools").fill(PYTHON_ID);
    await dialog.getByPlaceholder("absolute path to its python").fill(PYTHON_BIN);
    await dialog.getByTestId("import-runtime-add").getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByTestId("import-runtime-add-state")).toContainText(`${PYTHON_ID} was added`);
    await pick(page(), dialog.getByTestId("import-runtime-0"), `${PYTHON_ID} ·`);
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByTestId("import-done")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    step("ui", "imported the root Workflow with its Code step bound to the registered Python");

    /* Seeds: publish the imported Workflow and the Hook Workflow through the
       real bridge; compose the Agent from captured parts. */
    const imported = await getV2(page(), "import-root-code");
    const rootPublished = await page().evaluate(([id, token]) => window.unchainAPI.publishManagedSkeletonWorkflow(id, token),
      ["import-root-code", imported.resource.edit_token]);
    const hookSeed = rowOf(toolSetCapture, "wf-hook-continue_version").version.document;
    const hookSaved = await page().evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
      schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
    }), copy(hookSeed));
    const hookPublished = await page().evaluate(([id, token]) => window.unchainAPI.publishManagedSkeletonWorkflow(id, token),
      [hookSeed.id, hookSaved.resource.edit_token]);
    step("seed", "published import-root-code (UI-imported) and wf-hook-continue through the bridge",
      { root_revision: rootPublished.version.revision_id, hook_revision: hookPublished.version.revision_id });

    const owned = caseOf("owned-hook").request;
    const agent = copy(owned.document);
    agent.id = "qa357-exec";
    agent.name = "QA 357 exec";
    const hooksNode = agent.nodes.find((node) => node.id === "hooks");
    hooksNode.config.hooks[0].workflow.document.nodes.find((node) => node.type === "code").config.code.environment_profile_id = PYTHON_ID;
    const pinned = copy(rowOf(toolSetCapture, "every_get").resource.document.nodes.find((node) => node.id === "hooks").config.hooks[0]);
    pinned.workflow = { workflow_id: hookSeed.id, revision_id: hookPublished.version.revision_id };
    hooksNode.config.hooks.push(pinned);
    const callNode = copy(rowOf(callCapture, "caller_complete_get").resource.document.nodes.find((node) => node.id === "call"));
    callNode.config.workflow = { workflow_id: "import-root-code", revision_id: rootPublished.version.revision_id };
    callNode.config.execution.inputs = callNode.config.execution.inputs.filter((input) => input.name === "message");
    callNode.config.execution.outputs = [{ name: "rows", source: { kind: "result", path: ["rows"] } }];
    const toolsNode = { id: "tools", type: "toolkit_pool", config: { toolkits: [{ id: "core", enabled_tools: ["read"] }], merge_with_user_selected: false } };
    agent.nodes.push(callNode, toolsNode);
    agent.edges = agent.edges.filter((edge) => !(edge.source_node_id === "start" && edge.target_node_id === "kernel"));
    agent.edges.push(
      { id: "flow-start-call", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "call", target_port_id: "in" },
      { id: "flow-call-kernel", kind: "flow", source_node_id: "call", source_port_id: "out", target_node_id: "kernel", target_port_id: "in" },
      { id: "attach-kernel-tools", kind: "attach", source_node_id: "kernel", source_port_id: "attach_top", target_node_id: "tools", target_port_id: "attach_top" },
    );
    const agentSaved = await page().evaluate((request) => window.unchainAPI.saveManagedSkeletonResource(request), {
      schema: "pupu.skeleton-edit.v2", document: agent, expected_edit_token: null, managed_sources: owned.managed_sources,
    });
    await attachJson(testInfo, "exec agent seed request+reply", { document: agent, managed_sources: owned.managed_sources, reply: agentSaved });
    expect(agentSaved.resource.id).toBe("qa357-exec");
    step("seed", "composed Agent qa357-exec: owned-hook capture + every_get pinned hook + caller_complete call node (re-pinned) + native capture toolkit pool (core read)");

    /* UI: choose the Kernel model offered by this build, Save, check. */
    await page().reload();
    await enterApp(page());
    await openAgents(page());
    await openResource(page(), "QA 357 exec");
    await pressNode(page(), "kernel");
    await page().getByTestId("kernel-model").getByRole("combobox").first().click();
    const offered = page().getByRole("listbox").last().getByText("openai · gpt-6-luna", { exact: true });
    const chosenLabel = (await offered.textContent()).trim();
    await offered.click();
    step("ui", `Kernel model chosen from the offered list: ${chosenLabel}`);
    await saveNow(page());
    const withKernel = await getV2(page(), "qa357-exec");
    const profile = withKernel.resource.document.nodes.find((node) => node.id === "kernel").config.kernel.profile;
    await attachJson(testInfo, "exec agent after UI Kernel choice", withKernel);
    expect(profile.provider).toBe("openai");
    await page().getByRole("button", { name: "Open the run menu" }).click();
    await page().getByRole("button", { name: "Check it can run" }).click();
    const preflight = page().getByTestId("skeleton-preflight-state");
    await expect(preflight).not.toHaveText("", { timeout: 60000 });
    await attachShot(testInfo, page(), "exec check it can run");
    step("ui", "Check it can run", { preflight: await preflight.textContent() });

    /* Seed: a placeholder OpenAI credential through the real settings
       bridge. It is not a key, and the run has no route out, so the Kernel's
       request cannot leave the machine; it only lets the run start, so the
       steps before the Kernel execute. */
    const credential = await page().evaluate(() => window.settingsStorageAPI.setProviderCredential("provider", "openai", "qa357-offline-only-not-a-real-key"));
    expect(credential.ok).toBe(true);
    step("seed", "fixed non-key sentinel persisted via real App settings writer/private GNOME keyring", { ok: credential.ok });
    const runtime = await page().evaluate(async (workspace) => {
      const boot = window.settingsStorageAPI.bootstrap();
      const before = (boot.namespaces && boot.namespaces.runtime) || {};
      return window.settingsStorageAPI.setNamespace("runtime", { ...before, workspace_root: workspace });
    }, process.env.QA_WORKSPACE);
    expect(runtime.ok).toBe(true);
    step("seed", "disposable existing workspace selected through real runtime settings", { workspace: process.env.QA_WORKSPACE });
    await attachJson(testInfo, "actual App Context V2 status", await page().evaluate(() => window.contextV2API.getStatus()));
    await page().reload();
    await enterApp(page());
    await openAgents(page());

    /* UI: a new chat that runs this Agent. */
    await page().getByRole("button", { name: "Close builder" }).click();
    await page().getByRole("button", { name: "New chat", exact: true }).click();
    await page().getByTestId("attach-agent-row").getByRole("combobox").click();
    await page().getByRole("listbox").last().getByText("QA 357 exec", { exact: false }).first().click();
    await expect(page().getByTestId("attach-agent-row")).toContainText("QA 357 exec");
    const message = "QA357-APP read the qualification file";
    await page().getByRole("textbox", { name: "Message PuPu..." }).fill(message);
    step("ui", "Enter will send this composer text", { message });
    await page().getByRole("textbox", { name: "Message PuPu..." }).press("Enter");
    step("ui", "chose QA 357 exec in the composer and sent a message", { message });

    const allowViews = page().getByRole("button", { name: "Allow once", exact: true });
    const allow = allowViews.first();
    const details = page().getByRole("button", { name: "detail", exact: true }).first();
    await expect.poll(async () => (await allow.isVisible()) || (await details.isVisible()), { timeout: 60000 }).toBe(true);
    if (!(await allow.isVisible()) && await details.isVisible()) {
      await details.click();
      step("ui", "expanded the message's trace through its visible detail button");
    }
    await expect(allow).toBeVisible({ timeout: 120000 });
    /* The finite-stream recovery may show both the stream's root-owned card
       and its node-owned pending projection. Before selecting either visible
       view, require ONE exact durable interaction and the same sole identity
       in this new chat's persisted confirmation frames. Do not guess between
       distinct approvals or loosen the later no-actions/final-output gates. */
    const approvalOwner = await page().evaluate(async () => {
      const boot = window.chatStorageAPI.bootstrap();
      const chatId = boot.activeChatId;
      const messages = window.chatStorageAPI.readMessages(chatId);
      const assistant = messages.filter((message) => message.role === "assistant");
      if (assistant.length !== 1) throw new Error("Expected one owner message in the new qualification chat");
      const owner = assistant[0];
      const sessionId = owner.meta?.executionSessionId;
      if (typeof sessionId !== "string" || !sessionId) throw new Error("The owner has no exact execution session");
      const pending = await window.unchainAPI.getPendingInteraction({ session_id: sessionId });
      const confirmations = (owner.traceFrames || []).filter((frame) =>
        frame.type === "tool_call" && frame.payload?.requires_confirmation === true);
      return { chatId, sessionId, ownerMessageId: owner.id, ownerAttempt: owner.meta?.attemptId,
        confirmations, pending };
    });
    await attachJson(testInfo, "actual pending reply and visible approval ownership", approvalOwner);
    const pending = approvalOwner.pending;
    expect(pending.status).toBe("awaiting_response");
    expect(pending.session_id).toBe(approvalOwner.sessionId);
    expect(pending.active_attempt_id).toBe(approvalOwner.ownerAttempt);
    expect(pending.source_run_id).toBe(approvalOwner.ownerAttempt);
    expect(pending.kind).toBe("tool_approval");
    expect(pending.interaction_id).toMatch(/^interaction_[a-f0-9]+$/);
    const presented = pending.presentation.tool_call;
    expect(presented.confirmation_id).toBe(pending.interaction_id);
    expect(presented.call_id).toBe("call_qa357_app_read_1");
    expect(presented.tool_name).toBe("read");
    expect(presented.arguments).toEqual({ path: path.join(process.env.QA_WORKSPACE, "qualification.txt") });
    expect(approvalOwner.confirmations.length).toBeGreaterThan(0);
    expect([...new Set(approvalOwner.confirmations.map((frame) => frame.payload.confirmation_id))])
      .toEqual([pending.interaction_id]);
    expect(approvalOwner.confirmations.every((frame) => frame.payload.call_id === presented.call_id &&
      frame.payload.tool_name === presented.tool_name && frame.session_id === pending.session_id &&
      [pending.active_attempt_id, pending.interaction_source_run_id].includes(frame.run_id))).toBe(true);
    const approvalViewCount = await allowViews.count();
    expect([1, 2]).toContain(approvalViewCount);
    step("observation", "visible approval views share the sole exact pending interaction", {
      interaction_id: pending.interaction_id, call_id: presented.call_id, approvalViewCount,
    });
    await attachShot(testInfo, page(), "actual pending hook approval");
    step("ui", "matching approval visible; Allow once will resume the suspended run");
    await allow.click();
    await expect(page().getByText("QA357 APP DONE", { exact: true }).last()).toBeVisible({ timeout: 120000 });
    await expect(allowViews).toHaveCount(0);
    await expect.poll(() => page().locator('button[aria-label="Stop"],button[aria-label="Stop generating"]').count()).toBe(0);
    step("ui", "actual assistant final visible after approving the saved Hook");
    await attachShot(testInfo, page(), "actual final after approval");
  } finally {
    const stored = await page().evaluate(() => {
      const boot = window.chatStorageAPI.bootstrap();
      const ids = JSON.stringify(boot || {}).match(/chat-[A-Za-z0-9-]+/g) || [];
      const messages = {};
      for (const id of [...new Set(ids)].slice(0, 6)) {
        try { messages[id] = window.chatStorageAPI.readMessages(id); } catch (error) { messages[id] = { error: error.message }; }
      }
      return { boot, messages };
    }).catch((error) => ({ error: error.message }));
    await attachJson(testInfo, "chat storage after run", stored);
  }
  /* The GUI final is a gate; independent physical Journal/CAS review remains
     required before claiming Code/Workflow/Hook execution acceptance. */
  expect(pupu.pageErrors).toEqual([]);
});
