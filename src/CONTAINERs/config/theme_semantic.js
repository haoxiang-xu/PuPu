import { deriveTier } from "../../BUILTIN_COMPONENTs/theme/color_derive";
import {
  roleWindow,
  clampToWindow,
} from "../../BUILTIN_COMPONENTs/theme/contrast_window";
import {
  SEMANTIC_TOKEN_KEYS,
  SEMANTIC_DEFAULTS,
  SEMANTIC_PRESETS,
  SEMANTIC_FAMILIES,
  SEMANTIC_TOKEN_TREE,
  ALPHA_STEPS,
} from "../../BUILTIN_COMPONENTs/theme/semantic_tokens";

export const hexToRgbTriplet = (color) => {
  const trimmed = String(color || "").trim();
  const short = /^#([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    const [, v] = short;
    const r = parseInt(`${v[0]}${v[0]}`, 16);
    const g = parseInt(`${v[1]}${v[1]}`, 16);
    const b = parseInt(`${v[2]}${v[2]}`, 16);
    return `${r},${g},${b}`;
  }
  const full = /^#([0-9a-f]{6})$/i.exec(trimmed);
  if (full) {
    const [, v] = full;
    return [
      parseInt(v.slice(0, 2), 16),
      parseInt(v.slice(2, 4), 16),
      parseInt(v.slice(4, 6), 16),
    ].join(",");
  }
  return null;
};

/* three-tier border strength (CEO design ruling, follow-up to phases 3/4):
   single `border` semantic token stays — these are derived strength vars
   layered on top for different sink families. */
export const BORDER_TIER_ALPHA = { strong: 0.9, mid: 0.55, subtle: 0.3 };

/* Literal (non-numeric) detail keys. Published, frozen: kept only, never
   extended — a per-sink literal key for every new sink is the growth path
   v2 exists to close. They are NOT alpha steps and must be excluded
   wherever alpha-step logic iterates. */
export const DETAIL_LITERAL_KEYS = ["chipBorder", "menuBorder", "cardBorder"];

/* JSON details channel (CEO-approved): fine-grained knobs the theme editor UI
   does not render, carried only through JSON import/export + presets.
   Precedence per mode-key: user details > preset details > this default.

   v2: bucketed per mode. semanticCssVars does not know which mode it is
   emitting for, so a per-mode alpha would be unresolvable there — but
   resolveThemeDetails ALREADY resolves per mode, so bucketing the default
   table makes every strength step's light/dark difference flow down the
   channel that already exists. One pipe, no new plumbing.

   Border's three keep identical light/dark values, so this bucketing is
   behaviour-neutral for everything shipped before v2. */
const buildDetailDefaults = (modeBucket) => {
  const out = {};
  for (const key of DETAIL_LITERAL_KEYS) out[key] = "transparent";
  for (const step of ALPHA_STEPS) out[step.detailsKey] = step.alpha[modeBucket];
  return out;
};

export const DETAIL_DEFAULTS = {
  light_mode: buildDetailDefaults("light"),
  dark_mode: buildDetailDefaults("dark"),
};

export const resolveThemeDetails = (mode, options = {}) => {
  const { preset, details } = options;
  const presetDetails =
    (preset &&
      SEMANTIC_PRESETS[preset] &&
      SEMANTIC_PRESETS[preset].details &&
      SEMANTIC_PRESETS[preset].details[mode]) ||
    {};
  const userDetails = (details && details[mode]) || {};
  const base = DETAIL_DEFAULTS[mode] || DETAIL_DEFAULTS.light_mode;
  return { ...base, ...presetDetails, ...userDetails };
};

export const resolveSemanticPalette = (mode, options = {}) => {
  const { preset, custom } = options;
  const base = SEMANTIC_DEFAULTS[mode] || SEMANTIC_DEFAULTS.light_mode;
  const presetPalette =
    (preset && SEMANTIC_PRESETS[preset] && SEMANTIC_PRESETS[preset][mode]) || {};
  const customPalette = (custom && custom[mode]) || {};
  const result = {};
  for (const key of SEMANTIC_TOKEN_KEYS) {
    result[key] = customPalette[key] || presetPalette[key] || base[key];
  }
  for (const [root, family] of Object.entries(SEMANTIC_FAMILIES)) {
    /* Only derive a family's tiers when its own root was explicitly
       customized (per-family gate — no cross-family bleed). */
    if (customPalette[root] == null) continue;
    const refRoot = presetPalette[root] || base[root];
    for (const tier of family.children) {
      if (!customPalette[tier]) {
        const refTier = presetPalette[tier] || base[tier];
        /* Derivation options come from the node's own declaration. The
           minStep floor used to be one global 0.04, which is LARGER than
           the shipped sidebar offset (0.0118 on the default dark preset) —
           so the floor fired on every customisation and dragged sidebar
           permanently off the preset relationship. Per-node minStep fixes
           that at the source, without touching the derive gate (moving the
           gate would introduce a discontinuity instead). */
        const opts = SEMANTIC_TOKEN_TREE[tier]?.derive;
        result[tier] = deriveTier(result[root], refRoot, refTier, opts);
      }
    }
  }
  return clampDerivedTiers(mode, result, customPalette);
};

