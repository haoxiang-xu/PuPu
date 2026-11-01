const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { CHANNELS } = require('../../shared/channels');
const capture = require('../../../src/SERVICEs/skeleton_hook_capabilities_capture.json');

test('the actual capability reply traverses the real preload and fixed Main action unchanged', async () => {
  const ipc = { invoke: jest.fn(async (channel, command) => {
    expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
    expect(command).toEqual({ action: 'hook_capabilities', payload: {} });
    expect(buildSkeletonResourceRequest(command.action, command.payload))
      .toEqual({ method: 'GET', path: '/skeleton_hooks/capabilities' });
    return { schema: 'pupu.skeleton-resource-response.v1', ok: true, data: capture };
  }) };
  await expect(createMisoBridge(ipc, {}).getSkeletonHookCapabilities()).resolves.toEqual(capture);
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
});

test.each([null, [], { path: '/elsewhere' }, { schema: 'future' }])('read action rejects caller fields and malformed payload %p', payload => {
  expect(() => buildSkeletonResourceRequest('hook_capabilities', payload)).toThrow();
});
