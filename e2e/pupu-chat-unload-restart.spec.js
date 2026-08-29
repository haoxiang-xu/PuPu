/* eslint-disable testing-library/prefer-screen-queries */

const { test, expect } = require("./fixtures/pupu_app");

const IS_CI = process.env.CI === "true" || process.env.CI === "1";
const APP_START_TIMEOUT_MS = IS_CI ? 120000 : 60000;
const CATALOG_TIMEOUT_MS = IS_CI ? 60000 : 30000;
const TEST_TIMEOUT_MS = IS_CI ? 300000 : 180000;
const SESSION_EDIT_TO_QUIT_BUDGET_MS = IS_CI ? 1000 : 500;
const PENDING_DRAFT_TO_QUIT_BUDGET_MS = 250;

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
  await expect(startGate).toBeVisible({ timeout: APP_START_TIMEOUT_MS });
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
  await expect(startGate).toBeVisible({ timeout: APP_START_TIMEOUT_MS });
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
  const deadline = Date.now() + CATALOG_TIMEOUT_MS;
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

const waitForToolCapableModel = async (testApi) => {
  const deadline = Date.now() + CATALOG_TIMEOUT_MS;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const catalog = await debugEval(
        testApi,
        "return window.unchainAPI.getModelCatalog()",
      );
      const providers = catalog?.providers || {};
      const capabilities = catalog?.model_capabilities || {};
      const candidates = ["openai", "anthropic", "ollama"].flatMap((provider) =>
        (Array.isArray(providers[provider]) ? providers[provider] : []).map(
          (model) => `${provider}:${model}`,
        ),
      );
      const modelId = candidates.find(
        (candidate) => capabilities[candidate]?.supports_tools !== false,
      );
      if (modelId) return modelId;
      lastError = new Error("model catalog had no tool-capable entry");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Timed out waiting for a tool-capable model: ${
      lastError?.message || "unknown error"
    }`,
  );
};

test("immediate app.quit persists pending chat UI state across a same-userData restart", async ({
  pupu,
}, testInfo) => {
  test.setTimeout(TEST_TIMEOUT_MS);

  await enterFirstRunApp(pupu.appWindow);
  const chatTitle = `unload-restart-${Date.now()}`;
  const draftText = `draft-before-quit-${Date.now()}`;
  const modelId = await waitForToolCapableModel(pupu.testApi);
  const created = await pupu.testApi.post("/chats", {
    title: chatTitle,
    model: modelId,
  });
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
  await expect(toolkitOption).toBeVisible({ timeout: CATALOG_TIMEOUT_MS });
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
  // Toolkit selection precedes the textarea fill. On hosted macOS runners,
  // that UI operation can consume more than the session bundle's 150 ms
  // debounce even though quit is requested immediately afterward. Keep a
  // generous bound for the earlier session edit, while the draft timestamp
  // remains adjacent to app.quit() and proves the 250 ms draft debounce was
  // still pending when the durability drain began.
  expect(previousExit.quitRequestedAt - sessionEditedAt).toBeLessThan(
    SESSION_EDIT_TO_QUIT_BUDGET_MS,
  );
  expect(previousExit.quitRequestedAt - draftEditedAt).toBeLessThan(
    PENDING_DRAFT_TO_QUIT_BUDGET_MS,
  );
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
