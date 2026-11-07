import { FrontendApiError } from "./api.shared";
import { invokeSkeletonBridge } from "./skeleton_resource_errors";

const closed = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const sameNames = (value, expected) => Array.isArray(value) && value.length === expected.length &&
  value.every((name, i) => name === expected[i]);

/* No source-path/version inference or old-host fallback: the host checked the
 * imported producer's digest-bound manifest and its actual closed field list.
 * This digest is provenance for that answer, not a renderer authorization. */
export const checkSkeletonHookCapabilities = value => {
  const hook = value?.hook_entry;
  if (!closed(value, ["schema", "runtime_manifest_digest", "hook_entry"]) ||
      value.schema !== "pupu.skeleton_hooks_capabilities.v1" ||
      typeof value.runtime_manifest_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest) ||
      !closed(hook, ["schema", "required_fields", "optional_fields", "omitted_enabled"]) ||
      hook.schema !== "unchain.skeleton_hook_entry.v1" || hook.omitted_enabled !== true ||
      !sameNames(hook.required_fields, ["event", "force_approval", "id", "order", "tool_name", "workflow"]) ||
      !sameNames(hook.optional_fields, ["enabled"])) {
    throw new FrontendApiError("skeleton_hook_capabilities_malformed", "Invalid Hook capabilities response");
  }
  return value;
};

export const createSkeletonHookApi = (assertBridgeMethod, withTimeout) => ({
  getSkeletonHookCapabilities: async () => {
    const method = assertBridgeMethod("unchainAPI", "getSkeletonHookCapabilities");
    const reply = await withTimeout(() => invokeSkeletonBridge(() => method()), 20000,
      "skeleton_hook_capabilities_timeout", "Hook capabilities read timed out");
    return checkSkeletonHookCapabilities(reply);
  },
});
