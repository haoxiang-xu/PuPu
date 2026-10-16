/* Drilling into a subagent's own graph.
 *
 * A subagent is a complete Agent graph, and a graph is edited on the canvas.
 * So the pool panel manages entries and the canvas opens them: double-clicking
 * an entry swaps the canvas to that subagent's graph, with a breadcrumb back.
 *
 * The two kinds of entry are not two flavours of the same thing — they differ
 * in what a save writes, which is the whole point of keeping them apart:
 *
 *   `agent_ref`  names another resource. Opening it opens THAT resource by
 *                identity, and saving writes it, so every other parent
 *                referencing it sees the change on its next run. Measured:
 *                saving the child leaves the parent's document and edit token
 *                untouched while the parent's own subagent digest changes.
 *   `embedded`   is a whole Agent document living inside this parent's pool
 *                entry (`source.document`) — which is what the real legacy
 *                conversion writes for an inline subagent. It is owned by the
 *                parent, so editing it edits the parent's document and saving
 *                writes the parent. Measured: the child's edit comes back out
 *                of the stored parent verbatim, with no new resource created
 *                and the referenced Agent untouched.
 *
 * Everything here is the store's own vocabulary, frozen in
 * `skeleton_drill_capture.js`: `source.kind` decides, never a file extension
 * and never a field name. The store refuses the rest at Run — `unknown_variant`
 * at `source.kind`, `invalid_type` at `source.document`, `missing_field` at
 * `source` — and each refusal has a row there.
 *
 * One thing worth stating because it decides what a child view may show: the
 * draft check does not look inside an embedded graph. A child with no End
 * answers the same `[]` as a healthy one, while the identical fault in the
 * PARENT is reported — at `document.nodes[1]…`, which in a child view is the
 * child's own Kernel. So a child view shows none of the parent's diagnostics,
 * and says that this graph is checked when the parent runs. */

import { identity_of, safe_text } from "./document_values";
import {
  find_node,
  node_legacy_pool_entries,
  node_pool_is_legacy,
  node_subagents,
} from "./skeleton_document";
import { legacy_entry_label } from "./legacy_conversion";
import { entry_source_label, why_not_this_reference } from "./skeleton_subagent_eligibility";
/* One stack algebra, two editors. Pushing a frame, unwinding to a depth and
   rendering crumbs are the same operations on the legacy recipe canvas and
   here; only what a frame HOLDS differs, and that is this module's business. */
import {
  drill_crumbs,
  push_drill_frame,
  saves_since,
  unwind_drill_stack,
} from "./subagent_drill";

export { drill_crumbs, push_drill_frame, unwind_drill_stack };

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const DRILL = Object.freeze({
  REFERENCE: "reference",
  EMBEDDED: "embedded",
  UNREADABLE: "unreadable",
});

/* The pool crumb names where the step happened. It is not a graph, so it is
   never navigable — the same word the design uses. */
const VIA_LABEL = "Subagent Pool";

export const EMBEDDED_UNCHECKED_CAPTION =
  "The draft check does not look inside an embedded graph, so nothing here is reported until the parent Agent runs.";

const NO_SOURCE =
  "This entry does not say where its Agent comes from, so there is no graph to open.";
const NOT_A_DOCUMENT =
  "This entry's embedded graph is not a document, so it cannot be opened. The store refuses it at Run.";
const LEGACY_FIRST =
  "This pool still holds legacy entries. Convert it first — then each subagent is an Agent graph that opens here.";

/* An embedded graph that is not an Agent has no Agent graph to open, and the
   store says so at `source.document.kind` — `wrong_kind`, "Agent preparation
   requires agent kind". Nothing in this editor can change a document's kind,
   so opening it would be a canvas full of Agent panels over a graph that can
   never be one. The pool row's own problem rows report the refusal. */
function embedded_not_an_agent_reason(document) {
  const kind = is_object(document) ? document.kind : null;
  if (kind === "agent") return null;
  return kind === "workflow"
    ? "This entry's embedded graph declares itself a Workflow, and a Subagent Pool holds Agents."
    : "This entry's embedded graph does not declare itself an Agent, so there is no Agent graph to open.";
}

function entry_source(entry) {
  return is_object(entry) && is_object(entry.source) ? entry.source : null;
}

/* What an entry points at, decided by `source.kind` alone. */
export function drill_target(entry) {
  const source = entry_source(entry);
  if (source === null) return { kind: DRILL.UNREADABLE, reason: NO_SOURCE };
  if (source.kind === "agent_ref") {
    const agent_id = source.agent_id;
    const refused = why_not_this_reference(agent_id, null);
    return refused === null
      ? { kind: DRILL.REFERENCE, agent_id }
      : { kind: DRILL.UNREADABLE, reason: refused };
  }
  if (source.kind === "embedded") {
    if (!is_object(source.document)) {
      return { kind: DRILL.UNREADABLE, reason: NOT_A_DOCUMENT };
    }
    const refused = embedded_not_an_agent_reason(source.document);
    return refused === null
      ? { kind: DRILL.EMBEDDED }
      : { kind: DRILL.UNREADABLE, reason: refused };
  }
  return {
    kind: DRILL.UNREADABLE,
    reason: `This entry's source is ${safe_text(source.kind)}, and the store knows agent_ref and embedded. There is no graph to open.`,
  };
}

