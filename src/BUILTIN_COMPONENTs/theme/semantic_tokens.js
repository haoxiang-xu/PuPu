export const SEMANTIC_TOKEN_KEYS = [
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
];

/* ━━ Alpha ladder (taxonomy v2 spec §3) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   The 8 semantic rungs that the codebase's 1748 hand-written neutral
   overlays collapse into (73 distinct alpha values, 8 semantic buckets).

   A rung is an EVIDENCE ANCHOR plus a default alpha pair — it is never a
   variable name. There is no `--pupu-a5`. Every strength step carries its
   own semantic var name and merely cites the rung it sits on.

   A step may PIN its own `alpha`, overriding the rung default. Two legal
   reasons only: (a) the value is already published and must not move
   (border's three), (b) the step has its own measured evidence that
   differs from the rung centroid (text-faint, overlay-selected, the
   status template). */
export const ALPHA_LADDER = {
  A1: { id: "ghost", dark: 0.05, light: 0.04 },
  A2: { id: "subtle", dark: 0.08, light: 0.07 },
  A3: { id: "soft", dark: 0.12, light: 0.1 },
  A4: { id: "firm", dark: 0.22, light: 0.2 },
  A5: { id: "edge", dark: 0.34, light: 0.3 },
  A6: { id: "half", dark: 0.5, light: 0.45 },
  A7: { id: "strong", dark: 0.72, light: 0.68 },
  A8: { id: "full", dark: 0.92, light: 0.88 },
};

/* Status-colour ladder: ONE template stamped onto every status hue, so the
   four hues stay visually comparable. `detailsKey` is deliberately
   template-level (not per-hue) — allowing per-hue alpha tuning would split
   the single ladder back into four, which is the exact duplication v2
   exists to remove. Consequence: these steps are `shared`, see below. */
const STATUS_HUES = ["accent", "success", "warning", "danger", "info"];
const STATUS_STEPS = [
  { suffix: "tint", label: "Tint", rung: "A3", alpha: 0.14, detailsKey: "statusTintAlpha" },
  { suffix: "tint-hover", label: "Tint hover", rung: "A4", alpha: 0.18, detailsKey: "statusTintHoverAlpha" },
  { suffix: "tint-active", label: "Tint active", rung: "A4", alpha: 0.22, detailsKey: "statusTintActiveAlpha" },
  { suffix: "tint-border", label: "Tint border", rung: "A4", alpha: 0.25, detailsKey: "statusTintBorderAlpha" },
];

const camel = (hue, suffix) =>
  hue + suffix.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

const statusTintNodes = () => {
  const nodes = {};
  for (const hue of STATUS_HUES) {
    for (const step of STATUS_STEPS) {
      nodes[camel(hue, step.suffix)] = {
        parent: hue,
        kind: "alpha",
        varName: `${hue}-${step.suffix}`,
        label: step.label,
        phase: "P1",
        rung: step.rung,
        alpha: { dark: step.alpha, light: step.alpha },
        detailsKey: step.detailsKey,
        /* shared: this step's alpha is ONE knob for all five hues, because
           the value of a single status ladder is that the hues stay
           comparable. The editor still renders and edits these rows, and
           still offers the Linked/Pinned switch — it just labels them
           "shared" so the coupling is visible: moving accent-tint moves
           danger-tint too, by design rather than by accident. */
        shared: true,
      };
    }
  }
  return nodes;
};

/* ━━ Token tree (taxonomy v2 spec §2.2) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Single source of truth. The resolver, storage, editor state and editor
   UI all read THIS — never re-declare a child list locally.

   kind:
     "literal" — a root colour the user picks outright
     "tier"    — an independent hex whose lightness/saturation relationship
                 derives from the parent (deriveTier); lives in
                 theme.custom[mode][key]; missing key = Linked
     "alpha"   — an alpha variant of the parent, never an independent
                 colour; lives in theme.details[mode][detailsKey];
                 missing key = Linked

   authored: every preset hand-specifies this node's value, so when the
   root has NOT been customised the preset value must be taken verbatim
   rather than recomputed. This is the existing sidebar/surface behaviour,
   made explicit so nobody later "helpfully" derives over authored values.

   DEPTH IS CAPPED AT 3 (root -> tier/alpha -> alpha). Enforced by test. */
