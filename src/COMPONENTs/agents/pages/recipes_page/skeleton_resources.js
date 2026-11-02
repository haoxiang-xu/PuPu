/* Talking to the Skeleton resource store.
 *
 * The method names and payload shapes are the ones the store actually exposes
 * (`route_skeleton_resources.py`, and the facade added to `api.unchain.js`):
 *
 *   getManagedSkeletonResource(resourceId)                 GET  /skeleton_resources/v2/<id>
 *   saveManagedSkeletonResource(edit)                      POST /skeleton_resources/v2
 *   preflightManagedSkeletonResource(resourceId)           POST /skeleton_resources/v2/<id>/preflight
 *   diagnoseSkeletonResource(document)                     POST /skeleton_resources/diagnose
 *
 * (the first three are the v2 managed-Code aggregate, #357 G1; see
 * docs/implementation/managed-code-interface-v2.md)
 *
 * Those endpoints are not on `dev` yet — they live in the Skeleton runtime
 * branch — so in this build the bridge has no such method and every call here
 * answers `unavailable`. That is deliberate: the caller is written against the
 * real name and the real payload, and the one thing it must never do is
 * pretend. A panel that silently did nothing would look identical to a panel
 * whose save failed.
 *
 * Three outcomes, kept apart on purpose:
 *   {ok: true, data}                  — the store answered
 *   {ok: false, reason: "unavailable"} — this build cannot reach the store
 *   {ok: false, reason: "refused", error} — the store answered and said no */

import { api } from "../../../../SERVICEs/api";
import { emitSkeletonLibraryRefresh } from "../../../../SERVICEs/skeleton_library_refresh";
import { kernel_admission_problems } from "./kernel_config";
import { normalize_diagnostics } from "./skeleton_diagnostics";
import {
  PREFLIGHT_SCHEMA,
  PROTOCOL_ERROR,
  admit_resource_aggregate,
  admit_version_aggregate,
  save_edit,
} from "./managed_code_sources";

const UNAVAILABLE_CODES = new Set(["bridge_unavailable", "bridge_missing"]);

function unavailable(error) {
  return {
    ok: false,
    reason: "unavailable",
    error: {
      code: (error && error.code) || "bridge_unavailable",
      message:
        "The Skeleton resource store is not reachable in this build, so nothing was saved.",
    },
  };
}

function refused(error) {
  return {
    ok: false,
    reason: "refused",
    error: {
      code: (error && error.code) || "skeleton_store_failed",
      path: (error && error.path) || [],
      message: (error && error.message) || "The Skeleton resource store refused the request.",
    },
  };
}

/* The store reports a refusal as a body rather than a throw on some paths and
 * as a throw on others, so both are funnelled to the same verdict. */
async function call(method_name, invoke) {
  const method = api && api.unchain && api.unchain[method_name];
  if (typeof method !== "function") return unavailable(null);
  let answer = null;
  try {
    answer = await invoke(method);
  } catch (error) {
    if (UNAVAILABLE_CODES.has(error && error.code)) return unavailable(error);
    return refused(error);
  }
  if (answer && typeof answer === "object" && answer.error) {
    return refused(answer.error);
  }
  return { ok: true, data: answer };
}

export function is_unavailable(result) {
  return Boolean(result) && result.ok === false && result.reason === "unavailable";
}

/* The resource listing, for the one caller that has to choose among them: a
 * Subagent Pool picking an Agent to reference. Archived resources are left
 * out of the request rather than filtered afterwards — an archived Agent
 * cannot start a run, so offering one composes a definition the store refuses
 * at Run. The gate refuses them too, for a listing that includes them. */
export async function list_resources(include_archived = false) {
  return call("listSkeletonResources", (method) => method(include_archived));
}

/* An open resource is the host's v2 aggregate (#357 G1): the document plus
 * the Code text it manages, so that a Code node's text is read with the
 * graph it belongs to and saved with it in one compare-and-set. This editor
 * reads and writes ONLY that way. A host without the v2 methods answers
 * `unavailable` and one whose answer is not a whole aggregate is refused —
 * the graph-only v1 read is not a fallback, because it cannot carry the text
 * and a Save built on it would drop every source the resource holds.
 *
 * The answer is the resource as before — `{id, kind, name, document,
 * edit_token, diagnostics, …}` — plus `managed_sources`, the text table keyed
 * by digest (managed_code_sources). */
