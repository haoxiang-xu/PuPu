const path = require("node:path");
module.exports = {
  testDir: path.resolve(__dirname, ".."),
  testMatch: "pupu-357-execution.spec.js",
  timeout: 300000,
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "test-results/app-execution.json" }]],
  outputDir: "test-results/app-execution",
  use: { viewport: { width: 1280, height: 820 }, screenshot: "only-on-failure", trace: "retain-on-failure" },
};
