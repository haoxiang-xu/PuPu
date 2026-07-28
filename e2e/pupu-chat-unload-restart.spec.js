/* eslint-disable testing-library/prefer-screen-queries */

const { test, expect } = require("./fixtures/pupu_app");

const BASE_TOOLKIT_IDS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

const enterFirstRunApp = async (appWindow) => {
  const startGate = appWindow.getByRole("button", {
    name: "Click anywhere to start",
  });
  await expect(startGate).toBeVisible({ timeout: 60000 });
  await startGate.click();
  await expect(startGate).toBeHidden();

  const setupDialog = appWindow.getByRole("dialog");
  await expect(setupDialog).toContainText("Setup");
  await setupDialog.getByRole("button", { name: "Skip for now" }).click();
  await expect(setupDialog).toBeHidden();
  await expect(appWindow.locator("[data-chat-id]").first()).toBeVisible();
};

const enterRestartedApp = async (appWindow) => {
  const startGate = appWindow.getByRole("button", {
    name: "Click anywhere to start",
  });
  await expect(startGate).toBeVisible({ timeout: 60000 });
  await startGate.click();
  await expect(startGate).toBeHidden();

  // "Skip for now" intentionally closes setup without setting
  // app.setup_completed. A new renderer therefore shows it again even with
  // the same persisted userData; dismiss it before checking chat durability.
  const skipSetup = appWindow.getByRole("button", { name: "Skip for now" });
  const setupReappeared = await skipSetup.isVisible();
  if (setupReappeared) {
    const setupDialog = appWindow.getByRole("dialog");
    await skipSetup.click();
    await expect(setupDialog).toBeHidden();
  }
  await expect(appWindow.locator("[data-chat-id]").first()).toBeVisible();
  return { setupReappeared };
};

const debugEval = async (testApi, code) => {
  const result = await testApi.post("/debug/eval", { code, await: true });
  if (!result?.ok) {
    throw new Error(result?.error?.message || "debug eval failed");
  }
  return result.value;
};

const waitForSelectableToolkit = async (testApi) => {
  const deadline = Date.now() + 30000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const catalog = await debugEval(
        testApi,
        "return window.unchainAPI.listToolModalCatalog()",
      );
      const candidates = (catalog?.toolkits || []).filter((toolkit) => {
        const toolkitId = String(toolkit?.toolkitId || "").trim();
        const source = String(toolkit?.source || "")
          .trim()
          .toLowerCase();
        const status = String(toolkit?.status || "")
          .trim()
          .toLowerCase();
        return (
          toolkitId &&
          !BASE_TOOLKIT_IDS.has(toolkitId.toLowerCase()) &&
          !toolkitId.toLowerCase().endsWith(".toolkit") &&
          toolkitId !== "builtin.computer" &&
          source !== "plugin" &&
          toolkit?.hidden !== true &&
          (!status || status === "available") &&
          (!Array.isArray(toolkit?.capabilityRequirements) ||
            toolkit.capabilityRequirements.length === 0)
        );
      });
      candidates.sort((left, right) => {
        if (left.toolkitId === "plan") return -1;
        if (right.toolkitId === "plan") return 1;
        return String(left.toolkitName || left.toolkitId).localeCompare(
          String(right.toolkitName || right.toolkitId),
        );
      });
      if (candidates[0]) return candidates[0];
      lastError = new Error("toolkit catalog had no selectable entry");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Timed out waiting for a selectable toolkit: ${
      lastError?.message || "unknown error"
    }`,
  );
};

test("immediate app.quit persists pending chat UI state across a same-userData restart", async ({
  pupu,
}, testInfo) => {
  test.setTimeout(180000);

  await enterFirstRunApp(pupu.appWindow);
  const chatTitle = `unload-restart-${Date.now()}`;
  const draftText = `draft-before-quit-${Date.now()}`;
  const created = await pupu.testApi.post("/chats", { title: chatTitle });
  const chatId = created.chat_id;
  expect(chatId).toBeTruthy();
  await expect
    .poll(async () => (await pupu.testApi.get("/debug/state")).active_chat_id)
    .toBe(chatId);

  const toolkit = await waitForSelectableToolkit(pupu.testApi);
  const toolkitName = String(toolkit.toolkitName || toolkit.toolkitId);
  const composer = pupu.appWindow.locator("textarea").first();
  await expect(composer).toBeVisible();
  await composer.focus();

  const toolkitTrigger = pupu.appWindow.getByRole("button", {
    name: "Select plugins",
  });
  await expect(toolkitTrigger).toBeVisible();
  await toolkitTrigger.dispatchEvent("click");
  const toolkitOption = pupu.appWindow
    .getByRole("option")
    .filter({ hasText: toolkitName })
    .first();
  await expect(toolkitOption).toBeVisible({ timeout: 30000 });
  await expect(toolkitOption).toHaveAttribute("aria-selected", "false");

  // The selector's sliding highlight keeps the option's box in motion while
  // the refreshed toolkit catalog settles. Dispatch the real DOM click without
  // waiting for Playwright's geometric-stability heuristic.
  await toolkitOption.dispatchEvent("click");
  const sessionEditedAt = Date.now();
  await composer.fill(draftText);
  const draftEditedAt = Date.now();

  const { previousExit } = await pupu.restartSameUserData();
  expect(previousExit).toMatchObject({
    generation: 1,
    code: 0,
    signal: null,
  });
  expect(previousExit.quitRequestedAt - sessionEditedAt).toBeLessThan(150);
  expect(previousExit.quitRequestedAt - draftEditedAt).toBeLessThan(250);
  expect(pupu.generation).toBe(2);

  const restartEntry = await enterRestartedApp(pupu.appWindow);
  await testInfo.attach("restart observations", {
    body: Buffer.from(JSON.stringify(restartEntry, null, 2), "utf8"),
    contentType: "application/json",
  });
  await expect
    .poll(async () => (await pupu.testApi.get("/debug/state")).active_chat_id)
    .toBe(chatId);
  await expect(pupu.appWindow.locator("textarea").first()).toHaveValue(
    draftText,
  );

  const restoredChat = await pupu.testApi.get(
    `/chats/${encodeURIComponent(chatId)}`,
  );
  expect(restoredChat.toolkits).toContain(toolkit.toolkitId);
  expect(pupu.pageErrors).toEqual([]);
});
