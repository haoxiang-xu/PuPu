import api from './api';
import { readLegacyUpgradeResponse } from './legacy_upgrade_api';
import fixture from './legacy_upgrade_producer.json';
const { webcrypto, createHash } = require('crypto');
const { TextEncoder } = require('util');
const copy = value => JSON.parse(JSON.stringify(value));
const example = fixture.cases.flat;
let bridgeBefore, subtleBefore, encoderBefore;
beforeEach(() => {
  bridgeBefore = window.unchainAPI; subtleBefore = Object.getOwnPropertyDescriptor(window.crypto, 'subtle'); encoderBefore = global.TextEncoder;
  Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle }); global.TextEncoder = TextEncoder;
  window.unchainAPI = {
    getSkeletonLegacyUpgradeCapabilities: jest.fn(async () => fixture.capabilities),
    inspectSkeletonLegacyUpgrade: jest.fn(async () => example.inventory),
    previewSkeletonLegacyUpgrade: jest.fn(async () => example.preview),
    applySkeletonLegacyUpgrade: jest.fn(async () => example.applied),
    migrateSkeletonResource: jest.fn(),
  };
});
afterEach(() => {
  window.unchainAPI = bridgeBefore; global.TextEncoder = encoderBefore;
  if (subtleBefore) Object.defineProperty(window.crypto, 'subtle', subtleBefore); else delete window.crypto.subtle;
});
test('facade accepts the real capability and exact producer inventory/preview/apply payloads', async () => {
  expect(await api.unchain.getSkeletonLegacyUpgradeCapabilities()).toEqual(fixture.capabilities);
  const inspect = copy(example.request); delete inspect.choices;
  expect(await api.unchain.inspectSkeletonLegacyUpgrade(inspect)).toEqual({ response: example.inventory, payload: JSON.parse(example.inventory.payload_json) });
  expect(await api.unchain.previewSkeletonLegacyUpgrade(example.request)).toEqual({ response: example.preview, payload: JSON.parse(example.preview.payload_json) });
  expect(await api.unchain.applySkeletonLegacyUpgrade(example.apply_request)).toEqual({ response: example.applied, payload: example.saved });
  expect(window.unchainAPI.migrateSkeletonResource).not.toHaveBeenCalled();
});
test.each(Object.keys(fixture.cases))('independent browser consumer accepts source-kind producer: %s', async name => {
  const row = fixture.cases[name];
  expect((await readLegacyUpgradeResponse(row.preview, 'preview', row.request)).payload).toEqual(JSON.parse(row.preview.payload_json));
});
test.each(['schema', 'identity', 'token', 'manifest', 'hash', 'projection', 'nested'])('malformed producer is refused: %s', async mode => {
  const value = copy(example.preview);
  if (mode === 'schema') value.schema = 'future';
  if (mode === 'identity') value.resource_id = 'other';
  if (mode === 'token') value.expected_edit_token = 'other';
  if (mode === 'manifest') value.runtime_manifest_digest = `sha256:${'0'.repeat(64)}`;
  if (mode === 'hash') value.payload_sha256 = '0'.repeat(64);
  if (mode === 'projection') value.projection_digest = '0'.repeat(64);
  if (mode === 'nested') {
    const payload = JSON.parse(value.payload_json); payload.document.id = 'other';
    value.payload_json = JSON.stringify(payload); value.payload_sha256 = createHash('sha256').update(value.payload_json).digest('hex');
  }
  window.unchainAPI.previewSkeletonLegacyUpgrade.mockResolvedValue(value);
  await expect(api.unchain.previewSkeletonLegacyUpgrade(example.request)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
});
test('plain producer refusal preserves code/path/status; old host has no fallback', async () => {
  const e = fixture.refusals.stale;
  window.unchainAPI.applySkeletonLegacyUpgrade.mockRejectedValue({ ...e.body.error, status: e.status });
  await expect(api.unchain.applySkeletonLegacyUpgrade(example.apply_request)).rejects.toMatchObject({ code: 'edit_conflict', path: ['expected_edit_token'], status: 409 });
  delete window.unchainAPI.previewSkeletonLegacyUpgrade;
  await expect(api.unchain.previewSkeletonLegacyUpgrade(example.request)).rejects.toMatchObject({ code: 'bridge_unavailable' });
  expect(window.unchainAPI.migrateSkeletonResource).not.toHaveBeenCalled();
});
test('unknown fields and getters cannot reach the bridge', async () => {
  const request = { ...example.request, path: '/anything' };
  await expect(api.unchain.previewSkeletonLegacyUpgrade(request)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  let called = 0; Object.defineProperty(request, 'choices', { enumerable: true, get() { called += 1; throw new Error('getter'); } });
  await expect(api.unchain.previewSkeletonLegacyUpgrade(request)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  expect(called).toBe(0); expect(window.unchainAPI.previewSkeletonLegacyUpgrade).not.toHaveBeenCalled();
});
test('a sent request is detached from edits made while its reply is pending', async () => {
  let finish;
  window.unchainAPI.previewSkeletonLegacyUpgrade.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const value = copy(example.request); const pending = api.unchain.previewSkeletonLegacyUpgrade(value);
  await Promise.resolve();
  value.resource_id = 'late-change'; value.choices.kernels[0].kernel.prompt = 'late prompt';
  finish(example.preview); await pending;
  expect(window.unchainAPI.previewSkeletonLegacyUpgrade).toHaveBeenCalledWith(example.request);
});

test('duplicate canonical payload fields cannot be hidden by a valid byte hash', async () => {
  const value = copy(example.preview);
  value.payload_json = value.payload_json.replace('"resource_id":', '"resource_id":"hidden-other","resource_id":');
  value.payload_sha256 = createHash('sha256').update(value.payload_json).digest('hex');
  await expect(readLegacyUpgradeResponse(value, 'preview', example.request)).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
});

test('response identity is detached before asynchronous digest verification', async () => {
  const value = copy(example.preview);
  const pending = readLegacyUpgradeResponse(value, 'preview', example.request);
  value.resource_id = 'late-other';
  expect((await pending).response.resource_id).toBe(example.request.resource_id);
});

test('native names and labels are displayed without trimming', async () => {
  const value = copy(example.preview), payload = JSON.parse(value.payload_json);
  payload.document.name = '  Legacy é  '; payload.document.nodes[1].label = '  Label é  ';
  value.payload_json = JSON.stringify(payload); value.payload_sha256 = createHash('sha256').update(value.payload_json).digest('hex');
  const parsed = await readLegacyUpgradeResponse(value, 'preview', example.request);
  expect(parsed.payload.document.name).toBe('  Legacy é  ');
  expect(parsed.payload.document.nodes[1].label).toBe('  Label é  ');
});
