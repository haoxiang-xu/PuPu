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

const createTestApiClient = (baseUrl) => {
  const request = async (method, endpointPath, body) => {
    const init = {
      method,
      headers: body == null ? {} : { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
    };
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(`${baseUrl}${endpointPath}`, init);
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
          payload?.error?.message || `Test API request failed: ${response.status}`,
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
    post: (endpointPath, body = {}) => request("POST", endpointPath, body),
    patch: (endpointPath, body = {}) => request("PATCH", endpointPath, body),
    delete: (endpointPath) => request("DELETE", endpointPath),
  };
};

const test = base.extend({
  pupu: async ({}, use, testInfo) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-e2e-"));
    const processLogs = [];
    const pageErrors = [];
    let debugPort = null;
    let electronProcess = null;
    let browser = null;
    let appWindow = null;

    try {
      debugPort = await getFreePort();
      electronProcess = spawn(
        require("electron"),
        [
          `--remote-debugging-port=${debugPort}`,
          `--user-data-dir=${userDataDir}`,
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
      electronProcess.stdout.on("data", (chunk) =>
        processLogs.push(chunk.toString()),
      );
      electronProcess.stderr.on("data", (chunk) =>
        processLogs.push(chunk.toString()),
      );

      const cdpEndpoint = await waitForCdp(
        debugPort,
        WEB_URL,
        processLogs,
        electronProcess,
      );
      browser = await chromium.connectOverCDP(cdpEndpoint);
      const context = browser.contexts()[0];
      appWindow = context
        .pages()
        .find((page) => page.url().startsWith(new URL(WEB_URL).origin));
      if (!appWindow) appWindow = await context.waitForEvent("page");
      appWindow.on("pageerror", (error) => pageErrors.push(error.message));
      await appWindow.waitForURL(`${WEB_URL}*`, { timeout: 60000 });
      await appWindow.waitForLoadState("domcontentloaded");

      const portInfo = await waitForJsonFile(
        path.join(userDataDir, "test-api-port"),
      );
      const testApi = createTestApiClient(
        `http://127.0.0.1:${portInfo.port}/v1`,
      );

      await use({
        browser,
        electronProcess,
        appWindow,
        testApi,
        userDataDir,
        debugPort,
        processLogs,
        pageErrors,
      });
    } finally {
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("Electron process log", {
          body: Buffer.from(processLogs.join(""), "utf8"),
          contentType: "text/plain",
        });
        if (appWindow) {
          const screenshotPath = testInfo.outputPath("pupu-failure.png");
          await appWindow.screenshot({ path: screenshotPath }).catch(() => {});
          if (fs.existsSync(screenshotPath)) {
            await testInfo.attach("PuPu failure screenshot", {
              path: screenshotPath,
              contentType: "image/png",
            });
          }
        }
      }

      try {
        await stopElectronProcess(electronProcess);
      } finally {
        try {
          if (browser) {
            await Promise.race([
              browser.close().catch(() => {}),
              sleep(5000),
            ]);
          }
        } finally {
          fs.rmSync(userDataDir, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 200,
          });
        }
      }
    }
  },
});

module.exports = { test, expect };
