const path = require('path');
const { EventEmitter } = require('events');
const { buildSkeletonResourceRequest, createUnchainService } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../shared/skeleton_resource_transport');
const fixture = require('../fixtures/managed_transfer_producer.json');
const clone = value => JSON.parse(JSON.stringify(value));

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
const response = (value, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(value) });
const fetchRoutes = (resource = fixture.resource, capabilities = fixture.capabilities) => jest.fn(async url => {
  const p = new URL(url).pathname;
  if (p === '/skeleton_resources/v2/capabilities') return response(fixture.code_capabilities);
  if (p === '/skeleton_resources/v2/transfer/capabilities') return response(capabilities);
  return response(p.endsWith('/export') ? fixture.export : resource);
});
let previousMode, previousPython, previousFetch;
beforeEach(() => { previousMode = process.env.PUPU_MEMORY_V2_MODE; previousPython = process.env.UNCHAIN_PYTHON_BIN; previousFetch = global.fetch; process.env.PUPU_MEMORY_V2_MODE = 'off'; });
afterEach(() => { if (previousMode === undefined) delete process.env.PUPU_MEMORY_V2_MODE; else process.env.PUPU_MEMORY_V2_MODE = previousMode; if (previousPython === undefined) delete process.env.UNCHAIN_PYTHON_BIN; else process.env.UNCHAIN_PYTHON_BIN = previousPython; global.fetch = previousFetch; });

test('fixed importer and exporter preserve the exact payload', () => {
  expect(buildSkeletonResourceRequest('code_import', fixture.request)).toEqual({ method: 'POST', path: '/skeleton_resources/v2/import', body: fixture.request });
  expect(buildSkeletonResourceRequest('code_export', { resource_id: fixture.snapshot.document.id })).toEqual({ method: 'GET', path: `/skeleton_resources/v2/${fixture.snapshot.document.id}/export` });
});

test('preload -> real Main handshakes both contracts before the exact import body', async () => {
  const service = await ready(); const fetch = fetchRoutes(); global.fetch = fetch;
  try {
    const bridge = createMisoBridge({ invoke: (_channel, command) => createSkeletonResourceReply(() => service.runMisoSkeletonResourceCommand(command.action, command.payload)) }, {});
    expect(typeof bridge.importManagedSkeletonResource).toBe('function');
    expect(await bridge.importManagedSkeletonResource(fixture.request)).toEqual(fixture.resource);
    expect(fetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([
      ['/skeleton_resources/v2/capabilities', 'GET'], ['/skeleton_resources/v2/transfer/capabilities', 'GET'], ['/skeleton_resources/v2/import', 'POST']]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual(fixture.request);
    expect(fetch.mock.calls.every(([, init]) => init.headers['x-unchain-auth'] === 'qa-auth-token')).toBe(true);
  } finally { service.stopMiso(); }
});

test('export returns complete source and binds its resource identity', async () => {
  const service = await ready(); global.fetch = fetchRoutes();
  try { expect(await service.runMisoSkeletonResourceCommand('code_export', { resource_id: fixture.snapshot.document.id })).toEqual(fixture.export); }
  finally { service.stopMiso(); }
});

test.each(['old', 'digest', 'policy'])('unsupported transfer handshake stops before import: %s', async mode => {
  const service = await ready(); const capabilities = clone(fixture.capabilities);
  if (mode === 'old') capabilities.schema = 'old';
  if (mode === 'digest') capabilities.runtime_manifest_digest = `sha256:${'0'.repeat(64)}`;
  if (mode === 'policy') capabilities.identity_policy = 'replace';
  const fetch = fetchRoutes(fixture.resource, capabilities); global.fetch = fetch;
  try { await expect(service.runMisoSkeletonResourceCommand('code_import', fixture.request)).rejects.toMatchObject({ code: 'managed_source_protocol_error' }); expect(fetch.mock.calls).toHaveLength(2); }
  finally { service.stopMiso(); }
});

test.each(['id', 'source', 'profile'])('Main refuses mismatched import answer: %s', async mode => {
  const service = await ready(); const value = clone(fixture.resource);
  if (mode === 'id') { value.resource.id = 'other'; value.resource.document.id = 'other'; }
  if (mode === 'source') value.contents[0].text += 'bad';
  if (mode === 'profile') value.resource.document.nodes[1].config.code.environment_profile_id = 'other';
  global.fetch = fetchRoutes(value);
  try { await expect(service.runMisoSkeletonResourceCommand('code_import', fixture.request)).rejects.toMatchObject({ code: 'managed_source_protocol_error' }); }
  finally { service.stopMiso(); }
});

test.each(['token', 'executable', 'duplicate', 'getter'])('invalid import does not reach HTTP: %s', async mode => {
  const service = await ready(); const request = clone(fixture.request); let called = 0;
  if (mode === 'token') request.expected_edit_token = 'edit-elsewhere';
  if (mode === 'executable') request.runtime_bindings[0].executable = '/do/not/run';
  if (mode === 'duplicate') request.runtime_bindings.push(clone(request.runtime_bindings[0]));
  if (mode === 'getter') Object.defineProperty(request, 'source_json', { get() { called += 1; throw new Error('author getter'); }, enumerable: true });
  const fetch = fetchRoutes(); global.fetch = fetch;
  try { await expect(service.runMisoSkeletonResourceCommand('code_import', request)).rejects.toMatchObject({ code: 'managed_source_protocol_error' }); expect(fetch).not.toHaveBeenCalled(); expect(called).toBe(0); }
  finally { service.stopMiso(); }
});

test('raw file text is never reserialized by the Main builder', () => {
  const request = clone(fixture.request);
  // The real Python G1 preparer produced these numeric tokens.
  request.source_json = fixture.numeric_source_json;
  expect(request.source_json).toContain('1.0');
  expect(request.source_json).toContain('-0.0');
  expect(request.source_json).toContain('9007199254740993');
  const result = buildSkeletonResourceRequest('code_import', request);
  expect(result.body.source_json).toBe(request.source_json);
});
