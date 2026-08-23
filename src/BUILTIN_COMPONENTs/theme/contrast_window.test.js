import {
  relativeLuminance,
  contrastRatio,
  polarityBands,
  minContrastBands,
  intersectBands,
  bandsContain,
  projectLuminance,
  clampToWindow,
  roleWindow,
  SHELL_ROLES,
  HUE_ROLES,
  TEXT_MIN_RATIO,
  MUTED_MIN_RATIO,
  HUE_MIN_RATIO,
  POLARITY_DARK_MAX_L,
  POLARITY_LIGHT_MIN_L,
} from "./contrast_window";
import { SEMANTIC_PRESETS } from "./semantic_tokens";

const MODES = ["light_mode", "dark_mode"];
const eachPreset = (fn) => {
  for (const name of Object.keys(SEMANTIC_PRESETS)) {
    for (const mode of MODES) fn(name, mode, SEMANTIC_PRESETS[name][mode]);
  }
};

describe("bands algebra", () => {
  test("minContrastBands carves a forbidden band around the reference", () => {
    const bands = minContrastBands("#ffffff", 4.5);
    /* nothing near white can reach 4.5:1 against white */
    expect(bandsContain(bands, 1)).toBe(false);
    expect(bandsContain(bands, 0)).toBe(true);
  });

  test("intersectBands keeps only the overlap", () => {
    expect(intersectBands([[0, 0.5]], [[0.4, 1]])).toEqual([[0.4, 0.5]]);
    expect(intersectBands([[0, 0.2]], [[0.8, 1]])).toEqual([]);
  });

  test("projectLuminance snaps to the nearest legal edge", () => {
    const bands = [
      [0, 0.2],
      [0.8, 1],
    ];
    expect(projectLuminance(0.25, bands)).toBeCloseTo(0.2, 6);
    expect(projectLuminance(0.75, bands)).toBeCloseTo(0.8, 6);
    expect(projectLuminance(0.1, bands)).toBeCloseTo(0.1, 6);
  });
});

describe("factory palettes are legal in their own windows", () => {
  /* If the guard condemns a shipped preset, the guard is wrong — not the
     preset. This is the assertion that catches that. */
  test("every preset token sits inside its role window", () => {
    eachPreset((name, mode, palette) => {
      for (const role of [...SHELL_ROLES, "text", "textMuted", ...HUE_ROLES]) {
        const bands = roleWindow(role, mode, palette);
        expect(bands.length).toBeGreaterThan(0);
        const ok = bandsContain(bands, relativeLuminance(palette[role]));
        if (!ok) {
          throw new Error(
            `${name}.${mode}.${role} = ${palette[role]} is outside its own window`,
          );
        }
      }
    });
  });

  test("clampToWindow is byte-identical on every factory value", () => {
    eachPreset((name, mode, palette) => {
      for (const role of [...SHELL_ROLES, "text", "textMuted", ...HUE_ROLES]) {
        const bands = roleWindow(role, mode, palette);
        expect(clampToWindow(palette[role], bands)).toBe(palette[role]);
      }
    });
  });
});

