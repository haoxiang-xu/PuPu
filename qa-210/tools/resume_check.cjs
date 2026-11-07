/* QA-only: strict checks on the model request after a tool result. A run that
 * never parks must carry an assistant.tool_calls/tool pair. After an approval
 * resume the result arrives as one unchain.derived_handoff_input.v1 user
 * message, plus the tool exchange in MEMORY_V2_EVIDENCE_HISTORY. Each refusal
 * throws a ResumeCheckError with an exact code.
 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

class ResumeCheckError extends Error {
  constructor(code, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); this.code = code; }
}
const refuse = (code, detail) => { throw new ResumeCheckError(code, detail); };
const same = (left, right) => { try { assert.deepStrictEqual(left, right); return true; } catch { return false; } };
const keysAre = (value, keys) => value !== null && typeof value === 'object' && same(Object.keys(value).sort(), [...keys].sort());
const parse = (text) => { try { return JSON.parse(text); } catch { return undefined; } };

const HISTORY_MARK = '[MEMORY_V2_EVIDENCE_HISTORY]';
const INPUT_KEYS = ['consumer_attempt', 'full_output_artifact', 'handoff_envelope', 'handoff_event', 'schema', 'source_attempt'];
const ENVELOPE_KEYS = ['artifact_refs', 'byte_length', 'child_attempt', 'child_run_id', 'full_output_ref', 'schema',
  'sha256', 'source_event_range', 'status', 'summary'];
const ARTIFACT_KEYS = ['byte_length', 'media_type', 'preview', 'ref', 'schema', 'sha256'];
const COMPLETION_KEYS = ['error', 'outputs', 'schema', 'status', 'summary'];

function checkAttempt(attempt, code) {
  if (!keysAre(attempt, ['attempt_id', 'generation', 'schema']) || attempt.schema !== 'unchain.attempt_ref.v1'
    || typeof attempt.attempt_id !== 'string' || !attempt.attempt_id
    || !keysAre(attempt.generation, ['execution_id', 'generation_id', 'schema'])
    || attempt.generation.schema !== 'unchain.generation_ref.v1') refuse(code, 'attempt shape');
}

function historyOf(messages) {
  const row = messages.find(message => message.role === 'assistant' && typeof message.content === 'string'
    && message.content.includes(HISTORY_MARK));
  if (!row) refuse('history_missing');
  const start = row.content.indexOf('{');
  const history = parse(row.content.slice(start, row.content.lastIndexOf('}') + 1));
  if (!history || history.schema_version !== 'memory_v2.context.v1') refuse('history_invalid');
  return history;
}

function checkApprovalResume(body, { callId, toolName, arguments: toolArguments, sourceA, sourceB }) {
  if (JSON.stringify(body.messages).includes(sourceB)) refuse('source_b_present');
  if (body.messages.some(row => row.role === 'tool' || row.tool_calls)) refuse('unexpected_tool_pair');
  const last = body.messages[body.messages.length - 1];
  if (last?.role !== 'user') refuse('handoff_input_not_user');
  const input = parse(last.content);
  if (input === undefined) refuse('handoff_input_not_json');
  if (input?.schema !== 'unchain.derived_handoff_input.v1') refuse('handoff_schema');
  if (!keysAre(input, INPUT_KEYS)) refuse('handoff_input_keys');

  const { source_attempt: source, consumer_attempt: consumer, handoff_envelope: envelope,
    full_output_artifact: artifact, handoff_event: event } = input;
  checkAttempt(source, 'source_identity'); checkAttempt(consumer, 'consumer_identity');
  if (!source.attempt_id.startsWith('workflow-tool.')) refuse('source_identity', source.attempt_id);
  if (!consumer.attempt_id.startsWith('node-attempt.')) refuse('consumer_identity', consumer.attempt_id);
  if (source.attempt_id === consumer.attempt_id) refuse('source_consumer_same');
  if (!same(source.generation, consumer.generation)) refuse('generation_identity');

  if (!keysAre(envelope, ENVELOPE_KEYS) || envelope.schema !== 'unchain.handoff_envelope.v2') refuse('envelope_schema');
  if (envelope.status !== 'complete') refuse('envelope_status', envelope.status);
  if (!same(envelope.child_attempt, source) || envelope.child_run_id !== source.attempt_id) refuse('envelope_child_identity');
  if (!keysAre(event, ['event_id', 'schema', 'store_seq']) || event.schema !== 'unchain.event_cursor.v1'
    || !event.event_id) refuse('handoff_event');

  if (!keysAre(artifact, ARTIFACT_KEYS) || artifact.schema !== 'unchain.artifact_ref.v1'
    || artifact.media_type !== 'application/json') refuse('artifact_schema');
  if (!same(envelope.full_output_ref, artifact.ref)) refuse('artifact_ref');
  if (envelope.sha256 !== artifact.sha256) refuse('digest_mismatch', 'envelope');
  if (envelope.byte_length !== artifact.byte_length) refuse('length_mismatch', 'envelope');
  const bytes = Buffer.from(artifact.preview, 'utf8');
  if (bytes.length !== artifact.byte_length) refuse('length_mismatch', 'preview');
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) refuse('digest_mismatch', 'preview');

  const completion = parse(artifact.preview);
  if (!keysAre(completion, COMPLETION_KEYS) || completion.schema !== 'unchain.skeleton_child_completion.v1'
    || completion.status !== 'completed' || completion.error !== '') refuse('completion_invalid');
  if (!same(completion.outputs, { receipt: sourceA })) refuse('source_a_receipt');

  const history = historyOf(body.messages);
  const exchanges = (history.tool_exchanges || []).filter(row => row.call_id === callId);
  if (exchanges.length !== 1) refuse('exchange_call_id');
  const [exchange] = exchanges;
  if (exchange.tool_name !== toolName) refuse('exchange_tool_name', exchange.tool_name);
  if (!same(exchange.arguments, toolArguments)) refuse('exchange_arguments');
  const { id, kind, revision } = artifact.ref;
  if (!same(exchange.full_output_ref, { id, kind, revision })) refuse('exchange_ref');
  if (!same(exchange.result, completion)) refuse('exchange_result');
  const handoffs = (history.handoffs || []).filter(row => row.event_id === event.event_id);
  if (handoffs.length !== 1) refuse('history_handoff');
  const [handoff] = handoffs;
  if (handoff.child_run_id !== source.attempt_id || handoff.content_sha256 !== artifact.sha256
    || handoff.content_bytes !== artifact.byte_length || handoff.status !== 'complete'
    || !same(handoff.full_output_ref, { id, kind, revision })) refuse('history_handoff');
  return { schema: input.schema, source_attempt: source.attempt_id, consumer_attempt: consumer.attempt_id,
    generation_id: source.generation.generation_id, artifact_id: id, sha256: artifact.sha256, byte_length: artifact.byte_length,
    handoff_event: event.event_id, call_id: exchange.call_id, tool_name: exchange.tool_name, receipt: completion.outputs.receipt };
}

function checkToolPair(body, { callId, toolName, sentinel }) {
  const calls = body.messages.filter(row => row.role === 'assistant' && row.tool_calls);
  if (calls.length !== 1 || calls[0].tool_calls.length !== 1) refuse('tool_call_missing');
  const [call] = calls[0].tool_calls;
  if (call.id !== callId || call.function.name !== toolName) refuse('tool_call_identity');
  const tools = body.messages.filter(row => row.role === 'tool');
  if (tools.length !== 1 || tools[0].tool_call_id !== callId) refuse('tool_message_pair');
  if (!JSON.stringify(tools[0].content).includes(sentinel)) refuse('tool_message_content');
  return { call_id: callId, tool_name: toolName };
}

module.exports = { ResumeCheckError, checkApprovalResume, checkToolPair };