function admitted(result) {
  if (!result.ok) return result;
  const aggregate = admit_resource_aggregate(result.data);
  if (!aggregate.ok) return refused(aggregate.error);
  return { ok: true, data: { ...aggregate.resource, managed_sources: aggregate.sources } };
}

export async function load_resource(resource_id) {
  return admitted(await call("getManagedSkeletonResource", (method) => method(resource_id)));
}

/* A draft saves while it is still incomplete — the store validates the envelope
 * and nothing more. `expected_edit_token` is the compare-and-set: null for a
 * resource that does not exist yet, and required to overwrite one that does, so
 * a second editor cannot be overwritten without noticing.
 *
 * The edit carries the complete set of Code text this resource owns, each at
 * the address its node has in the document being sent. One whose text is not
 * on hand is refused here and nothing is sent. */
export async function save_draft(document, expected_edit_token, sources) {
  const built = save_edit(document, expected_edit_token, sources);
  if (!built.ok) return refused(built.error);
  const result = admitted(
    await call("saveManagedSkeletonResource", (method) => method(built.edit)),
  );
  /* A save is the one thing that puts a new Agent in the library, so it says
     so: anything showing that listing — the chat's Agent row, in another part
     of the same window — re-reads instead of going on offering the library
     from before this save. Only a store answer counts; a refusal and an
     unreachable store changed nothing. The announcement carries no document:
     the subscriber asks the store, so nobody renders a resource that only
     this call ever saw. */
  if (result.ok) {
    emitSkeletonLibraryRefresh({
      reason: "resource_saved",
      resource_id:
        result.data && typeof result.data.id === "string" ? result.data.id : "",
    });
  }
  return result;
}

export async function diagnose(document) {
  const result = await call("diagnoseSkeletonResource", (method) => method(document));
  if (!result.ok) return result;
  return {
    ok: true,
    data: normalize_diagnostics(result.data && result.data.diagnostics),
  };
}

/* Run and Publish go through here: full validation, not the draft's envelope
 * check. A draft that saves happily can still fail this. */
/* Make the Subagent Pool conversion permanent.
 *
 * The store has always performed it for each run and thrown it away, so the
 * settings were preserved where nobody could see them and the entries stayed
 * legacy in the document. This writes that same result once, under the
 * compare-and-set token the resource was read with.
 *
 * `legacy_kernel` is a fallback for an Agent node that has no Kernel of its
 * own, and this editor sends none: an inline legacy subagent is built on the
 * Kernel configured on the node its Pool is attached to, which the store
 * reads out of the document. Without one anywhere the store refuses with
 * `legacy_profile_required` rather than guessing a model, and the panel says
 * which node to configure — see `legacy_conversion`. */
export async function convert_legacy_pools(resource_id, expected_edit_token, legacy_kernel) {
  return call("convertSkeletonLegacyPools", (method) =>
    method(resource_id, expected_edit_token, legacy_kernel === undefined ? null : legacy_kernel),
  );
}

/* The Kernel profiles this build can offer, checked on arrival.
 *
 * The producer validates every profile with the runtime's own
 * `validate_kernel_config` before offering it; this side checks the same
 * profiles against the editor's mirror. The two are not the same code, and
 * that is the point — a profile both accept is one the author can pick
 * without the panel having to refuse it afterwards, and a disagreement
 * between them becomes a row saying so rather than a crash in a picker.
 *
 * The second half is passed through untouched. A model that is absent because
 * this build declares no output cap for it is a thing the panel has to be
 * able to say; a picker that silently omitted it would read as PuPu having
 * forgotten the model. */
export const CATALOG_MALFORMED = "skeleton_kernel_profile_list_malformed";

