import { api } from "./api";
import capture from "./skeleton_workflow_tool_capabilities_capture.json";

const original = window.unchainAPI;
const clone = () => JSON.parse(JSON.stringify(capture));
afterEach(() => { window.unchainAPI = original; });

test("the real authenticated producer reaches the strict facade without caller fields", async () => {
  const method = jest.fn(async () => clone());
  window.unchainAPI = { getSkeletonWorkflowToolCapabilities: method };
  await expect(api.unchain.getSkeletonWorkflowToolCapabilities()).resolves.toStrictEqual(capture);
  expect(method.mock.calls).toEqual([[]]);
});

test.each([
  ["outer extra", value => { value.extra = true; }],
  ["outer version", value => { value.schema = "future"; }],
  ["manifest", value => { value.runtime_manifest_digest = "not-a-digest"; }],
  ["missing contract", value => { delete value.workflow_tool; }],
  ["extra contract field", value => { value.workflow_tool.extra = true; }],
  ["contract version", value => { value.workflow_tool.schema = "future"; }],
  ["entry fields", value => { value.workflow_tool.entry_fields.push("latest"); }],
  ["revision fields", value => { value.workflow_tool.workflow_fields.reverse(); }],
  ["name prefix", value => { value.workflow_tool.function_prefix = ""; }],
  ["id pattern", value => { value.workflow_tool.id_pattern = ".*"; }],
  ["arguments", value => { value.workflow_tool.arguments_field = "payload"; }],
  ["return contract", value => { value.workflow_tool.returns = "last_node"; }],
  ["scope", value => { value.workflow_tool.scope = "all_kernels"; }],
  ["kind", value => { value.workflow_tool.document_kind = "agent"; }],
  ["version selection", value => { value.workflow_tool.version_policy = "latest"; }],
  ["minimum bool", value => { value.workflow_tool.minimum_runtime_minor = true; }],
])("refuses changed %s", async (_name, mutate) => {
  const value = clone(); mutate(value);
  window.unchainAPI = { getSkeletonWorkflowToolCapabilities: jest.fn(async () => value) };
  await expect(api.unchain.getSkeletonWorkflowToolCapabilities()).rejects.toMatchObject({
    code: "skeleton_workflow_tool_capabilities_malformed",
  });
});

test("an older Hook capability is not a fallback", async () => {
  const old = jest.fn(); window.unchainAPI = { getSkeletonHookCapabilities: old };
  await expect(api.unchain.getSkeletonWorkflowToolCapabilities()).rejects.toMatchObject({ code: expect.any(String) });
  expect(old).not.toHaveBeenCalled();
});

test("the backend refusal retains its code, path, message and status", async () => {
  const refusal = { code: "workflow_tool_runtime_incompatible", path: ["runtime_protocol_manifest"],
    message: "Workflow Tools require v1.4", status: 409 };
  window.unchainAPI = { getSkeletonWorkflowToolCapabilities: jest.fn(async () => { throw refusal; }) };
  await expect(api.unchain.getSkeletonWorkflowToolCapabilities()).rejects.toMatchObject(refusal);
});
