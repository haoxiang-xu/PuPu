/* ══════════════════════════════════════════════════════════════════════════════
 *  console_logger.js  –  Chrome DevTools badge logger
 *
 *  Usage:
 *    import { createLogger } from "../SERVICEs/console_logger";
 *
 *    const logger = createLogger("MISO", "src/PAGEs/chat/chat.js");
 *    logger.log("stream", "Connection established", payload);
 *    logger.warn("stream", "Retrying …");
 *    logger.error("stream", "Connection failed", err);
 *    logger.debug("stream", "Raw frame", frame);
 *
 *  Each call produces a badge row in the console:
 *    ┌─────────┬──────────┬──────────┬────────────────────────────────┐
 *    │  TIME    MODULE    ACTION    FILE PATH                        │
 *    └─────────┴──────────┴──────────┴────────────────────────────────┘
 *  followed by the remaining arguments printed on the next line.
 *
 *  Palette: Solarized Dark.
 * ══════════════════════════════════════════════════════════════════════════════ */

/* ── Enable / disable ──────────────────────────────────────────────────────── */
let _enabled =
  typeof process !== "undefined" && process.env
    ? process.env.NODE_ENV !== "production"
    : true;

export const setLoggerEnabled = (flag) => {
  _enabled = Boolean(flag);
};

/* ── Solarized Dark palette ────────────────────────────────────────────────── */
const SOL = Object.freeze({
  base03: "#002b36",
  base02: "#073642",
  base01: "#586e75",
  base00: "#657b83",
  base0: "#839496",
  base1: "#93a1a1",
  base2: "#eee8d5",
  base3: "#fdf6e3",
  yellow: "#b58900",
  orange: "#cb4b16",
  red: "#dc322f",
  magenta: "#d33682",
  violet: "#6c71c4",
  blue: "#268bd2",
  cyan: "#2aa198",
  green: "#859900",
});

/*  Each level defines the bg colour for its four segments.
 *  Foreground is always SOL.base3 (cream) for coloured segments
 *  and SOL.base2 for the file-path tail segment.                              */
const LEVEL_PALETTE = Object.freeze({
  log: [SOL.base02, SOL.blue, SOL.cyan, SOL.base01],
  warn: [SOL.base02, SOL.yellow, SOL.orange, SOL.base01],
  error: [SOL.base02, SOL.red, SOL.magenta, SOL.base01],
  debug: [SOL.base02, SOL.violet, SOL.green, SOL.base01],
});

/* The foreground (text) colour used on each segment index */
const FG = [SOL.base1, SOL.base3, SOL.base3, SOL.base2];

/* ── CSS helpers ───────────────────────────────────────────────────────────── */
const segCSS = (bg, fg) =>
  `background:${bg};color:${fg};padding:2px 6px;font-weight:bold;font-size:11px`;

const resetCSS = "background:transparent;color:inherit;font-weight:normal";

/* ── Timestamp ─────────────────────────────────────────────────────────────── */
const ts = () => {
  const d = new Date();
  return [
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ].join(":");
};

/* ── Module-specific palettes ─────────────────────────────────────────────── */
/*  Optional overrides so certain modules get a distinct colour family.
 *  Structure mirrors LEVEL_PALETTE: { log: [...], warn: [...], ... }         */
const MODULE_PALETTE = Object.freeze({
  CHARACTER: Object.freeze({
    log: [SOL.base02, SOL.magenta, SOL.violet, SOL.base01],
    warn: [SOL.base02, SOL.yellow, SOL.orange, SOL.base01],
    error: [SOL.base02, SOL.red, SOL.magenta, SOL.base01],
    debug: [SOL.base02, SOL.violet, SOL.magenta, SOL.base01],
  }),
});

/* ── Core builder ──────────────────────────────────────────────────────────── */
/**
 * Build the `%c`-interpolated format string + css arguments for one log line.
 *
 * @param {"log"|"warn"|"error"|"debug"} level
 * @param {string}  moduleName   e.g. "MISO"
 * @param {string}  action       e.g. "stream"
 * @param {string}  filePath     e.g. "src/PAGEs/chat/chat.js"
 * @param {object}  [palette]    Optional per-module LEVEL_PALETTE override
 * @returns {string[]}  [formatString, ...cssArgs]
 */
const buildBadge = (level, moduleName, action, filePath, palette) => {
  const bgs = (palette ?? LEVEL_PALETTE)[level] ?? LEVEL_PALETTE.log;
  const labels = [ts(), moduleName.toUpperCase(), action, filePath];

  let fmt = "";
  const css = [];

  labels.forEach((label, i) => {
    fmt += `%c ${label} `;
    css.push(segCSS(bgs[i], FG[i]));
  });

  // reset after the badge row
  fmt += "%c";
  css.push(resetCSS);

  return [fmt, ...css];
};

/* ── Public factory ────────────────────────────────────────────────────────── */
/**
 * Create a scoped logger bound to a module name and source-file path.
 *
 * @param {string} moduleName  Human-readable module tag (e.g. "MISO", "UI")
 * @param {string} filePath    Relative source path (e.g. "src/PAGEs/chat/chat.js")
 * @returns {{ log, warn, error, debug }}
 */
export const createLogger = (moduleName, filePath = "") => {
  const palette = MODULE_PALETTE[moduleName.toUpperCase()] || null;
  const make = (level) => {
    const nativeMethod = console[level] ?? console.log;

    return (action, ...rest) => {
      if (!_enabled) return;

      const [fmt, ...cssArgs] = buildBadge(level, moduleName, action, filePath, palette);

      if (rest.length === 0) {
        nativeMethod(fmt, ...cssArgs);
      } else if (rest.length === 1) {
        // Single payload → print on same groupCollapsed line, expand to see it
        nativeMethod(fmt, ...cssArgs, "\n", rest[0]);
      } else {
        nativeMethod(fmt, ...cssArgs, "\n", ...rest);
      }
    };
  };

  return Object.freeze({
    log: make("log"),
    warn: make("warn"),
    error: make("error"),
    debug: make("debug"),
  });
};