const is_entry = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function kernel_profiles() {
  const result = await call("listSkeletonKernelProfiles", (method) => method());
  if (!result.ok) return result;
  /* Asked here as well as in the facade, and not because one of them might be
     skipped: a strict consumer that trusts its transport to have checked the
     shape is not a strict consumer. An answer that is not a catalog is
     refused, never emptied — "no model can be configured" is a statement
     about this build, and it must not be how an unreadable answer looks. */
  const data = result.data;
  const shaped =
    is_entry(data) &&
    Array.isArray(data.profiles) &&
    Array.isArray(data.unavailable) &&
    [...data.profiles, ...data.unavailable].every(is_entry);
  if (!shaped) {
    return refused({
      code: CATALOG_MALFORMED,
      message: "The runtime's answer was not a list of Kernel profiles.",
    });
  }
  const offered = [];
  const unavailable = [];
  data.profiles.forEach(
    (profile) => {
      const problems = kernel_admission_problems({
        schema_version: 1,
        profile,
        prompt: "",
        max_iterations: 1,
        output_tokens: 1,
        history: "root",
        overflow: "error",
        json_schema: null,
      });
      if (problems.length === 0) {
        offered.push(profile);
        return;
      }
      const first = problems[0];
      unavailable.push({
        id: (profile && profile.id) || null,
        provider: (profile && profile.provider) || null,
        model: (profile && profile.model) || null,
        reason: "profile_refused",
        code: first.code,
        path: first.where,
      });
    },
  );
  data.unavailable.forEach((entry) => unavailable.push(entry));
  return { ok: true, data: { profiles: offered, unavailable } };
}

/* The Python profiles on this machine, for a Code node's Runtime picker
 * (#357). The store lists `{id, kind, executable, fingerprint, available,
 * changed, edit_token}` per profile — the built-in interpreter first, then
 * the Pythons the author named — and the panel reads only those fields. A
 * version is not among them: it comes from a probe the author asks for.
 *
 * Checked on arrival for the same reason the Kernel catalog is: an answer
 * that is not a list of profiles is refused, never emptied, because "no
 * Python on this machine" is a statement about the machine and must not be
 * how an unreadable answer looks. */
export const PROFILES_MALFORMED = "skeleton_python_profile_list_malformed";

export async function python_profiles() {
  const result = await call("listSkeletonPythonProfiles", (method) => method());
  if (!result.ok) return result;
  const data = result.data;
  const shaped =
    is_entry(data) &&
    Array.isArray(data.profiles) &&
    data.profiles.every((profile) => is_entry(profile) && typeof profile.id === "string" && profile.id);
  if (!shaped) {
    return refused({
      code: PROFILES_MALFORMED,
      message: "The runtime's answer was not a list of Python profiles.",
    });
  }
  return { ok: true, data: { profiles: data.profiles } };
}

/* Names a Python on this machine: an absolute path to its executable, never a
   shell string or an `activate` script. The store probes it before storing
   and answers with the profile plus `probe: {ok, version, implementation}`;
   a path that is not a CPython ≥ 3.10 is refused with its reason. */
export async function save_python_profile(profile_id, executable) {
  return call("saveSkeletonPythonProfile", (method) => method({ profile_id, executable }));
}

export async function probe_python_profile(profile_id) {
  return call("probeSkeletonPythonProfile", (method) => method(profile_id));
}

/* The check of the stored resource, its Code text included. The v2 answer
   wraps the same nine-field verdict the editor already reads; a refusal is
   the store's error, as before. Nothing goes over but the id: the v1 request
   Kernel was always sent empty from here. */
export async function preflight(resource_id) {
  const result = await call("preflightManagedSkeletonResource", (method) => method(resource_id));
  if (!result.ok) return result;
  const answer = result.data;
  if (!is_entry(answer) || Object.keys(answer).length !== 2 || answer.schema !== PREFLIGHT_SCHEMA || !is_entry(answer.preflight)) {
    return refused({ code: PROTOCOL_ERROR, message: "The preflight reply is not a v2 answer." });
  }
  return { ok: true, data: answer.preflight };
}