export function can_drill(entry) {
  return drill_target(entry).kind !== DRILL.UNREADABLE;
}

/* ── The rows a pool node draws ──────────────────────────────────────────── */

/* The canvas draws a row per entry and the row is what the author opens, so
   the node needs a name, where the Agent comes from, and whether it opens.
   A legacy pool draws its own entries — they are the subagents the author
   has, and a pool that showed nothing until it was converted would read as an
   empty pool. */
export function pool_entry_rows(node) {
  if (node_pool_is_legacy(node)) {
    return legacy_pool_rows(node);
  }
  const entries = node_subagents(node);
  if (!Array.isArray(entries)) return [];
  return entries.map((entry, index) => {
    const target = drill_target(entry);
    return {
      key: identity_of([(is_object(entry) && entry.id) || index]),
      entry_id: is_object(entry) && typeof entry.id === "string" ? entry.id : null,
      name: is_object(entry) && typeof entry.name === "string" && entry.name
        ? entry.name
        : safe_text(is_object(entry) ? entry.name : entry),
      note: entry_source_label(entry),
      openable: target.kind !== DRILL.UNREADABLE,
      reason: target.kind === DRILL.UNREADABLE ? target.reason : null,
    };
  });
}

/* A legacy entry's name is `legacy_conversion`'s `legacy_entry_label` and its
   entries are `skeleton_document`'s, both imported rather than restated: the
   conversion's refusals name the entry they are about, and two spellings of
   one name is how a message stops matching the row it points at. These rows
   are never openable — `drill_unavailable_reason` says why once, for the
   pool. */
function legacy_pool_rows(node) {
  return node_legacy_pool_entries(node).map((entry, index) => ({
    key: identity_of(["legacy", index]),
    entry_id: null,
    name: legacy_entry_label(entry),
    note: "Legacy",
    openable: false,
    reason: LEGACY_FIRST,
  }));
}

/* ── Where an embedded graph lives ───────────────────────────────────────── */

/* A step is the pool node and the entry inside it, by id — never by position.
   An index is not an identity: removing an earlier entry would move every
   step below it onto a different subagent. */
export function embedded_step_indices(document, step) {
  if (!is_object(document) || !Array.isArray(document.nodes) || !is_object(step)) {
    return null;
  }
  const node_index = document.nodes.findIndex(
    (node) => is_object(node) && node.id === step.node_id,
  );
  if (node_index < 0) return null;
  const node = document.nodes[node_index];
  if (node.type !== "subagent_pool" || node_pool_is_legacy(node)) return null;
  const entries = node_subagents(node);
  if (!Array.isArray(entries)) return null;
  const entry_index = entries.findIndex(
    (entry) => is_object(entry) && entry.id === step.entry_id,
  );
  if (entry_index < 0) return null;
  if (drill_target(entries[entry_index]).kind !== DRILL.EMBEDDED) return null;
  return { node_index, entry_index };
}

/* The path the store addresses this graph by, which is also the prefix every
   problem inside it is reported at:
   `document.nodes[i].config.subagents[j].source.document`. */
export function embedded_path(document, steps) {
  const list = Array.isArray(steps) ? steps : [];
  let current = document;
  const path = ["document"];
  for (const step of list) {
    const found = embedded_step_indices(current, step);
    if (found === null) return null;
    path.push(
      "nodes",
      found.node_index,
      "config",
      "subagents",
      found.entry_index,
      "source",
      "document",
    );
    current = current.nodes[found.node_index].config.subagents[found.entry_index]
      .source.document;
  }
  return path;
}

/* The graph at the end of the steps, or null if any step no longer resolves —
   the entry was removed, or the pool was. The caller treats that as "this
   graph is gone" rather than showing an empty canvas. */
export function embedded_document(document, steps) {
  const list = Array.isArray(steps) ? steps : [];
  let current = document;
  for (const step of list) {
    const found = embedded_step_indices(current, step);
    if (found === null) return null;
    current = current.nodes[found.node_index].config.subagents[found.entry_index]
      .source.document;
  }
  return current;
}

/* Writing a child back into its parent, immutably, touching nothing else. The
   result is the document the store is then asked to store — and that is what
   the capture checks it against. */
