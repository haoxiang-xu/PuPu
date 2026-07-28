const { test, expect } = require("./fixtures/pupu_app");

const expectedWebOrigin = new URL(
  process.env.PUPU_E2E_WEB_URL || "http://127.0.0.1:2907/#",
).origin;

test("AI can observe and control the PuPu Electron app through UI and Test API", async ({
  pupu,
}, testInfo) => {
  const { electronProcess, appWindow, testApi, pageErrors } = pupu;
  const chatTitle = `playwright-release-${Date.now()}`;
  let chatId = null;

  await test.step("verify the real Electron boundary", async () => {
    const runtime = await appWindow.evaluate(() => {
      return {
        href: window.location.href,
        hasUnchainBridge: typeof window.unchainAPI === "object",
        hasNodeRequire: typeof window.require !== "undefined",
        hasNodeProcess: typeof window.process !== "undefined",
      };
    });

    expect(electronProcess.pid).toBeGreaterThan(0);
    expect(new URL(runtime.href).origin).toBe(expectedWebOrigin);
    expect(runtime.hasUnchainBridge).toBe(true);
    expect(runtime.hasNodeRequire).toBe(false);
    expect(runtime.hasNodeProcess).toBe(false);
  });

  await test.step("cover first-run setup and enter the main app", async () => {
    const startGate = appWindow.getByRole("button", {
      name: "Click anywhere to start",
    });
    await expect(startGate).toBeVisible();
    await startGate.click();
    await expect(startGate).toBeHidden();

    const setupDialog = appWindow.getByRole("dialog");
    await expect(setupDialog).toContainText("Setup");
    await expect(
      setupDialog.getByRole("button", { name: "Skip for now" }),
    ).toBeVisible();

    const onboardingPath = testInfo.outputPath("onboarding.png");
    await appWindow.screenshot({ path: onboardingPath });
    await testInfo.attach("Onboarding", {
      path: onboardingPath,
      contentType: "image/png",
    });

    await setupDialog.getByRole("button", { name: "Skip for now" }).click();
    await expect(setupDialog).toBeHidden();
  });

  try {
    await test.step("drive semantic state through the Test API", async () => {
      const initialState = await testApi.get("/debug/state");
      expect(initialState.window_state.width).toBeGreaterThan(900);
      expect(initialState.is_streaming).toBe(false);

      const created = await testApi.post("/chats", { title: chatTitle });
      chatId = created.chat_id;
      expect(chatId).toBeTruthy();

      await expect.poll(async () => {
        const state = await testApi.get("/debug/state");
        return state.active_chat_id;
      }).toBe(chatId);
    });

    await test.step("exercise the AI-facing accessibility control contract", async () => {
      const composer = appWindow.locator("textarea").first();
      await expect(composer).toBeVisible();
      await expect(composer).toHaveAttribute("aria-label", /.+/);

      // Electron's draggable title bar can win Chromium hit-testing even though
      // this control is explicitly marked as a native no-drag region.
      await appWindow
        .getByRole("button", { name: "Open sidebar" })
        .dispatchEvent("click");
      await expect(
        appWindow.getByRole("button", { name: "Close sidebar" }),
      ).toBeVisible();
      await appWindow.getByRole("button", { name: "Settings" }).click();
      const settingsDialog = appWindow.getByRole("dialog");
      await expect(settingsDialog).toBeVisible();
      await expect.poll(async () => {
        const state = await testApi.get("/debug/state");
        return state.modal_open.includes("settings-modal");
      }).toBe(true);

      const settingsPath = testInfo.outputPath("settings.png");
      await appWindow.screenshot({ path: settingsPath });
      await testInfo.attach("Settings", {
        path: settingsPath,
        contentType: "image/png",
      });

      await settingsDialog
        .getByRole("button", { name: "Close settings" })
        .click();
      await expect(settingsDialog).toBeHidden();

      await composer.fill("Playwright can control this composer without sending.");
      await expect(composer).toHaveValue(
        "Playwright can control this composer without sending.",
      );
    });
  } finally {
    if (chatId) {
      await testApi.delete(`/chats/${chatId}`).catch(() => {});
    }
  }

  expect(pageErrors).toEqual([]);
});
