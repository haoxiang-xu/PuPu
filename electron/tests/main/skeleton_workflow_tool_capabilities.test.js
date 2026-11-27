const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { CHANNELS } = require('../../shared/channels');
const capture = require('../../../src/SERVICEs/skeleton_workflow_tool_capabilities_capture.json');

test('the real producer body crosses preload and the fixed Main read unchanged', async () => {
  const ipc = { invoke: jest.fn(async (channel, command) => {
    expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
    expect(command).toEqual({ action: 'workflow_tool_capabilities', payload: {} });
    expect(buildSkeletonResourceRequest(command.action, command.payload)).toEqual({
      method: 'GET', path: '/skeleton_workflow_tools/capabilities?contract=workflow_tool_v1',
    });
    return { schema: 'pupu.skeleton-resource-response.v1', ok: true, data: capture };
  }) };
  await expect(createMisoBridge(ipc, {}).getSkeletonWorkflowToolCapabilities()).resolves.toEqual(capture);
  expect(ipc.invoke).toHaveBeenCalledTimes(1);
});

test.each([null, [], { path: '/elsewhere' }, { resource_id: 'other' }, { contract: 'future' }])(
  'read action refuses caller fields and bad payload %p', payload => {
    expect(() => buildSkeletonResourceRequest('workflow_tool_capabilities', payload))
      .toThrow('Workflow Tool capability reads accept no payload fields');
  });
