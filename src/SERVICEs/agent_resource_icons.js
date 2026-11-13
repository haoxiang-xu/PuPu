// An Agent resource's icon: the one place that knows its shape.
//
// It is stored IN the Agent's Skeleton document, as the optional top-level
// key `presentation` = { icon?: <catalogue id>, color?: "#rrggbb" }. Absent
// means the default (the bot). PuPu is icon-only: it writes `{ icon }` and
// nothing else, and never draws a stored `color` — a document written by an
// older build that chose one still loads, and draws in the default colours.
// The icon belongs to the Agent RESOURCE (the Explorer, the Subagent Pool's
// roster and library); an Agent NODE always wears the fixed node identity.
//
// This module never stores anything itself: it reads the `presentation` a
// view already has (a resource summary from listSkeletonResources or an
// embedded subagent's `source.document`) and writes through a writer the
// caller injects (the resource store, from the Explorer).
//
// Reading drops any other key and an icon id that is not in the catalogue,
// and never throws: a resource written by a newer or older build still draws
// (with the default for what it does not know), and stored data is never
// rewritten on read.

import { DEFAULT_AGENT_ICON, is_agent_icon_id } from "../COMPONENTs/agents/agent_icons";

/* The colour every Agent tile wears — the Agent node blue. Not a choice. */
export const DEFAULT_AGENT_COLOR = "#4a5bd8";
export const DEFAULT_AGENT_PRESENTATION = Object.freeze({ icon: DEFAULT_AGENT_ICON, color: DEFAULT_AGENT_COLOR });

const HEX = /^#[0-9a-fA-F]{6}$/;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

/* {icon?, color?} with only valid keys, or null when nothing valid is left.
   A legacy `color` in the stored format is kept so the value reads back as
   stored; nothing draws it. */
export function normalize_presentation(raw) {
  if (!isRecord(raw)) return null;
  const out = {};
  try {
    if (own(raw, "icon") && is_agent_icon_id(raw.icon)) out.icon = raw.icon;
    if (own(raw, "color") && typeof raw.color === "string" && HEX.test(raw.color)) {
      out.color = raw.color.toLowerCase();
    }
  } catch (_error) {
    return null; // a getter that throws reads as no presentation
  }
  return Object.keys(out).length > 0 ? out : null;
}

/* What to draw: the stored icon (or the default), always on the default
   colour — a stored colour is never drawn. */
export function resolve_presentation(raw) {
  const stored = normalize_presentation(raw);
  return {
    icon: stored && stored.icon ? stored.icon : DEFAULT_AGENT_PRESENTATION.icon,
    color: DEFAULT_AGENT_PRESENTATION.color,
  };
}

/* The value a writer should store: `{ icon }` for a chosen icon other than
   the default, or null — remove the key, use the default. A stored colour is
   never written back, so saving drops a legacy one. */
export const presentation_to_store = (raw) => {
  const stored = normalize_presentation(raw);
  return stored && stored.icon && stored.icon !== DEFAULT_AGENT_ICON ? { icon: stored.icon } : null;
};

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
