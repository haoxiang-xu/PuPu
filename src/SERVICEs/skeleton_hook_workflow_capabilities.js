import { FrontendApiError } from "./api.shared";
import { invokeSkeletonBridge } from "./skeleton_resource_errors";

const closed = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const pair = (value, first, second) => Array.isArray(value) && value.length === 2 && value[0] === first && value[1] === second;

export const checkSkeletonHookWorkflowCapabilities = value => {
  const source = value?.workflow_source;
  if (!closed(value, ["schema", "runtime_manifest_digest", "workflow_source"]) ||
      value.schema !== "pupu.skeleton_hook_workflow_capabilities.v1" ||
      typeof value.runtime_manifest_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest) ||
      !closed(source, ["schema", "field", "reference_fields", "embedded_fields", "embedded_kind", "document_kind", "identity"]) ||
      source.schema !== "unchain.skeleton_hook_workflow.v1" || source.field !== "workflow" ||
      !pair(source.reference_fields, "revision_id", "workflow_id") || !pair(source.embedded_fields, "document", "kind") ||
      source.embedded_kind !== "embedded" || source.document_kind !== "workflow" || source.identity !== "embedded-sha256") {
    throw new FrontendApiError("skeleton_hook_workflow_capabilities_malformed", "Invalid Hook Workflow capabilities response");
  }
  return value;
};

export const createSkeletonHookWorkflowApi = (assertBridgeMethod, withTimeout) => ({
  getSkeletonHookWorkflowCapabilities: async () => {
    const method = assertBridgeMethod("unchainAPI", "getSkeletonHookWorkflowCapabilities");
    const reply = await withTimeout(() => invokeSkeletonBridge(() => method()), 20000,
      "skeleton_hook_workflow_capabilities_timeout", "Hook Workflow capabilities read timed out");
    return checkSkeletonHookWorkflowCapabilities(reply);
  },
});
