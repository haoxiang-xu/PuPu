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
 * Readbacks go through the same v2 bridge the editor uses. No provider is
 * called and nothing runs: this is authoring, persistence and layout.
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
  await rows.click();
  await expect(page.getByTestId("skeleton-node-start")).toBeVisible();
};

const pressNode = async (page, id) => page.getByTestId(`skeleton-node-${id}`).click();
const saveNow = async (page) => {
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
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

const enableAgents = async (page) => {
  await expect.poll(async () => page.evaluate(() => window.settingsStorageAPI.bootstrap().available)).toBe(true);
  await page.evaluate(async () => {
    const result = await window.settingsStorageAPI.setNamespace("feature_flags", { format: 2, flags: { enable_user_access_to_agents: true } });
    if (result.ok !== true) throw new Error("QA feature selection was not persisted");
  });
  step("seed", "feature flag enable_user_access_to_agents (as the #352 control)");
};

const setTheme = async (pupu, mode) => {
  const page = pupu.appWindow;
  await page.evaluate(async (themeMode) => {
    const snapshot = window.settingsStorageAPI.bootstrap();
    const current = (snapshot && snapshot.namespaces && snapshot.namespaces.appearance) || {};
    const result = await window.settingsStorageAPI.setNamespace("appearance", { ...current, theme_mode: themeMode });
    if (result.ok !== true) throw new Error("QA theme selection was not persisted");
  }, mode);
  step("seed", `appearance.theme_mode = ${mode} (stored setting, applied by reload)`);
  await page.reload();
  await enterApp(page);
  await openAgents(page);
};

/* ── Seeds from the real producer's own requests ─────────────────────────── */

const seedWorkflowCall = async (page) => {
  /* The published revision's own document, saved as the Workflow's draft and
     published through the real bridge; the caller's pin is the revision id the
     bridge answered with. */
  const version = rowOf(callCapture, "wf_version_1").version;
  const workflow = copy(version.document);
  const saved = await page.evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
    schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
  }), workflow);
  const published = await page.evaluate(([id, token]) => window.unchainAPI.publishManagedSkeletonWorkflow(id, token), [workflow.id, saved.resource.edit_token]);
  const caller = copy(rowOf(callCapture, "caller_complete_get").resource.document);
  caller.nodes.find((node) => node.id === "call").config.workflow = { workflow_id: workflow.id, revision_id: published.version.revision_id };
  const stored = await page.evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
    schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
  }), caller);
  step("seed", "Workflow wf_version_1 document saved and published; caller_complete pinned to the published revision", { revision: published.version.revision_id });
  return { caller: stored, revision: published.version.revision_id };
};

const seedPinnedHook = async (page) => {
  const version = rowOf(toolSetCapture, "wf-hook-continue_version").version;
  const workflow = copy(version.document);
  const saved = await page.evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
    schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
  }), workflow);
  const published = await page.evaluate(([id, token]) => window.unchainAPI.publishManagedSkeletonWorkflow(id, token), [workflow.id, saved.resource.edit_token]);
  const agent = copy(rowOf(toolSetCapture, "every_get").resource.document);
  agent.nodes.find((node) => node.id === "hooks").config.hooks[0].workflow = { workflow_id: workflow.id, revision_id: published.version.revision_id };
  const stored = await page.evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
    schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
  }), agent);
  step("seed", "Hook Workflow wf-hook-continue saved and published; agent-tool-every pinned to it", { revision: published.version.revision_id });
  return { agent: stored, revision: published.version.revision_id };
};

