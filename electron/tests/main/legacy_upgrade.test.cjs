const { createHash } = require('crypto');
const { EventEmitter } = require('events');
const path = require('path');
const fixture = require('../fixtures/legacy_upgrade_producer.json');
const { prepareLegacyUpgradeRequest, readLegacyUpgradeResponse, validateLegacyUpgradeCapabilities, runLegacyUpgradeCommand } = require('../../main/services/unchain/legacy_upgrade_transport');
const { readSkeletonResourceResponse } = require('../../main/services/unchain/skeleton_resource_response');
const { createUnchainService } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../shared/skeleton_resource_transport');
const copy = value => JSON.parse(JSON.stringify(value));
const record = fixture.cases.flat;
const response = (body, status = 200) => ({ ok: status === 200, status, text: async () => JSON.stringify(body) });
const fetcher = (answer = record.preview, cap = fixture.capabilities) => jest.fn(async url => response(new URL(url).pathname.endsWith('/capabilities') ? cap : answer));
const run = (request, fetchImpl) => runLegacyUpgradeCommand(request, { baseUrl: 'http://127.0.0.1:5879', authToken: 'offline-only', fetchImpl, readResponse: readSkeletonResourceResponse });
const rehash = value => { value.payload_sha256 = createHash('sha256').update(value.payload_json).digest('hex'); };

test.each(Object.keys(fixture.cases))('strict consumer accepts actual producer inventory/preview/apply: %s', name => {
  const value = fixture.cases[name];
  expect(validateLegacyUpgradeCapabilities(fixture.capabilities)).toEqual(fixture.capabilities);
  for (const [operation, wire, scope] of [['inventory', value.inventory, value.request], ['preview', value.preview, value.request], ['apply', value.applied, value.apply_request]]) {
    const parsed = readLegacyUpgradeResponse(wire, operation, scope);
    expect(parsed.response).toEqual(wire);
    expect(parsed.payload).toEqual(JSON.parse(wire.payload_json));
  }
});

test('fixed requests negotiate the manifest and never accept a caller URL/method', async () => {
  const prepared = prepareLegacyUpgradeRequest('legacy_upgrade_preview', record.request);
  expect(prepared.method).toBe('POST');
  expect(prepared.path).toBe(`/skeleton_resources/${record.request.resource_id}/legacy_upgrade/preview`);
  expect(prepared.body).toEqual(Object.fromEntries(Object.entries(record.request).filter(([key]) => key !== 'resource_id')));
  const fetch = fetcher();
  expect(await run(prepared, fetch)).toEqual(record.preview);
  expect(fetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method])).toEqual([
    ['/skeleton_resources/legacy_upgrade/capabilities', 'GET'], [prepared.path, 'POST']]);
  expect(new URL(fetch.mock.calls[0][0]).search).toBe('?contract=legacy_upgrade_v1');
  expect(fetch.mock.calls.every(([, init]) => init.headers['x-unchain-auth'] === 'offline-only')).toBe(true);
  expect(() => prepareLegacyUpgradeRequest('legacy_upgrade_preview', { ...record.request, method: 'DELETE' })).toThrow();
});

