const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
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
    /* Main's store follows app.getPath("userData"), which comes from HOME /
       XDG_CONFIG_HOME on Linux (a run showed two tests sharing one store under
       one HOME). Each fixture gets its own, kept across its restarts. */
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-357-home-"));
    const logs = [];
    const pageErrors = [];
    const generations = [];
    let current = null;

    const launch = async () => {
      const port = await freePort();
            /* The control's session keyring (gnome-keyring over its own D-Bus), named
         explicitly so Chromium does not fall back to basic_text, which Main
         refuses for credentials. */
      const store = process.env.PUPU_357_PASSWORD_STORE ? [`--password-store=${process.env.PUPU_357_PASSWORD_STORE}`] : [];
      const child = spawn(EXECUTABLE, [`--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, ...store], {
        env: { ...process.env, HOME: home, XDG_CONFIG_HOME: path.join(home, ".config"), PUPU_E2E: "1", PUPU_COMPUTER_USE: "0" },
        detached: true,
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
      // The QA child owns a separate process group. Supervise the whole group,
      // including the sidecar; this is explicitly not product-quit evidence.
      const groupAlive = () => {
        try { process.kill(-child.pid, 0); return true; } catch (error) {
          if (error.code === "ESRCH") return false;
          throw error;
        }
      };
      if (groupAlive()) {
        process.kill(-child.pid, "SIGTERM");
        const deadline = Date.now() + 30000;
        while (groupAlive() && Date.now() < deadline) await sleep(200);
        if (groupAlive()) process.kill(-child.pid, "SIGKILL");
      }
      await browser.close().catch(() => {});
      generations[generations.length - 1].stopped = { exit: child.exitCode, signal: child.signalCode, by: "supervisor" };
      current = null;
    };

    await launch();
    await use({
      get appWindow() { return current && current.page; },
      get privateHome() { return home; },
      get privateUserData() { return userData; },
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
    const copied = [];
    let total = 0;
    const copyPrivate = (source, label) => {
      const targetRoot = testInfo.outputPath("private-store-snapshot", label);
      const visit = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          const relative = path.relative(source, full);
          if (entry.isSymbolicLink()) {
            copied.push({ root: label, path: relative, symlink: fs.readlinkSync(full), followed: false });
          } else if (entry.isDirectory()) visit(full);
          else if (entry.isFile()) {
            const stat = fs.statSync(full);
            total += stat.size;
            if (total > 256 * 1024 * 1024) throw new Error("QA private snapshot exceeds bounded size");
            const target = path.join(targetRoot, relative);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(full, target, fs.constants.COPYFILE_EXCL);
            copied.push({ root: label, path: relative, bytes: stat.size,
              sha256: crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex") });
          }
        }
      };
      visit(source);
    };
    copyPrivate(home, "home");
    copyPrivate(userData, "user-data");
    await testInfo.attach("private-store-manifest", { body: Buffer.from(JSON.stringify(copied, null, 2)), contentType: "application/json" });
    await testInfo.attach("packaged-app-generations", { body: Buffer.from(JSON.stringify(generations, null, 2)), contentType: "application/json" });
    const listing = [];
    const walk = (dir, depth) => {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        listing.push(path.relative(home, full));
        if (depth < 3 && fs.statSync(full).isDirectory()) walk(full, depth + 1);
      }
    };
    try { walk(home, 0); } catch (_error) { /* listing is evidence only */ }
    await testInfo.attach("fixture-home-listing", { body: Buffer.from(listing.join("\n")), contentType: "text/plain" });
    await testInfo.attach("packaged-app-log", { body: Buffer.from(logs.join("")), contentType: "text/plain" });
  },
});

module.exports = { test, expect };
