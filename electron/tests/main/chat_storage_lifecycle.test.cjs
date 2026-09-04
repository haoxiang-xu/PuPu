const fs = require("fs");
const path = require("path");

describe("chat storage quit lifecycle", () => {
  test("all shutdown waits for will-quit after cancelable renderer unload", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../main/index.js"),
      "utf8",
    );

    expect(source).not.toMatch(/app\.on\("before-quit"/);
    expect(source).toMatch(
      /app\.on\("will-quit",\s*\(\)\s*=>\s*\{[\s\S]*?stopBackgroundServices\(\)[\s\S]*?testApiService\.stop\(\)[\s\S]*?chatStorageService\.close\(\)[\s\S]*?settingsStorageService\.close\(\)/,
    );
  });

  test("app close and system suspend stop active Unchain executions", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../main/index.js"),
      "utf8",
    );

    expect(source).toMatch(
      /powerMonitor\.on\("suspend",\s*\(\)\s*=>\s*\{[\s\S]*?stopActiveExecutionsForLifecycle\("system_suspend"\)/,
    );
    expect(source).toMatch(
      /app\.on\("window-all-closed",\s*\(\)\s*=>\s*\{[\s\S]*?stopActiveExecutionsForLifecycle\("app_windows_closed"\)[\s\S]*?app\.quit\(\)/,
    );
    expect(source).toMatch(
      /const stopActiveExecutionsForLifecycle = \(reason\) => \{\s*void unchainService\.stopActiveMisoExecutionsForLifecycle\(\{ reason \}\)/,
    );
  });
});