/* Derived tiers are OUR decision, so we are responsible for them: a tier
   the resolver computed must be dragged back inside its readability window
   rather than shipped unreadable. Colours the user picked by hand are
   already constrained at the picker, so this is a no-op for them. */
const clampDerivedTiers = (mode, palette, customPalette) => {
  for (const [root, family] of Object.entries(SEMANTIC_FAMILIES)) {
    if (customPalette[root] == null) continue;
    for (const tier of family.children) {
      if (customPalette[tier]) continue;
      palette[tier] = clampToWindow(
        palette[tier],
        roleWindow(tier, mode, palette),
      );
    }
  }
  return palette;
};

/* Imported JSON is the one entry point that can carry an illegal palette
   (hand-edited files). Clamping beats rejecting: throwing away someone's
   whole theme because one swatch is off is worse than fixing the swatch
   and saying so. Returns the count so the caller can disclose it. */
export const clampImportedCustom = (preset, custom) => {
  let adjusted = 0;
  const out = {};
  for (const mode of ["light_mode", "dark_mode"]) {
    const bag = { ...((custom && custom[mode]) || {}) };
    const palette = resolveSemanticPalette(mode, { preset, custom });
    for (const key of Object.keys(bag)) {
      if (!SEMANTIC_TOKEN_KEYS.includes(key)) continue;
      const legal = clampToWindow(bag[key], roleWindow(key, mode, palette));
      if (legal !== bag[key]) {
        bag[key] = legal;
        adjusted += 1;
      }
    }
    out[mode] = bag;
  }
  return { custom: out, adjusted };
};

export const semanticCssVars = (palette, detailsResolved) => {
  const vars = {};
  const rgbByKey = {};

  /* roots + hex tiers */
  for (const key of Object.keys(palette || {})) {
    const node = SEMANTIC_TOKEN_TREE[key];
    if (!node || node.kind === "alpha") continue;
    const value = palette[key];
    vars[`--pupu-${node.varName}`] = value;
    const rgb = hexToRgbTriplet(value);
    if (rgb) {
      vars[`--pupu-${node.varName}-rgb`] = rgb;
      rgbByKey[key] = rgb;
    }
  }

  /* strength steps: rgba(parent-rgb, alpha). A step is emitted only when
     its parent colour is present, so a partial palette stays partial.
     detailsResolved is already mode-resolved by resolveThemeDetails; the
     light bucket is a defensive fallback for callers that pass no details
     at all (tests only — every production caller resolves first, and the
     three published border alphas are mode-invariant, so this fallback is
     byte-identical to pre-v2 behaviour). */
  const fallback = DETAIL_DEFAULTS.light_mode;
  for (const step of ALPHA_STEPS) {
    const rgb = rgbByKey[step.parent];
    if (!rgb) continue;
    const alpha = detailsResolved
      ? (detailsResolved[step.detailsKey] ?? fallback[step.detailsKey])
      : fallback[step.detailsKey];
    vars[`--pupu-${step.varName}`] = `rgba(${rgb}, ${alpha})`;
  }

  if (detailsResolved) {
    vars["--pupu-chip-border"] = detailsResolved.chipBorder ?? fallback.chipBorder;
    vars["--pupu-menu-border"] = detailsResolved.menuBorder ?? fallback.menuBorder;
    vars["--pupu-card-border"] = detailsResolved.cardBorder ?? fallback.cardBorder;
  }
  return vars;
};

const withAlpha = (color, alpha) => {
  const rgb = hexToRgbTriplet(color);
  return rgb ? `rgba(${rgb}, ${alpha})` : color;
};

const merge = (base, overrides) => ({
  ...(base || {}),
  ...overrides,
});