export const SEMANTIC_TOKEN_TREE = {
  /* ── roots ─────────────────────────────────────────────────────────── */
  accent: { parent: null, kind: "literal", varName: "accent", label: "Accent", phase: "shipped" },
  background: { parent: null, kind: "literal", varName: "background", label: "Background", phase: "shipped" },
  text: { parent: null, kind: "literal", varName: "text", label: "Label", phase: "shipped" },
  border: { parent: null, kind: "literal", varName: "border", label: "Border", phase: "shipped" },
  success: { parent: null, kind: "literal", varName: "success", label: "Success", phase: "shipped" },
  warning: { parent: null, kind: "literal", varName: "warning", label: "Warning", phase: "P1" },
  danger: { parent: null, kind: "literal", varName: "danger", label: "Danger", phase: "shipped" },
  info: { parent: null, kind: "literal", varName: "info", label: "Info", phase: "P1" },

  /* ── background family tiers ───────────────────────────────────────── */
  /* minStep is per-node: the shipped sidebar offset (default dark
     #121212 -> #151515) is only 0.0118 in HSL-L, SMALLER than the old
     global 0.04 floor. That floor was forcing sidebar to #1c1c1c the
     moment anyone customised background — a permanent drift away from
     the preset. 0.010 sits below every preset's authored sidebar offset
     (measured range 0.0118–0.0255), so it never fires spuriously while
     still guarding the degenerate all-black case. */
  sidebar: {
    parent: "background",
    kind: "tier",
    varName: "sidebar",
    label: "Sidebar",
    phase: "shipped",
    authored: true,
    derive: { minStep: 0.01 },
  },
  surface: {
    parent: "background",
    kind: "tier",
    varName: "surface",
    label: "Surface",
    phase: "shipped",
    authored: true,
    derive: { minStep: 0.01 },
  },

  /* ── text family ───────────────────────────────────────────────────── */
  textMuted: {
    parent: null,
    kind: "literal",
    varName: "text-muted",
    label: "Muted text",
    phase: "shipped",
    authored: true,
  },
  textStrong: {
    parent: "text", kind: "alpha", varName: "text-strong", label: "Strong", phase: "P1",
    rung: "A8", alpha: { dark: 0.92, light: 0.88 }, detailsKey: "textStrongAlpha",
  },
  textSecondary: {
    parent: "text", kind: "alpha", varName: "text-secondary", label: "Secondary", phase: "P1",
    rung: "A7", alpha: { dark: 0.72, light: 0.68 }, detailsKey: "textSecondaryAlpha",
  },
  textFaint: {
    parent: "text", kind: "alpha", varName: "text-faint", label: "Faint", phase: "P1",
    rung: "A5", alpha: { dark: 0.38, light: 0.35 }, detailsKey: "textFaintAlpha",
  },
  textDisabled: {
    parent: "text", kind: "alpha", varName: "text-disabled", label: "Disabled", phase: "P1",
    rung: "A4", alpha: { dark: 0.22, light: 0.2 }, detailsKey: "textDisabledAlpha",
  },

  /* ── markdown family: the prose the assistant writes ─────────────────
     Rendered markdown was the largest surface still painted from fixed
     JSON hex (#E0E0E0 body, #B5B5B5 quote), so a custom Label moved every
     label in the app except the actual answer text. These are alphas of
     Label like everything else, and their defaults are the old hex values
     re-expressed over each mode's background, so adopting them changes
     nothing until the user reaches for them. */
  markdownBody: {
    parent: "text", kind: "alpha", varName: "markdown-body", group: "markdown",
    label: "Body", phase: "P2",
    rung: "A8", alpha: { dark: 0.88, light: 1 }, detailsKey: "markdownBodyAlpha",
  },
  markdownQuote: {
    parent: "text", kind: "alpha", varName: "markdown-quote", group: "markdown",
    label: "Quote", phase: "P2",
    rung: "A7", alpha: { dark: 0.69, light: 0.67 }, detailsKey: "markdownQuoteAlpha",
  },

  /* ── overlay family: neutral FILL only, never a hairline ────────────
     No root of its own — the de-facto behaviour everywhere is neutral ink
     over the surface, so it derives from `text`. Append-only escape hatch
     for a future coloured hover: add an `overlay` root key; a missing key
     keeps falling back to text. */
  overlayHover: {
    parent: "text", kind: "alpha", varName: "overlay-hover", group: "overlay", label: "Hover fill", phase: "P1",
    rung: "A2", alpha: { dark: 0.08, light: 0.07 }, detailsKey: "overlayHoverAlpha",
  },
  overlayActive: {
    parent: "text", kind: "alpha", varName: "overlay-active", group: "overlay", label: "Active fill", phase: "P1",
    rung: "A3", alpha: { dark: 0.12, light: 0.1 }, detailsKey: "overlayActiveAlpha",
  },
  overlaySelected: {
    parent: "text", kind: "alpha", varName: "overlay-selected", group: "overlay", label: "Selected fill", phase: "P1",
    rung: "A3", alpha: { dark: 0.1, light: 0.06 }, detailsKey: "overlaySelectedAlpha",
  },
  overlayGhost: {
    parent: "text", kind: "alpha", varName: "overlay-ghost", group: "overlay", label: "Ghost fill", phase: "P1",
    rung: "A1", alpha: { dark: 0.05, light: 0.04 }, detailsKey: "overlayGhostAlpha",
  },

  /* ── border family: STROKES only. Alphas are already published as
       borderAlpha* details keys — frozen, do not align them to the rung
       defaults. ────────────────────────────────────────────────────── */
  borderStrong: {
    parent: "border", kind: "alpha", varName: "border-strong", label: "Strong", phase: "shipped",
    rung: "A8", alpha: { dark: 0.9, light: 0.9 }, detailsKey: "borderAlphaStrong",
  },
  borderMid: {
    parent: "border", kind: "alpha", varName: "border-mid", label: "Mid", phase: "shipped",
    rung: "A6", alpha: { dark: 0.55, light: 0.55 }, detailsKey: "borderAlphaMid",
  },
  borderSubtle: {
    parent: "border", kind: "alpha", varName: "border-subtle", label: "Subtle", phase: "shipped",
    rung: "A5", alpha: { dark: 0.3, light: 0.3 }, detailsKey: "borderAlphaSubtle",
  },

  /* ── status ladder x 5 hues (20 nodes, generated) ──────────────────── */
  ...statusTintNodes(),
};

