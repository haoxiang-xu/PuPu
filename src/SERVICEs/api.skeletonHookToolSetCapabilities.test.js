import { api } from "./api";
import capture from "./skeleton_hook_tool_set_capabilities_capture.json";

const original = window.unchainAPI;
afterEach(() => { window.unchainAPI = original; });
const copy = (value) => JSON.parse(JSON.stringify(value));

test("the real producer reaches the public API without caller selectors or secret fields", async () => {
  const method = jest.fn(async () => copy(capture));
  window.unchainAPI = { getSkeletonHookToolSetCapabilities: method };
  await expect(api.unchain.getSkeletonHookToolSetCapabilities()).resolves.toStrictEqual(capture);
  expect(method.mock.calls).toEqual([[]]);
});

test.each([
  ["extra envelope", v => { v.extra = true; }],
  ["future envelope", v => { v.schema = "future"; }],
  ["bad digest", v => { v.runtime_manifest_digest = "sha256:bad"; }],
  ["extra contract", v => { v.tool_matcher.fail_open = true; }],
  ["future contract", v => { v.tool_matcher.schema = "future"; }],
  ["display title", v => { v.tool_matcher.field = "title"; }],
  ["legacy variants reordered", v => { v.tool_matcher.legacy_types.reverse(); }],
  ["string set", v => { v.tool_matcher.set_type = "string"; }],
  ["boolean minimum", v => { v.tool_matcher.minimum_size = true; }],
  ["empty sets", v => { v.tool_matcher.minimum_size = 0; }],
  ["duplicates", v => { v.tool_matcher.duplicates = "allow"; }],
  ["patterns", v => { v.tool_matcher.names = "patterns"; }],
  ["normalization", v => { v.tool_matcher.normalization = "trim"; }],
  ["missing key", v => { delete v.tool_matcher.names; }],
])("refuses %s from the actual producer shape", async (_name, mutate) => {
  const value = copy(capture); mutate(value);
  window.unchainAPI = { getSkeletonHookToolSetCapabilities: jest.fn(async () => value) };
  await expect(api.unchain.getSkeletonHookToolSetCapabilities()).rejects.toMatchObject({ code: "skeleton_hook_tool_set_capabilities_malformed" });
});

test("the host refusal is preserved", async () => {
  window.unchainAPI = { getSkeletonHookToolSetCapabilities: jest.fn(async () => {
    throw { code: "skeleton_hook_tool_set_unavailable", path: ["runtime_protocol_manifest"], status: 409, message: "Unavailable" };
  }) };
  await expect(api.unchain.getSkeletonHookToolSetCapabilities()).rejects.toMatchObject({ code: "skeleton_hook_tool_set_unavailable", status: 409 });
});

test("an old enable-only host is not used as a fallback", async () => {
  const old = jest.fn(); window.unchainAPI = { getSkeletonHookCapabilities: old };
  await expect(api.unchain.getSkeletonHookToolSetCapabilities()).rejects.toMatchObject({ code: expect.any(String) });
  expect(old).not.toHaveBeenCalled();
});
