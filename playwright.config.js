const { defineConfig } = require("@playwright/test");

const isCi = process.env.CI === "true" || process.env.CI === "1";
const isReleaseQa = process.env.PUPU_E2E_RELEASE === "1";
const testTimeoutMs = isCi ? 240000 : 120000;
const expectTimeoutMs = isCi ? 30000 : 15000;
const webServerTimeoutMs = isCi ? 300000 : 180000;
const webPort = process.env.PUPU_E2E_PORT || (isReleaseQa ? "2917" : "2907");
const webOrigin = `http://127.0.0.1:${webPort}`;

process.env.PUPU_E2E_WEB_URL ||= `${webOrigin}/#`;

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: testTimeoutMs,
  expect: {
    timeout: expectTimeoutMs,
  },
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 1 : 0,
  outputDir: "test-results/playwright/artifacts",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/playwright/results.json" }],
  ],
  webServer: {
    command:
      webPort === "2907"
        ? "npm run start:web"
        : `cross-env BROWSER=none HOST=127.0.0.1 PORT=${webPort} react-scripts start`,
    url: webOrigin,
    reuseExistingServer: !isCi && !isReleaseQa,
    timeout: webServerTimeoutMs,
    stdout: "pipe",
    stderr: "pipe",
  },
});
