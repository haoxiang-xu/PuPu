import capture from "./workflow_parameters_producer.json";
import { checkManagedCodeResponse } from "../../../../SERVICEs/managed_code_api";
import { workflow_parameters_capability } from "./detail_panel/workflow_parameters_section";
import { callee_interface } from "./workflow_call_config";
const { validateManagedCodeReply, buildManagedCodeRequest } = require("../../../../../electron/main/services/unchain/managed_code_transport");

test("fixed-wheel Flask producer passes the actual Main and renderer consumers intact", () => {
  expect(validateManagedCodeReply("code_capabilities", capture.capabilities)).toEqual(capture.capabilities);
  expect(checkManagedCodeResponse("capabilities", capture.capabilities)).toBe(capture.capabilities);
  expect(workflow_parameters_capability(capture.capabilities)).toBe(true);
  expect(buildManagedCodeRequest("code_save", capture.edit).body).toEqual(capture.edit);
  expect(validateManagedCodeReply("code_save", capture.resource)).toEqual(capture.resource);
  expect(checkManagedCodeResponse("resource", capture.resource)).toBe(capture.resource);
  expect(callee_interface(capture.publication.version.document).inputs.map(({ key, required, type, default: fallback }) => ({ key, required, type, fallback }))).toEqual([
    { key: "city", required: true, type: "string", fallback: undefined },
    { key: "days", required: false, type: "integer", fallback: 1 },
  ]);
});

test.each(["version", "feature", "digest", "extra"])("the Main boundary refuses forged %s capability", (mutation) => {
  const value = JSON.parse(JSON.stringify(capture.capabilities));
  const protocol = value.runtime_manifest.protocols.find((row) => row.id === "skeleton_execution");
  if (mutation === "version") protocol.major = 99;
  if (mutation === "feature") protocol.features.pop();
  if (mutation === "digest") value.runtime_manifest.manifest_digest = "sha256:" + "0".repeat(64);
  if (mutation === "extra") value.extra = true;
  expect(() => validateManagedCodeReply("code_capabilities", value)).toThrow();
});
