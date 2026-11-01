const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./qa357/packaged_app");


/* #357 App fixes, narrow re-run on the packaged Linux App (fix 75ae5952 on
 * candidate c60dc5c7): AC-04's viewer and Escape in the Builder. The twelve
 * layout cells and the rest of the acceptance stand from run 41273700851.
 *
 * Every pointer move is stepped, as a person moves; nothing calls
 * locator.hover() (it scrolls into view first). No field is blurred by the
 * script before Escape: Escape is pressed with focus where typing left it. */
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

/* ── Pointer and keys as a person uses them ─────────────────────────────── */

const moveTo = async (page, locator, steps = 8) => {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps });
};
const awayPoint = async (page) => {
  const box = await page.getByTestId("skeleton-workspace").boundingBox();
  return { x: box.x + box.width * 0.35, y: box.y + box.height * 0.22 };
};
const moveAway = async (page) => {
  const at = await awayPoint(page);
  await page.mouse.move(at.x, at.y, { steps: 8 });
};
const viewerOpen = (page, id) => page.getByTestId(`code-node-${id}`).getAttribute("data-viewer-open");
const builderOpen = (page) => page.getByRole("button", { name: "Close builder" }).isVisible();
const settleMs = (page, ms = 600) => page.waitForTimeout(ms);
/* Z.POPOVER as the source states it (not POPOVER_BLOCKER). */
const Z_POPOVER = Number((fs.readFileSync(path.join(ROOT, "src/BUILTIN_COMPONENTs/layer/z_layers.js"), "utf8").match(/\bPOPOVER:\s*(\d+)/) || [])[1]);

