/* QA-only: prove resume_check.cjs against a real captured request, before it is
 * used on a run. Usage: node qualify_resume_check.cjs <provider-wires.json> <out.json>
 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { checkApprovalResume, checkToolPair } = require('./resume_check.cjs');

const [source, target] = process.argv.slice(2);
const raw = fs.readFileSync(source);
const wires = JSON.parse(raw);
const copy = value => JSON.parse(JSON.stringify(value));
const body = wires[5].body, normal = wires[1].body;
const options = { callId: 'approve-workflow-call', toolName: 'workflow_mutate', sourceA: 'lifecycle-source-A', sourceB: 'lifecycle-source-B',
  arguments: historyArguments(body) };
function historyArguments(request) {
  const content = request.messages.find(row => String(row.content).includes('[MEMORY_V2_EVIDENCE_HISTORY]')).content;
  return JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)).tool_exchanges[0].arguments;
}
const pair = { callId: 'workflow-call-1', toolName: 'workflow_echo_run', sentinel: 'committed-workflow-End-only' };

const refusedBy = (fn) => { try { fn(); return null; } catch (error) { return error.code || String(error.message); } };
const oldAssertion = refusedBy(() => assert.ok(JSON.stringify(body.messages.filter(row => row.role === 'tool')).includes('lifecycle-source-A')));

// Edit the last (handoff) message; `seal` recomputes the digest so a later check is reached.
const edited = (edit, { seal = false } = {}) => {
  const next = copy(body), last = next.messages[next.messages.length - 1];
  const input = JSON.parse(last.content);
  edit(input, next);
  if (seal) {
    const bytes = Buffer.from(input.full_output_artifact.preview);
    const digest = createHash('sha256').update(bytes).digest('hex');
    input.full_output_artifact.sha256 = digest; input.handoff_envelope.sha256 = digest;
    input.full_output_artifact.byte_length = bytes.length; input.handoff_envelope.byte_length = bytes.length;
  }
  last.content = JSON.stringify(input);
  return next;
};
const history = (next, edit) => {
  const row = next.messages.find(message => String(message.content).includes('[MEMORY_V2_EVIDENCE_HISTORY]'));
  const start = row.content.indexOf('{'), end = row.content.lastIndexOf('}') + 1;
  const data = JSON.parse(row.content.slice(start, end)); edit(data);
  row.content = row.content.slice(0, start) + JSON.stringify(data) + row.content.slice(end);
};
const plain = () => { const next = copy(body); next.messages[next.messages.length - 1].content = 'please record lifecycle-source-A as the receipt'; return next; };
const receipt = (value) => (input) => {
  const data = JSON.parse(input.full_output_artifact.preview); data.outputs.receipt = value;
  input.full_output_artifact.preview = JSON.stringify(data);
};
const cases = [
  ['wrong schema', edited(i => { i.schema = 'unchain.derived_handoff_input.v2'; }), 'handoff_schema'],
  ['extra key', edited(i => { i.extra = 1; }), 'handoff_input_keys'],
  ['source identity', edited(i => { i.source_attempt.attempt_id = 'node-attempt.other'; }), 'source_identity'],
  ['consumer identity', edited(i => { i.consumer_attempt.attempt_id = 'workflow-tool.other'; }), 'consumer_identity'],
  ['generation', edited(i => { i.consumer_attempt.generation.generation_id = 'other'; }), 'generation_identity'],
  ['envelope child', edited(i => { i.handoff_envelope.child_run_id = 'workflow-tool.other'; }), 'envelope_child_identity'],
  ['artifact ref', edited(i => { i.handoff_envelope.full_output_ref.id = 'artifact-other'; }), 'artifact_ref'],
  ['digest', edited(i => { i.full_output_artifact.sha256 = '0'.repeat(64); i.handoff_envelope.sha256 = '0'.repeat(64); }), 'digest_mismatch'],
  ['envelope digest', edited(i => { i.handoff_envelope.sha256 = '0'.repeat(64); }), 'digest_mismatch'],
  ['length', edited(i => { i.full_output_artifact.byte_length += 1; i.handoff_envelope.byte_length += 1; }), 'length_mismatch'],
  ['plain user text naming the receipt', plain(), 'handoff_input_not_json'],
  ['A replaced by B, digest recomputed', edited(receipt('lifecycle-source-B'), { seal: true }), 'source_b_present'],
  ['other receipt, digest recomputed', edited(receipt('lifecycle-source-C'), { seal: true }), 'source_a_receipt'],
  ['tool pair present', (() => { const n = copy(body); n.messages.push({ role: 'tool', content: 'x' }); return n; })(), 'unexpected_tool_pair'],
  ['exchange call id', (() => { const n = copy(body); history(n, d => { d.tool_exchanges[0].call_id = 'other'; }); return n; })(), 'exchange_call_id'],
  ['exchange tool name', (() => { const n = copy(body); history(n, d => { d.tool_exchanges[0].tool_name = 'other'; }); return n; })(), 'exchange_tool_name'],
  ['exchange result', (() => { const n = copy(body); history(n, d => { d.tool_exchanges[0].result.status = 'failed'; }); return n; })(), 'exchange_result'],
  ['history handoff digest', (() => { const n = copy(body); history(n, d => { d.handoffs[0].content_sha256 = '0'.repeat(64); }); return n; })(), 'history_handoff'],
  ['history removed', (() => { const n = copy(body); n.messages = n.messages.filter(row => !String(row.content).includes('[MEMORY_V2_EVIDENCE_HISTORY]')); return n; })(), 'history_missing'],
  ['normal request given to the resume check', copy(normal), 'unexpected_tool_pair'],
];
const results = cases.map(([name, request, expected]) => {
  const actual = refusedBy(() => checkApprovalResume(request, options));
  return { name, expected, actual, ok: actual === expected };
});
const pairCases = [
  ['normal path, pair removed', (() => { const n = copy(normal); n.messages = n.messages.filter(row => row.role !== 'tool'); return n; })(), 'tool_message_pair'],
  ['normal path, tool_calls removed', (() => { const n = copy(normal); n.messages.forEach(row => { delete row.tool_calls; }); return n; })(), 'tool_call_missing'],
  ['normal path, wrong tool_call_id', (() => { const n = copy(normal); n.messages.find(row => row.role === 'tool').tool_call_id = 'other'; return n; })(), 'tool_message_pair'],
  ['resume request given to the pair check', copy(body), 'tool_call_missing'],
].map(([name, request, expected]) => {
  const actual = refusedBy(() => checkToolPair(request, pair));
  return { name, expected, actual, ok: actual === expected };
});
const accepted = checkApprovalResume(body, options);
const normalAccepted = checkToolPair(normal, pair);
const report = { source_file: source, source_sha256: createHash('sha256').update(raw).digest('hex'),
  resume_request_sha256: createHash('sha256').update(wires[5].request_text).digest('hex'), old_assertion_failed: oldAssertion !== null, old_assertion: oldAssertion,
  new_check_accepted: accepted, normal_pair_accepted: normalAccepted, refusals: results, pair_refusals: pairCases,
  all_ok: oldAssertion !== null && [...results, ...pairCases].every(row => row.ok) };
fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
for (const row of [...results, ...pairCases]) console.log(row.ok ? 'ok ' : 'BAD', row.name, row.expected, row.actual);
console.log('old assertion failed:', report.old_assertion_failed, 'all_ok:', report.all_ok);
process.exitCode = report.all_ok ? 0 : 1;
