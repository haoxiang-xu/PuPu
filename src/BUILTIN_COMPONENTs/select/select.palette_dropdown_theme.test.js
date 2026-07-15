// src/BUILTIN_COMPONENTs/select/select.palette_dropdown_theme.test.js
//
// Root-cause regression lock (semantic theme phase 4, Task 4 Part B): the
// attach panel (chat-input) renders all its Selects with variant="palette"
// (model/tools/workspace). Unlike the two non-palette dropdown code paths
// (which already read theme?.select?.dropdown — mapped to the surface tier
// since phase 1), the isPalette dropdown panel hardcoded its own literal
// black/white neutrals and never consulted the theme at all — so switching
// theme/palette never changed the attach panel's dropdown color. This test
// source-scans select.js to lock the fix: the palette dropdown panel
// (background/border), its rail-mode divider/hover/selection-ring, and its
// sliding-hover overlay all bind to the surface/text semantic tiers.
describe("select.js palette-variant dropdown follows semantic tiers", () => {
  const src = require("fs").readFileSync(
    require("path").join(__dirname, "select.js"),
    "utf8",
  );

  test("no hardcoded rgba(28,28,28/252,252,252) literals remain anywhere in select.js", () => {
    expect(src).not.toMatch(/rgba\(28,28,28/);
    expect(src).not.toMatch(/rgba\(252,252,252/);
  });

  test("isPalette dropdown panel: near-opaque frosted background binds to surface tier", () => {
    expect(src).toMatch(
      /backgroundColor: isDark\s*\n\s*\? "rgba\(var\(--pupu-surface-rgb\),0\.85\)"\s*\n\s*: "rgba\(var\(--pupu-surface-rgb\),0\.9\)"/,
    );
  });

  test("isPalette dropdown panel: hairline border binds to the mid border-strength tier (three-tier border strength)", () => {
    expect(src).toMatch(/border: "1px solid var\(--pupu-border-mid\)"/);
  });

  test("isPalette dropdown panel: boxShadow stays black-based (unaffected by theme)", () => {
    expect(src).toMatch(
      /boxShadow: isDark\s*\n\s*\? "0 10px 34px rgba\(0,0,0,0\.5\)"\s*\n\s*: "0 10px 34px rgba\(0,0,0,0\.12\)"/,
    );
  });

  test("palette-rail provider divider and hover glow bind to the text tier", () => {
    // Both isDark branches resolved to the same text-tier literal, so Task 4's
    // fix collapsed the dead ternary into the constant (same semantic tier,
    // no behavior change) — assert the constant binding directly.
    expect(src).toMatch(
      /borderRight: "1px solid rgba\(var\(--pupu-text-rgb\),0\.06\)"/,
    );
    expect(src).toMatch(
      /color=\{isDark \? "rgba\(var\(--pupu-text-rgb\),0\.10\)" : "rgba\(var\(--pupu-text-rgb\),0\.06\)"\}/,
    );
  });

  test("palette-rail selection-dot ring matches the panel's surface tier (solid, not tinted)", () => {
    // Both isDark branches resolved to the same surface-tier literal, so
    // Task 4's fix collapsed the dead ternary into the constant.
    expect(src).toMatch(
      /border: "1\.5px solid rgb\(var\(--pupu-surface-rgb\)\)"/,
    );
  });

  test("palette variant's sliding hover overlay binds to the text tier", () => {
    expect(src).toMatch(
      /const slidingHoverColor = isDark\s*\n\s*\? "rgba\(var\(--pupu-text-rgb\),0\.10\)"\s*\n\s*: "rgba\(var\(--pupu-text-rgb\),0\.06\)"/,
    );
  });
});

describe("dropdown panels carry the mid-tier border", () => {
  test("all three variant panels bind var(--pupu-border-mid)", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "select.js"),
      "utf8",
    );
    const hits = src.match(/border: "1px solid var\(--pupu-border-mid\)"/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3);
  });
});
