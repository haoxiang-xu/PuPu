import { admit_resource_aggregate, managed_rows, managed_path } from "./managed_code_sources";
import { load_resource, python_profiles } from "./skeleton_resources";
import { agentProblemMessage } from "./agents_i18n";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const t = (key, vars) => `T:${key}:${JSON.stringify(vars || {})}`;
beforeEach(() => { Object.keys(api.unchain).forEach((key) => delete api.unchain[key]); });
test("local managed-protocol rejection keeps normal error fields but can display its own translated reason", () => {
  const result = admit_resource_aggregate({});
  expect(result.error).toEqual({ code: "managed_source_protocol_error", path: [], message: "The resource reply is not a v2 aggregate." });
  expect(agentProblemMessage(result.error, t)).toMatch(/^T:agents\.managed\./);
});
test("local missing source refusal keeps its complete address, with no substitute source", () => {
  const sha = "a".repeat(64); const document = { nodes: [{ id: "raw", type: "code", config: { code: { source: { kind: "file", path: managed_path(sha) } } } }], edges: [] };
  const before = JSON.stringify(document); const result = managed_rows(document, {});
  expect(result.ok).toBe(false); expect(result.error.code).toBe("managed_source_missing");
  expect(result.error.path).toEqual(["document", "nodes", 0, "config", "code", "source"]);
  expect(agentProblemMessage(result.error, t)).toMatch(/^T:agents\.managed\./); expect(JSON.stringify(document)).toBe(before);
});
test("local unavailable/profile refusals preserve ownership through the resource adapter", async () => {
  const missing = await load_resource("raw");
  expect(missing.reason).toBe("unavailable"); expect(agentProblemMessage(missing.error, t)).toMatch(/^T:agents\.managed\./);
  api.unchain.listSkeletonPythonProfiles = jest.fn().mockResolvedValue({ profiles: false });
  const result = await python_profiles(); expect(result.reason).toBe("refused");
  expect(agentProblemMessage(result.error, t)).toMatch(/^T:agents\.managed\./);
});
test("a backend message identical to local diagnostic English is still opaque", async () => {
  const message = "The resource reply is not a v2 aggregate.";
  api.unchain.getManagedSkeletonResource = jest.fn().mockResolvedValue({ error: { code: "raw", message, path: ["raw"] } });
  const result = await load_resource("raw"); expect(result.reason).toBe("refused");
  expect(agentProblemMessage(result.error, t)).toBe(message);
});
