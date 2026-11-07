const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { validateManagedCodeReply } = require('../../main/services/unchain/managed_code_transport');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../shared/skeleton_resource_transport');
const captured = require('../fixtures/managed_code_producer.json');
const copy = value => JSON.parse(JSON.stringify(value));

test('actual Flask producer passes the independent Main consumer', () => {
  for (const [action, key] of [['code_capabilities', 'capabilities'], ['code_get', 'resource'], ['code_preflight', 'preflight']]) {
    expect(validateManagedCodeReply(action, captured[key])).toEqual(captured[key]);
  }
});

test.each([
  v => { v.extra = true; }, v => { v.schema = 'pupu.skeleton-resource.v99'; },
  v => { v.contents[0].text += 'changed'; }, v => { v.contents[0].text = '\ud800'; },
  v => { v.sources_manifest.entries[0].node_path = ['nodes', true]; },
  v => { v.contents.push(copy(v.contents[0])); }, v => { v.contents = []; },
  v => { v.resource.document.nodes[3].config.code.source.path = 'elsewhere.py'; },
  v => { v.sources_manifest.entries[0].sha256 = '0'.repeat(64); },
])('refuses tampered source producer %#', change => {
  const value = copy(captured.resource); change(value);
  expect(() => validateManagedCodeReply('code_get', value)).toThrow();
});

test('preload uses the existing allowlisted IPC and preserves exact Unicode bytes', async () => {
  const ipc = { invoke: jest.fn(async (_channel, command) => createSkeletonResourceReply(async () => {
    expect(command).toEqual({ action: 'code_save', payload: captured.edit });
    return captured.resource;
  })) };
  const bridge = createMisoBridge(ipc, {});
  expect(await bridge.saveManagedSkeletonResource(captured.edit)).toEqual(captured.resource);
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
});

test('fixed request paths do not discard unknown v2 fields or normalize ids', () => {
  const built = buildSkeletonResourceRequest('code_save', captured.edit);
  expect(built).toEqual({ method: 'POST', path: '/skeleton_resources/v2', body: captured.edit });
  expect(() => buildSkeletonResourceRequest('code_get', { resource_id: ' source-agent' })).toThrow();
  expect(() => buildSkeletonResourceRequest('code_save', { ...captured.edit, surprise: true })).toThrow();
  expect(() => buildSkeletonResourceRequest('code_get', { resource_id: 'source-agent', path: '/other' })).toThrow();
});
