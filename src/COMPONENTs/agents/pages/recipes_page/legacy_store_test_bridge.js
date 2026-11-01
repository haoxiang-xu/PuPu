/* TEST-ONLY. Lets a page or hook test written against the graph-only store
 * mocks (`getSkeletonResource`, `saveSkeletonResource`,
 * `preflightSkeletonResource`) drive the editor, which since #357 G1 reads
 * and writes only through the v2 managed-Code aggregate.
 *
 * It is a translation of the mocks, not a second store, and it is strict in
 * the one direction that matters: a legacy mock knows nothing of Code text,
 * so an edit carrying any `managed_sources` row throws here instead of being
 * forwarded without it. Every v2 method exists only while the legacy mock it
 * stands for does, so "no store in this build" still reads as unavailable.
 *
 * What it does NOT prove is the v2 wire: that is proved against the real
 * producer's captures (managed_code_capture.json) by the tests that use
 * those, with no bridge in between. */

const RESOURCE_SCHEMA = "pupu.skeleton-resource.v2";
const PREFLIGHT_SCHEMA = "pupu.skeleton-preflight.v2";
const MANIFEST_SCHEMA = "pupu.skeleton-code-sources.v1";
const OPAQUE_DIGEST = "0".repeat(64);

const is_refusal = (answer) => Boolean(answer) && typeof answer === "object" && Boolean(answer.error);

function aggregate(answer) {
  if (is_refusal(answer)) return answer;
  return {
    schema: RESOURCE_SCHEMA,
    resource: answer,
    sources_manifest: { schema: MANIFEST_SCHEMA, entries: [] },
    contents: [],
    content_digest: OPAQUE_DIGEST,
  };
}

export function install_legacy_store_bridge(unchain) {
  const define = (name, legacy, wrap) =>
    Object.defineProperty(unchain, name, {
      configurable: true,
      enumerable: false,
      get() {
        const method = unchain[legacy];
        return typeof method === "function" ? wrap(method) : undefined;
      },
    });
  define("getManagedSkeletonResource", "getSkeletonResource", (method) => async (resource_id) =>
    aggregate(await method(resource_id)));
  define("saveManagedSkeletonResource", "saveSkeletonResource", (method) => async (edit) => {
    const keys = Object.keys(edit || {}).sort().join(",");
    if (keys !== "document,expected_edit_token,managed_sources,schema" || edit.schema !== "pupu.skeleton-edit.v2") {
      throw new Error(`legacy store bridge: not a v2 edit (${keys})`);
    }
    if (!Array.isArray(edit.managed_sources) || edit.managed_sources.length !== 0) {
      throw new Error("legacy store bridge: a graph-only mock cannot take Code text");
    }
    const payload = { document: edit.document };
    if (edit.expected_edit_token !== null) payload.expected_edit_token = edit.expected_edit_token;
    return aggregate(await method(payload));
  });
  define("preflightManagedSkeletonResource", "preflightSkeletonResource", (method) => async (resource_id) => {
    const answer = await method(resource_id, null);
    return is_refusal(answer) ? answer : { schema: PREFLIGHT_SCHEMA, preflight: answer };
  });
}
