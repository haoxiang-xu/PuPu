const { buildSkeletonResourceRequest } = require('../../main/services/unchain/service');
const { createMisoBridge } = require('../../preload/bridges/unchain_bridge');
const { CHANNELS } = require('../../shared/channels');
const capture = require('../../../src/SERVICEs/skeleton_hook_workflow_capabilities_capture.json');

test('the true producer reply survives the fixed Main and preload action', async () => {
  const ipc = { invoke: jest.fn(async (channel, command) => {
    expect(channel).toBe(CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND);
    expect(command).toEqual({action: 'hook_workflow_capabilities', payload: {}});
    expect(buildSkeletonResourceRequest(command.action, command.payload)).toEqual({method: 'GET', path: '/skeleton_hooks/capabilities?contract=embedded_workflow_v1'});
    return {schema: 'pupu.skeleton-resource-response.v1', ok: true, data: capture};
  }) };
  await expect(createMisoBridge(ipc, {}).getSkeletonHookWorkflowCapabilities()).resolves.toEqual(capture);
});

test.each([null, [], {contract:'future'}, {resource_id:'unrelated'}])('the Main action refuses payload selection %p', value => {
  expect(() => buildSkeletonResourceRequest('hook_workflow_capabilities', value)).toThrow();
});
