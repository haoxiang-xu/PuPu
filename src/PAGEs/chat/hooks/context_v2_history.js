/**
 * context_v2_history — Memory V2 P0 renderer-side lazy-bootstrap history
 * (PURE helper).
 *
 * When the enable_memory_v2 feature flag is ON, the chat hook attaches a
 * `context_v2_history` array to the top level of the outgoing stream payload
 * (next to `memory_v2_requested: true`). The sidecar uses it ONLY to lazily
 * bootstrap its Context V2 journal for a chat it has never seen — it is NOT
 * model input. The legacy `history` field keeps its exact existing logic so
 * the bytes the model sees are unchanged in shadow mode.
 *
 * Shape contract (consumed by unchain_runtime memory_v2_store
 * .bootstrap_history, which accepts arbitrary user/assistant message
 * mappings):
 *  - only `user` / `assistant` messages, in original order — this mirrors
 *    the legacy `history` semantics: the in-flight user message travels in
 *    the payload's `message` field and is deliberately NOT duplicated here;
 *  - the in-flight assistant placeholder (status === "streaming") is
 *    excluded;
 *  - renderer-only presentation state (traceFrames, subagentFrames, meta,
 *    interjections, composer, ids, timestamps) is NOT copied — no hidden
 *    trace and no token-delta residue can leak through;
 *  - user attachments are preserved as their stored metadata array.
 */

const isPlainObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

export const buildContextV2History = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter(
      (message) =>
        isPlainObject(message) &&
        (message.role === "user" || message.role === "assistant") &&
        message.status !== "streaming",
    )
    .map((message) => {
      const entry = {
        role: message.role,
        content: typeof message.content === "string" ? message.content : "",
      };
      if (
        Array.isArray(message.attachments) &&
        message.attachments.length > 0
      ) {
        entry.attachments = message.attachments.map((attachment) =>
          isPlainObject(attachment) ? { ...attachment } : attachment,
        );
      }
      return entry;
    })
    .filter(
      (entry) =>
        entry.content.trim().length > 0 ||
        (Array.isArray(entry.attachments) && entry.attachments.length > 0),
    );

export default buildContextV2History;