/* Derived view kept for the four P0 consumers (resolver, storage,
   advanced_state, editor). A "family" here means exactly what it meant in
   P0: a root plus its hex TIER children. Alpha steps are not families —
   they never enter the custom bag. */
export const SEMANTIC_FAMILIES = Object.entries(SEMANTIC_TOKEN_TREE).reduce(
  (acc, [key, node]) => {
    if (node.kind !== "tier" || !node.parent) return acc;
    if (!acc[node.parent]) acc[node.parent] = { children: [] };
    acc[node.parent].children.push(key);
    return acc;
  },
  {},
);

/* Every alpha step, in declaration order — the emission list for
   semanticCssVars. */
export const ALPHA_STEPS = Object.entries(SEMANTIC_TOKEN_TREE)
  .filter(([, node]) => node.kind === "alpha")
  .map(([key, node]) => ({ key, ...node }));

export const tokenTreeDepth = (key, tree = SEMANTIC_TOKEN_TREE) => {
  let depth = 1;
  let cur = tree[key];
  const seen = new Set([key]);
  while (cur && cur.parent) {
    if (seen.has(cur.parent)) return Infinity; /* cycle */
    seen.add(cur.parent);
    depth += 1;
    cur = tree[cur.parent];
  }
  return depth;
};

export const SEMANTIC_DEFAULTS = {
  light_mode: {
    accent: "#65c466",
    background: "#ffffff",
    sidebar: "#f5f5f5",
    surface: "#ffffff",
    text: "#222222",
    textMuted: "#8c8c8c",
    border: "#e6e6e6",
    success: "#22c55e",
    warning: "#d97706",
    danger: "#dc3545",
    info: "#2563eb",
  },
  dark_mode: {
    accent: "#65c466",
    background: "#121212",
    sidebar: "#151515",
    surface: "#1e1e1e",
    text: "#ffffff",
    textMuted: "#8a8a8a",
    border: "#2e2e2e",
    success: "#4ade80",
    warning: "#fbbf24",
    danger: "#f87171",
    info: "#60a5fa",
  },
};

