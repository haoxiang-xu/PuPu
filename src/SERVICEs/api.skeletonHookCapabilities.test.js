import { api } from './api';
import capture from './skeleton_hook_capabilities_capture.json';

const original = window.unchainAPI;
afterEach(() => { window.unchainAPI = original; });
const copy = value => JSON.parse(JSON.stringify(value));

test('admits the actual host producer without inventing fields or passing a resource/secret', async () => {
  const method = jest.fn(async () => copy(capture));
  window.unchainAPI = { getSkeletonHookCapabilities: method };
  await expect(api.unchain.getSkeletonHookCapabilities()).resolves.toStrictEqual(capture);
  expect(method.mock.calls).toEqual([[]]);
});

test.each([
  ['unknown-envelope-field', v => { v.extra = true; }],
  ['wrong-schema', v => { v.schema = 'future'; }],
  ['unknown-contract-field', v => { v.hook_entry.fail_open = true; }],
  ['wrong-contract-schema', v => { v.hook_entry.schema = 'future'; }],
  ['wrong-required', v => { v.hook_entry.required_fields.pop(); }],
  ['noncanonical-fields', v => { v.hook_entry.required_fields.reverse(); }],
  ['extra-optional', v => { v.hook_entry.optional_fields.push('fail_open'); }],
  ['boolean-coercion', v => { v.hook_entry.omitted_enabled = 1; }],
  ['changed-legacy-semantics', v => { v.hook_entry.omitted_enabled = false; }],
  ['invalid-digest', v => { v.runtime_manifest_digest = 'sha256:invalid'; }],
])('fails closed for %s', async (_name, mutate) => {
  const value = copy(capture); mutate(value);
  window.unchainAPI = { getSkeletonHookCapabilities: jest.fn(async () => value) };
  await expect(api.unchain.getSkeletonHookCapabilities()).rejects.toMatchObject({ code: 'skeleton_hook_capabilities_malformed' });
});

test('preserves the host unavailable refusal instead of manufacturing old defaults', async () => {
  window.unchainAPI = { getSkeletonHookCapabilities: jest.fn(async () => {
    throw { code: 'skeleton_hook_enable_unavailable', path: ['runtime_protocol_manifest'], status: 409, message: 'Unavailable' };
  }) };
  await expect(api.unchain.getSkeletonHookCapabilities()).rejects.toMatchObject({ code: 'skeleton_hook_enable_unavailable', status: 409 });
});
