const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./fixtures/pupu_app");
const documents = require("./fixtures/skeleton_step_documents.json");

// This probe must run on a disposable hosted user with no external route.
// Local macOS HOME redirection does not isolate CFPreferences.
test.skip(process.env.PUPU_STEPS_ACCEPTANCE !== "1" || process.env.GITHUB_ACTIONS !== "true"
  || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.RUNNER_OS !== "Linux",
"Run the exact-pair offline steps acceptance control on its disposable Linux user");

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
  // Only the title-bar navigation toggle needs the established fixture adapter.
  // Node fields, picking, Save and reopening below use actual pointer input.
  if (await sidebar.isVisible()) await sidebar.dispatchEvent("click");
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByTestId("agent-explorer")).toBeVisible();
};

test("Tool Call and Skill Read edits persist through real bridges, Store and restart", async ({ pupu }, testInfo) => {
  const identities = {};
  for (const suffix of ["a", "b"]) {
    const name = `qa-notes-${suffix}`;
    const file = path.join(process.env.HOME, ".unchain", "skills", name, "SKILL.md");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: Offline desktop notes\n---\nDesktop skill ${suffix}`);
    identities[suffix] = { source: "user-unchain", source_id: file, name };
  }
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

  const rows = [];
  // Setup seeds are actual page-produced documents; construction from an empty
  // canvas is covered by page tests, not claimed by this desktop probe.
  for (const [kind, fixture] of Object.entries(documents)) {
    const document = JSON.parse(JSON.stringify(fixture));
    document.id = `qa-352-${kind}-${Date.now()}`;
    document.name = `Deterministic acceptance ${kind}`;
    if (kind === "skill") document.nodes.find((node) => node.id === "skill").config.skill = identities.a;
    const seed = await pupu.appWindow.evaluate(
      (value) => window.unchainAPI.saveSkeletonResource({ document: value }), document,
    );
    expect(seed.document).toEqual(document);
    rows.push({ kind, document, token: seed.edit_token });
  }
  await openAgents(pupu.appWindow);
  for (const row of rows) {
    const page = pupu.appWindow;
    await page.getByTestId("agent-explorer").getByText(row.document.name, { exact: true }).click();
    await page.getByTestId(`skeleton-node-${row.kind}`).click();
    const expected = JSON.parse(JSON.stringify(row.document));
    if (row.kind === "tool") {
      const field = page.getByTestId("tool-call-argument-content").getByPlaceholder("a value written here");
      await expect(field).toHaveValue("written by the builder");
      await field.fill("Edited on the real desktop");
      expected.nodes.find((node) => node.id === "tool").config.execution.inputs
        .find((input) => input.name === "content").value.value = "Edited on the real desktop";
    } else {
      await expect(page.getByTestId("skill-read-preview-body")).toHaveText("Desktop skill a");
      await page.getByTestId("skill-read-picker").getByRole("combobox").click();
      await page.getByRole("listbox").getByText("qa-notes-b · your skills (~/.unchain)", { exact: true }).click();
      await expect(page.getByTestId("skill-read-preview-body")).toHaveText("Desktop skill b");
      expected.nodes.find((node) => node.id === "skill").config.skill = identities.b;
    }
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
    const before = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(before.document).toEqual(row.document);
    expect(before.edit_token).toBe(row.token);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
    const after = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(after.document).toEqual(expected);
    expect(after.edit_token).not.toBe(row.token);
    expect(after.diagnostics).toEqual([]);
    await page.getByRole("button", { name: "Open the run menu", exact: true }).click();
    await expect(page.getByTestId("skeleton-preflight-state")).toHaveText("Ready to run.");
    row.expected = after;
    await testInfo.attach(`steps-${row.kind}-saved`, {
      body: Buffer.from(JSON.stringify({ before, after }, null, 2)), contentType: "application/json",
    });
    await testInfo.attach(`Steps ${row.kind} editor`, { body: await page.screenshot(), contentType: "image/png" });
  }
  await pupu.restartSameUserData();
  await enterApp(pupu.appWindow);
  await openAgents(pupu.appWindow);
  for (const row of rows) {
    const page = pupu.appWindow;
    const cold = await page.evaluate((id) => window.unchainAPI.getSkeletonResource(id), row.document.id);
    expect(cold).toEqual(row.expected);
    await page.getByTestId("agent-explorer").getByText(row.document.name, { exact: true }).click();
    await page.getByTestId(`skeleton-node-${row.kind}`).click();
    if (row.kind === "tool") {
      await expect(page.getByTestId("tool-call-argument-content").getByPlaceholder("a value written here"))
        .toHaveValue("Edited on the real desktop");
    } else {
      await expect(page.getByTestId("skill-read-preview-body")).toHaveText("Desktop skill b");
    }
    await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
    await testInfo.attach(`steps-${row.kind}-cold`, {
      body: Buffer.from(JSON.stringify(cold, null, 2)), contentType: "application/json",
    });
  }
  expect(pupu.pageErrors).toEqual([]);
});