export const SEMANTIC_PRESETS = {
  default: SEMANTIC_DEFAULTS,
  ocean: {
    light_mode: {
      accent: "#0ea5e9",
      background: "#f7fbfd",
      sidebar: "#eef5f9",
      surface: "#ffffff",
      text: "#0f2330",
      textMuted: "#5b7585",
      border: "#d8e6ee",
      success: "#22c55e",
      warning: "#b45309",
      danger: "#dc3545",
      info: "#0369a1",
    },
    dark_mode: {
      accent: "#38bdf8",
      background: "#0b1620",
      sidebar: "#0f1d28",
      surface: "#13232f",
      text: "#e6f2f8",
      textMuted: "#7d97a6",
      border: "#233a48",
      success: "#4ade80",
      warning: "#fcd34d",
      danger: "#f87171",
      info: "#7dd3fc",
    },
  },
  warm: {
    light_mode: {
      accent: "#f97316",
      background: "#fffaf5",
      sidebar: "#f6efe7",
      surface: "#ffffff",
      text: "#2b1d12",
      textMuted: "#9c7a60",
      border: "#f0e2d4",
      success: "#22c55e",
      warning: "#b45309",
      danger: "#dc3545",
      info: "#1d4ed8",
    },
    dark_mode: {
      accent: "#fb923c",
      background: "#1a120b",
      sidebar: "#1f160d",
      surface: "#241910",
      text: "#f7ece1",
      textMuted: "#b08e72",
      border: "#3a2a1c",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
      info: "#93c5fd",
    },
  },
  high_contrast: {
    light_mode: {
      accent: "#0040ff",
      background: "#ffffff",
      sidebar: "#f0f0f0",
      surface: "#ffffff",
      text: "#000000",
      textMuted: "#595959",
      border: "#6b6b6b",
      success: "#008a00",
      warning: "#7a4100",
      danger: "#c40000",
      info: "#0033cc",
    },
    dark_mode: {
      accent: "#5b8cff",
      background: "#000000",
      sidebar: "#050505",
      surface: "#0a0a0a",
      text: "#ffffff",
      textMuted: "#b3b3b3",
      border: "#8a8a8a",
      success: "#46e046",
      warning: "#ffc14d",
      danger: "#ff5a5a",
      info: "#7fb0ff",
    },
    details: {
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
    },
  },
  graphite: {
    light_mode: {
      accent: "#4a4a4a",
      background: "#ffffff",
      sidebar: "#f4f4f4",
      surface: "#ffffff",
      text: "#1f1f1f",
      textMuted: "#737373",
      border: "#e2e2e2",
      success: "#22c55e",
      warning: "#b45309",
      danger: "#dc3545",
      info: "#2563eb",
    },
    dark_mode: {
      accent: "#d4d4d4",
      background: "#111111",
      sidebar: "#161616",
      surface: "#1d1d1d",
      text: "#f5f5f5",
      textMuted: "#8f8f8f",
      border: "#2c2c2c",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
      info: "#93c5fd",
    },
  },
  violet: {
    light_mode: {
      accent: "#7c3aed",
      background: "#fdfcff",
      sidebar: "#f5f2fb",
      surface: "#ffffff",
      text: "#241b35",
      textMuted: "#7a7090",
      border: "#e6e0f0",
      success: "#22c55e",
      warning: "#b45309",
      danger: "#dc3545",
      info: "#4f46e5",
    },
    dark_mode: {
      accent: "#a78bfa",
      background: "#131020",
      sidebar: "#171327",
      surface: "#1d1830",
      text: "#efeaf8",
      textMuted: "#948aac",
      border: "#322a48",
      success: "#4ade80",
      warning: "#fbbf24",
      danger: "#f87171",
      info: "#a5b4fc",
    },
  },
  rose: {
    light_mode: {
      accent: "#db2777",
      background: "#fffafc",
      sidebar: "#faf0f5",
      surface: "#ffffff",
      text: "#341421",
      textMuted: "#9c7288",
      border: "#f2dde7",
      success: "#22c55e",
      warning: "#b45309",
      danger: "#b91c1c",
      info: "#2563eb",
    },
    dark_mode: {
      accent: "#f472b6",
      background: "#1c1016",
      sidebar: "#21141b",
      surface: "#281a21",
      text: "#f8ecf1",
      textMuted: "#b08ea0",
      border: "#3e2a34",
      success: "#4ade80",
      warning: "#fcd34d",
      danger: "#fca5a5",
      info: "#93c5fd",
    },
  },
  nord: {
    light_mode: {
      accent: "#5e81ac",
      background: "#eceff4",
      sidebar: "#e5e9f0",
      surface: "#f5f7fa",
      text: "#2e3440",
      textMuted: "#4c566a",
      border: "#d8dee9",
      success: "#4c7a44",
      warning: "#8a6d20",
      danger: "#a54049",
      info: "#5e81ac",
    },
    dark_mode: {
      accent: "#88c0d0",
      background: "#2e3440",
      sidebar: "#3b4252",
      surface: "#434c5e",
      text: "#eceff4",
      textMuted: "#d8dee9",
      border: "#4c566a",
      success: "#a3be8c",
      warning: "#ebcb8b",
      danger: "#bf616a",
      info: "#81a1c1",
    },
  },
  midnight: {
    light_mode: {
      accent: "#1f6feb",
      background: "#fbfcfe",
      sidebar: "#eef2f7",
      surface: "#ffffff",
      text: "#1f2733",
      textMuted: "#6b7687",
      border: "#d8dfe9",
      success: "#1a7f37",
      warning: "#9a6700",
      danger: "#cf222e",
      info: "#0969da",
    },
    dark_mode: {
      accent: "#3b82f6",
      background: "#161c28",
      sidebar: "#131824",
      surface: "#1e2635",
      text: "#d7dee8",
      textMuted: "#8a94a6",
      border: "#2c3648",
      success: "#3fb950",
      warning: "#d29922",
      danger: "#f85149",
      info: "#58a6ff",
    },
  },
};
