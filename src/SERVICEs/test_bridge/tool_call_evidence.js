const asObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;

const nonemptyString = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const resultStatus = (payload) => {
  const status = nonemptyString(payload.status)?.toLowerCase();
  const result = asObject(payload.result);
  if (status === "denied" || payload.denied === true || result?.denied === true) {
    return "denied";
  }
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "failed" || status === "error" || status === "failure") {
    return "failed";
  }
  if (
    payload.success === false || payload.ok === false || payload.is_error === true ||
    payload.error != null || result?.ok === false || result?.error != null
  ) return "failed";
  if (status && !["complete", "completed", "success", "succeeded"].includes(status)) {
    return "running";
  }
  return "completed";
};

// Test API projection only. Storage and runtime traces retain their original shape.
export const projectTestApiToolCalls = (message) => {
  if (!message || message.role !== "assistant") return null;
  const groups = [
    { frames: message.traceFrames, runId: null },
    ...Object.entries(asObject(message.subagentFrames) || {}).map(
      ([runId, frames]) => ({ frames, runId }),
    ),
  ];
  const calls = new Map();
  let sawToolFrame = false;
  for (const group of groups) {
    if (!Array.isArray(group.frames)) continue;
    for (const frame of group.frames) {
      if (!["tool_call", "tool_confirmed", "tool_denied", "tool_result"].includes(frame?.type)) {
        continue;
      }
      sawToolFrame = true;
      const payload = asObject(frame.payload);
      const id = nonemptyString(payload?.call_id);
      if (!id) continue;
      const runId = nonemptyString(frame.run_id) || nonemptyString(group.runId);
      const key = JSON.stringify([runId, id]);
      let entry = calls.get(key);
      if (!entry) {
        entry = {
          record: { id, run_id: runId, name: null, arguments: null, status: "running", result: null },
          rank: 0,
        };
        calls.set(key, entry);
      }
      const record = entry.record;
      const name = nonemptyString(payload.tool_name);
      if (name && record.name === null) record.name = name;
      if (Object.prototype.hasOwnProperty.call(payload, "arguments") && record.arguments === null) {
        record.arguments = payload.arguments ?? null;
      }
      if (frame.type === "tool_call") {
        if (entry.rank < 1) {
          record.status = payload.requires_confirmation === true ? "pending" : "running";
          entry.rank = 1;
        }
      } else if (frame.type === "tool_confirmed") {
        if (entry.rank < 2) {
          record.status = "running";
          entry.rank = 2;
        }
      } else if (frame.type === "tool_denied") {
        record.status = "denied";
        entry.rank = 5;
      } else {
        if (Object.prototype.hasOwnProperty.call(payload, "result")) {
          record.result = payload.result ?? null;
        }
        const status = resultStatus(payload);
        const rank = status === "completed" ? 3 : status === "running" ? 2 : 4;
        if (rank >= entry.rank) {
          record.status = status;
          entry.rank = rank;
        }
      }
    }
  }
  if (calls.size) return [...calls.values()].map(({ record }) => record);
  if (!sawToolFrame && Array.isArray(message.tool_calls) && message.tool_calls.length) {
    return message.tool_calls;
  }
  return null;
};

export const projectTestApiMessage = (message) =>
  message?.role === "assistant"
    ? { ...message, tool_calls: projectTestApiToolCalls(message) }
    : message;
