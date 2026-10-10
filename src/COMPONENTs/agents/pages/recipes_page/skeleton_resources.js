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
