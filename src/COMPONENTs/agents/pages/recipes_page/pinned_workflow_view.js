import { identity_of, safe_text } from "./document_values";
import { pinned_reference } from "./workflow_call_config";

/* Opening the graph a Workflow Call is pinned to, read-only (#357).
 *
 * A pin names one published revision, and a revision is immutable on the
 * host, so what opens is exactly that `{workflow_id, revision_id}` — never the
 * Workflow's draft and never "the latest". Nothing here is a navigation into
 * another resource: the editor's sitting (its unsaved document, Code text,
 * history, selection and drill steps) stays where it is, and the view is laid
 * over it until the author goes back. */

/* The crumb between the editor's graph and the revision: like a pool crumb, it
   names where the step happened and is not a graph, so it is not navigable. */
export const PINNED_VIA_LABEL = "Workflow Call";

/* Where the view's drawing is kept. A resource id is URL-safe, so a key built
   from a list can never be an editor's own key. */
export function pinned_view_key(pin) {
  return identity_of(["pinned-workflow", pin && pin.workflow_id, pin && pin.revision_id]);
}

export function pinned_view_label(version) {
  const document = version && version.document;
  const name = document && typeof document.name === "string" && document.name ? document.name : version && version.workflow_id;
  return `${safe_text(name)} · revision ${version && version.ordinal}`;
}

export function pinned_view_caption(version) {
  const document = version && version.document;
  const name = document && typeof document.name === "string" && document.name ? document.name : version && version.workflow_id;
  return `Read-only: revision ${version && version.ordinal} of ${safe_text(name)} · ${safe_text(version && version.revision_id)}. The run uses exactly this revision; nothing here is edited or saved.`;
}

/* The editor's crumbs with the revision after them. The graph the author came
   from becomes navigable at `stack.length` — a depth no frame has — which is
   how going back to it is told from going further up. */
export function pinned_view_crumbs(editor_crumbs, depth, node_id, label) {
  const list = Array.isArray(editor_crumbs) ? editor_crumbs.slice() : [];
  const last = list.pop();
  return [
    ...list,
    { label: last ? last.label : "", depth, navigable: true },
    { label: `${PINNED_VIA_LABEL} · ${safe_text(node_id)}`, depth: null, navigable: false },
    { label, depth: null, navigable: false },
  ];
}

/* Whether the graph on screen still has exactly one node with this id, and it
   is still pinned to exactly this revision. Asked when a read answers: the
   author may have re-pinned, removed the node or taken another version while
   it was in flight, and then the answer is about a pin nobody holds. */
export function pin_still_held(document, node_id, pin) {
  const nodes = document && Array.isArray(document.nodes) ? document.nodes : null;
  if (!nodes || !pin) return false;
  const matches = nodes.filter((node) => node && typeof node === "object" && node.id === node_id);
  if (matches.length !== 1) return false;
  const now = pinned_reference(matches[0]);
  return Boolean(now) && now.workflow_id === pin.workflow_id && now.revision_id === pin.revision_id;
}

export const PIN_CHANGED_MESSAGE = "The pin changed while its revision was being read, so nothing was opened. Open it again to see the revision it holds now.";

export function pinned_open_failed_message(result) {
  const error = result && result.error;
  const reason = (error && (error.message || error.code)) || (result && result.reason === "unavailable" ? "the store could not be reached" : "the store refused");
  return `The pinned revision could not be read: ${safe_text(reason)}. Nothing was opened.`;
}
