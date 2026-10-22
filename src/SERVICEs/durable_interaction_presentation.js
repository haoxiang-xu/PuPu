import {
  validateToolCallRef,
  validateToolCallRefMetadata,
} from "./runtime_events/tool_call_projection";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const POLICIES = new Set(["never", "no_feedback", "approved", "always"]);

// Both durable consumers accept the same closed provenance extension. Keep
// original argument text intact; parsing here only checks its JSON shape.
export const validateDurablePresentationMetadata = (
  presentation,
  { kind, sessionId, sourceRunId, equalJson },
) => {
  const tool = presentation?.tool_call;
  const trace = presentation?.trace_frame;
  if (!isObject(tool) || !isObject(trace)) return null;
  const toolKeys = [];
  const traceKeys = [];
  const hasRef = hasOwn(tool, "call_ref");
  const hasMetadata = hasOwn(tool, "call_ref_metadata");
  const hasPolicy = hasOwn(tool, "timeline_merge_policy");
  const hasIteration = hasOwn(trace, "iteration");
  if (kind === "max_budget" && (hasRef || hasMetadata || hasPolicy || hasIteration)) {
    return null;
  }
  if (hasPolicy) {
    if (!POLICIES.has(tool.timeline_merge_policy)) return null;
    toolKeys.push("timeline_merge_policy");
  }
  let originalArgumentsDeclared = false;
  if (hasRef || hasMetadata) {
    if (!hasRef || !hasMetadata) return null;
    const ref = validateToolCallRef(tool.call_ref);
    if (!ref.valid ||
        ref.value.execution_id !== sessionId ||
        ref.value.original_attempt_id !== sourceRunId ||
        ref.value.call_id !== tool.call_id ||
        ref.value.tool_name !== tool.tool_name ||
        (hasOwn(ref.value, "toolkit_id") && ref.value.toolkit_id !== tool.toolkit_id)) {
      return null;
    }
    const metadata = validateToolCallRefMetadata(tool.call_ref_metadata, ref.value);
    if (!metadata.valid ||
        metadata.value.timeline_merge_policy_declared !== hasPolicy ||
        (hasPolicy && metadata.value.timeline_merge_policy !== tool.timeline_merge_policy)) {
      return null;
    }
    originalArgumentsDeclared = metadata.value.original_arguments_declared;
    if (originalArgumentsDeclared && !equalJson(metadata.value.original_arguments, tool.arguments)) {
      return null;
    }
    if (hasOwn(ref.value, "iteration") !== hasIteration ||
        (hasIteration && trace.iteration !== ref.value.iteration)) {
      return null;
    }
    toolKeys.push("call_ref", "call_ref_metadata");
  } else if (hasIteration) {
    return null;
  }
  if (hasIteration) traceKeys.push("iteration");
  if (!isObject(tool.arguments)) {
    if (!originalArgumentsDeclared || typeof tool.arguments !== "string") return null;
    try {
      if (!isObject(JSON.parse(tool.arguments))) return null;
    } catch (_error) {
      return null;
    }
  }
  return { toolKeys, traceKeys };
};
