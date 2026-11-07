import {
  sha256_bytes,
  utf8_bytes,
} from "../../COMPONENTs/agents/pages/recipes_page/managed_code_sources";

/* Cold-resumed subagent settlement (#357). A child run.completed / run.failed
   may carry payload.settlement, the display projection of the call-bound
   Journal receipt (unchain events/subagent_settlement.py). It is the only
   evidence that settles a delegate card the original stream left waiting; a
   root completion or the model's text never does. Every check below mirrors
   the producer's validator, plus the event links that bind it. */

export const SETTLEMENT_SCHEMA = "unchain.skeleton_subagent_settlement_projection.v1";
export const CHILD_COMPLETION_SCHEMA = "unchain.skeleton_child_completion.v1";
export const AMBIGUOUS_SETTLEMENT = Object.freeze({ ambiguous: true });

const MAX_PREVIEW_BYTES = 8192;
const MAX_RESULT_BYTES = 32 * 1024 * 1024;
const TERMINAL = new Set(["completed", "failed", "cancelled", "outcome_unknown"]);
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// Python str.isspace(), which the producer's strip() uses (not JS trim()).
const PY_SPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0,
  0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const hasExactKeys = (value, keys) =>
  isRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
const isIdentifier = (value) => typeof value === "string" && IDENTIFIER.test(value);
const isCount = (value, minimum) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

const generationOf = (value) =>
  hasExactKeys(value, ["schema", "execution_id", "generation_id"]) &&
  value.schema === "unchain.generation_ref.v1" &&
  isIdentifier(value.execution_id) &&
  isIdentifier(value.generation_id)
    ? value
    : null;

const attemptOf = (value) =>
  hasExactKeys(value, ["schema", "generation", "attempt_id"]) &&
  value.schema === "unchain.attempt_ref.v1" &&
  isIdentifier(value.attempt_id) &&
  generationOf(value.generation)
    ? value
    : null;

const cursorOf = (value) =>
  hasExactKeys(value, ["schema", "store_seq", "event_id"]) &&
  value.schema === "unchain.event_cursor.v1" &&
  isCount(value.store_seq, 1) &&
  isIdentifier(value.event_id)
    ? value
    : null;

const artifactRefOf = (value) =>
  hasExactKeys(value, ["schema", "kind", "id", "revision", "fragment"]) &&
  value.schema === "unchain.resource_ref.v1" &&
  value.kind === "artifact" &&
  isIdentifier(value.id) &&
  isCount(value.revision, 1) &&
  value.fragment === ""
    ? value
    : null;

/* Identity is the typed fields, never the order keys arrived in. */
const sameGeneration = (left, right) =>
  left.execution_id === right.execution_id &&
  left.generation_id === right.generation_id;
const attemptTuple = (attempt) => [
  attempt.generation.execution_id,
  attempt.generation.generation_id,
  attempt.attempt_id,
];
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const isCallText = (value) => {
  if (typeof value !== "string" || !value) return false;
  const chars = Array.from(value);
  return (
    !PY_SPACE.has(chars[0].codePointAt(0)) &&
    !PY_SPACE.has(chars[chars.length - 1].codePointAt(0))
  );
};

/* The inline preview is the child completion body. Its bytes are bound to the
   receipt by length and SHA-256; the producer's canonical re-serialisation is
   not repeated here because JavaScript cannot reproduce Python's number text
   (1.0 vs 1), so a byte-exact digest is the binding instead. */
const bodyOf = (preview, status) => {
  let body;
  try {
    body = JSON.parse(preview);
  } catch (_error) {
    return null;
  }
  if (
    !hasExactKeys(body, ["schema", "status", "outputs", "error", "summary"]) ||
    body.schema !== CHILD_COMPLETION_SCHEMA ||
    body.status !== status ||
    typeof body.error !== "string" ||
    typeof body.summary !== "string" ||
    (status === "completed" ? !isRecord(body.outputs) : body.outputs !== null)
  ) {
    return null;
  }
  return body;
};

const resultOf = (value, status) => {
  if (!hasExactKeys(value, ["full_output_ref", "content_bytes", "content_sha256", "preview", "inline"])) {
    return null;
  }
  const { content_bytes: size, content_sha256: digest, preview, inline } = value;
  if (
    !artifactRefOf(value.full_output_ref) ||
    !isCount(size, 1) ||
    size > MAX_RESULT_BYTES ||
    typeof digest !== "string" ||
    !SHA256.test(digest) ||
    typeof preview !== "string" ||
    typeof inline !== "boolean" ||
    inline !== (size <= MAX_PREVIEW_BYTES)
  ) {
    return null;
  }
  const bytes = utf8_bytes(preview);
  if (!bytes || bytes.length > MAX_PREVIEW_BYTES) return null;
  if (!inline) return { body: null };
  if (bytes.length !== size || sha256_bytes(bytes) !== digest) return null;
  const body = bodyOf(preview, status);
  return body ? { body } : null;
};

/* The projection alone (the producer's validator), or null. Normalized
   identities plus the result body; no event or transport binding yet. */
