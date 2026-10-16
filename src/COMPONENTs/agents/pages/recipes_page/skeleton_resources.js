/* Talking to the Skeleton resource store.
 *
 * The method names and payload shapes are the ones the store actually exposes
 * (`route_skeleton_resources.py`, and the facade added to `api.unchain.js`):
 *
 *   getSkeletonResource(resourceId)                        GET  /skeleton_resources/<id>
 *   saveSkeletonResource({document, expected_edit_token})  POST /skeleton_resources
 *   diagnoseSkeletonResource(document)                     POST /skeleton_resources/diagnose
 *   preflightSkeletonResource(resourceId, legacyKernel)    POST .../preflight
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
import { kernel_admission_problems } from "./kernel_config";
import { normalize_diagnostics } from "./skeleton_diagnostics";

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

export async function load_resource(resource_id) {
  return call("getSkeletonResource", (method) => method(resource_id));
}

/* A draft saves while it is still incomplete — the store validates the envelope
 * and nothing more. `expected_edit_token` is the compare-and-set: omitted for a
 * resource that does not exist yet, and required to overwrite one that does, so
 * a second editor cannot be overwritten without noticing. */
export async function save_draft(document, expected_edit_token) {
  const payload = { document };
  if (expected_edit_token !== undefined && expected_edit_token !== null) {
    payload.expected_edit_token = expected_edit_token;
  }
  return call("saveSkeletonResource", (method) => method(payload));
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

export async function preflight(resource_id, legacy_kernel) {
  return call("preflightSkeletonResource", (method) =>
    method(resource_id, legacy_kernel === undefined ? null : legacy_kernel),
  );
}

export function edit_conflict_message(error) {
  return error && error.code === "edit_conflict"
    ? "This Agent was changed elsewhere since it was opened. Reload it before saving, or the other edit would be replaced."
    : null;
}