const importBoth = async (page) => {
  for (const name of ["root", "owned-hook"]) {
    const file = path.join(process.env.TMPDIR || ROOT, `qa-357-fix-${name}.json`);
    fs.writeFileSync(file, caseOf(name).exported.source_json, "utf8");
    await page.getByRole("button", { name: "Import an Agent or Workflow" }).click();
    const dialog = page.getByTestId("import-resource-modal");
    await dialog.getByTestId("import-file-input").setInputFiles(file);
    await expect(dialog.getByTestId("import-preview")).toBeVisible();
    if (name === "root") {
      await dialog.getByRole("button", { name: "Name a Python…" }).click();
      await dialog.getByPlaceholder("profile name, e.g. pupu-tools").fill(PYTHON_ID);
      await dialog.getByPlaceholder("absolute path to its python").fill(PYTHON_BIN);
      await dialog.getByTestId("import-runtime-add").getByRole("button", { name: "Add" }).click();
      await expect(dialog.getByTestId("import-runtime-add-state")).toContainText(`${PYTHON_ID} was added`);
    }
    await pick(page, dialog.getByTestId("import-runtime-0"), `${PYTHON_ID} ·`);
    await dialog.getByRole("button", { name: "Import" }).click();
    await expect(dialog.getByTestId("import-done")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  }
  step("seed", "real producer exports (managed_hook_source_capture root, owned-hook) imported through the dialog with the registered Python");
};

/* After each Escape case: the Builder is there, the draft is there, unsaved,
   and the store still holds what it held before. */
const heldAfterEscape = async (page, testInfo, label, id, before, draftCheck) => {
  const open = await builderOpen(page);
  const state = await page.getByTestId("skeleton-save-state").textContent().catch(() => null);
  const draftKept = open ? await draftCheck() : false;
  const after = await getV2(page, id);
  const storeUnchanged = JSON.stringify(after) === JSON.stringify(before);
  await attachShot(testInfo, page, `Esc ${label}`);
  step("ui", `Esc: ${label}`, { builder_open: open, save_state: state, draft_kept: draftKept, store_unchanged: storeUnchanged });
  expect.soft(open, `${label}: the Builder stays open`).toBe(true);
  expect.soft(state, `${label}: still unsaved`).toBe("Unsaved changes");
  expect.soft(draftKept, `${label}: the draft is kept`).toBe(true);
  expect.soft(storeUnchanged, `${label}: nothing written`).toBe(true);
};

test("#357 fixes on the packaged App: the Code viewer by hover, and Escape never closes the Builder over an edit", async ({ pupu }, testInfo) => {
  test.setTimeout(25 * 60 * 1000);
  expect(typeof PYTHON_BIN === "string" && path.isAbsolute(PYTHON_BIN)).toBe(true);
  expect(Number.isInteger(Z_POPOVER)).toBe(true);
  const page = () => pupu.appWindow;
  await enterApp(page());
  await enableAgents(page());
  await seedWorkflowCall(page());
  await seedPinnedHook(page());
  await openAgents(page());
  await importBoth(page());

  /* ── AC-04: the viewer, on a freshly opened Code node ────────────────── */
  await test.step("AC-04 viewer", async () => {
    await openResource(page(), "Managed Code");
    const node = page().getByTestId("code-node-code");
    const button = page().getByRole("button", { name: "View the code of code" });
    await moveTo(page(), node);
    await moveTo(page(), button);
    await settleMs(page());
    const byHover = await viewerOpen(page(), "code");
    const viewer = page().getByTestId("code-node-code-viewer");
    const hoverText = byHover === "true" ? await viewer.textContent() : null;
    await attachShot(testInfo, page(), "AC-04 hover opened");
    step("ui", "stepped pointer onto the node, then the expand button; no press", { viewer_open: byHover });
    expect.soft(byHover, "hover alone opens the viewer").toBe("true");
    expect.soft(hoverText || "", "the viewer is read-only").toContain("Read-only");

    const z = await page().evaluate(() => {
      const bubble = document.querySelector('[role="tooltip"]');
      return bubble ? Number(getComputedStyle(bubble).zIndex) : null;
    });
    step("ui", "viewer layer", { z_index: z, z_popover: Z_POPOVER });
    expect.soft(z, "the viewer sits on Z.POPOVER").toBe(Z_POPOVER);

    await moveTo(page(), viewer);
    await settleMs(page());
    const intoViewer = await viewerOpen(page(), "code");
    step("ui", "moved from the button into the viewer", { viewer_open: intoViewer });
    expect.soft(intoViewer, "moving into the viewer keeps it open").toBe("true");
    await moveAway(page());
    await settleMs(page());
    const leftBoth = await viewerOpen(page(), "code");
    step("ui", "left button and viewer for empty canvas", { viewer_open: leftBoth });
    expect.soft(leftBoth, "leaving both closes it").toBe("false");

    await moveTo(page(), node);
    await moveTo(page(), button);
    await settleMs(page());
    await button.click();
    await moveAway(page());
    await settleMs(page(), 1000);
    const pinned = await viewerOpen(page(), "code");
    await attachShot(testInfo, page(), "AC-04 pinned by click");
    step("ui", "clicked the expand button, then moved away", { viewer_open: pinned });
    expect.soft(pinned, "a click pins it").toBe("true");

    await page().keyboard.press("Escape");
    await settleMs(page());
    const afterEsc = await viewerOpen(page(), "code");
    const builderAfterEsc = await builderOpen(page());
    await attachShot(testInfo, page(), "AC-04 Escape closed the viewer");
    step("ui", "Escape with the pinned viewer open", { viewer_open: afterEsc, builder_open: builderAfterEsc });
    expect.soft(afterEsc, "Escape closes the viewer").toBe("false");
    expect.soft(builderAfterEsc, "and only the viewer").toBe(true);

    await moveTo(page(), node);
    await moveTo(page(), button);
    await settleMs(page());
    const block = page().getByTestId("code-node-code-block");
    const blockBox = await block.boundingBox();
    await page().mouse.move(blockBox.x + 20, blockBox.y + blockBox.height - 8, { steps: 6 });
    await page().mouse.down();
    await page().mouse.move(blockBox.x + 60, blockBox.y + blockBox.height + 30, { steps: 6 });
    await settleMs(page());
    const whileDragging = await viewerOpen(page(), "code");
    const buttonBox = await button.boundingBox();
    await page().mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2, { steps: 6 });
    await settleMs(page());
    const heldOverButton = await viewerOpen(page(), "code");
    await page().mouse.up();
    await settleMs(page());
    const released = await viewerOpen(page(), "code");
    await moveAway(page());
    await moveTo(page(), node);
    await moveTo(page(), button);
    await settleMs(page());
    const backAgain = await viewerOpen(page(), "code");
    step("ui", "pressed the node and dragged; hovered the button while held; released; came back", {
      while_dragging: whileDragging, held_over_button: heldOverButton, released, back_again: backAgain,
    });
    expect.soft(whileDragging, "a press on the node closes it").toBe("false");
    expect.soft(heldOverButton, "no hover while the press is held").toBe("false");
    expect.soft(released, "release alone does not reopen").toBe("false");
    expect.soft(backAgain, "a fresh hover opens it").toBe("true");
    await moveAway(page());

    const canvas = page().getByTestId("skeleton-canvas");
    await moveTo(page(), canvas, 4);
    for (let turn = 0; turn < 40 && (await block.count()) > 0; turn += 1) {
      await page().mouse.wheel(0, 400);
      await page().waitForTimeout(60);
    }
    const folded = await block.count();
    const header = await node.textContent();
    const buttonsLeft = await button.count();
    await attachShot(testInfo, page(), "AC-04 below half zoom");
    step("ui", "zoomed below half", { blocks: folded, expand_buttons: buttonsLeft, header });
    expect.soft(folded, "below half zoom the block is gone").toBe(0);
    expect.soft(buttonsLeft, "and the button with it").toBe(0);
    expect.soft(header || "", "the header stays").toContain("Code ·");
    for (let turn = 0; turn < 40 && (await block.count()) === 0; turn += 1) {
      await page().mouse.wheel(0, -400);
      await page().waitForTimeout(60);
    }
  });

  /* ── Escape: four places with an unsaved edit, focus left where typing put it ── */
  await test.step("Esc in the Code text box", async () => {
    await openResource(page(), "Managed Code");
    const before = await getV2(page(), "import-root-code");
    await pressNode(page(), "code");
    const box = page().getByRole("textbox", { name: "Code of code" });
    const draft = "def main(input, context):\n    return {\"rows\": 4}\n";
    await box.fill(draft);
    const focused = await box.evaluate((element) => element === document.activeElement);
    step("ui", "typed a draft in the Code text box", { focused });
    await page().keyboard.press("Escape");
    await settleMs(page());
    await heldAfterEscape(page(), testInfo, "Code text box", "import-root-code", before,
      async () => (await page().getByRole("textbox", { name: "Code of code" }).inputValue()) === draft);
    /* A second Escape, the field now left: still open, and it says why. */
    await page().keyboard.press("Escape");
    await settleMs(page());
    const second = await builderOpen(page());
    const notice = await page().getByTestId("skeleton-escape-unsaved").textContent().catch(() => null);
    await attachShot(testInfo, page(), "Esc again with nothing focused");
    step("ui", "Escape again, nothing focused", { builder_open: second, notice });
    expect.soft(second, "Escape with an unsaved edit leaves the Builder open").toBe(true);
    expect.soft(notice || "", "and says why").toContain("Unsaved changes");
    await saveNow(page());
    step("ui", "Save (explicit) to leave this resource clean");
  });

  await test.step("Esc in a hook's own Code", async () => {
    await openResource(page(), "Agent");
    const before = await getV2(page(), "import-owned-hook");
    await pressNode(page(), "hooks");
    await page().getByRole("button", { name: "Edit hook 1" }).click();
    await page().getByRole("button", { name: "Open the Workflow of hook policy" }).click();
    await expect(page().getByTestId("skeleton-drill-crumbs")).toContainText("Hooks Pool");
    await pressNode(page(), "step");
    const box = page().getByRole("textbox", { name: "Code of step" });
    const draft = "def main(input, context):\n    return {\"decision\": \"continue\", \"require_approval\": True}  # draft\n";
    await box.fill(draft);
    await page().keyboard.press("Escape");
    await settleMs(page());
    const crumbs = await page().getByTestId("skeleton-drill-crumbs").isVisible().catch(() => false);
    step("ui", "Escape in the hook's Code text box", { drill_still_open: crumbs });
    expect.soft(crumbs, "still inside the hook's Workflow").toBe(true);
    await heldAfterEscape(page(), testInfo, "hook Code text box", "import-owned-hook", before,
      async () => (await page().getByRole("textbox", { name: "Code of step" }).inputValue()) === draft);
    await page().keyboard.press("Escape");
    await expect(page().getByTestId("skeleton-node-hooks")).toBeVisible();
    await saveNow(page());
    step("ui", "Escape once more went up a level; Save (explicit)");
  });

  await test.step("Esc with the tool list open", async () => {
    await openResource(page(), "agent-tool-every");
    const before = await getV2(page(), "agent-tool-every");
    await pressNode(page(), "hooks");
    await page().getByRole("button", { name: "Edit hook 1" }).click();
    const editor = page().getByTestId("hook-0-editor");
    await editor.getByTestId("hook-0-tool").getByText("A set of tools", { exact: true }).click();
    await editor.getByTestId("hook-0-tool-set-picker").getByRole("combobox").click();
    const options = page().getByRole("listbox").last().getByRole("option");
    const names = [await options.nth(0).innerText(), await options.nth(1).innerText()];
    await options.nth(0).click();
    await options.nth(1).click();
    const listsBefore = await page().getByRole("listbox").count();
    await page().keyboard.press("Escape");
    await settleMs(page());
    const listsAfter = await page().getByRole("listbox").count();
    step("ui", "picked two tools, Escape with the list open", { picked: names, lists_before: listsBefore, lists_after: listsAfter });
    expect.soft(listsAfter, "Escape closes the list").toBe(0);
    await heldAfterEscape(page(), testInfo, "tool list", "agent-tool-every", before,
      async () => (await page().getByTestId("hook-row-0").textContent()).includes(names[1].trim()));
    await saveNow(page());
    step("ui", "Save (explicit)");
  });

  await test.step("Esc from the pinned read-only revision", async () => {
    await openResource(page(), "caller-complete");
    const before = await getV2(page(), "caller-complete");
    await pressNode(page(), "call");
    const limit = page().getByTestId("tool-call-argument-limit");
    await limit.getByText("Value", { exact: true }).click();
    await limit.getByPlaceholder("a value written here").fill("357");
    await page().getByRole("button", { name: "Open the pinned graph (read-only)" }).click();
    await expect(page().getByTestId("workflow-pinned-view")).toBeVisible();
    await page().keyboard.press("Escape");
    await settleMs(page());
    const viewGone = (await page().getByTestId("workflow-pinned-view").count()) === 0;
    step("ui", "Escape from the pinned view", { view_closed: viewGone });
    expect.soft(viewGone, "Escape leaves the pinned view").toBe(true);
    await heldAfterEscape(page(), testInfo, "pinned view", "caller-complete", before,
      async () => (await page().getByTestId("tool-call-argument-limit").getByPlaceholder("a value written here").inputValue()) === "357");
    await saveNow(page());
    step("ui", "Save (explicit)");
  });

  /* ── Control: a clean Builder still closes on Escape ─────────────────── */
  await test.step("control: clean Escape closes", async () => {
    await expect(page().getByTestId("skeleton-save-state")).toHaveText("Saved");
    await closeDetail(page());
    await page().keyboard.press("Escape");
    await settleMs(page(), 1000);
    const open = await builderOpen(page());
    await attachShot(testInfo, page(), "control clean Escape");
    step("ui", "Escape with nothing unsaved and nothing open", { builder_open: open });
    expect.soft(open, "a clean Builder closes on Escape").toBe(false);
  });

  expect(pupu.pageErrors).toEqual([]);
});
