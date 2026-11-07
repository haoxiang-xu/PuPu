/* Drilling into a subagent.
 *
 * A referenced subagent is not a copy living inside its parent — it is the
 * shared Agent resource, opened by identity. Editing it there is editing the
 * one definition, so every other parent referencing it sees the change on its
 * next run. That is why a drill-in resolves to a *name* and the editor then
 * loads that resource through the ordinary interface, rather than lifting a
 * sub-graph out of the parent's own definition.
 *
 * An embedded Agent graph — owned by the parent and saved with it — is the
 * other half of the design and has no storage protocol yet (#356). It is
 * recognised here so that such an entry says what it is instead of doing
 * nothing when opened. */

export const DRILL = Object.freeze({
  REFERENCE: "reference",
  EMBEDDED: "embedded",
  LEGACY: "legacy",
  NONE: "none",
});

export function drill_target(entry) {
  if (!entry) return { kind: DRILL.NONE };
  if (entry.kind === "recipe_ref") {
    return entry.recipe_name
      ? { kind: DRILL.REFERENCE, name: entry.recipe_name }
      : { kind: DRILL.NONE };
  }
  if (entry.kind === "embedded") return { kind: DRILL.EMBEDDED };
  if (entry.kind === "inline" || entry.kind === "ref") {
    return { kind: DRILL.LEGACY };
  }
  return { kind: DRILL.NONE };
}

export function can_drill(entry) {
  return drill_target(entry).kind === DRILL.REFERENCE;
}

const UNAVAILABLE = Object.freeze({
  [DRILL.EMBEDDED]:
    "An embedded Agent graph is not connected yet — it needs the definition format from #356.",
  [DRILL.LEGACY]:
    "A legacy entry carries a prompt, not a graph. Convert it to an Agent first.",
  [DRILL.NONE]: "This entry does not point at an Agent that can be opened.",
});

export function drill_unavailable_reason(entry) {
  const { kind } = drill_target(entry);
  return kind === DRILL.REFERENCE ? null : UNAVAILABLE[kind];
}

/* A reference names a resource; whether that resource still exists is a
 * separate question, and one the UI must answer out loud rather than by
 * landing the user somewhere else. */
export function reference_exists(entry, resources) {
  const target = drill_target(entry);
  if (target.kind !== DRILL.REFERENCE) return true;
  if (!Array.isArray(resources)) return true;
  return resources.some((r) => r && r.name === target.name);
}

export function missing_reference_message(name) {
  return `"${name}" is no longer in the Agent library. The reference is kept so it can be repointed or removed.`;
}

export function read_failure_message(name, error) {
  const detail =
    error && typeof error.message === "string" && error.message
      ? ` — ${error.message}`
      : "";
  return `Could not open "${name}"${detail}`;
}

/* ── The drill stack ──────────────────────────────────────────────────────
 * Each frame is the graph left behind: its name, its in-memory definition
 * (unsaved edits included), whether it was dirty, what was selected, where the
 * viewport was, and the undo history recorded against that definition. Coming
 * back restores that frame rather than re-reading the resource, because
 * re-reading would throw away edits the user never asked to discard — and
 * going back is navigation, not a save, so the history has to come back too. */

export function push_drill_frame(stack, frame) {
  return [...(stack || []), frame];
}

/* Returns the frame to restore and the stack that remains, unwinding to
 * `depth` (0 = the root graph). */
export function unwind_drill_stack(stack, depth) {
  const list = stack || [];
  if (depth < 0 || depth >= list.length) return { frame: null, stack: list };
  return { frame: list[depth], stack: list.slice(0, depth) };
}

/* `Reviewer › Subagent Pool › Summarizer` — the pool crumb names where the
 * step happened and is not itself a graph, so it is never navigable. */
export function drill_crumbs(stack, current_label) {
  const list = stack || [];
  const crumbs = [];
  list.forEach((frame, depth) => {
    crumbs.push({ label: frame.label, depth, navigable: true });
    crumbs.push({ label: frame.via_label, depth: null, navigable: false });
  });
  crumbs.push({ label: current_label, depth: null, navigable: false });
  return crumbs;
}

/* ── Is a stashed frame still describing the resource it was taken from? ──
 *
 * A frame holds content and the undo history recorded against that content.
 * Both are only meaningful together: replaying a history onto content someone
 * else has since written would undo into states that never existed for it.
 *
 * The same Agent can sit at more than one level — a graph referencing an Agent
 * that references it back — so saving deeper in the stack can write the very
 * resource a frame below is holding an older copy of. That is detected by
 * counting saves per resource for this editing session.
 *
 * A write by another process is NOT detectable this way: the listing carries no
 * version or digest, so there is nothing to compare against. That half needs
 * the version handshake from #356 and is not claimed here. */

/* The table is keyed by a resource id, which is data: measured on the pair,
   `constructor`, `toString`, `valueOf` and `hasOwnProperty` are all ids the
   store accepts, while `__proto__` is refused at `document.id`. Read as a
   plain key, `saved_versions["constructor"]` answered with a function — and
   `function - 0` is `NaN`, which is never greater than zero, so the notice
   that this copy is older than the stored one was never shown. The page's own
   table has no prototype; this reads by own key so a caller's plain object
   cannot bring the fault back. */
export function saves_since(frame, saved_versions) {
  if (!frame) return 0;
  const now =
    (saved_versions &&
      typeof frame.name === "string" &&
      Object.prototype.hasOwnProperty.call(saved_versions, frame.name) &&
      saved_versions[frame.name]) ||
    0;
  return now - (frame.saved_version || 0);
}

export function frame_is_stale(frame, saved_versions) {
  return saves_since(frame, saved_versions) > 0;
}

export function stale_frame_message(name) {
  return `"${name}" was saved elsewhere while this copy was open. Its edit history was dropped, and saving here would replace that newer version.`;
}

export function left_behind_message(name) {
  return `Unsaved changes to "${name}" were left behind. Opening it again reads the saved version.`;
}

export function library_unavailable_message(error) {
  const detail =
    error && typeof error.message === "string" && error.message
      ? ` — ${error.message}`
      : "";
  return `The Agent library could not be read${detail}`;
}
