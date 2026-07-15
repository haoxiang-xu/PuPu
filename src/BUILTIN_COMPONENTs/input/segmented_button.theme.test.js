import fs from "fs";
import path from "path";

describe("segmented_button theme (phase 4)", () => {
  test("light-mode indicator background binds to the background tier, not a hardcoded literal", () => {
    const source = fs.readFileSync(path.join(__dirname, "segmented_button.js"), "utf8");
    expect(source).not.toContain("rgba(255,255,255,0.92)");
    expect(source).toContain("rgba(var(--pupu-background-rgb),0.92)");
  });
});
