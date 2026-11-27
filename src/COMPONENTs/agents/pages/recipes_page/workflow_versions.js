import { useEffect, useReducer } from "react";
import { read_workflow_version } from "./skeleton_resources";

/* Published Workflow revisions this window has read (#357 Workflow Call).
 *
 * A revision is immutable on the host — its rows refuse update and delete, and
 * a re-read after the draft changed and was published again answers the same
 * bytes (measured: workflow-call-01 `wf_version_1_after_2`) — so a revision
 * admitted once is that revision for good, and every reader can share it: the
 * panel, the canvas node and the Output Variables, which must agree on what
 * the called Workflow takes and exports.
 *
 * Only admitted answers are kept. A refusal (`resource_missing` for an id
 * nobody published, the store unreachable) is remembered as the last answer
 * for that key and is asked again whenever a reader asks again; it is never
 * stored as if it were a revision. Keys are data, so the table has no
 * prototype. */

const entries = Object.create(null);
const listeners = new Set();
const key_of = (workflow_id, revision_id) => `${workflow_id}\u0000${revision_id}`;

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (_error) {
      // a reader that throws does not stop the others
    }
  });
}

/* `{status: "ready", version}`, `{status: "loading"}`, `{status: "refused",
   error}`, `{status: "unavailable", error}`, or null for a key never asked. */
export function workflow_version_state(workflow_id, revision_id) {
  if (typeof workflow_id !== "string" || !workflow_id || typeof revision_id !== "string" || !revision_id) return null;
  const entry = entries[key_of(workflow_id, revision_id)];
  return entry === undefined ? null : entry;
}

export function cached_workflow_version(workflow_id, revision_id) {
  const state = workflow_version_state(workflow_id, revision_id);
  return state && state.status === "ready" ? state.version : null;
}

/* Keeps an answer the host just gave (a publication), so a pin to it reads
   the same revision without another round trip. Only an admitted version. */
export function remember_workflow_version(version) {
  if (!version || typeof version.workflow_id !== "string" || typeof version.revision_id !== "string") return;
  entries[key_of(version.workflow_id, version.revision_id)] = { status: "ready", version };
  notify();
}

/* One read per revision at a time, and every caller awaits ITS settlement: a
   second reader — the Pin button while the canvas node is already reading the
   same revision — gets the same answer, never the "loading" placeholder
   (R-WFC-01). */
const inflight = new Map();

export function request_workflow_version(workflow_id, revision_id) {
  if (typeof workflow_id !== "string" || !workflow_id || typeof revision_id !== "string" || !revision_id) return Promise.resolve(null);
  const key = key_of(workflow_id, revision_id);
  const held = entries[key];
  if (held && held.status === "ready") return Promise.resolve(held);
  if (inflight.has(key)) return inflight.get(key);
  entries[key] = { status: "loading" };
  notify();
  const settled = read_workflow_version(workflow_id, revision_id).then((result) => {
    /* The adapter refuses an answer about another revision than the one asked
       (R-WFC-05), so an admitted answer here is this revision. */
    const answer = result.ok
      ? { status: "ready", version: result.data }
      : { status: result.reason === "unavailable" ? "unavailable" : "refused", error: result.error };
    /* A publication that landed while this read was in flight is the same
       immutable revision; the admitted answer is kept either way. */
    if (!(entries[key] && entries[key].status === "ready")) entries[key] = answer;
    inflight.delete(key);
    notify();
    return entries[key];
  });
  inflight.set(key, settled);
  return settled;
}

export function subscribe_workflow_versions(listener) {
  if (typeof listener !== "function") return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/* Re-renders the caller whenever any revision arrives, and asks for the ones
   it names that have not been asked for. */
export function useWorkflowVersions(references = []) {
  const [, bump] = useReducer((count) => count + 1, 0);
  useEffect(() => subscribe_workflow_versions(bump), []);
  const wanted = references
    .filter((ref) => ref && typeof ref.workflow_id === "string" && typeof ref.revision_id === "string")
    .map((ref) => key_of(ref.workflow_id, ref.revision_id))
    .join("\u0001");
  useEffect(() => {
    if (!wanted) return;
    wanted.split("\u0001").forEach((key) => {
      const [workflow_id, revision_id] = key.split("\u0000");
      if (!workflow_version_state(workflow_id, revision_id)) request_workflow_version(workflow_id, revision_id);
    });
  }, [wanted]);
}

/* Tests only: the table is module state. */
export function forget_workflow_versions() {
  Object.keys(entries).forEach((key) => delete entries[key]);
  inflight.clear();
  notify();
}
