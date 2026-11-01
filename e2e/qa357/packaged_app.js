const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test: base, expect } = require("@playwright/test");
const { chromium } = require("playwright");

/* QA-only (#357): drive the PACKAGED Linux App, whose Main launches the
 * resources/unchain_runtime/dist/linux/unchain-server it was packaged with —
 * the one fixed sidecar of the pair. The product's own e2e fixture runs the
 * development App (Main → Python main.py), which cannot exercise that binary.
 *
 * The App runs with its native Chromium sandbox, a disposable HOME and user
 * data directory owned by the caller, and whatever network the caller's
 * namespace allows (loopback only in the control). Stopping it between
 * generations is a supervisor SIGTERM, not product quit acceptance. */

const EXECUTABLE = process.env.PUPU_357_APP_EXECUTABLE;

const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close((error) => (error ? reject(error) : resolve(port)));
  });
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForCdp(port, logs, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return (await response.json()).webSocketDebuggerUrl;
    } catch (_error) {
      // not listening yet
    }
    await sleep(250);
  }
  throw new Error(`The packaged App did not open its debugging port.\n${logs.join("").slice(-4000)}`);
}

async function firstAppPage(browser, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      const page = context.pages().find((candidate) => /^file:|^app:/.test(candidate.url()));
      if (page) return page;
    }
    await sleep(250);
  }
  throw new Error("The packaged App window did not appear");
}

const test = base.extend({
  pupu: async ({}, use, testInfo) => {
    if (!EXECUTABLE || !path.isAbsolute(EXECUTABLE) || !fs.existsSync(EXECUTABLE)) {
      throw new Error("PUPU_357_APP_EXECUTABLE must name the packaged App executable");
    }
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-357-user-data-"));
    const logs = [];
    const pageErrors = [];
    const generations = [];
    let current = null;

    const launch = async () => {
      const port = await freePort();
      const child = spawn(EXECUTABLE, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], {
        env: { ...process.env, PUPU_E2E: "1", PUPU_COMPUTER_USE: "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
      child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
      const endpoint = await waitForCdp(port, logs);
      const browser = await chromium.connectOverCDP(endpoint);
      const page = await firstAppPage(browser);
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.waitForLoadState("domcontentloaded");
      current = { child, browser, page, port, started_at: new Date().toISOString() };
      generations.push({ pid: child.pid, port, started_at: current.started_at });
    };

    const stop = async () => {
      if (!current) return;
      const { child, browser } = current;
      await browser.close().catch(() => {});
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        const deadline = Date.now() + 30000;
        while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await sleep(200);
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
      generations[generations.length - 1].stopped = { exit: child.exitCode, signal: child.signalCode, by: "supervisor" };
      current = null;
    };

    await launch();
    await use({
      get appWindow() { return current && current.page; },
      pageErrors,
      restartSameUserData: async () => {
        await stop();
        await launch();
      },
    });
    if (current && testInfo.status !== testInfo.expectedStatus) {
      // A CDP-attached window carries no trace snapshots; keep what it showed.
      await testInfo.attach("failure-window", { body: await current.page.screenshot().catch(() => Buffer.from("")), contentType: "image/png" });
      const tree = await current.page.locator("body").ariaSnapshot().catch((error) => `aria snapshot failed: ${error.message}`);
      await testInfo.attach("failure-aria", { body: Buffer.from(tree), contentType: "text/plain" });
    }
    await stop();
    await testInfo.attach("packaged-app-generations", { body: Buffer.from(JSON.stringify(generations, null, 2)), contentType: "application/json" });
    await testInfo.attach("packaged-app-log", { body: Buffer.from(logs.join("")), contentType: "text/plain" });
  },
});

module.exports = { test, expect };