test.each(['schema', 'extra', 'policy', 'manifest'])('bad capability stops before POST: %s', async mode => {
  const cap = copy(fixture.capabilities);
  if (mode === 'schema') cap.schema = 'future';
  if (mode === 'extra') cap.extra = true;
  if (mode === 'policy') cap.apply_policy = 'automatic';
  if (mode === 'manifest') cap.runtime_manifest.manifest_digest = `sha256:${'0'.repeat(64)}`;
  const fetch = fetcher(record.preview, cap);
  await expect(run(prepareLegacyUpgradeRequest('legacy_upgrade_preview', record.request), fetch)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each(['identity', 'token', 'operation', 'manifest', 'payload_hash', 'payload_identity', 'payload_extra', 'projection'])('bad response is refused: %s', mode => {
  const value = copy(record.preview);
  if (mode === 'identity') value.resource_id = 'other';
  if (mode === 'token') value.expected_edit_token = 'other';
  if (mode === 'operation') value.operation = 'apply';
  if (mode === 'manifest') value.runtime_manifest_digest = `sha256:${'0'.repeat(64)}`;
  if (mode === 'payload_hash') value.payload_sha256 = '0'.repeat(64);
  if (mode === 'payload_identity') { const parsed = JSON.parse(value.payload_json); parsed.document.id = 'other'; value.payload_json = JSON.stringify(parsed); rehash(value); }
  if (mode === 'payload_extra') { const parsed = JSON.parse(value.payload_json); parsed.extra = true; value.payload_json = JSON.stringify(parsed); rehash(value); }
  if (mode === 'projection') value.projection_digest = '0'.repeat(64);
  expect(() => readLegacyUpgradeResponse(value, 'preview', record.request)).toThrow();
});

test('closed choices reject unknown nested fields and accessors without executing them', () => {
  const value = copy(record.request); value.choices.extra = true;
  expect(() => prepareLegacyUpgradeRequest('legacy_upgrade_preview', value)).toThrow();
  let calls = 0;
  Object.defineProperty(value, 'choices', { enumerable: true, get() { calls += 1; return {}; } });
  expect(() => prepareLegacyUpgradeRequest('legacy_upgrade_preview', value)).toThrow();
  expect(calls).toBe(0);
});

test('duplicate fields inside canonical payload JSON are rejected after a valid rehash', () => {
  const value = copy(record.preview);
  value.payload_json = value.payload_json.replace('"resource_id":', '"resource_id":"hidden-other","resource_id":');
  rehash(value);
  expect(() => readLegacyUpgradeResponse(value, 'preview', record.request)).toThrow();
});

test('native names and labels retain valid surrounding whitespace', () => {
  const value = copy(record.preview), data = JSON.parse(value.payload_json);
  data.document.name = '  Legacy é  '; data.document.nodes[1].label = '  Label é  ';
  value.payload_json = JSON.stringify(data); rehash(value);
  const parsed = readLegacyUpgradeResponse(value, 'preview', record.request);
  expect(parsed.payload.document.name).toBe('  Legacy é  ');
  expect(parsed.payload.document.nodes[1].label).toBe('  Label é  ');
});

test('duplicate capability HTTP keys are rejected before the operation', async () => {
  const raw = JSON.stringify(fixture.capabilities).replace('"schema":', '"schema":"hidden-old","schema":');
  const fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => raw }));
  await expect(run(prepareLegacyUpgradeRequest('legacy_upgrade_preview', record.request), fetch)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('request is snapshotted before awaiting a handshake', async () => {
  const input = copy(record.request);
  let finish;
  const fetch = jest.fn((url) => new URL(url).pathname.endsWith('/capabilities')
    ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(response(record.preview)));
  const prepared = prepareLegacyUpgradeRequest('legacy_upgrade_preview', input);
  const pending = run(prepared, fetch);
  input.choices.kernels[0].kernel.prompt = 'late edit';
  input.resource_id = 'other';
  finish(response(fixture.capabilities));
  await pending;
  expect(JSON.parse(fetch.mock.calls[1][1].body).choices).toEqual(record.request.choices);
});

test('real refusal keeps status/code/path; unsupported host sends no operation', async () => {
  const refusal = fixture.refusals.stale;
  const fetch = jest.fn(async url => new URL(url).pathname.endsWith('/capabilities') ? response(fixture.capabilities) : response(refusal.body, refusal.status));
  await expect(run(prepareLegacyUpgradeRequest('legacy_upgrade_apply', record.apply_request), fetch)).rejects.toMatchObject({ code: 'edit_conflict', path: ['expected_edit_token'], status: 409 });
  const old = jest.fn(async () => response({ error: { code: 'unsupported_version', path: [], message: 'old host' } }, 404));
  await expect(run(prepareLegacyUpgradeRequest('legacy_upgrade_preview', record.request), old)).rejects.toMatchObject({ status: 404 });
  expect(old).toHaveBeenCalledTimes(1);
});

test('a valid newly signed manifest cannot replace the manifest reviewed by the caller', async () => {
  const cap = copy(fixture.capabilities), manifest = cap.runtime_manifest;
  manifest.protocols.find(p => p.id === 'skeleton_execution').minor += 1;
  const canonical = JSON.stringify({ protocols: manifest.protocols.map(p => ({ features: p.features, id: p.id, major: p.major, minor: p.minor })), runtime: manifest.runtime, schema: manifest.schema });
  manifest.manifest_digest = 'sha256:' + createHash('sha256').update('unchain.runtime_protocol_manifest.v1\\u0000' + canonical).digest('hex');
  expect(validateLegacyUpgradeCapabilities(cap)).toEqual(cap);
  const fetch = fetcher(record.preview, cap);
  await expect(run(prepareLegacyUpgradeRequest('legacy_upgrade_preview', record.request), fetch)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

const ready = async () => {
  const proc = new EventEmitter(); proc.stdout = new EventEmitter(); proc.stderr = new EventEmitter(); proc.killed = false;
  proc.kill = jest.fn(() => { proc.killed = true; proc.emit('exit', 0, null); return true; });
  const net = { createServer: () => { const handlers = {}; return { once: (event, fn) => { handlers[event] = fn; }, listen: () => handlers.listening?.(), close: fn => fn?.() }; } };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'ok', contract: {
    schema: 'pupu.runtime-capabilities', version: 1, capabilities: { runtime_events_v4: true, execution_fencing: true, durable_interactions: true, exact_cancellation: true,
      durable_jobs: { version: 'D4.1', available: true, reason: '' }, automatic_wake_resume: false }, reasons: {},
  }, session_guard_migration: { schema: 'pupu.session-guard-migration', version: 1, status: 'ready', protocol_version: 1 } }) }));
  const service = createUnchainService({ app: { isPackaged: false, getAppPath: () => '/app', getPath: () => '/tmp/pupu', getVersion: () => '0.1.12' },
    fs: { existsSync: () => true }, path, spawn: () => proc, spawnSync: () => ({ status: 0, stdout: JSON.stringify({ ok: true, major: 3, minor: 12, missing: [] }) }),
    crypto: { randomBytes: () => ({ toString: () => 'offline-only' }) }, net,
    runtimeService: { validateWorkspaceRootPath: () => ({ valid: true, resolvedPath: '/workspace' }) }, getAppIsQuitting: () => false });
  process.env.UNCHAIN_PYTHON_BIN = '/usr/bin/python3.12';
  await service.startMiso(); return service;
};

test('preload through actual Main resource command preserves the negotiated producer', async () => {
  const fetchBefore = global.fetch, mode = process.env.PUPU_MEMORY_V2_MODE, python = process.env.UNCHAIN_PYTHON_BIN;
  process.env.PUPU_MEMORY_V2_MODE = 'off';
  let service;
  try {
    service = await ready();
    const fetch = fetcher(); global.fetch = fetch;
    const bridge = createMisoBridge({ invoke: (_channel, command) => createSkeletonResourceReply(() => service.runMisoSkeletonResourceCommand(command.action, command.payload)) }, {});
    expect(await bridge.previewSkeletonLegacyUpgrade(record.request)).toEqual(record.preview);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    service?.stopMiso(); global.fetch = fetchBefore;
    if (mode === undefined) delete process.env.PUPU_MEMORY_V2_MODE; else process.env.PUPU_MEMORY_V2_MODE = mode;
    if (python === undefined) delete process.env.UNCHAIN_PYTHON_BIN; else process.env.UNCHAIN_PYTHON_BIN = python;
  }
});