/* ── Published Workflow revisions (#357 Workflow Call) ─────────────────
 *
 * A Workflow Call pins one published revision of one Workflow. Both reads go
 * through the v2 aggregate, for the reason the resource reads do: a revision
 * of a Workflow whose draft is host-managed is refused by the graph-only v1
 * read (`source_api_required`, measured on the fixed sidecar), and nothing is
 * read any other way.
 *
 *   read_workflow_version(id, revision)  GET  …/v2/<id>/versions/<revision>
 *   publish_workflow(id, token)          POST …/v2/<id>/publish
 *
 * Publication is the host's: it publishes the stored draft at that token,
 * answers an unchanged draft with its existing revision (measured), and
 * refuses a stale token with `edit_conflict`. The answer is admitted whole —
 * `{ok, data: version}` with the revision's six fields — or refused. */
/* An answer is admitted only as an answer about what was asked: a valid
   revision of another Workflow (or another revision of this one) is refused
   here, before anything announces, keeps or pins it (R-WFC-05). A publication
   names its Workflow only; the revision is the host's to choose. */
function admitted_version(result, workflow_id, revision_id) {
  if (!result.ok) return result;
  const aggregate = admit_version_aggregate(result.data);
  if (!aggregate.ok) return refused(aggregate.error);
  const version = aggregate.version;
  if (version.workflow_id !== workflow_id || (revision_id !== undefined && version.revision_id !== revision_id)) {
    return refused({ code: "identity_mismatch", message: "The host answered about another Workflow revision than the one asked for." });
  }
  return { ok: true, data: version };
}

export async function read_workflow_version(workflow_id, revision_id) {
  return admitted_version(
    await call("getManagedSkeletonWorkflowVersion", (method) => method(workflow_id, revision_id)),
    workflow_id,
    revision_id,
  );
}

/* The whole pinned revision, for opening it read-only from its Workflow Call:
   the same v2 read and admission as `read_workflow_version`, and the same
   refusal of an answer about another revision, kept together with the Code
   text its aggregate carries — which the shared revision table does not hold,
   and without which a host-kept Code node could not be drawn. */
export async function read_workflow_revision_view(workflow_id, revision_id) {
  const result = await call("getManagedSkeletonWorkflowVersion", (method) => method(workflow_id, revision_id));
  if (!result.ok) return result;
  const aggregate = admit_version_aggregate(result.data);
  if (!aggregate.ok) return refused(aggregate.error);
  const version = aggregate.version;
  if (version.workflow_id !== workflow_id || version.revision_id !== revision_id) {
    return refused({ code: "identity_mismatch", message: "The host answered about another Workflow revision than the one asked for." });
  }
  return { ok: true, data: { version, sources: aggregate.sources } };
}

export async function publish_workflow(workflow_id, expected_edit_token) {
  const result = admitted_version(
    await call("publishManagedSkeletonWorkflow", (method) => method(workflow_id, expected_edit_token)),
    workflow_id,
  );
  /* A publication changes what the library lists (a revision count), so it
     is announced like a save. */
  if (result.ok) emitSkeletonLibraryRefresh({ reason: "workflow_published", resource_id: workflow_id });
  return result;
}

/* ── Importing one resource with its Code (#357) ───────────────────────
 *
 * The host's transfer interface, through the strict facade: its closed
 * capability first, then one import of the file's text exactly as read, with
 * an explicit local Python for every owned Code node. There is no fallback:
 * an old or mismatched host leaves import unavailable with its own reason,
 * and a refusal keeps the host's code, path and message. */
export async function transfer_capabilities() {
  return call("getManagedSkeletonTransferCapabilities", (method) => method());
}

export async function import_resource(payload) {
  const result = await call("importManagedSkeletonResource", (method) => method(payload));
  /* A stored resource is a change to what the library lists. */
  if (result.ok && result.data && result.data.resource) {
    emitSkeletonLibraryRefresh({ reason: "imported", resource_id: result.data.resource.id });
  }
  return result;
}

export function edit_conflict_message(error) {
  return error && error.code === "edit_conflict"
    ? "This Agent was changed elsewhere since it was opened. Reload it before saving, or the other edit would be replaced."
    : null;
}
