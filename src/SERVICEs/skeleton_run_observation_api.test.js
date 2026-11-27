import { checkSkeletonRunObservation, checkSkeletonRunObservationRequest, createSkeletonRunObservationApi } from './skeleton_run_observation_api';
import { createUnchainApi } from './api.unchain';
const manifest = require('./__fixtures__/ticket210-observation/manifest.json');
const load = entry => JSON.parse(JSON.stringify(require('./__fixtures__/ticket210-observation/' + entry.file)));
const nested = manifest.captures.find(e => e.file.includes('nested-wait'));
const scope = nested.expected_scope;
const fresh = () => load(nested);
const timeout = task => task();
const apiFor = task => createSkeletonRunObservationApi(() => task, timeout);

describe('independent renderer observation validator and public facade', () => {
  test.each(manifest.captures.map(e => [e.file, e]))('actual producer %s', async (_name, entry) => {
    const value = load(entry);
    expect(checkSkeletonRunObservation(value, entry.expected_scope)).toBe(value);
    await expect(apiFor(async () => value).getSkeletonRunObservation(entry.expected_scope)).resolves.toEqual({ ok: true, data: value });
  });
  test('public API exposes observation and unchanged resource methods', () => {
    const api = createUnchainApi();
    expect(typeof api.getSkeletonRunObservation).toBe('function');
    expect(typeof api.getSkeletonResource).toBe('function');
  });
  test('run:null and optional root discovery', async () => {
    const request = { owner_chat_id: 'owner', execution_id: 'session', resource_id: 'root' };
    const value = { schema: 'pupu.skeleton-run-observation.v1', run: null };
    await expect(apiFor(async () => value).getSkeletonRunObservation(request)).resolves.toEqual({ ok: true, data: value });
  });
  test.each([null, [], {}, { ...scope, extra: true }, { ...scope, root_run_id: undefined }, { ...scope, root_run_id: null }, { ...scope, owner_chat_id: ' owner' }, { ...scope, execution_id: 'x/y' }, { ...scope, resource_id: 1 }])('bad requests never reach bridge %#', async value => {
    const method = jest.fn();
    expect(() => checkSkeletonRunObservationRequest(value)).toThrow();
    expect((await apiFor(method).getSkeletonRunObservation(value)).ok).toBe(false);
    expect(method).not.toHaveBeenCalled();
  });
  const cases = [
    v => { v.schema = 'v0'; },
    v => { v.extra = true; },
    v => { v.run.extra = true; },
    v => { v.run.owner_chat_id = 'foreign'; },
    v => { v.run.execution_id = 'foreign'; },
    v => { v.run.root_run_id = 'foreign'; },
    v => { v.run.resource_id = 'foreign'; },
    v => { v.run.high_watermark = Number.MAX_SAFE_INTEGER + 1; },
    v => { v.run.graphs.push(v.run.graphs[0]); },
    v => { v.run.graphs[1].attempt_id = v.run.graphs[0].attempt_id; },
    v => { v.run.graphs[0].document.extra = true; },
    v => { v.run.graphs[0].document.nodes[0].extra = true; },
    v => { v.run.graphs[0].document.edges[0].extra = true; },
    v => { v.run.graphs[0].document.nodes[0].type = '__proto__'; },
    v => { v.run.graphs[0].nodes.push(v.run.graphs[0].nodes[0]); },
    v => { v.run.graphs[0].nodes.pop(); },
    v => { v.run.graphs[0].nodes[0].extra = true; },
    v => { v.run.graphs[0].nodes[0].state = 'green'; },
    v => { v.run.graphs[0].nodes[0].phase = 'green'; },
    v => { v.run.graphs[0].owner_liveness = 'alive'; },
    v => { v.run.graphs[0].store_seq = v.run.high_watermark + 1; },
    v => { v.run.graphs[1].parent_graph_id = 'missing'; },
    v => { v.run.graphs[1].caller_node_id = 'end'; },
    v => { v.run.graphs[1].call_stack[0].caller_node_invocation_id = 'foreign'; },
    v => { v.run.graphs[1].call_stack[1].definition_digest = 'a'.repeat(64); },
    v => { v.run.graphs[1].call_stack[1].caller_node_invocation_id = 'wrong'; },
    v => { v.run.graphs[0].document.nodes[0].config.nonjson = undefined; },
    v => { v.run.graphs[0].document.nodes[0].config.nonjson = Infinity; },
    v => { v.run.graphs[0].document.nodes[0].config.nonjson = () => true; },
    v => { v.run.graphs[0].error = { code: 'safe', path: [-1] }; },
    v => { v.run.graphs[0].skipped_edges = ['missing']; },
    v => { v.run.graphs = Array(65).fill(v.run.graphs[0]); },
    v => { v.run.graphs[0].document.description = '\u4e2d'.repeat(1400000); },
  ];
  test.each(cases.map((change, i) => [i, change]))('malformed observation fails closed #%s', (_i, change) => {
    const v = fresh(); change(v);
    expect(() => checkSkeletonRunObservation(v, scope)).toThrow();
  });
  test('all producer phases and states are admitted without inferred transitions', () => {
    for (const phase of ['pending','completed','running','result_received','failed','cancelled','outcome_unknown','paused','waiting_for_child','awaiting_approval','receipt_recorded','awaiting_input','receipt_recorded_upstream']) {
      const v = fresh(); v.run.graphs[0].nodes[0].phase = phase;
      expect(checkSkeletonRunObservation(v, scope)).toBe(v);
    }
  });
  test('all recorded graph statuses and node states remain explicit', () => {
    for (const status of ['ready','running','waiting','result_received','completed','failed','cancelled','outcome_unknown']) {
      const v = fresh(); v.run.graphs[0].status = status;
      expect(checkSkeletonRunObservation(v, scope)).toBe(v);
    }
    for (const state of ['pending','running','waiting','waiting_approval','suspended','succeeded','failed','cancelled','outcome_unknown']) {
      const v = fresh(); v.run.graphs[0].nodes[0].state = state;
      expect(checkSkeletonRunObservation(v, scope)).toBe(v);
    }
  });
  test('JSON opaque config and Unicode/prototype-looking node identifiers remain exact', () => {
    const v = fresh(), g = v.run.graphs[1];
    g.document.nodes[2].id = '__proto__\u4e2d'; g.nodes[2].node_id = '__proto__\u4e2d';
    g.document.edges[1].target_node_id = '__proto__\u4e2d';
    g.document.nodes[2].config.extension = { arbitrary: [null, true, 1.2, '\u4e2d'] };
    expect(checkSkeletonRunObservation(v, scope)).toBe(v);
  });
  test('missing or old bridge returns explicit unavailable', async () => {
    const api = createSkeletonRunObservationApi(() => { throw new Error('missing bridge'); }, timeout);
    expect(await api.getSkeletonRunObservation(scope)).toEqual({ ok: false, error: { code: 'skeleton_run_observation_unavailable', path: [], message: 'Run observation is unavailable', status: null } });
  });
  test('exact typed refusal survives; malformed Host success is unavailable', async () => {
    const refusal = { code: 'observation_unavailable', path: ['adapter', 0], message: 'Unavailable', status: 503 };
    expect(await apiFor(async () => { throw refusal; }).getSkeletonRunObservation(scope)).toEqual({ ok: false, error: refusal });
    expect((await apiFor(async () => ({ resources: [] })).getSkeletonRunObservation(scope)).error.code).toBe('skeleton_run_observation_protocol_error');
  });
});

