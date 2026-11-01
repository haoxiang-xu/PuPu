const { defineConfig } = require("@playwright/test");

/* QA-only (#357): the packaged App loads its own build, so there is no web
   dev server here, and no retry — a failure is reported as it happened. */
module.exports = defineConfig({
  testDir: "..",
  testMatch: ["pupu-357-fixes.spec.js"],
  timeout: 30 * 60 * 1000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: "../../test-results/playwright/artifacts",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "../../playwright-report" }],
    ["json", { outputFile: "../../test-results/playwright/results.json" }],
  ],
  use: { trace: "retain-on-failure", actionTimeout: 60000, navigationTimeout: 120000 },
});
