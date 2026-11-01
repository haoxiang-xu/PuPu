const { test, expect } = require("./fixtures/pupu_app");
const documents = require("./fixtures/skeleton_branch_documents.json");

// The real desktop probe belongs on an isolated CI user. Running this fixture
// on the developer's macOS account can write CFPreferences outside its HOME.
test.skip(process.env.GITHUB_ACTIONS !== "true" || process.env.RUNNER_ENVIRONMENT !== "github-hosted"
  || process.env.RUNNER_OS !== "Linux", "Run desktop acceptance on the disposable hosted Linux user");

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
  // Match the release probe: Electron's draggable title bar can intercept the
  // sidebar toggle. Branch fields, Save and navigation below use pointer input.
  if (await sidebar.isVisible()) await sidebar.dispatchEvent("click");
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByTestId("agent-explorer")).toBeVisible();
};

test("Branch conditions persist through real preload/Main/Store and an app restart", async ({ pupu }, testInfo) => {
  await enterApp(pupu.appWindow);
  await expect.poll(async () => pupu.appWindow.evaluate(
    () => window.settingsStorageAPI.bootstrap().available,
  )).toBe(true);
  await pupu.appWindow.evaluate(async () => {
    const result = await window.settingsStorageAPI.setNamespace("feature_flags", {
      format: 2, flags: { enable_user_access_to_agents: true },
    });
    if (result.ok !== true) throw new Error("QA feature selection was not persisted");
  });
  await pupu.appWindow.reload();
  await enterApp(pupu.appWindow);

  const saved = [];
  // The graphs are real renderer-produced fixtures, seeded through the real
  // bridge. This checks editing/persistence, not construction from an empty graph.
  for (const [kind, fixture] of Object.entries(documents)) {
    const document = JSON.parse(JSON.stringify(fixture));
    document.id = `qa-351-${kind}-${Date.now()}`;
    document.name = `Branch acceptance ${kind}`;
    const seed = await pupu.appWindow.evaluate(
      (value) => window.unchainAPI.saveSkeletonResource({ document: value }), document,
    );
    expect(seed.document).toEqual(document);
    saved.push({ kind, document, token: seed.edit_token });
  }
  await openAgents(pupu.appWindow);
  for (const row of saved) {
    const page = pupu.appWindow;
    await page.getByTestId("agent-explorer").getByText(row.document.name, { exact: true }).click();
    const branchId = row.kind === "if" ? "if" : "switch";
    await page.getByTestId(`skeleton-node-${branchId}`).click();
    const fieldId = row.kind === "if"
      ? "condition-root-right-literal-text" : "branch-case-0-value-text";
    const value = row.kind === "if" ? "acceptance condition" : "acceptance case";
    await page.getByTestId(fieldId).getByPlaceholder("text", { exact: true }).fill(value);
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
    const before = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(before.document).toEqual(row.document);
    expect(before.edit_token).toBe(row.token);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
    const expected = JSON.parse(JSON.stringify(row.document));
    const execution = expected.nodes.find((node) => node.id === branchId).config.execution;
    if (row.kind === "if") execution.condition.right.value = value;
    else execution.cases[0].value = value;
    const after = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(after.document).toEqual(expected);
    expect(after.edit_token).not.toBe(row.token);
    expect(after.diagnostics).toEqual([]);
    await page.getByRole("button", { name: "Open the run menu", exact: true }).click();
    await expect(page.getByTestId("skeleton-preflight-state")).toHaveText("Ready to run.");
    row.expected = after;
    row.fieldId = fieldId;
    row.value = value;
    await testInfo.attach(`branch-${row.kind}-saved`, {
      body: Buffer.from(JSON.stringify({ before, after }, null, 2)), contentType: "application/json",
    });
  }
  await testInfo.attach("Branch editor", {
    body: await pupu.appWindow.screenshot(), contentType: "image/png",
  });
  await pupu.restartSameUserData();
  await enterApp(pupu.appWindow);
  await openAgents(pupu.appWindow);
  for (const row of saved) {
    const page = pupu.appWindow;
    const cold = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(cold).toEqual(row.expected);
    await page.getByTestId("agent-explorer").getByText(row.document.name, { exact: true }).click();
    await page.getByTestId(`skeleton-node-${row.kind === "if" ? "if" : "switch"}`).click();
    await expect(page.getByTestId(row.fieldId).getByPlaceholder("text", { exact: true })).toHaveValue(row.value);
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
    await testInfo.attach(`branch-${row.kind}-cold`, {
      body: Buffer.from(JSON.stringify(cold, null, 2)), contentType: "application/json",
    });
  }
  expect(pupu.pageErrors).toEqual([]);
});