describe("CP2 strong-review regression boundaries", () => {
  test('real Core Unicode definitions and deep opaque graph identities', async () => {
    const packet = require('./__fixtures__/ticket210-observation-packet02/manifest.json');
    const entry = packet.captures[0];
    const value = require('./__fixtures__/ticket210-observation-packet02/producer-projection-opaque-identities.json');
    expect(value.run.graphs.some(g => g.graph_id.length > 200)).toBe(true);
    expect(value.run.graphs.some(g => Array.from(g.document.id).some(char => char.codePointAt(0) > 127))).toBe(true);
    expect(checkSkeletonRunObservation(value, entry.expected_scope)).toBe(value);
  });
  test.each(['\n', '\r', '\r\n', '\u2028', '\u2029'])('strict ingress IDs reject final line terminator %p', suffix => {
    for (const key of Object.keys(scope)) expect(() => checkSkeletonRunObservationRequest({ ...scope, [key]: scope[key] + suffix })).toThrow();
  });
  test('digests require actual strings and complete matches', () => {
    for (const transform of [v => [v], v => v + '\n', v => v + '\r', v => v + '\u2028']) {
      for (const key of ['definition_digest', 'runtime_manifest_digest', 'launch_manifest_digest']) {
        const value = fresh(); value.run[key] = transform(value.run[key]);
        expect(() => checkSkeletonRunObservation(value, scope)).toThrow();
      }
      for (const target of ['graph', 'frame']) {
        const value = fresh(); const row = target === 'graph' ? value.run.graphs[0] : value.run.graphs[0].call_stack[0];
        row.definition_digest = transform(row.definition_digest);
        expect(() => checkSkeletonRunObservation(value, scope)).toThrow();
      }
    }
  });
  test('conservative display budget includes structural whitespace and numeric allowance', () => {
    const value = fresh(); value.run.graphs[0].document.nodes[0].config.large = Array(27000).fill(1);
    expect(JSON.stringify(value).length).toBeLessThan(8 * 1024 * 1024);
    expect(() => checkSkeletonRunObservation(value, scope)).toThrow();
    const hugeNumber = JSON.parse('1' + '0'.repeat(299));
    const exact = fresh(); exact.run.graphs[0].document.nodes[0].config.large = Array(27000).fill(hugeNumber);
    expect(Number.isFinite(hugeNumber)).toBe(true);
    expect(() => checkSkeletonRunObservation(exact, scope)).toThrow();
    const small = fresh(); small.run.graphs[0].document.nodes[0].config.large = [hugeNumber, -0, 1.2e-100];
    expect(checkSkeletonRunObservation(small, scope)).toBe(small);
  });
});

test('renderer scope remains detached and frozen across await', async () => {
  const request = { ...scope }; let received, respond;
  const api = apiFor(value => { received = value; return new Promise(resolve => { respond = resolve; }); });
  const pending = api.getSkeletonRunObservation(request);
  expect(received).not.toBe(request); expect(Object.isFrozen(received)).toBe(true);
  request.owner_chat_id = 'foreign'; request.root_run_id = 'foreign';
  respond(fresh());
  expect(await pending).toEqual({ ok: true, data: fresh() });
});
