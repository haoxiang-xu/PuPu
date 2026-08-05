import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
  SEMANTIC_FAMILIES,
  SEMANTIC_TOKEN_TREE,
  ALPHA_LADDER,
  ALPHA_STEPS,
  tokenTreeDepth,
} from "./semantic_tokens";

const HEX = /^#[0-9a-f]{6}$/;

describe("semantic_tokens", () => {
  test("exposes 11 token keys", () => {
    expect(SEMANTIC_TOKEN_KEYS).toEqual([
      "accent",
      "background",
      "sidebar",
      "surface",
      "text",
      "textMuted",
      "border",
      "success",
      "warning",
      "danger",
      "info",
    ]);
  });

  /* Two declarations of the same fact became one declaration plus this
     consistency lock: SEMANTIC_TOKEN_KEYS is exactly the set of tree nodes
     that can hold a literal hex in the custom bag. Alpha steps must never
     leak into it — that is what keeps resolveSemanticPalette's shape, the
     boot palette's four keys and applySemanticPaletteToTheme's destructure
     untouched by taxonomy growth. */
  test("SEMANTIC_TOKEN_KEYS is exactly the non-alpha nodes of the tree", () => {
    const nonAlpha = Object.entries(SEMANTIC_TOKEN_TREE)
      .filter(([, node]) => node.kind !== "alpha")
      .map(([key]) => key);
    expect([...SEMANTIC_TOKEN_KEYS].sort()).toEqual(nonAlpha.sort());
    for (const step of ALPHA_STEPS) {
      expect(SEMANTIC_TOKEN_KEYS).not.toContain(step.key);
    }
  });

  test("defaults define every key for both modes as lowercase hex", () => {
    for (const mode of ["light_mode", "dark_mode"]) {
      for (const key of SEMANTIC_TOKEN_KEYS) {
        expect(SEMANTIC_DEFAULTS[mode][key]).toMatch(HEX);
      }
    }
  });

  test("light accent default stays #65c466 (keeps existing highlight)", () => {
    expect(SEMANTIC_DEFAULTS.light_mode.accent).toBe("#65c466");
  });

  test("every preset is a full valid palette for both modes", () => {
    expect(SEMANTIC_PRESETS.default).toBeDefined();
    for (const preset of Object.values(SEMANTIC_PRESETS)) {
      for (const mode of ["light_mode", "dark_mode"]) {
        for (const key of SEMANTIC_TOKEN_KEYS) {
          expect(preset[mode][key]).toMatch(HEX);
        }
      }
    }
  });

  test("sidebar is a semantic token with light/dark defaults", () => {
    expect(SEMANTIC_TOKEN_KEYS).toContain("sidebar");
    expect(SEMANTIC_DEFAULTS.light_mode.sidebar).toMatch(/^#[0-9a-f]{6}$/i);
    expect(SEMANTIC_DEFAULTS.dark_mode.sidebar).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test("every preset defines sidebar in both modes", () => {
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      expect(SEMANTIC_PRESETS[name].light_mode.sidebar).toBeDefined();
      expect(SEMANTIC_PRESETS[name].dark_mode.sidebar).toBeDefined();
    }
  });

  test("only high_contrast opts into a details bag (chipBorder for the softened border family)", () => {
    expect(SEMANTIC_PRESETS.high_contrast.details).toEqual({
      light_mode: {
        chipBorder: "rgba(107,107,107,0.25)",
        menuBorder: "rgba(107,107,107,0.32)",
        cardBorder: "rgba(107,107,107,0.28)",
      },
      dark_mode: {
        chipBorder: "rgba(138,138,138,0.25)",
        menuBorder: "rgba(138,138,138,0.32)",
        cardBorder: "rgba(138,138,138,0.28)",
      },
    });
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      if (name === "high_contrast") continue;
      expect(SEMANTIC_PRESETS[name].details).toBeUndefined();
    }
  });
});

describe("phase-3 preset library", () => {
  const HEX6 = /^#[0-9a-f]{6}$/i;

  const luminance = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const chan = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return (
      0.2126 * chan((n >> 16) & 255) +
      0.7152 * chan((n >> 8) & 255) +
      0.0722 * chan(n & 255)
    );
  };
  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  const NEW_PRESETS = ["graphite", "violet", "rose", "nord", "midnight"];

  test("new presets exist with 9 valid hex tokens per mode", () => {
    for (const name of NEW_PRESETS) {
      const preset = SEMANTIC_PRESETS[name];
      expect(preset).toBeDefined();
      for (const mode of ["light_mode", "dark_mode"]) {
        for (const key of SEMANTIC_TOKEN_KEYS) {
          expect(preset[mode][key]).toMatch(HEX6);
        }
      }
    }
  });

  test("every preset keeps text/background ≥ 4.5:1", () => {
    for (const name of Object.keys(SEMANTIC_PRESETS)) {
      for (const mode of ["light_mode", "dark_mode"]) {
        const p = SEMANTIC_PRESETS[name][mode];
        expect(contrast(p.text, p.background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test("new presets keep accent/background ≥ 3:1", () => {
    for (const name of NEW_PRESETS) {
      for (const mode of ["light_mode", "dark_mode"]) {
        const p = SEMANTIC_PRESETS[name][mode];
        expect(contrast(p.accent, p.background)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("SEMANTIC_TOKEN_TREE", () => {
  /* Replaces the old "every family root and child is a semantic token key".
     That assertion could not survive alpha steps, which are deliberately
     NOT token keys. */
  test("every node is well-formed", () => {
    const varNames = new Set();
    for (const [key, node] of Object.entries(SEMANTIC_TOKEN_TREE)) {
      expect(["literal", "tier", "alpha"]).toContain(node.kind);

      if (node.parent !== null) {
        expect(SEMANTIC_TOKEN_TREE[node.parent]).toBeDefined();
      }

      if (node.kind === "alpha") {
        expect(SEMANTIC_TOKEN_KEYS).not.toContain(key);
        expect(typeof node.detailsKey).toBe("string");
        expect(ALPHA_LADDER[node.rung]).toBeDefined();
        expect(node.parent).not.toBeNull();
      } else {
        expect(SEMANTIC_TOKEN_KEYS).toContain(key);
      }

      expect(typeof node.varName).toBe("string");
      expect(varNames.has(node.varName)).toBe(false);
      varNames.add(node.varName);
    }
  });

  /* Replaces "no child belongs to two families, and no child is itself a
     family root".

     The single-parent half survives verbatim — it is still true and still
     valuable. The "no child is itself a family root" half is DELETED: it
     was the assertion pinning the taxonomy at two levels, and nesting
     (background -> surface -> surface-overlay) is a designed capability.

     In its place, the depth cap. Three levels is what the real data needs;
     a fourth has zero evidence behind it and every extra level costs an
     editor fold state, a derivation hop and a cycle risk. */
  test("single parent, no cycle, depth capped at 3", () => {
    const parentOf = new Map();
    for (const [key, node] of Object.entries(SEMANTIC_TOKEN_TREE)) {
      if (node.parent === null) continue;
      expect(parentOf.has(key)).toBe(false);
      parentOf.set(key, node.parent);
    }

    let maxDepth = 0;
    for (const key of Object.keys(SEMANTIC_TOKEN_TREE)) {
      const depth = tokenTreeDepth(key);
      expect(depth).toBeLessThan(Infinity); /* no cycle */
      expect(depth).toBeLessThanOrEqual(3);
      maxDepth = Math.max(maxDepth, depth);
    }

    /* Guard against the cap silently going vacuous if someone flattens the
       tree: there must actually BE nesting for the cap to be meaningful. */
    expect(maxDepth).toBeGreaterThanOrEqual(2);
  });

  test("background family matches the shipped derived tiers, authored-protected", () => {
    expect(SEMANTIC_FAMILIES.background.children).toEqual(["sidebar", "surface"]);
    /* authored=true is the lock that stops a preset's hand-picked value
       from being recomputed when its root was never customised. */
    expect(SEMANTIC_TOKEN_TREE.sidebar.authored).toBe(true);
    expect(SEMANTIC_TOKEN_TREE.surface.authored).toBe(true);
    expect(SEMANTIC_TOKEN_TREE.textMuted.authored).toBe(true);
  });

  test("alpha steps cite a real ladder rung and publish a details key", () => {
    expect(ALPHA_STEPS.length).toBe(31);
    const detailsKeys = ALPHA_STEPS.map((s) => s.detailsKey);
    /* the three shipped border keys must still be present and unchanged */
    expect(detailsKeys).toContain("borderAlphaStrong");
    expect(detailsKeys).toContain("borderAlphaMid");
    expect(detailsKeys).toContain("borderAlphaSubtle");
    expect(SEMANTIC_TOKEN_TREE.borderStrong.alpha).toEqual({ dark: 0.9, light: 0.9 });
    expect(SEMANTIC_TOKEN_TREE.borderMid.alpha).toEqual({ dark: 0.55, light: 0.55 });
    expect(SEMANTIC_TOKEN_TREE.borderSubtle.alpha).toEqual({ dark: 0.3, light: 0.3 });
  });

  test("the status ladder is one template stamped on five hues", () => {
    for (const hue of ["accent", "success", "warning", "danger", "info"]) {
      for (const [suffix, key] of [
        ["tint", "Tint"],
        ["tint-hover", "TintHover"],
        ["tint-active", "TintActive"],
        ["tint-border", "TintBorder"],
      ]) {
        const node = SEMANTIC_TOKEN_TREE[`${hue}${key}`];
        expect(node).toBeDefined();
        expect(node.varName).toBe(`${hue}-${suffix}`);
        expect(node.parent).toBe(hue);
        expect(node.shared).toBe(true);
      }
    }
    /* one knob per rung, shared across hues — that is the whole point */
    expect(SEMANTIC_TOKEN_TREE.accentTint.detailsKey).toBe("statusTintAlpha");
    expect(SEMANTIC_TOKEN_TREE.dangerTint.detailsKey).toBe("statusTintAlpha");
    expect(SEMANTIC_TOKEN_TREE.dangerTint.alpha.dark).toBe(0.14);
  });
});