test("#357 Code, Workflow Call and Hooks authoring persist through the real App, Store and restart; twelve layout cells", async ({ pupu }, testInfo) => {
  test.setTimeout(20 * 60 * 1000);
  expect(typeof PYTHON_BIN === "string" && path.isAbsolute(PYTHON_BIN)).toBe(true);
  const page = () => pupu.appWindow;
  await enterApp(page());
  await enableAgents(page());
  await page().reload();
  await enterApp(page());

  const capabilities = await page().evaluate(async () => ({
    transfer: await window.unchainAPI.getManagedSkeletonTransferCapabilities(),
    hookWorkflow: await window.unchainAPI.getSkeletonHookWorkflowCapabilities(),
  }));
  await attachJson(testInfo, "capabilities", capabilities);

  const call = await seedWorkflowCall(page());
  const hook = await seedPinnedHook(page());
  await openAgents(page());

  /* ── AC-03: import two real exports, each Code step bound to an explicitly
     registered local Python (ui) ─────────────────────────────────────────── */
  const files = {};
  for (const name of ["root", "owned-hook"]) {
    const exported = caseOf(name).exported;
    const file = path.join(process.env.TMPDIR || ROOT, `qa-357-${name}.json`);
    fs.writeFileSync(file, exported.source_json, "utf8");
    files[name] = { file, expected: caseOf(name) };
  }
  step("seed", "two real producer exports written to files for the dialog (managed_hook_source_capture root, owned-hook)");
  for (const [name, { file, expected }] of Object.entries(files)) {
    await page().getByRole("button", { name: "Import an Agent or Workflow" }).click();
    const dialog = page().getByTestId("import-resource-modal");
    await expect(dialog.getByRole("button", { name: "Choose a file…" })).toBeEnabled();
    await dialog.getByTestId("import-file-input").setInputFiles(file);
    step("ui", `import dialog: file chosen (${name})`);
    await expect(dialog.getByTestId("import-preview")).toBeVisible();
    if (name === "root") {
      await dialog.getByRole("button", { name: "Name a Python…" }).click();
      await dialog.getByPlaceholder("profile name, e.g. pupu-tools").fill(PYTHON_ID);
      await dialog.getByPlaceholder("absolute path to its python").fill(PYTHON_BIN);
      await dialog.getByTestId("import-runtime-add").getByRole("button", { name: "Add" }).click();
      await expect(dialog.getByTestId("import-runtime-add-state")).toContainText(`${PYTHON_ID} was added`);
      step("ui", "registered the local Python through the dialog's existing registration");
    }
    const count = expected.payload.runtime_bindings.length;
    await expect(dialog.getByRole("button", { name: "Import" })).toBeDisabled();
    for (let index = 0; index < count; index += 1) {
      const row = dialog.getByTestId(`import-runtime-${index}`);
      await expect(row.getByRole("combobox")).toContainText("choose a Python");
      await pick(page(), row, `${PYTHON_ID} ·`);
    }
    step("ui", `chose ${PYTHON_ID} for each of ${count} Code steps`);
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByTestId("import-done")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    const stored = await getV2(page(), expected.saved.resource.id);
    expected.payload.runtime_bindings.forEach((binding) => {
      let node = stored.resource.document;
      for (let at = 0; at < binding.node_path.length; at += 1) node = node[binding.node_path[at]];
      expect(node.config.code.environment_profile_id).toBe(PYTHON_ID);
      expect(textAt(stored, binding.node_path)).toBe(textAt(expected.saved, binding.node_path));
    });
    await attachJson(testInfo, `import-${name}`, stored);
  }

  /* ── AC-03: the same file under the same id with another explicit Python is
     refused, and the dialog shows the host's refusal as it came (ui) ──────── */
  {
    await page().getByRole("button", { name: "Import an Agent or Workflow" }).click();
    const dialog = page().getByTestId("import-resource-modal");
    await expect(dialog.getByRole("button", { name: "Choose a file…" })).toBeEnabled();
    await dialog.getByTestId("import-file-input").setInputFiles(files.root.file);
    await expect(dialog.getByTestId("import-preview")).toBeVisible();
    await dialog.getByRole("button", { name: "Name a Python…" }).click();
    await dialog.getByPlaceholder("profile name, e.g. pupu-tools").fill(`${PYTHON_ID}-second`);
    await dialog.getByPlaceholder("absolute path to its python").fill(PYTHON_BIN);
    await dialog.getByTestId("import-runtime-add").getByRole("button", { name: "Add" }).click();
    await expect(dialog.getByTestId("import-runtime-add-state")).toContainText(`${PYTHON_ID}-second was added`);
    await pick(page(), dialog.getByTestId("import-runtime-0"), `${PYTHON_ID}-second ·`);
    const before = await getV2(page(), "import-root-code");
    await dialog.getByRole("button", { name: "Import" }).click();
    const refusal = dialog.getByTestId("import-refusal");
    await expect(refusal).toContainText("import_conflict");
    await expect(refusal).toContainText("Nothing was changed");
    await attachShot(testInfo, page(), "AC-03 import conflict shown");
    expect(await getV2(page(), "import-root-code")).toEqual(before);
    step("ui", "re-imported the root file with a second explicit Python: import_conflict shown, store unchanged");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  }

  /* ── AC-02/03: edit Code text, Save, reopen (ui) ───────────────────────── */
  await openResource(page(), "Managed Code");
  await pressNode(page(), "code");
  const codeBox = page().getByRole("textbox", { name: "Code of code" });
  const rootText = "def main(input, context):\n    return {\"rows\": 357}\n";
  await codeBox.fill(rootText);
  step("ui", "typed new Code text in the root Code step");
  await saveNow(page());
  let rootSaved = await getV2(page(), "import-root-code");
  expect(textAt(rootSaved, ["nodes", 1])).toBe(rootText);

  /* ── AC-04: three lines at a fixed height, hover viewer, drag suppression,
     half zoom (ui) ─────────────────────────────────────────────────────── */
  {
    const node = page().getByTestId("code-node-code");
    const block = page().getByTestId("code-node-code-block");
    await expect(block).toBeVisible();
    const fixed = (await block.boundingBox()).height;
    await expect(block).toContainText("def main(input, context):");
    await node.hover();
    await page().getByRole("button", { name: "View the code of code" }).hover();
    await expect(node).toHaveAttribute("data-viewer-open", "true");
    await expect(page().getByTestId("code-node-code-viewer")).toContainText("Read-only");
    await attachShot(testInfo, page(), "AC-04 viewer on hover");
    const box = await node.boundingBox();
    await page().mouse.move(box.x + 20, box.y + 12);
    await page().mouse.down();
    await page().mouse.move(box.x + 120, box.y + 60, { steps: 8 });
    await expect(node).toHaveAttribute("data-viewer-open", "false");
    await page().mouse.up();
    await expect(node).toHaveAttribute("data-viewer-open", "false");
    await pressNode(page(), "code");
    await page().getByRole("textbox", { name: "Code of code" }).fill("x = 1\n");
    await expect(block).toContainText("1 line");
    expect((await block.boundingBox()).height).toBe(fixed);
    /* Put the saved text back and store it, so later readbacks compare the
       document the author left. */
    await page().getByRole("textbox", { name: "Code of code" }).fill(rootText);
    await page().getByRole("button", { name: "Save", exact: true }).click();
    await expect(page().getByTestId("skeleton-save-state")).toHaveText("Saved");
    const canvas = page().getByTestId("skeleton-canvas");
    const area = await canvas.boundingBox();
    await page().mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page().keyboard.down("Control");
    for (let turn = 0; turn < 12 && (await block.count()) > 0; turn += 1) await page().mouse.wheel(0, 400);
    await page().keyboard.up("Control");
    await expect(block).toHaveCount(0);
    await expect(node).toContainText("Code ·");
    await attachShot(testInfo, page(), "AC-04 below half zoom");
    step("ui", "Code node: hover viewer, drag closes it, fixed height across code lengths, below half zoom folds the block", { block_height: fixed });
    rootSaved = await getV2(page(), "import-root-code");
    expect(textAt(rootSaved, ["nodes", 1])).toBe(rootText);
  }

  /* ── AC-06: a hook's own Workflow (imported), drill and edit its Code ──── */
  await openResource(page(), "Agent");
  await pressNode(page(), "hooks");
  await page().getByRole("button", { name: "Edit hook 1" }).click();
  await page().getByRole("button", { name: "Open the Workflow of hook policy" }).click();
  await expect(page().getByTestId("skeleton-drill-crumbs")).toContainText("Hooks Pool");
  await pressNode(page(), "step");
  const hookText = "def main(input, context):\n    return {\"decision\": \"continue\", \"require_approval\": True}  # qa-357\n";
  await page().getByRole("textbox", { name: "Code of step" }).fill(hookText);
  step("ui", "opened the hook's own Workflow and typed new Code text");
  await page().keyboard.press("Escape");
  await expect(page().getByTestId("skeleton-node-hooks")).toBeVisible();
  await saveNow(page());
  const HOOK_CODE = ["nodes", 3, "config", "hooks", 0, "workflow", "document", "nodes", 1];
  const ownedSaved = await getV2(page(), "import-owned-hook");
  expect(textAt(ownedSaved, HOOK_CODE)).toBe(hookText);

  /* ── AC-06: pinned hook — off, order, tool set; the pin stays (ui) ─────── */
  await openResource(page(), "agent-tool-every");
  await pressNode(page(), "hooks");
  await page().getByRole("button", { name: "Edit hook 1" }).click();
  const editor = page().getByTestId("hook-0-editor");
  await editor.getByTestId("hook-0-runs").getByText("Off", { exact: true }).click();
  await editor.getByPlaceholder("0 … 1,000,000").fill("7");
  await editor.getByTestId("hook-0-tool").getByText("A set of tools", { exact: true }).click();
  const setPicker = editor.getByTestId("hook-0-tool-set-picker");
  await setPicker.getByRole("combobox").click();
  const options = page().getByRole("listbox").last().getByRole("option");
  const names = [await options.nth(0).innerText(), await options.nth(1).innerText()];
  await options.nth(0).click();
  await options.nth(1).click();
  await page().keyboard.press("Escape");
  step("ui", "pinned hook: Off, order 7, a set of two tools", { picked: names });
  await saveNow(page());
  const pinnedSaved = await getV2(page(), "agent-tool-every");
  const savedHook = pinnedSaved.resource.document.nodes.find((node) => node.id === "hooks").config.hooks[0];
  expect(savedHook.enabled).toBe(false);
  expect(savedHook.order).toBe(7);
  expect(Array.isArray(savedHook.tool_name) && savedHook.tool_name.length).toBe(2);
  expect(savedHook.workflow).toEqual({ workflow_id: "wf-hook-continue", revision_id: hook.revision });

  /* ── AC-05: pinned Workflow opens read-only; unsaved caller edit survives ── */
  await openResource(page(), "caller-complete");
  await pressNode(page(), "call");
  const limit = page().getByTestId("tool-call-argument-limit");
  await limit.getByText("Value", { exact: true }).click();
  await limit.getByPlaceholder("a value written here").fill("357");
  await expect(page().getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  await page().getByRole("button", { name: "Open the pinned graph (read-only)" }).click();
  await expect(page().getByTestId("workflow-pinned-view")).toBeVisible();
  await expect(page().getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await attachShot(testInfo, page(), "AC-05 pinned graph read-only");
  await page().keyboard.press("Escape");
  await expect(page().getByTestId("workflow-pinned-view")).toHaveCount(0);
  await expect(page().getByTestId("tool-call-argument-limit").getByPlaceholder("a value written here")).toHaveValue("357");
  await expect(page().getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  step("ui", "caller: unsaved limit=357, opened the pinned revision read-only, Escape back, edit still there");
  await saveNow(page());
  const callerSaved = await getV2(page(), "caller-complete");
  const callNode = callerSaved.resource.document.nodes.find((node) => node.id === "call");
  expect(callNode.config.workflow).toEqual({ workflow_id: "wf-summarize", revision_id: call.revision });
  expect(callNode.config.execution.inputs.find((input) => input.name === "limit").value).toEqual({ kind: "literal", value: "357" });

  const before = { rootSaved, ownedSaved, pinnedSaved, callerSaved };
  await attachJson(testInfo, "saved-before-restart", before);

  /* ── Restart with the same user data, reopen and read back (ui) ────────── */
  await pupu.restartSameUserData();
  step("ui", "restarted the App with the same user data");
  await enterApp(page());
  await openAgents(page());
  for (const [id, value] of Object.entries({ "import-root-code": rootSaved, "import-owned-hook": ownedSaved, "agent-tool-every": pinnedSaved, "caller-complete": callerSaved })) {
    expect(await getV2(page(), id)).toEqual(value);
  }
  await openResource(page(), "Managed Code");
  await pressNode(page(), "code");
  await expect(page().getByRole("textbox", { name: "Code of code" })).toHaveValue(rootText);
  await openResource(page(), "Agent");
  await pressNode(page(), "hooks");
  await page().getByRole("button", { name: "Edit hook 1" }).click();
  await page().getByRole("button", { name: "Open the Workflow of hook policy" }).click();
  await pressNode(page(), "step");
  await expect(page().getByRole("textbox", { name: "Code of step" })).toHaveValue(hookText);
  await page().keyboard.press("Escape");
  await openResource(page(), "agent-tool-every");
  await pressNode(page(), "hooks");
  await page().getByRole("button", { name: "Edit hook 1" }).click();
  await expect(page().getByTestId("hook-0-tool-set-names")).toContainText(savedHook.tool_name.join(", "));
  await openResource(page(), "caller-complete");
  await pressNode(page(), "call");
  await expect(page().getByTestId("tool-call-argument-limit").getByPlaceholder("a value written here")).toHaveValue("357");
  await expect(page().getByTestId("skeleton-save-state")).toHaveText("Saved");

  /* ── AC-01: three panels × two themes × two widths ─────────────────────── */
  const panels = [
    { name: "code", resource: "Managed Code", node: "code", section: "code-section" },
    { name: "workflow-call", resource: "caller-complete", node: "call", section: "workflow-call-section" },
    { name: "hooks", resource: "agent-tool-every", node: "hooks", section: "hooks-pool-section" },
  ];
  const cells = [];
  for (const theme of ["light_mode", "dark_mode"]) {
    await setTheme(pupu, theme);
    for (const panel of panels) {
      await openResource(page(), panel.resource);
      await pressNode(page(), panel.node);
      await expect(page().getByTestId(panel.section)).toBeVisible();
      for (const target of ["min", "max"]) {
        const shell = page().getByTestId("skeleton-detail-panel-shell");
        const handle = page().getByTestId("skeleton-detail-resize-handle");
        const box = await handle.boundingBox();
        expect(box).not.toBeNull();
        /* The panel is anchored right: dragging right narrows it, left widens. */
        await page().mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page().mouse.down();
        await page().mouse.move(box.x + (target === "min" ? 3000 : -3000), box.y + box.height / 2, { steps: 12 });
        await page().mouse.up();
        const measured = await page().evaluate(() => {
          const panelBox = document.querySelector('[data-testid="skeleton-detail-panel-shell"]').getBoundingClientRect();
          /* The share is of the Agents canvas (recipes_page's canvasRef); the
             workspace fills it (position absolute, inset 0). */
          const workspace = document.querySelector('[data-testid="skeleton-workspace"]');
          return {
            panel_width: Math.round(panelBox.width),
            container_width: Math.round(workspace.getBoundingClientRect().width),
            window: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
            body_background: getComputedStyle(document.body).backgroundColor,
          };
        });
        const shot = `AC-01 ${panel.name} ${theme} ${target}`;
        await testInfo.attach(shot, { body: await shell.screenshot(), contentType: "image/png" });
        await attachShot(testInfo, page(), `${shot} (window)`);
        cells.push({ panel: panel.name, theme, target, ...measured });
        step("ui", `layout cell ${panel.name}/${theme}/${target}: dragged the panel handle`, measured);
        if (target === "min") expect(measured.panel_width).toBe(300);
      }
    }
  }
  await attachJson(testInfo, "AC-01 cells", cells);
  /* The ceiling is half the space the panel sits in; measured, not assumed. */
  cells.filter((cell) => cell.target === "max").forEach((cell) => {
    expect(Math.abs(cell.panel_width - Math.round(cell.container_width * 0.5))).toBeLessThanOrEqual(2);
  });
  expect(cells).toHaveLength(12);

  await attachJson(testInfo, "ledger (seed vs ui)", ledger);
  expect(pupu.pageErrors).toEqual([]);
});