export function with_embedded_document(document, steps, child) {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length === 0) return child;
  const [step, ...rest] = list;
  const found = embedded_step_indices(document, step);
  if (found === null) return document;
  const node = document.nodes[found.node_index];
  const entries = node.config.subagents;
  const entry = entries[found.entry_index];
  const inner =
    rest.length === 0
      ? child
      : with_embedded_document(entry.source.document, rest, child);
  const next_entries = entries.map((candidate, index) =>
    index === found.entry_index
      ? { ...candidate, source: { ...candidate.source, document: inner } }
      : candidate,
  );
  return {
    ...document,
    nodes: document.nodes.map((candidate, index) =>
      index === found.node_index
        ? { ...candidate, config: { ...candidate.config, subagents: next_entries } }
        : candidate,
    ),
  };
}

/* Which of the parent's diagnostics are about this embedded graph: the ones
   reported at its own path, re-rooted so the panel can place them the way it
   places any other. Measured today: none — the draft check does not descend
   into a pool. The filter is what keeps the parent's own problems off this
   graph's nodes, where they would otherwise land by position. */
export function diagnostics_for_embedded(diagnostics, prefix) {
  if (!Array.isArray(diagnostics) || !Array.isArray(prefix)) return [];
  return diagnostics
    .filter((item) => {
      const path = item && Array.isArray(item.path) ? item.path : null;
      if (path === null || path.length <= prefix.length) return false;
      return prefix.every((part, index) => path[index] === part);
    })
    .map((item) => ({
      ...item,
      path: ["document", ...item.path.slice(prefix.length)],
    }));
}

/* ── What is being edited, and what a save writes ────────────────────────── */

/* The layout is drawn per graph, and an embedded graph has no resource id of
   its own, so it is keyed by the resource plus the steps that reach it. A
   delimiter would not do: a node id may contain anything the store accepts. */
export function drill_layout_key(resource_id, steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (list.length === 0) return resource_id;
  return identity_of([
    resource_id,
    ...list.flatMap((step) => [step.node_id, step.entry_id]),
  ]);
}

/* A graph's own name, for the breadcrumb. */
export function graph_label(document, fallback) {
  const name = is_object(document) ? document.name : null;
  return typeof name === "string" && name ? name : fallback || "";
}

export function save_target_caption(label) {
  return `Save writes ${label}, which owns this embedded graph.`;
}

export function open_failed_message(agent_id, error) {
  const detail =
    error && typeof error.message === "string" && error.message
      ? ` — ${error.message}`
      : "";
  return `The Agent ${safe_text(agent_id)} could not be opened${detail}`;
}

export function gone_message(label) {
  return `${label} is no longer in this pool, so it was closed.`;
}

export function left_behind_message(label) {
  return `Unsaved changes to ${label} were left behind. Opening it again reads the stored version.`;
}

export function stale_frame_message(label) {
  return `${label} was saved again further in, so this copy is older than the stored one. Saving here raises a conflict you can resolve.`;
}

/* Opening a subagent while a write is in flight would answer about the graph
   that is open now and land on a different one. */
export function drill_blocked_reason(session) {
  if (!session) return null;
  if (session.saving) {
    return "This save has not landed yet. Its answer belongs to the graph that is open now, so wait before opening a subagent.";
  }
  if (session.converting) {
    return "The conversion is still being written. Wait for it before opening a subagent.";
  }
  return null;
}

/* A frame is the graph left behind. `kind` says how it was left, which is what
   decides whether coming back has to put a resource session back:
   an embedded step never left the resource, so its edits are in the live
   session and restoring one would throw them away. */
export const FRAME = Object.freeze({ RESOURCE: "resource", EMBEDDED: "embedded" });

export function frame_for_embedded_step({ label, steps, selected_node_id }) {
  return {
    kind: FRAME.EMBEDDED,
    label,
    via_label: VIA_LABEL,
    steps,
    selected_node_id: selected_node_id || null,
  };
}

export function frame_for_resource_step({
  label,
  steps,
  selected_node_id,
  session,
  saved_version,
}) {
  return {
    kind: FRAME.RESOURCE,
    label,
    via_label: VIA_LABEL,
    steps,
    selected_node_id: selected_node_id || null,
    session,
    name: (session && session.resource_id) || null,
    saved_version: saved_version || 0,
  };
}

/* A document replaced wholesale — the other editor's version taken — may not
   hold the entry a drilled-in graph came from. Then there is no graph to show,
   and the honest place to land is this resource's own root: the frames above
   it belong to steps inside the document that was just replaced. */
export function closed_embedded_frames(stack) {
  const list = Array.isArray(stack) ? [...stack] : [];
  while (list.length > 0 && list[list.length - 1].kind === FRAME.EMBEDDED) {
    list.pop();
  }
  return list;
}

export function frame_is_stale(frame, saved_versions) {
  return frame && frame.kind === FRAME.RESOURCE
    ? saves_since(frame, saved_versions) > 0
    : false;
}

export function pool_node_for(document, node_id) {
  const node = find_node(document, node_id);
  return node && node.type === "subagent_pool" ? node : null;
}
