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
});
