// An Agent's icon and colour: the one place that knows their shape.
//
// They are stored IN the Agent's Skeleton document, as the optional top-level
// key `presentation` = { icon?: <catalogue id>, color?: "#rrggbb" lowercase }.
// Absent means the default (the bot on the Agent blue). This module never
// stores anything itself: it reads the `presentation` a view already has (a
// resource summary from listSkeletonResources, the open editor's document,
// or an embedded subagent's `source.document`) and writes through a writer the
// caller injects — the editor's document-change path, the pool panel's entry
// write, or the resource store for an Agent that is not open.
//
// The shape is CLOSED. Reading drops any other key, an icon id that is not in
// the catalogue and a colour that is not in the palette below, and never
// throws: a resource written by a newer or older build still draws (with the
// default for what it does not know), and stored data is never rewritten on
// read. Writing sends only what reading would keep, so a value written here
// reads back the same everywhere.
//
// The palette is a PuPu decision, narrower than the stored format: the
// runtime admits any "#rrggbb", PuPu offers and writes only these.

import { DEFAULT_AGENT_ICON, is_agent_icon_id } from "../COMPONENTs/agents/agent_icons";

export const DEFAULT_AGENT_COLOR = "#4a5bd8";
/* Every colour meets 3:1 against the dark (#1e1e1e) and light (#f5f5f5) list
   backgrounds and against a white glyph (agent_resource_icons.test.js). The
   default is first. */
export const AGENT_PRESET_COLORS = Object.freeze([
  "#4a5bd8", "#7c4dd8", "#3a7bd5", "#1d8798", "#2e8f5a", "#b3820b",
  "#d9622b", "#d23f37", "#c0398f", "#b94a74", "#6e6e73",
]);
export const DEFAULT_AGENT_PRESENTATION = Object.freeze({ icon: DEFAULT_AGENT_ICON, color: DEFAULT_AGENT_COLOR });
export const PRESENTATION_KEYS = Object.freeze(["icon", "color"]);

const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/* A palette colour, lowercased; anything else (including well-formed hex
   outside the palette) is null. */
export const normalize_color = (value) => {
  if (typeof value !== "string" || !HEX.test(value)) return null;
  const color = value.toLowerCase();
  return AGENT_PRESET_COLORS.includes(color) ? color : null;
};

/* {icon?, color?} with only valid keys, or null when nothing valid is left. */
export function normalize_presentation(raw) {
  if (!isRecord(raw)) return null;
  const out = {};
  try {
    if (own(raw, "icon") && is_agent_icon_id(raw.icon)) out.icon = raw.icon;
    if (own(raw, "color")) {
      const color = normalize_color(raw.color);
      if (color) out.color = color;
    }
  } catch (_error) {
    return null; // a getter that throws reads as no presentation
  }
  return Object.keys(out).length > 0 ? out : null;
}

/* What to draw: every key present, defaults filled in. */
export function resolve_presentation(raw) {
  const stored = normalize_presentation(raw);
  return {
    icon: stored && stored.icon ? stored.icon : DEFAULT_AGENT_PRESENTATION.icon,
    color: stored && stored.color ? stored.color : DEFAULT_AGENT_PRESENTATION.color,
  };
}

/* The value a writer should store: null means "remove the key". A value equal
   to the default is still stored as chosen — the user picked it. */
export const presentation_to_store = (raw) => normalize_presentation(raw);

/* A document with `presentation` set (or removed for null). Returns the same
   document when nothing would change, so an editor sees no edit. */
export function with_document_presentation(document, presentation) {
  if (!isRecord(document)) return document;
  const next = presentation_to_store(presentation);
  const current = own(document, "presentation") ? document.presentation : undefined;
  if (next === null) {
    if (current === undefined) return document;
    const { presentation: _dropped, ...rest } = document;
    return rest;
  }
  if (isRecord(current) && Object.keys(current).length === Object.keys(next).length &&
    Object.keys(next).every((key) => current[key] === next[key])) {
    return document;
  }
  return { ...document, presentation: next };
}

/* ── change notification ─────────────────────────────────────────────── */
const listeners = new Set();

export function subscribe_presentation(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notify_presentation(change) {
  listeners.forEach((listener) => {
    try {
      listener(change);
    } catch (_error) {
      // a listener must not break the write that announced it
    }
  });
}

/* ── writes ──────────────────────────────────────────────────────────── */

/* `write(resourceId, presentationOrNull)` may return a value or a promise of
   `{ ok: true }` / `{ ok: false, code }`; throwing counts as `{ ok: false }`.
   Listeners hear only about writes that succeeded. */
export async function set_presentation(resourceId, presentation, { write } = {}) {
  if (typeof write !== "function") return { ok: false, code: "presentation_writer_missing" };
  const value = presentation_to_store(presentation);
  let answer;
  try {
    answer = await write(resourceId, value);
  } catch (error) {
    return { ok: false, code: (error && error.code) || "presentation_write_failed", error };
  }
  if (isRecord(answer) && answer.ok === false) return answer;
  notify_presentation({ resourceId, presentation: value });
  return { ok: true, presentation: value };
}

export const reset_presentation = (resourceId, options) => set_presentation(resourceId, null, options);
