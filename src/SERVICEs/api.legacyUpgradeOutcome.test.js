import api from './api';
import fixture from './legacy_upgrade_producer.json';
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');
const example = fixture.cases.flat;
const copy = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
let oldBridge, oldEncoder, oldSubtle;
beforeEach(() => {
  oldBridge = window.unchainAPI; oldEncoder = global.TextEncoder;
  oldSubtle = Object.getOwnPropertyDescriptor(window.crypto, 'subtle');
  Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  global.TextEncoder = TextEncoder;
  window.unchainAPI = { applySkeletonLegacyUpgrade: jest.fn(async () => example.applied),
    previewSkeletonLegacyUpgrade: jest.fn(async () => example.preview) };
});
afterEach(() => {
  jest.useRealTimers(); window.unchainAPI = oldBridge; global.TextEncoder = oldEncoder;
  if (oldSubtle) Object.defineProperty(window.crypto, 'subtle', oldSubtle); else delete window.crypto.subtle;
});
const metadata = outcome => ({ operation: 'apply', resource_id: example.apply_request.resource_id,
  expected_edit_token: example.apply_request.expected_edit_token,
  expected_runtime_manifest_digest: example.apply_request.expected_runtime_manifest_digest,
  expected_projection_digest: example.apply_request.expected_projection_digest, outcome });

test('actual facade timeout marks dispatched apply unconfirmed without retry or abort', async () => {
  jest.useFakeTimers(); let finish;
  window.unchainAPI.applySkeletonLegacyUpgrade.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const request = copy(example.apply_request);
  const pending = api.unchain.applySkeletonLegacyUpgrade(request).catch(error => error);
  await flush(); request.resource_id = 'edited-after-dispatch';
  jest.advanceTimersByTime(20001);
  const error = await pending;
  expect(error.code).toBe('legacy_upgrade_timeout');
  expect(error.message).toMatch(/unconfirmed/i);
  expect(error.legacyUpgrade).toEqual(metadata('unconfirmed'));
  expect(Object.isFrozen(error.legacyUpgrade)).toBe(true);
  expect(window.unchainAPI.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
  finish(example.applied); await flush();
  expect(window.unchainAPI.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
});

test.each([
  ['unauthorized', 401], ['edit_conflict', 409], ['upgrade_preview_stale', 409],
  ['upgrade_manifest_stale', 409], ['legacy_upgrade_already_applied', 409], ['legacy_dependency_upgrade_required', 409],
])('documented prewrite refusal preserves %s identity and code', async (code, status) => {
  window.unchainAPI.applySkeletonLegacyUpgrade.mockRejectedValue({ code, status, path: ['expected_edit_token'], message: 'actual refusal' });
  const error = await api.unchain.applySkeletonLegacyUpgrade(example.apply_request).catch(value => value);
  expect(error).toMatchObject({ code, status, path: ['expected_edit_token'], message: 'actual refusal' });
  expect(error.legacyUpgrade).toEqual(metadata('prewrite_refused'));
});

test.each([['limit_bytes', 413], ['skeleton_store_failed', 500], ['edit_conflict', 500]])(
  'older-host or generic %s/%s is conservatively unconfirmed', async (code, status) => {
    window.unchainAPI.applySkeletonLegacyUpgrade.mockRejectedValue({ code, status, path: ['payload'], message: 'not proof of rollback' });
    const error = await api.unchain.applySkeletonLegacyUpgrade(example.apply_request).catch(value => value);
    expect(error).toMatchObject({ code, status, path: ['payload'] });
    expect(error.legacyUpgrade).toEqual(metadata('unconfirmed'));
  });

test('a dispatched malformed success cannot be presented as no write', async () => {
  window.unchainAPI.applySkeletonLegacyUpgrade.mockResolvedValue({ ...example.applied, payload_sha256: '0'.repeat(64) });
  const error = await api.unchain.applySkeletonLegacyUpgrade(example.apply_request).catch(value => value);
  expect(error.code).toBe('legacy_upgrade_protocol_error');
  expect(error.legacyUpgrade).toEqual(metadata('unconfirmed'));
});

test('malformed disconnect stays a protocol failure and does not replay apply', async () => {
  window.unchainAPI.applySkeletonLegacyUpgrade.mockRejectedValue(new Error('transport disconnected'));
  const error = await api.unchain.applySkeletonLegacyUpgrade(example.apply_request).catch(value => value);
  // The shared bridge contract intentionally normalizes undeclared Errors.
  expect(error.code).toBe('skeleton_resource_protocol_error');
  expect(error.message).toBe('Invalid Skeleton resource bridge refusal');
  expect(error.legacyUpgrade).toEqual(metadata('unconfirmed'));
  expect(window.unchainAPI.applySkeletonLegacyUpgrade).toHaveBeenCalledTimes(1);
});

test('local request rejection and unavailable bridge are not dispatched outcomes', async () => {
  await expect(api.unchain.applySkeletonLegacyUpgrade({ ...example.apply_request, extra: true })).rejects.toMatchObject({ code: 'legacy_upgrade_protocol_error' });
  expect(window.unchainAPI.applySkeletonLegacyUpgrade).not.toHaveBeenCalled();
  delete window.unchainAPI.applySkeletonLegacyUpgrade;
  const error = await api.unchain.applySkeletonLegacyUpgrade(example.apply_request).catch(value => value);
  expect(error.code).toBe('bridge_unavailable');
  expect(error.legacyUpgrade).toBeUndefined();
});

test('normal apply keeps the closed producer result; preview errors have no apply metadata', async () => {
  expect(await api.unchain.applySkeletonLegacyUpgrade(example.apply_request)).toEqual({ response: example.applied, payload: example.saved });
  window.unchainAPI.previewSkeletonLegacyUpgrade.mockRejectedValue({ code: 'edit_conflict', path: [], status: 409, message: 'preview conflict' });
  const error = await api.unchain.previewSkeletonLegacyUpgrade(example.request).catch(value => value);
  expect(error.code).toBe('edit_conflict'); expect(error.legacyUpgrade).toBeUndefined();
});
