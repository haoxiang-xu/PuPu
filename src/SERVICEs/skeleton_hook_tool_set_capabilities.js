import { FrontendApiError } from "./api.shared";
import { invokeSkeletonBridge } from "./skeleton_resource_errors";

const closed = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));

/* Separate from the enable contract: old hosts never manufacture set support.
 * The host independently checked the actual runtime feature and getter; the
 * digest here records that answer's provenance, not a source/version allowlist.
 */
export const checkSkeletonHookToolSetCapabilities = value => {
  const matcher = value?.tool_matcher;
  if (!closed(value, ["schema", "runtime_manifest_digest", "tool_matcher"]) ||
      value.schema !== "pupu.skeleton_hook_tool_set_capabilities.v1" ||
      typeof value.runtime_manifest_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest) ||
      !closed(matcher, ["schema", "field", "legacy_types", "set_type", "minimum_size", "duplicates", "names", "normalization"]) ||
      matcher.schema !== "unchain.skeleton_hook_tool_set.v1" || matcher.field !== "tool_name" ||
      !Array.isArray(matcher.legacy_types) || matcher.legacy_types.length !== 2 ||
      matcher.legacy_types[0] !== "null" || matcher.legacy_types[1] !== "string" ||
      matcher.set_type !== "array" || matcher.minimum_size !== 1 || matcher.duplicates !== "reject" ||
      matcher.names !== "nonblank_exact" || matcher.normalization !== "none") {
    throw new FrontendApiError("skeleton_hook_tool_set_capabilities_malformed", "Invalid Hook tool-set capabilities response");
  }
  return value;
};

export const createSkeletonHookToolSetApi = (assertBridgeMethod, withTimeout) => ({
  getSkeletonHookToolSetCapabilities: async () => {
    const method = assertBridgeMethod("unchainAPI", "getSkeletonHookToolSetCapabilities");
    const reply = await withTimeout(() => invokeSkeletonBridge(() => method()), 20000,
      "skeleton_hook_tool_set_capabilities_timeout", "Hook tool-set capabilities read timed out");
    return checkSkeletonHookToolSetCapabilities(reply);
  },
});