export const admitSettlementProjection = (settlement) => {
  if (
    !hasExactKeys(settlement, [
      "schema", "cursor", "consumer_attempt", "source_attempt",
      "call_id", "tool_name", "status", "result",
    ]) ||
    settlement.schema !== SETTLEMENT_SCHEMA
  ) {
    return null;
  }
  const consumer = attemptOf(settlement.consumer_attempt);
  const source = attemptOf(settlement.source_attempt);
  const cursor = cursorOf(settlement.cursor);
  const status = settlement.status;
  if (
    !consumer ||
    !source ||
    !cursor ||
    consumer.attempt_id === source.attempt_id ||
    !sameGeneration(consumer.generation, source.generation) ||
    !isCallText(settlement.call_id) ||
    !isCallText(settlement.tool_name) ||
    typeof status !== "string" ||
    !TERMINAL.has(status)
  ) {
    return null;
  }
  const result = resultOf(settlement.result, status);
  if (!result) return null;
  return {
    identity: JSON.stringify([
      cursor.store_seq,
      cursor.event_id,
      attemptTuple(consumer),
      attemptTuple(source),
      settlement.call_id,
      settlement.tool_name,
    ]),
    fingerprint: canonicalJson(settlement),
    callId: settlement.call_id,
    toolName: settlement.tool_name,
    consumerAttemptId: consumer.attempt_id,
    sourceAttemptId: source.attempt_id,
    executionId: consumer.generation.execution_id,
    status,
    inline: settlement.result.inline,
    contentBytes: settlement.result.content_bytes,
    body: result.body,
  };
};

/* A settlement the renderer recorded from an admitted Stop reply (the reply
   carries no event links, so the record restates the projection's own
   identities). */
export const SETTLEMENT_RECORD_FRAME_TYPE = "subagent_settlement";
export const SETTLEMENT_RECORD_ORIGIN = "execution_cancel_response";

/* One renderer frame -> admitted settlement or null: a child's own terminal
   event (subagent_completed / subagent_failed, as the activity reducer
   projects run.completed / run.failed) or a recorded Stop-reply settlement. */
export const admitSubagentSettlementFrame = (frame) => {
  const admitted = admitSettlementProjection(frame?.payload?.settlement);
  if (!admitted) return null;
  const links = isRecord(frame.links) ? frame.links : {};
  const recorded = frame.type === SETTLEMENT_RECORD_FRAME_TYPE;
  if (
    (recorded
      ? frame.payload.origin !== SETTLEMENT_RECORD_ORIGIN
      : frame.type !== (admitted.status === "completed" ? "subagent_completed" : "subagent_failed")) ||
    frame.run_id !== admitted.sourceAttemptId ||
    links.parent_run_id !== admitted.consumerAttemptId ||
    links.tool_call_id !== admitted.callId ||
    frame.session_id !== admitted.executionId ||
    frame.payload.status !== admitted.status
  ) {
    return null;
  }
  return admitted;
};

export const bindingKey = (consumerAttemptId, callId, toolName) =>
  JSON.stringify([consumerAttemptId, callId, toolName]);

/* Admitted settlements by the call they settle. Repeated identical receipts
   (same cursor, attempts, call and bytes) collapse; any second, different
   settlement for the same call makes that call ambiguous. */
export const collectSubagentSettlements = (frameGroups) => {
  const byCall = new Map();
  (Array.isArray(frameGroups) ? frameGroups : []).forEach((frames) => {
    (Array.isArray(frames) ? frames : []).forEach((frame) => {
      if (
        frame?.type !== "subagent_completed" &&
        frame?.type !== "subagent_failed" &&
        frame?.type !== SETTLEMENT_RECORD_FRAME_TYPE
      ) return;
      if (!isRecord(frame.payload) || !Object.prototype.hasOwnProperty.call(frame.payload, "settlement")) return;
      const admitted = admitSubagentSettlementFrame(frame);
      if (!admitted) return;
      const key = bindingKey(admitted.consumerAttemptId, admitted.callId, admitted.toolName);
      const previous = byCall.get(key);
      if (!previous) {
        byCall.set(key, admitted);
      } else if (
        previous === AMBIGUOUS_SETTLEMENT ||
        previous.identity !== admitted.identity ||
        previous.fingerprint !== admitted.fingerprint
      ) {
        byCall.set(key, AMBIGUOUS_SETTLEMENT);
      }
    });
  });
  return byCall;
};

/* The settlement for one delegate tool_call frame, or null. The call must be
   the only frame with its call id, tool and consumer attempt, and belong to
   the settlement's execution. */
export const settlementForToolCall = (settlements, callFrame, frames) => {
  const callId = callFrame?.payload?.call_id;
  const toolName = callFrame?.payload?.tool_name;
  const runId = callFrame?.run_id;
  if (typeof callId !== "string" || typeof toolName !== "string" || typeof runId !== "string") {
    return null;
  }
  const entry = settlements?.get?.(bindingKey(runId, callId, toolName));
  if (!entry || entry === AMBIGUOUS_SETTLEMENT) return null;
  if (callFrame.session_id !== undefined && callFrame.session_id !== entry.executionId) {
    return null;
  }
  const owners = (Array.isArray(frames) ? frames : []).filter(
    (frame) =>
      frame?.type === "tool_call" &&
      frame.run_id === runId &&
      frame.payload?.call_id === callId &&
      frame.payload?.tool_name === toolName,
  );
  return owners.length === 1 ? entry : null;
};
