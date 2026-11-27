// V4 carries tool output in an artifact envelope; legacy traces carry the
// result itself. Decode only a complete inline object for subagent display.
// Never fetch an artifact, replace a frame, or infer success from a preview.
export const subagentDisplayResult = (result) => {
  if (
    !result || typeof result !== "object" || Array.isArray(result) ||
    result.inline !== true || typeof result.preview !== "string" ||
    !Number.isSafeInteger(result.content_bytes) || result.content_bytes < 0
  ) return result;
  try {
    if (new Blob([result.preview]).size !== result.content_bytes) return result;
    const decoded = JSON.parse(result.preview);
    return decoded && typeof decoded === "object" && !Array.isArray(decoded)
      ? decoded
      : result;
  } catch {
    return result;
  }
};
