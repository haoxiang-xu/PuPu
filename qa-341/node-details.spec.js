const { test, expect } = require("./fixtures/pupu_app");
const steps = require("./fixtures/skeleton_step_documents.json");

// QA-only source-App control, installed into e2e/ in the disposable control
// branch. It must not be counted as a packaged-release qualification.
test.skip(process.env.PUPU_NODE_DETAILS_ACCEPTANCE !== "1" || process.env.GITHUB_ACTIONS !== "true"
  || process.env.RUNNER_ENVIRONMENT !== "github-hosted" || process.env.RUNNER_OS !== "Linux",
"Requires the disposable hosted Linux control with only a loopback route");

const copy = (value) => JSON.parse(JSON.stringify(value));
const getResource = (page, id) => page.evaluate(async (id) => {
  const result = await window.unchainAPI.getManagedSkeletonResource(id);
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
}, id);
async function enter(page) {
  const gate = page.getByRole("button", { name: "Click anywhere to start", exact: true });
  await expect(gate).toBeVisible({ timeout: 120000 });
  await gate.click();
  const skip = page.getByRole("button", { name: "Skip for now", exact: true });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toHaveCount(0);
}
async function agents(page) {
  if (!await page.getByRole("button", { name: "Close sidebar", exact: true }).isVisible()) {
    // The closed sidebar's labelled toggle is clipped. Use the real title-bar
    // hit target; no force, dispatchEvent or DOM mutation is permitted.
    await expect.poll(() => page.evaluate(() => {
      const hit = document.elementFromPoint(26, 25);
      return !!hit?.closest('button, [role="button"]');
    })).toBe(true);
    await page.mouse.click(26, 25);
  }
  await expect(page.getByRole("button", { name: "Close sidebar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByTestId("agent-explorer")).toBeVisible();
}
async function choose(page, id) {
  // Finder is a user-facing route to nodes covered by the floating panel.
  const canvas = page.getByTestId("skeleton-canvas");
  const point = await canvas.evaluate((element) => {
    const r = element.getBoundingClientRect();
    // A drilled-in graph is centred and its chrome sits at the edges, so the
    // four original probes can all be taken; walk an interior grid as well.
    const probes = [[2, 2], [2, r.height / 2], [r.width / 2, 2], [r.width / 2, r.height / 2]];
    for (const fy of [0.5, 0.25, 0.75, 0.35, 0.65]) for (const fx of [0.5, 0.15, 0.85, 0.3, 0.7]) probes.push([r.width * fx, r.height * fy]);
    for (const [dx, dy] of probes) {
      const x = r.left + dx, y = r.top + dy;
      const hit = document.elementFromPoint(x, y);
      if (hit && element.contains(hit) && !hit.closest('button, [role="button"], input, textarea, select, [data-flow-node-id], [data-flow-edge-id], [role="listbox"]')) return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press("Control+f");
  await page.getByPlaceholder("Find a node", { exact: true }).fill(id);
  await page.getByTestId(`palette-node-${id}`).click();
}
async function attachJson(testInfo, name, value) {
  await testInfo.attach(name, { body: Buffer.from(JSON.stringify(value, null, 2)), contentType: "application/json" });
}
function seed() {
  const document = copy(steps.tool);
  document.id = "qa-341-details";
  document.name = "QA 341 node details";
  document.nodes = document.nodes.filter((node) => ["start", "router", "end"].includes(node.id));
  document.edges = [
    { id: "s-a", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "router", target_port_id: "in" },
    { id: "a-e", kind: "flow", source_node_id: "router", source_port_id: "out", target_node_id: "end", target_port_id: "in" },
  ];
  const child = copy(document);
  child.id = "qa-341-owned-child"; child.name = "Owned Child 341";
  document.nodes.push(
    { id: "tools", type: "toolkit_pool", label: "Tools 341", config: { toolkits: [], merge_with_user_selected: false } },
    { id: "pool", type: "subagent_pool", label: "Reviewers 341", config: { subagents: [
      { id: "owned", name: "Owned Child 341", description: "QA owned child", source: { kind: "embedded", document: child } },
    ] } },
  );
  const agent = document.nodes.find((node) => node.id === "router");
  agent.label = "Reviewer 341";
  agent.config.execution.inputs = Array.from({ length: 18 }, (_, i) => ({ name: `input_${i}`,
    missing: "error", value: { kind: "literal", value: `Value ${i}` } }));
  return document;
}

test("#341 Rename, Start caller context, cold read and shared shell geometry", async ({ pupu }, testInfo) => {
  test.setTimeout(240000);
  const page = pupu.appWindow;
  await enter(page);
  await expect.poll(() => page.evaluate(() => window.settingsStorageAPI.bootstrap().available)).toBe(true);
  // Seed the feature and theme via the real persistent settings bridge. These
  // are setup operations, not claimed as mouse-driven authoring.
  await page.evaluate(async () => {
    for (const [name, value] of [["feature_flags", { format: 2, flags: { enable_user_access_to_agents: true } }], ["appearance", { theme_mode: "light_mode" }]]) {
      const result = await window.settingsStorageAPI.setNamespace(name, value);
      if (!result.ok) throw new Error("Settings seed failed: " + name);
    }
  });
  await page.reload(); await enter(page);
  const expectedManifest = process.env.NODE_LABEL_EXPECTED_MANIFEST;
  expect(expectedManifest).toMatch(/^sha256:[a-f0-9]{64}$/);
  let capabilities;
  await expect.poll(async () => {
    capabilities = await page.evaluate(() => window.unchainAPI.getManagedCodeCapabilities());
    return capabilities?.runtime_manifest?.manifest_digest;
  }, { timeout: 120000 }).toBe(expectedManifest);
  expect(capabilities.runtime_manifest.manifest_digest).toBe(expectedManifest);
  expect(capabilities.runtime_manifest.protocols.find((p) => p.id === "skeleton_execution"))
    .toMatchObject({ major: 1, minor: 8, features: expect.arrayContaining(["node_display_label_v1"]) });
  await attachJson(testInfo, "actual-capabilities", capabilities);
  const document = seed();
  const initial = await page.evaluate((document) => window.unchainAPI.saveManagedSkeletonResource({
    schema: "pupu.skeleton-edit.v2", document, expected_edit_token: null, managed_sources: [],
  }), document);
  expect(initial.resource.document).toEqual(document);
  await agents(page);
  await page.getByTestId("agent-explorer").getByText(document.name, { exact: true }).click();
  await choose(page, "start");
  const startNode = page.locator('[data-flow-node-id="start"]');
  await startNode.click();
  await expect(page.getByTestId("skeleton-input-variables")).toContainText("Caller input");
  await expect(page.getByTestId("skeleton-input-variables").getByRole("button")).toHaveCount(0);
  await startNode.click({ button: "right" });
  await page.getByText("Rename", { exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Rename node", exact: true });
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
  expect((await getResource(page, document.id)).resource).toEqual(initial.resource);
  await startNode.click(); await page.keyboard.press("F2");
  dialog = page.getByRole("dialog", { name: "Rename node", exact: true });
  const title = "  用户输入 e\u0301  ";
  await dialog.getByRole("textbox").fill(title);
  await dialog.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  expect((await getResource(page, document.id)).resource).toEqual(initial.resource);
  await page.getByTitle("Undo (Ctrl+Z)", { exact: true }).getByRole("button").click();
  // Stepping is an edit by design (skeleton_resource_session.js: "the draft is
  // unsaved"), so the state stays "Unsaved changes"; the undone document must
  // show the saved name again and the store must be untouched.
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  await expect(page.getByTestId("recipe-detail-panel-header")).not.toContainText(title.trim());
  expect((await getResource(page, document.id)).resource).toEqual(initial.resource);
  await page.getByTitle("Redo (Ctrl+Y)", { exact: true }).getByRole("button").click();
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Unsaved changes");
  await expect(page.getByTestId("recipe-detail-panel-header")).toContainText(title.trim());
  await startNode.click(); await page.keyboard.press("F2");
  await page.getByRole("dialog", { name: "Rename node", exact: true }).getByRole("textbox").fill("Discard me");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Rename node", exact: true })).toHaveCount(0);
  await expect(page.getByTestId("skeleton-resource-page")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("skeleton-save-state")).toHaveText("Saved");
  const saved = await getResource(page, document.id);
  const expected = copy(document); expected.nodes.find((n) => n.id === "start").label = title;
  expect(saved.resource.document).toEqual(expected);
  await attachJson(testInfo, "rename-before-after", { initial, saved });

  await choose(page, "pool");
  await page.getByRole("button", { name: "Open Owned Child 341", exact: true }).click();
  await choose(page, "start");
  await expect(page.getByTestId("skeleton-input-variables")).toContainText("same delegated message text");
  await expect(page.getByTestId("skeleton-input-variables")).toContainText("message");
  await expect(page.getByTestId("skeleton-input-variables").getByRole("button")).toHaveCount(0);
  await testInfo.attach("subagent-caller-input", { body: await page.screenshot(), contentType: "image/png" });
  // Escape is answered by the nearest thing on top (the detail panel), not the
  // drill; the user's way back is the breadcrumb.
  await page.getByRole("button", { name: `Back to ${document.name}`, exact: true }).click();
  await expect(page.getByText(/owns this embedded graph/)).toHaveCount(0);
  await choose(page, "start");
  await expect(page.getByTestId("skeleton-input-variables")).toContainText("Caller input");

  const geometry = [];
  for (const mode of ["light_mode", "dark_mode"]) {
    if (mode === "dark_mode") {
      await page.evaluate(async (mode) => {
        const result = await window.settingsStorageAPI.setNamespace("appearance", { theme_mode: mode });
        if (!result.ok) throw new Error("Theme seed failed");
      }, mode);
      await page.reload(); await enter(page); await agents(page);
      await page.getByTestId("agent-explorer").getByText(document.name, { exact: true }).click();
    }
    for (const size of ["minimum", "maximum"]) {
      await choose(page, "router");
      const handle = await page.getByTestId("skeleton-detail-resize-handle").boundingBox();
      const canvas = await page.getByTestId("skeleton-canvas").boundingBox();
      expect(handle).not.toBeNull(); expect(canvas).not.toBeNull();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(size === "minimum" ? canvas.x + canvas.width - 5 : canvas.x + 5, handle.y + handle.height / 2, { steps: 10 });
      await page.mouse.up();
      for (const id of ["start", "router", "end", "tools", "pool"]) {
        await choose(page, id);
        const header = page.getByTestId("recipe-detail-panel-header");
        const body = page.getByTestId("recipe-detail-panel-body");
        await body.hover(); await page.mouse.wheel(0, -10000);
        await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
        const before = await header.boundingBox();
        const overflows = await body.evaluate((element) => element.scrollHeight > element.clientHeight);
        await page.mouse.wheel(0, 1600);
        if (overflows) await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
        const after = await header.boundingBox();
        expect(Math.abs(after.y - before.y)).toBeLessThan(1);
        const measurement = await body.evaluate((element) => ({
          clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
          scrollTop: element.scrollTop, overflowY: getComputedStyle(element).overflowY,
          background: getComputedStyle(document.documentElement).getPropertyValue("--pupu-background"),
        }));
        expect(measurement.scrollWidth).toBeLessThanOrEqual(measurement.clientWidth + 1);
        expect(measurement.overflowY).toBe("auto");
        if (id === "router") expect(measurement.scrollTop).toBeGreaterThan(0);
        const panel = await page.getByTestId("skeleton-detail-panel-shell").boundingBox();
        // Shell border box can include its two 1px borders.
        expect(Math.abs(panel.width - (size === "minimum" ? 300 : canvas.width / 2))).toBeLessThanOrEqual(3);
        geometry.push({ mode, size, id, before, after, panel, canvas, ...measurement });
        await testInfo.attach(`shell-${mode}-${size}-${id}`, { body: await page.screenshot(), contentType: "image/png" });
      }
    }
  }
  await attachJson(testInfo, "shell-geometry", geometry);
  await pupu.restartSameUserData();
  await enter(pupu.appWindow);
  const cold = await getResource(pupu.appWindow, document.id);
  expect(cold).toEqual(saved);
  await agents(pupu.appWindow);
  await pupu.appWindow.getByTestId("agent-explorer").getByText(document.name, { exact: true }).click();
  await choose(pupu.appWindow, "start");
  await expect(pupu.appWindow.getByTestId("recipe-detail-panel-header")).toContainText(title.trim());
  await expect(pupu.appWindow.getByTestId("skeleton-input-variables")).toContainText("Caller input");
  await attachJson(testInfo, "cold-resource", cold);
  expect(pupu.pageErrors).toEqual([]);
});