describe("measured margins (threshold discipline)", () => {
  /* These record the ACTUAL factory floor next to the threshold. If a
     future preset retune eats the margin, this fails before the guard
     starts rejecting shipped colours. Do not relax a threshold to make
     this pass — retune the preset, or escalate. */
  const worst = (fn) => {
    let min = Infinity;
    let who = "";
    eachPreset((name, mode, p) => {
      const v = fn(p);
      if (v < min) {
        min = v;
        who = `${name}.${mode}`;
      }
    });
    return { min, who };
  };

  test("text vs every shell: floor 7.485, threshold 4.5", () => {
    const { min } = worst((p) =>
      Math.min(...SHELL_ROLES.map((s) => contrastRatio(p.text, p[s]))),
    );
    expect(min).toBeGreaterThanOrEqual(TEXT_MIN_RATIO);
    expect(min).toBeCloseTo(7.485, 2);
  });

  test("textMuted vs every shell: floor 3.084 — only 0.084 above the wall", () => {
    const { min, who } = worst((p) =>
      Math.min(...SHELL_ROLES.map((s) => contrastRatio(p.textMuted, p[s]))),
    );
    expect(min).toBeGreaterThanOrEqual(MUTED_MIN_RATIO);
    expect(min).toBeCloseTo(3.084, 2);
    /* the binding case is muted-on-sidebar, not muted-on-background */
    expect(who).toBe("default.light_mode");
  });

  test("status hues vs background+surface: floor 2.109, threshold 1.9", () => {
    const { min } = worst((p) =>
      Math.min(
        ...HUE_ROLES.flatMap((h) => [
          contrastRatio(p[h], p.background),
          contrastRatio(p[h], p.surface),
        ]),
      ),
    );
    expect(min).toBeGreaterThanOrEqual(HUE_MIN_RATIO);
    expect(min).toBeCloseTo(2.109, 2);
  });

  test("a 3:1 status threshold would condemn shipped presets", () => {
    /* Documents WHY HUE_MIN_RATIO is not the WCAG number. If someone
       "fixes" it to 3.0 later, this test explains the crater. */
    const offenders = [];
    eachPreset((name, mode, p) => {
      if (contrastRatio(p.success, p.background) < 3) {
        offenders.push(`${name}.${mode}`);
      }
    });
    expect(offenders.length).toBeGreaterThan(5);
    expect(offenders).toContain("default.light_mode");
  });

  test("polarity caps sit outside the factory shell luminance range", () => {
    let darkMax = 0;
    let lightMin = 1;
    eachPreset((name, mode, p) => {
      for (const s of SHELL_ROLES) {
        const l = relativeLuminance(p[s]);
        if (mode === "dark_mode") darkMax = Math.max(darkMax, l);
        else lightMin = Math.min(lightMin, l);
      }
    });
    expect(darkMax).toBeLessThanOrEqual(POLARITY_DARK_MAX_L);
    expect(lightMin).toBeGreaterThanOrEqual(POLARITY_LIGHT_MIN_L);
    expect(darkMax).toBeCloseTo(0.0717, 3);
    expect(lightMin).toBeCloseTo(0.8123, 3);
  });
});

describe("window solvability", () => {
  test("no role window is ever empty for a factory palette", () => {
    eachPreset((name, mode, palette) => {
      for (const role of [...SHELL_ROLES, "text", "textMuted", ...HUE_ROLES]) {
        expect(roleWindow(role, mode, palette).length).toBeGreaterThan(0);
      }
    });
  });

  test("legal-in implies legal-out for any single-token edit", () => {
    /* The whole safety argument: starting legal, editing one token at a
       time through the clamp can never produce an illegal palette, so the
       user cannot be walked into a dead end. */
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const randomHex = () =>
      `#${Math.floor(rnd() * 0xffffff)
        .toString(16)
        .padStart(6, "0")}`;

    for (let i = 0; i < 200; i += 1) {
      const names = Object.keys(SEMANTIC_PRESETS);
      const name = names[Math.floor(rnd() * names.length)];
      const mode = MODES[Math.floor(rnd() * MODES.length)];
      const palette = { ...SEMANTIC_PRESETS[name][mode] };

      const roles = [...SHELL_ROLES, "text", "textMuted", ...HUE_ROLES];
      const role = roles[Math.floor(rnd() * roles.length)];

      const bands = roleWindow(role, mode, palette);
      const picked = clampToWindow(randomHex(), bands);
      expect(bandsContain(bands, relativeLuminance(picked))).toBe(true);

      palette[role] = picked;
      /* and the edited palette is still a legal starting point */
      expect(roleWindow(role, mode, palette).length).toBeGreaterThan(0);
    }
  });

  test("polarity really does block a light colour in dark mode", () => {
    const palette = SEMANTIC_PRESETS.default.dark_mode;
    const bands = roleWindow("background", "dark_mode", palette);
    expect(bandsContain(bands, relativeLuminance("#ffffff"))).toBe(false);
    expect(bandsContain(bands, relativeLuminance("#cccccc"))).toBe(false);
    const clamped = clampToWindow("#ffffff", bands);
    expect(bandsContain(bands, relativeLuminance(clamped))).toBe(true);
  });

  test("clamping preserves hue and saturation, moving lightness only", () => {
    const palette = SEMANTIC_PRESETS.default.dark_mode;
    const bands = roleWindow("background", "dark_mode", palette);
    const clamped = clampToWindow("#4488ff", bands);
    expect(clamped).not.toBe("#4488ff");
    /* still recognisably the same blue */
    const hue = (hex) => {
      const n = parseInt(hex.slice(1), 16);
      const r = ((n >> 16) & 255) / 255;
      const g = ((n >> 8) & 255) / 255;
      const b = (n & 255) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (!d) return 0;
      if (max === r) return (((g - b) / d + 6) % 6) * 60;
      if (max === g) return ((b - r) / d + 2) * 60;
      return ((r - g) / d + 4) * 60;
    };
    expect(Math.abs(hue(clamped) - hue("#4488ff"))).toBeLessThan(2);
  });
});
