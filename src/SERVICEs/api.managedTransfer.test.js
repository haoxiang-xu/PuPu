import api from './api';
import fixture from './managed_transfer_producer.json';
const copy = value => JSON.parse(JSON.stringify(value));
let previous;
beforeEach(() => {
  previous = window.unchainAPI;
  window.unchainAPI = { getManagedSkeletonTransferCapabilities: jest.fn(async () => fixture.capabilities), exportManagedSkeletonResource: jest.fn(async () => fixture.export), importManagedSkeletonResource: jest.fn(async () => fixture.resource) };
});
afterEach(() => { window.unchainAPI = previous; });

test('facade exposes strict transfer capabilities and snapshot export', async () => {
  expect(typeof api.unchain.getManagedSkeletonTransferCapabilities).toBe('function');
  expect(await api.unchain.getManagedSkeletonTransferCapabilities()).toEqual(fixture.capabilities);
  expect(await api.unchain.exportManagedSkeletonResource(fixture.snapshot.document.id)).toEqual(fixture.export);
});
test('import sends the explicit binding request without mutation or a v1 fallback', async () => {
  expect(typeof api.unchain.importManagedSkeletonResource).toBe('function');
  const value = copy(fixture.request); expect(await api.unchain.importManagedSkeletonResource(value)).toEqual(fixture.resource);
  expect(value).toEqual(fixture.request); expect(window.unchainAPI.importManagedSkeletonResource).toHaveBeenCalledWith(value);
});
test.each(['future', 'extra', 'binding'])('invalid capability fails closed: %s', async mode => {
  const value = copy(fixture.capabilities);
  if (mode === 'future') value.schema = 'future';
  if (mode === 'extra') value.extra = true;
  if (mode === 'binding') value.binding_policy = 'use-existing';
  window.unchainAPI.getManagedSkeletonTransferCapabilities.mockResolvedValue(value);
  await expect(api.unchain.getManagedSkeletonTransferCapabilities()).rejects.toMatchObject({ code: 'managed_source_protocol_error' });
});
test('plain backend refusal preserves code/path/status', async () => {
  window.unchainAPI.importManagedSkeletonResource.mockRejectedValue({ code: 'profile_missing', path: ['runtime_bindings', 0, 'environment_profile_id'], message: 'Python profile was not found', status: 404 });
  await expect(api.unchain.importManagedSkeletonResource(fixture.request)).rejects.toMatchObject({ code: 'profile_missing', path: ['runtime_bindings', 0, 'environment_profile_id'], status: 404 });
});
test('wrong resource identity is rejected', async () => {
  const value = copy(fixture.resource); value.resource.id = 'other'; value.resource.document.id = 'other';
  window.unchainAPI.importManagedSkeletonResource.mockResolvedValue(value);
  await expect(api.unchain.importManagedSkeletonResource(fixture.request)).rejects.toMatchObject({ code: 'managed_source_protocol_error' });
});
