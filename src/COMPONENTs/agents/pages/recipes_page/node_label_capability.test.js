import capture from "../../../../../electron/tests/fixtures/managed_code_producer.json";
import { node_label_capability } from "./node_label_capability";
const protocol = { id: "skeleton_execution", major: 1, minor: 8, features: ["node_display_label_v1"] };
const response = (protocols = [protocol]) => ({ ...capture.capabilities, runtime_manifest: { ...capture.capabilities.runtime_manifest, protocols } });
test("only the feature on compatible actual runtime protocol enables Rename", () => {
  expect(node_label_capability(response())).toEqual({ allowed: true, reason: null });
  expect(node_label_capability(response([{ ...protocol, minor: 9 }])).allowed).toBe(true);
});
test.each([
  [], [{ ...protocol, major: 2 }], [{ ...protocol, minor: 7 }], [{ ...protocol, features: [] }],
  [{ ...protocol, features: "node_display_label_v1" }], [protocol, protocol],
  [{ ...protocol, minor: "8" }], [{ ...protocol, major: true }], [{ ...protocol, extra: true }],
].map((value) => [value]))("missing, old, wrong or malformed protocol is denied %#", (protocols) => {
  const result = node_label_capability(response(protocols)); expect(result.allowed).toBe(false); expect(result.reason).toBeTruthy();
});
test.each([null, {}, { ...response(), runtime_manifest: { ...response().runtime_manifest, manifest_digest: "wrong" } },
  { ...response(), runtime_manifest: { ...response().runtime_manifest, runtime: "other" } }])("bad envelope denied %#", (value) => {
  expect(node_label_capability(value).allowed).toBe(false);
});
