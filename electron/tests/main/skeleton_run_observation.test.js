const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { checkSkeletonRunObservation, checkSkeletonRunObservationRequest } = require('../../main/services/unchain/skeleton_run_observation');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../shared/skeleton_resource_transport');
const { readSkeletonResourceResponse } = require('../../main/services/unchain/skeleton_resource_response');
const { CHANNELS } = require('../../shared/channels');
const directory = path.resolve(__dirname, '../../../src/SERVICEs/__fixtures__/ticket210-observation');
const manifest = require('../../../src/SERVICEs/__fixtures__/ticket210-observation/manifest.json');
const load = entry => JSON.parse(fs.readFileSync(path.join(directory, entry.file), 'utf8'));
const nested = manifest.captures.find(entry => entry.file.includes('nested-wait'));
const scope = nested.expected_scope;
const fresh = () => load(nested);

describe('closed observation Main and preload boundary (BC-210-002)', () => {
  test.each(manifest.captures.map(e => [e.file, e]))('real producer %s, fixed independent scope and exact bytes', async (_name, entry) => {
    const bytes = fs.readFileSync(path.join(directory, entry.file));
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    const data = JSON.parse(bytes.toString('utf8'));
    const ipc = { invoke: jest.fn(async (channel, command) => {
      expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
      expect(command).toEqual({ action: 'run_observation', payload: entry.expected_scope });
      expect(buildSkeletonResourceRequest(command.action, command.payload).method).toBe('GET');
      const response = { status: 200, ok: true, text: async () => bytes.toString('utf8') };
      return createSkeletonResourceReply(async () => checkSkeletonRunObservation(await readSkeletonResourceResponse(response), command.payload));
    }) };
    await expect(createMisoBridge(ipc, {}).getSkeletonRunObservation(entry.expected_scope)).resolves.toEqual(data);
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });
  test('exact query encoding; root discovery is optional; existing routes stay unchanged', () => {
    expect(buildSkeletonResourceRequest('run_observation', { owner_chat_id: 'a:b', execution_id: 'c.d', resource_id: 'e-f' })).toEqual({ method: 'GET', path: '/skeleton_runs/observation?owner_chat_id=a%3Ab&execution_id=c.d&resource_id=e-f' });
    expect(buildSkeletonResourceRequest('run_observation', scope).path).toContain('root_run_id=root-run');
    expect(buildSkeletonResourceRequest('list', { include_archived: false })).toEqual({ method: 'GET', path: '/skeleton_resources?include_archived=false' });
    expect(buildSkeletonResourceRequest('get', { resource_id: 'a/b' })).toEqual({ method: 'GET', path: '/skeleton_resources/a%2Fb' });
  });
  test.each([null, [], {}, { ...scope, extra: true }, { ...scope, root_run_id: undefined }, { ...scope, root_run_id: null }, { ...scope, owner_chat_id: ' owner' }, { ...scope, execution_id: 'x/y' }, { ...scope, resource_id: 1 }])('rejects non-closed requests %#', value => {
    expect(() => buildSkeletonResourceRequest('run_observation', value)).toThrow();
    expect(() => checkSkeletonRunObservationRequest(value)).toThrow();
  });
  test('null run is a valid cold read', () => expect(checkSkeletonRunObservation({ schema: 'pupu.skeleton-run-observation.v1', run: null }, scope).run).toBeNull());
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
  test('typed old Host refusal survives HTTP and preload with exact fields', async () => {
    const refusal = { code: 'observation_unavailable', path: ['adapter', 0], message: 'Unavailable' };
    const ipc = { invoke: async () => createSkeletonResourceReply(() => readSkeletonResourceResponse({ ok: false, status: 503, text: async () => JSON.stringify({ error: refusal }) })) };
    await expect(createMisoBridge(ipc, {}).getSkeletonRunObservation(scope)).rejects.toEqual({ ...refusal, status: 503 });
  });
});

