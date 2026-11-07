const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { CHANNELS } = require('../../shared/channels');
const capture = require('../../../src/SERVICEs/skeleton_hook_tool_set_capabilities_capture.json');

test('the real producer traverses preload and the fixed Main tool-set action unchanged', async () => {
  const ipc = { invoke: jest.fn(async (channel, command) => {
    expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
    expect(command).toEqual({ action: 'hook_tool_set_capabilities', payload: {} });
    expect(buildSkeletonResourceRequest(command.action, command.payload))
      .toEqual({ method: 'GET', path: '/skeleton_hooks/capabilities?contract=tool_set_v1' });
    return { schema: 'pupu.skeleton-resource-response.v1', ok: true, data: capture };
  }) };
  await expect(createMisoBridge(ipc, {}).getSkeletonHookToolSetCapabilities()).resolves.toEqual(capture);
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
});

test.each([null, [], { contract: 'future' }, { path: '/elsewhere' }, { api_key: 'sentinel' }])('tool-set action refuses caller payload %p', payload => {
  expect(() => buildSkeletonResourceRequest('hook_tool_set_capabilities', payload)).toThrow();
});
