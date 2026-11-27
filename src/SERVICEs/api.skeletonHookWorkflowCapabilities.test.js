import { api } from "./api";
import capture from "./skeleton_hook_workflow_capabilities_capture.json";
const original = window.unchainAPI;
const clone = () => JSON.parse(JSON.stringify(capture));
afterEach(() => { window.unchainAPI = original; });

test("the real source capability reaches the public API without caller fields", async () => {
  const method = jest.fn(async () => clone());
  window.unchainAPI = { getSkeletonHookWorkflowCapabilities: method };
  await expect(api.unchain.getSkeletonHookWorkflowCapabilities()).resolves.toStrictEqual(capture);
  expect(method.mock.calls).toEqual([[]]);
});

test.each([
  ["extra", value => { value.extra = true; }],
  ["schema", value => { value.schema = "future"; }],
  ["digest", value => { value.runtime_manifest_digest = "none"; }],
  ["contract-extra", value => { value.workflow_source.extra = true; }],
  ["fields", value => { value.workflow_source.embedded_fields.reverse(); }],
  ["kind", value => { value.workflow_source.document_kind = "agent"; }],
  ["identity", value => { value.workflow_source.identity = "latest"; }],
])("refuses %s at the independent renderer reader", async (_name, mutate) => {
  const value = clone(); mutate(value);
  window.unchainAPI = { getSkeletonHookWorkflowCapabilities: jest.fn(async () => value) };
  await expect(api.unchain.getSkeletonHookWorkflowCapabilities()).rejects.toMatchObject({code: "skeleton_hook_workflow_capabilities_malformed"});
});

test("an old enable reader is not a fallback", async () => {
  const old = jest.fn(); window.unchainAPI = { getSkeletonHookCapabilities: old };
  await expect(api.unchain.getSkeletonHookWorkflowCapabilities()).rejects.toMatchObject({code: expect.any(String)});
  expect(old).not.toHaveBeenCalled();
});