describe("CP2 strong-review regression boundaries", () => {
  test('real Core Unicode definitions and deep opaque graph identities', async () => {
    const packet = require('../../../src/SERVICEs/__fixtures__/ticket210-observation-packet02/manifest.json');
    const entry = packet.captures[0];
    const value = require('../../../src/SERVICEs/__fixtures__/ticket210-observation-packet02/producer-projection-opaque-identities.json');
    const bytes = fs.readFileSync(require.resolve('../../../src/SERVICEs/__fixtures__/ticket210-observation-packet02/producer-projection-opaque-identities.json'));
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
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

describe('bounded raw observation HTTP ingress', () => {
  const read = (...args) => require('../../main/services/unchain/skeleton_run_observation').readSkeletonRunObservationResponse(...args);
  test('raw size cap applies before parsing even valid whitespace-padded JSON', async () => {
    const body = '{"schema":"pupu.skeleton-run-observation.v1","run":null}' + ' '.repeat(8 * 1024 * 1024);
    await expect(read({ ok: true, status: 200, text: async () => body })).rejects.toMatchObject({ code: 'skeleton_run_observation_protocol_error' });
  });
  test('stream stops and cancels once received raw bytes exceed budget', async () => {
    const cancel = jest.fn(async () => {}); const releaseLock = jest.fn();
    const reader = { read: jest.fn().mockResolvedValueOnce({ done: false, value: Buffer.alloc(8 * 1024 * 1024) }).mockResolvedValueOnce({ done: false, value: Buffer.from('x') }), cancel, releaseLock };
    await expect(read({ ok: true, status: 200, body: { getReader: () => reader } })).rejects.toMatchObject({ code: 'skeleton_run_observation_protocol_error' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(releaseLock).toHaveBeenCalledTimes(1);
  });
  test('ordinary typed error parser remains in use', async () => {
    const refusal = { code: 'unavailable', message: 'Unavailable', path: ['adapter'] };
    await expect(read({ ok: false, status: 503, text: async () => JSON.stringify({ error: refusal }) })).rejects.toMatchObject({ ...refusal, status: 503 });
  });
});

// Readiness uses only injected fakes, copied from the established transport suite.
const { EventEmitter } = require('events');
const { createUnchainService } = require('../../main/services/unchain/service');
const ready = async () => {
  const proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter(); proc.killed = false;
  proc.kill = jest.fn(() => { proc.killed = true; proc.emit('exit', 0, null); return true; });
  const net = { createServer: () => { const handlers = {}; return { once: (event, fn) => { handlers[event] = fn; }, listen: () => handlers.listening?.(), close: fn => fn?.() }; } };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', contract: {
    schema: 'pupu.runtime-capabilities', version: 1, capabilities: { runtime_events_v4: true, execution_fencing: true, durable_interactions: true, exact_cancellation: true, durable_jobs: { version: 'D4.1', available: true, reason: '' }, automatic_wake_resume: false }, reasons: {},
  }, session_guard_migration: { schema: 'pupu.session-guard-migration', version: 1, status: 'ready', protocol_version: 1 } }) }));
  const service = createUnchainService({ app: { isPackaged: false, getAppPath: () => '/app', getPath: () => '/tmp/pupu', getVersion: () => '0.1.12' },
    fs: { existsSync: () => true }, path, spawn: () => proc, spawnSync: () => ({ status: 0, stdout: JSON.stringify({ ok: true, major: 3, minor: 12, missing: [] }) }),
    crypto: { randomBytes: () => ({ toString: () => 'qa-auth-token' }) }, net,
    runtimeService: { validateWorkspaceRootPath: () => ({ valid: true, resolvedPath: '/workspace' }) }, getAppIsQuitting: () => false });
  process.env.UNCHAIN_PYTHON_BIN = '/usr/bin/python3.12';
  await service.startMiso();
  return service;
};

describe('Main observation snapshot across deferred response', () => {
  let savedFetch, savedMode, savedPython;
  beforeEach(() => { savedFetch = global.fetch; savedMode = process.env.PUPU_MEMORY_V2_MODE; savedPython = process.env.UNCHAIN_PYTHON_BIN; process.env.PUPU_MEMORY_V2_MODE = 'off'; });
  afterEach(() => { global.fetch = savedFetch; if (savedMode === undefined) delete process.env.PUPU_MEMORY_V2_MODE; else process.env.PUPU_MEMORY_V2_MODE = savedMode; if (savedPython === undefined) delete process.env.UNCHAIN_PYTHON_BIN; else process.env.UNCHAIN_PYTHON_BIN = savedPython; });
  test('query and result remain bound to detached original payload', async () => {
    const service = await ready();
    let respond;
    global.fetch = jest.fn(() => new Promise(resolve => { respond = resolve; }));
    const payload = { ...scope };
    try {
      const pending = service.runMisoSkeletonResourceCommand('run_observation', payload);
      const url = global.fetch.mock.calls[0][0];
      payload.owner_chat_id = 'foreign'; payload.root_run_id = 'foreign'; payload.extra = 'foreign';
      respond({ ok: true, status: 200, text: async () => JSON.stringify(fresh()) });
      expect(await pending).toEqual(fresh());
      expect(new URL(url).searchParams.get('owner_chat_id')).toBe(scope.owner_chat_id);
      expect(new URL(url).searchParams.get('root_run_id')).toBe(scope.root_run_id);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    } finally { service.stopMiso(); }
  });
});
