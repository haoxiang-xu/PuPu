import { FrontendApiError } from "./api.shared";
import { invokeSkeletonBridge } from "./skeleton_resource_errors";

const closed = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const expected = {
  schema: "pupu.skeleton_workflow_tool.v1", field: "workflow_tools",
  entry_fields: ["id", "workflow"], workflow_fields: ["revision_id", "workflow_id"],
  id_pattern: "[A-Za-z0-9_-]{1,48}", function_prefix: "workflow_",
  arguments_field: "inputs", returns: "end_exports", scope: "attached_kernel",
  document_kind: "workflow", version_policy: "published_exact", minimum_runtime_minor: 4,
};

export const checkSkeletonWorkflowToolCapabilities = value => {
  const contract = value?.workflow_tool;
  if (!closed(value, ["schema", "runtime_manifest_digest", "workflow_tool"]) ||
      value.schema !== "pupu.skeleton_workflow_tools_capabilities.v1" ||
      typeof value.runtime_manifest_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest) ||
      !closed(contract, Object.keys(expected)) ||
      !Object.entries(expected).every(([key, target]) => Array.isArray(target)
        ? Array.isArray(contract[key]) && contract[key].length === target.length && target.every((part, index) => contract[key][index] === part)
        : contract[key] === target)) {
    throw new FrontendApiError("skeleton_workflow_tool_capabilities_malformed", "Invalid Workflow Tool capabilities response");
  }
  return value;
};

export const createSkeletonWorkflowToolApi = (assertBridgeMethod, withTimeout) => ({
  getSkeletonWorkflowToolCapabilities: async () => {
    const method = assertBridgeMethod("unchainAPI", "getSkeletonWorkflowToolCapabilities");
    const reply = await withTimeout(() => invokeSkeletonBridge(() => method()), 20000,
      "skeleton_workflow_tool_capabilities_timeout", "Workflow Tool capabilities read timed out");
    return checkSkeletonWorkflowToolCapabilities(reply);
  },
});
