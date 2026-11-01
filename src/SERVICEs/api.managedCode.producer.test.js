import { api } from './api';
import capture from '../../electron/tests/fixtures/managed_code_producer.json';
const { createMisoBridge } = require('../../electron/preload/bridges/unchain_bridge');
const { createSkeletonResourceReply } = require('../../electron/shared/skeleton_resource_transport');
const { buildSkeletonResourceRequest } = require('../../electron/main/services/unchain/service');
const { validateManagedCodeReply } = require('../../electron/main/services/unchain/managed_code_transport');

afterEach(() => { delete window.unchainAPI; });
const install = (change = value => value) => {
  const seen = [];
  window.unchainAPI = createMisoBridge({ invoke: async (_channel, command) => createSkeletonResourceReply(async () => {
    seen.push(buildSkeletonResourceRequest(command.action, command.payload));
    const key = command.action === 'code_capabilities' ? 'capabilities' : command.action === 'code_preflight' ? 'preflight' : 'resource';
    return validateManagedCodeReply(command.action, change(JSON.parse(JSON.stringify(capture[key]))));
  }) }, {});
  return seen;
};
test('real Flask source result crosses Main validation, IPC, preload and facade unchanged', async () => {
  const seen = install();
  expect(await api.unchain.getManagedCodeCapabilities()).toEqual(capture.capabilities);
  expect(await api.unchain.saveManagedSkeletonResource(capture.edit)).toEqual(capture.resource);
  expect(await api.unchain.getManagedSkeletonResource('source-agent')).toEqual(capture.resource);
  expect(await api.unchain.preflightManagedSkeletonResource('source-agent')).toEqual(capture.preflight);
  expect(seen[1]).toEqual({ method: 'POST', path: '/skeleton_resources/v2', body: capture.edit });
  expect(seen).toHaveLength(4);
});
test('strict Main refusal survives both bridge error serializations', async () => {
  install(value => ({ ...value, unexpected: true }));
  await expect(api.unchain.getManagedSkeletonResource('source-agent')).rejects.toMatchObject({
    code: 'managed_source_protocol_error', path: [], status: null,
  });
});
test('missing source bridge never falls back to a graph-only save', async () => {
  window.unchainAPI = { saveSkeletonResource: jest.fn() };
  await expect(api.unchain.saveManagedSkeletonResource(capture.edit)).rejects.toThrow();
  expect(window.unchainAPI.saveSkeletonResource).not.toHaveBeenCalled();
});
test.each([{}, { ...capture.resource, contents: null }, { ...capture.resource, schema: 'future' }])('facade itself rejects bad envelopes %#', async value => {
  window.unchainAPI = { getManagedSkeletonResource: jest.fn().mockResolvedValue(value) };
  await expect(api.unchain.getManagedSkeletonResource('source-agent')).rejects.toMatchObject({ code: 'managed_source_protocol_error' });
});