export const applySemanticPaletteToTheme = (base, semantic, mode) => {
  if (!base || !semantic) return base;

  const {
    accent,
    background,
    sidebar,
    surface,
    text,
    textMuted,
    success,
    warning,
    danger,
  } = semantic;

  const deepTier =
    mode === "light_mode" ? sidebar : mode === "dark_mode" ? surface : null;

  return {
    ...base,
    semantic,
    highlightColor: accent,
    color: text,
    backgroundColor: background,
    foregroundColor: surface,
    icon: merge(base.icon, { color: text }),
    font: merge(base.font, { color: text }),
    /* A Button draws its label from theme.button.root.color and its icon from
       theme.icon.color. Mapping only the second one left the two halves of
       the same control on different colours — on the default dark palette the
       icon went to #ffffff while the label stayed at the JSON's #CCCCCC, and
       on any custom palette they drifted apart properly. Buttons that set
       their own colour still win: user style is merged over this. */
    button: merge(base.button, {
      root: merge(base.button?.root, { color: text }),
    }),
    input: merge(base.input, {
      backgroundColor: withAlpha(surface, 0.9),
      outline: merge(base.input?.outline, {
        onFocus: `2px solid ${accent}`,
      }),
    }),
    select: merge(base.select, {
      color: text,
      backgroundColor: withAlpha(surface, 0.9),
      placeholderColor: withAlpha(textMuted, 0.85),
      outline: merge(base.select?.outline, {
        onFocus: `2px solid ${accent}`,
      }),
      dropdown: merge(base.select?.dropdown, {
        backgroundColor: surface,
      }),
    }),
    modal: merge(base.modal, {
      backgroundColor: background,
      /* was withAlpha(border, BORDER_TIER_ALPHA.strong) — a second,
         independent computation of the same number the css var already
         holds, which silently ignored a user's borderAlphaStrong override.
         Referencing the var removes the duplicate AND fixes that. */
      border: "1px solid var(--pupu-border-strong)",
      bodyColor: textMuted,
      closeButtonColor: withAlpha(textMuted, 0.9),
      closeButtonHoverColor: text,
      errorAccent: danger,
      successAccent: success,
      /* warningAccent existed in the JSON theme and was read by
         confirm_interact, but nothing ever filled it — so the tool
         confirmation buttons in the chat stream never followed the theme.
         This is the wiring that makes the new warning root actually land
         on its highest-traffic consumer. */
      warningAccent: warning,
    }),
    switch: merge(base.switch, {
      backgroundColor_on: accent,
      /* off track: 20% text over whatever it sits on — reproduces the old
         fixed grays (#ccc light / ~#494949 dark) on the default palette,
         but keeps contrast with background AND the surface thumb on any
         custom palette (the base JSON grays didn't follow the theme) */
      backgroundColor: withAlpha(text, 0.2),
      /* thumb: control chip on the track → surface tier */
      color: surface,
    }),
    ...(deepTier
      ? {
          code: merge(base.code, { backgroundColor: deepTier }),
          textfield: merge(base.textfield, {
            backgroundColor: withAlpha(surface, 0.95),
            /* one border source for input surfaces: the base JSON's
               hardcoded textfield border would otherwise shadow the
               mid-tier var that the attach panel and context menus use */
            border: "1px solid var(--pupu-border-mid)",
          }),
          /* Rendered prose was the biggest surface still painted from fixed
             JSON hex, so a custom Label moved every label in the app except
             the answer itself. These are written as var() rather than
             resolved colours on purpose: the variables move on every preview
             frame, while this object only moves on commit. */
          markdown: {
            ...(base.markdown || {}),
            color: "var(--pupu-markdown-body)",
            pre: merge(base.markdown?.pre, { backgroundColor: deepTier }),
            table: merge(base.markdown?.table, {
              headerBackground: deepTier,
              borderColor: "var(--pupu-border)",
            }),
            blockquote: merge(base.markdown?.blockquote, {
              color: "var(--pupu-markdown-quote)",
              borderColor: "var(--pupu-border)",
            }),
            hr: merge(base.markdown?.hr, { borderColor: "var(--pupu-border)" }),
          },
        }
      : {}),
  };
};

export const applySemanticCssVars = (palette, element, detailsResolved) => {
  const el = element || (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  const vars = semanticCssVars(palette, detailsResolved);
  for (const name of Object.keys(vars)) {
    el.style.setProperty(name, vars[name]);
  }
};

/* ── Boot palette cache (boot-loading-gate design) ─────────────────────
   The static S1 shell in public/index.html cannot resolve a preset/custom
   theme (no bundle, no BUILTIN_COMPONENTs/theme data) — it can only read a
   plain-JSON cache of the already-resolved key colors. This is that write
   side: called wherever a fresh semantic palette gets committed (container
   boot IIFE, container theme effect, theme editor commit), never from a
   transient preview path. The static shell's inline script is the read
   side and has no knowledge of preset/custom resolution — it only trusts
   this cache or falls back to its own hardcoded dark default. */
export const BOOT_PALETTE_STORAGE_KEY = "pupu_boot_palette";

export const persistBootPalette = (palette) => {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (!palette || typeof palette !== "object") return;
  const { background, text, textMuted, accent } = palette;
  if (!background || !text || !accent) return;
  try {
    window.localStorage.setItem(
      BOOT_PALETTE_STORAGE_KEY,
      JSON.stringify({ background, text, textMuted: textMuted || text, accent }),
    );
  } catch (_e) {
    // Storage full/unavailable — the static shell just falls back to its
    // hardcoded default on next boot. Non-critical.
  }
};
