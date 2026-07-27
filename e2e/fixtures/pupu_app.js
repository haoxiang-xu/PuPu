const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const { test: base, expect } = require("@playwright/test");
const { chromium } = require("playwright");

const REPO_ROOT = path.resolve(__dirname, "../..");
const WEB_URL = process.env.PUPU_E2E_WEB_URL || "http://localhost:2907/#";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

const waitForCdp = async (
  port,
  appUrl,
  processLogs,
  electronProcess,
  timeoutMs = 60000,
) => {
  const endpoint = `http://127.0.0.1:${port}`;
  const expectedOrigin = new URL(appUrl).origin;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (electronProcess?.exitCode != null || electronProcess?.signalCode) {
      throw new Error(
        `Electron exited before CDP became ready on ${endpoint}\n${processLogs.join("")}`,
      );
    }
    try {
      const response = await fetch(`${endpoint}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const appTargetReady = targets.some(
          (target) =>
            target.type === "page" && target.url.startsWith(expectedOrigin),
        );
        if (appTargetReady) return endpoint;
      }
    } catch (_) {
      // CDP may not be accepting connections yet; the process check above
      // distinguishes normal startup from an Electron crash.
    }
    await sleep(200);
  }
  throw new Error(
    `Timed out waiting for Electron CDP on ${endpoint}\n${processLogs.join("")}`,
  );
};

const waitForProcessExit = async (child, timeoutMs) => {
  if (child.exitCode != null || child.signalCode) return true;
  return await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    sleep(timeoutMs).then(() => false),
  ]);
};

const stopElectronProcess = async (child) => {
  if (!child || child.exitCode != null || child.signalCode) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    await waitForProcessExit(child, 10000);
    return;
  }

  child.kill("SIGTERM");
  const exited = await waitForProcessExit(child, 5000);
  if (!exited) {
    child.kill("SIGKILL");
    await waitForProcessExit(child, 5000);
  }
};

const waitForJsonFile = async (filePath, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (_) {
      await sleep(200);
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
};

const waitForAppQuitOutcome = (child, dialogPromise, timeoutMs = 10000) =>
  new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const onExit = (code, signal) => finish({ kind: "exit", code, signal });
    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      child?.off("exit", onExit);
      resolve(outcome);
    };

    child?.once("exit", onExit);
    timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    dialogPromise.then((dialog) => finish({ kind: "dialog", dialog }));
    if (!child || child.exitCode != null || child.signalCode) {
      finish({
        kind: "exit",
        code: child?.exitCode ?? null,
        signal: child?.signalCode ?? null,
      });
    }
  });

const createTestApiClient = (baseUrl) => {
  const request = async (method, endpointPath, body, options = {}) => {
    const baseInit = {
      method,
      headers: body == null ? {} : { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    };
    const timeoutMs = Math.max(0, Number(options.timeoutMs) || 0);
    const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : 0;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const remainingMs = deadline > 0 ? deadline - Date.now() : 0;
      if (deadline > 0 && remainingMs <= 0) {
        throw new Error(`Test API request timed out: ${endpointPath}`);
      }
      const controller = deadline > 0 ? new AbortController() : null;
      const timer =
        controller && remainingMs > 0
          ? setTimeout(() => controller.abort(), remainingMs)
          : null;
      let response;
      try {
        response = await fetch(`${baseUrl}${endpointPath}`, {
          ...baseInit,
          signal: controller?.signal,
        });
      } catch (error) {
        if (controller?.signal.aborted) {
          throw new Error(`Test API request timed out: ${endpointPath}`);
        }
        throw error;
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (response.status === 503) {
        await sleep(200);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? await response.json()
        : Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        const error = new Error(
          payload?.error?.message ||
            `Test API request failed: ${response.status}`,
        );
        Object.assign(error, { status: response.status, body: payload });
        throw error;
      }
      return payload;
    }
    throw new Error(`Test API did not become ready: ${endpointPath}`);
  };

  return {
    baseUrl,
    get: (endpointPath) => request("GET", endpointPath),
    post: (endpointPath, body = {}, options = {}) =>
      request("POST", endpointPath, body, options),
    patch: (endpointPath, body = {}) => request("PATCH", endpointPath, body),
    delete: (endpointPath) => request("DELETE", endpointPath),
  };
};

const closeBrowserConnection = async (browser) => {
  if (!browser) return;
  await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
};

const test = base.extend({
  pupu: async ({}, use, testInfo) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-e2e-"));
    const testApiPortFile = path.join(userDataDir, "test-api-port");
    const processLogs = [];
    const pageErrors = [];
    const dialogHandlingErrors = [];
    let runtime = null;
    let generation = 0;
    let lastControlledExit = null;

    const launchElectron = async () => {
      generation += 1;
      fs.rmSync(testApiPortFile, { force: true });

      const state = {
        generation,
        debugPort: await getFreePort(),
        electronProcess: null,
        browser: null,
        appWindow: null,
        testApi: null,
        appQuitRequested: false,
        resolveAppQuitDialog: null,
        appQuitDialogHandling: Promise.resolve(),
        quitRequestedAt: null,
        controlledExit: false,
        exitOutcome: null,
      };
      runtime = state;

      state.electronProcess = spawn(
        require("electron"),
        [
          `--remote-debugging-port=${state.debugPort}`,
          `--user-data-dir=${userDataDir}`,
          // The release runners intentionally replace HOME with an isolated
          // directory. On macOS, Chromium would otherwise look for a default
          // keychain inside that fake HOME and show a blocking "Keychain Not
          // Found" dialog. The mock keychain is scoped to this test Electron
          // process and leaves the user's real Keychain untouched.
          ...(process.platform === "darwin" ? ["--use-mock-keychain"] : []),
          ".",
        ],
        {
          cwd: REPO_ROOT,
          env: {
            ...process.env,
            NODE_ENV: "development",
            ELECTRON_START_URL: WEB_URL,
            PUPU_TEST_API_DISABLE: "0",
            PUPU_COMPUTER_USE: "0",
            PUPU_E2E: "1",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      state.electronProcess.stdout.on("data", (chunk) =>
        processLogs.push(chunk.toString()),
      );
      state.electronProcess.stderr.on("data", (chunk) =>
        processLogs.push(chunk.toString()),
      );

      const cdpEndpoint = await waitForCdp(
        state.debugPort,
        WEB_URL,
        processLogs,
        state.electronProcess,
      );
      state.browser = await chromium.connectOverCDP(cdpEndpoint);
      const context = state.browser.contexts()[0];
      state.appWindow = context
        .pages()
        .find((page) => page.url().startsWith(new URL(WEB_URL).origin));
      if (!state.appWindow) {
        state.appWindow = await context.waitForEvent("page");
      }
      state.appWindow.on("dialog", (dialog) => {
        const duringAppQuit = state.appQuitRequested;
        if (duringAppQuit && state.resolveAppQuitDialog) {
          state.resolveAppQuitDialog({ type: dialog.type() });
        }
        // During a real app.quit(), dismiss beforeunload so PuPu's fail-closed
        // durability decision is honored and reported instead of overridden.
        // Outside shutdown, mirror Playwright's built-in defaults.
        const handling =
          !duringAppQuit && dialog.type() === "beforeunload"
            ? dialog.accept()
            : dialog.dismiss();
        const settledHandling = handling.catch((error) => {
          const message = String(
            error?.message || error || "dialog handling failed",
          );
          if (!/No dialog is showing|Target.*closed/i.test(message)) {
            dialogHandlingErrors.push({
              generation: state.generation,
              type: dialog.type(),
              duringAppQuit,
              message,
            });
          }
        });
        if (duringAppQuit) state.appQuitDialogHandling = settledHandling;
      });
      state.appWindow.on("pageerror", (error) =>
        pageErrors.push(error.message),
      );
      await state.appWindow.waitForURL(`${WEB_URL}*`, { timeout: 60000 });
      await state.appWindow.waitForLoadState("domcontentloaded");

      const portInfo = await waitForJsonFile(testApiPortFile);
      state.testApi = createTestApiClient(
        `http://127.0.0.1:${portInfo.port}/v1`,
      );
      return state;
    };

    const quitCurrentElectron = async () => {
      const state = runtime;
      if (!state?.electronProcess) {
        throw new Error("Electron is not running");
      }
      if (state.controlledExit) {
        return state.exitOutcome;
      }
      if (
        state.electronProcess.exitCode != null ||
        state.electronProcess.signalCode
      ) {
        throw new Error(
          `Electron exited before controlled app.quit(): code=${
            state.electronProcess.exitCode
          } signal=${state.electronProcess.signalCode || "none"}`,
        );
      }
      if (!state.testApi) {
        throw new Error(
          "Electron Test API was unavailable for graceful app quit",
        );
      }

      state.appQuitRequested = true;
      const dialogErrorStart = dialogHandlingErrors.length;
      const appQuitDialog = new Promise((resolve) => {
        state.resolveAppQuitDialog = resolve;
      });
      const appQuitOutcome = waitForAppQuitOutcome(
        state.electronProcess,
        appQuitDialog,
      );
      try {
        state.quitRequestedAt = Date.now();
        await state.testApi.post("/debug/quit", {}, { timeoutMs: 8000 });
        const outcome = await appQuitOutcome;
        if (outcome.kind === "dialog") {
          await state.appQuitDialogHandling;
          throw new Error(
            `Electron app quit was blocked by a ${outcome.dialog.type} dialog`,
          );
        }
        if (outcome.kind === "timeout") {
          throw new Error(
            "Electron did not exit within 10 seconds of app.quit()",
          );
        }
        if (outcome.code !== 0 || outcome.signal !== null) {
          throw new Error(
            `Electron exited abnormally during app.quit(): code=${
              outcome.code
            } signal=${outcome.signal || "none"}`,
          );
        }
        if (dialogHandlingErrors.length > dialogErrorStart) {
          throw new Error(
            `Electron dialog handling failed: ${
              dialogHandlingErrors[dialogErrorStart].message
            }`,
          );
        }

        state.controlledExit = true;
        state.exitOutcome = {
          generation: state.generation,
          code: outcome.code,
          signal: outcome.signal,
          quitRequestedAt: state.quitRequestedAt,
        };
        lastControlledExit = state.exitOutcome;
        await closeBrowserConnection(state.browser);
        state.browser = null;
        return state.exitOutcome;
      } finally {
        state.resolveAppQuitDialog = null;
      }
    };

    const fixtureValue = {
      userDataDir,
      processLogs,
      pageErrors,
      quitControlled: quitCurrentElectron,
      restartSameUserData: async () => {
        const previousExit = await quitCurrentElectron();
        await launchElectron();
        return { previousExit, pupu: fixtureValue };
      },
    };
    Object.defineProperties(fixtureValue, {
      browser: {
        enumerable: true,
        get: () => runtime?.browser ?? null,
      },
      electronProcess: {
        enumerable: true,
        get: () => runtime?.electronProcess ?? null,
      },
      appWindow: {
        enumerable: true,
        get: () => runtime?.appWindow ?? null,
      },
      testApi: {
        enumerable: true,
        get: () => runtime?.testApi ?? null,
      },
      debugPort: {
        enumerable: true,
        get: () => runtime?.debugPort ?? null,
      },
      generation: {
        enumerable: true,
        get: () => runtime?.generation ?? null,
      },
      lastControlledExit: {
        enumerable: true,
        get: () => lastControlledExit,
      },
    });

    try {
      await launchElectron();
      await use(fixtureValue);
    } finally {
      const bodyFailed = testInfo.status !== testInfo.expectedStatus;
      const currentWindow = runtime?.appWindow;
      if (bodyFailed) {
        await testInfo.attach("Electron process log", {
          body: Buffer.from(processLogs.join(""), "utf8"),
          contentType: "text/plain",
        });
        if (currentWindow) {
          const screenshotPath = testInfo.outputPath("pupu-failure.png");
          await currentWindow
            .screenshot({ path: screenshotPath })
            .catch(() => {});
          if (fs.existsSync(screenshotPath)) {
            await testInfo.attach("PuPu failure screenshot", {
              path: screenshotPath,
              contentType: "image/png",
            });
          }
        }
      }

      let shutdownError = null;
      try {
        if (runtime?.electronProcess && !runtime.controlledExit) {
          await quitCurrentElectron();
        }
      } catch (error) {
        shutdownError = new Error(
          `Electron graceful app quit failed: ${
            error?.message || String(error)
          }`,
        );
      }
      if (!shutdownError && dialogHandlingErrors.length > 0) {
        shutdownError = new Error(
          `Electron dialog handling failed: ${dialogHandlingErrors[0].message}`,
        );
      }
      if (shutdownError) {
        await testInfo.attach("Electron graceful-shutdown failure", {
          body: Buffer.from(
            `${shutdownError.message}\n${processLogs.join("")}`,
            "utf8",
          ),
          contentType: "text/plain",
        });
        if (currentWindow && !currentWindow.isClosed()) {
          const screenshotPath = testInfo.outputPath(
            "pupu-shutdown-failure.png",
          );
          await currentWindow
            .screenshot({ path: screenshotPath })
            .catch(() => {});
          if (fs.existsSync(screenshotPath)) {
            await testInfo.attach("PuPu shutdown failure screenshot", {
              path: screenshotPath,
              contentType: "image/png",
            });
          }
        }
      }

      try {
        await stopElectronProcess(runtime?.electronProcess);
      } finally {
        try {
          await closeBrowserConnection(runtime?.browser);
        } finally {
          fs.rmSync(userDataDir, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
          });
        }
      }
      if (shutdownError && !bodyFailed) throw shutdownError;
    }
  },
});

module.exports = { test, expect };
