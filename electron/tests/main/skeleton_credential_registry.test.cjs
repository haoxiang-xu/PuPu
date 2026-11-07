const {
  buildSkeletonCredentialQuery,
  resolveSkeletonCredentials,
  trustedCustomProviders,
} = require("../../main/services/unchain/skeleton_credentials");
const presets = require("../../../src/SERVICEs/custom_provider_presets.json");

const copy = (value) => JSON.parse(JSON.stringify(value));
const bundled = () => ({ ...copy(presets.find((item) => item.provider.id === "deepseek").provider), enabled: true });
const snapshot = (providers = []) => ({ status: "ready", providers });
const query = () => buildSkeletonCredentialQuery({
  threadId: "session-registry", owner_chat_id: "chat-registry",
  memory_agent_config: { displayName: "Memory Agent", additionalInstructions: "", provider: "openai", modelId: "memory-model" },
  options: { skeleton_selection: { schema: "pupu.skeleton_chat_selection.v1", kind: "resource", resource_id: "authored-custom-agent" } },
});
const profile = (registration = bundled()) => ({
  id: `custom.deepseek:${registration.models[0].id}`, credential_ref: "custom.deepseek", provider: "custom.deepseek",
  model: registration.models[0].id, protocol: registration.protocol, endpoint: registration.base_url,
});
const requirements = (target = profile()) => ({
  schema: "pupu.skeleton_credential_requirements.v1", kind: "skeleton",
  scope: { schema: "pupu.skeleton_credential_scope.v1", mode: "start", session_id: "session-registry", owner_chat_id: "chat-registry",
    interaction_id: "", source_attempt_id: "", selection_digest: "a".repeat(64), workflows_digest: "b".repeat(64), launch_digest: "", memory_provider: "openai" },
  profiles: [target],
});
const attempt = (stored, target = profile()) => {
  const readSecret = jest.fn((kind, id) => `REGISTRY-TEST-SENTINEL:${kind}:${id}`);
  let result, error;
  try {
    const customProviders = trustedCustomProviders(stored);
    result = resolveSkeletonCredentials(requirements(target), query(), { customProviders, readSecret });
  } catch (caught) { error = caught; }
  return { result, error, readSecret };
};
const refusedBeforeAnyKey = (read, code = "skeleton_credential_target_mismatch") => {
  expect(read.result).toBeUndefined();
  expect(read.error).toBeInstanceOf(Error);
  expect(read.error.code).toBe(code);
  expect(read.readSecret).not.toHaveBeenCalled();
  expect(String(read.error.message)).not.toContain("REGISTRY-TEST-SENTINEL");
};

// Main graph policy for this increment intentionally differs from the legacy
// shipped renderer's bundle-only policy. Imported/hand-authored Kernel profiles
// already cross Store/preflight; catalog UI generation is not the admission gate.
describe("Main Skeleton registry uses stored registration before shipped fallback", () => {
  test("a genuinely absent registration falls back to the bundled target", () => {
    const read = attempt(snapshot());
    expect(read.error).toBeUndefined();
    expect(read.result.credentials["custom.deepseek"]).toEqual({ provider: "custom.deepseek", endpoint: bundled().base_url, api_key: "REGISTRY-TEST-SENTINEL:custom_provider:custom.deepseek" });
    expect(read.readSecret.mock.calls).toEqual([["custom_provider", "custom.deepseek"], ["provider", "openai"]]);
  });

  test("an explicitly missing registry is genuine absence", () => {
    const providers = trustedCustomProviders({ status: "missing" });
    expect(providers.find((entry) => entry.id === "deepseek")).toEqual(bundled());
  });

  test("the authored registration wins as one whole object without merged preset fields", () => {
    const authored = { config_version: 1, id: "deepseek", enabled: true, display_name: "My registered target", protocol: "openai-responses", base_url: "https://registered.example/v1", auth: { mode: "bearer" }, models: [{ id: "authored-model" }] };
    const before = copy(authored);
    const providers = trustedCustomProviders(snapshot([authored]));
    expect(providers.filter((entry) => entry.id === "deepseek")).toEqual([authored]);
    expect(authored).toEqual(before);
    const read = attempt(snapshot([authored]), profile(authored));
    expect(read.error).toBeUndefined();
    expect(read.result.credentials["custom.deepseek"]).toEqual({ provider: "custom.deepseek", endpoint: authored.base_url, api_key: "REGISTRY-TEST-SENTINEL:custom_provider:custom.deepseek" });
    expect(read.readSecret.mock.calls).toEqual([["custom_provider", "custom.deepseek"], ["provider", "openai"]]);
  });

  test.each([
    ["disabled", { enabled: false }],
    ["changed endpoint", { base_url: "https://different-registration.example/v1" }],
    ["changed protocol", { protocol: "openai-responses", auth: { mode: "bearer" } }],
    ["changed authentication", { auth: { mode: "bearer" } }],
    ["changed model list", { models: [{ id: "only-the-authored-model" }] }],
  ])("an authored %s does not silently authorize the old bundled target", (_label, changes) => {
    refusedBeforeAnyKey(attempt(snapshot([{ ...bundled(), ...changes }])));
  });

  test.each([
    ["incomplete shipped registration", { id: "deepseek" }],
    ["future registration version", { ...bundled(), config_version: 999 }],
    ["malformed models", { ...bundled(), models: "not-an-array" }],
    ["malformed authentication", { ...bundled(), auth: null }],
  ])("%s remains a refusal instead of becoming preset absence", (_label, authored) => {
    refusedBeforeAnyKey(attempt(snapshot([authored])));
  });

  test("duplicate shipped entries cannot pick a winner or fall back", () => {
    refusedBeforeAnyKey(attempt(snapshot([bundled(), { ...bundled(), enabled: false }])));
  });

  test("even identical duplicate registrations are ambiguous", () => {
    refusedBeforeAnyKey(attempt(snapshot([bundled(), bundled()])));
  });

  test.each([
    ["unavailable storage", { status: "unavailable" }, "skeleton_credential_registry_unavailable"],
    ["no status record", null, "skeleton_credential_registry_invalid"],
    ["explicitly invalid registry", { status: "invalid" }, "skeleton_credential_registry_invalid"],
    ["unknown status", { status: "future" }, "skeleton_credential_registry_invalid"],
    ["malformed provider collection", { status: "ready", providers: "not-an-array" }, "skeleton_credential_registry_invalid"],
    ["null provider collection", snapshot(null), "skeleton_credential_registry_invalid"],
    ["unidentifiable provider entry", snapshot([null]), "skeleton_credential_registry_invalid"],
  ])("%s cannot prove that no registration exists", (_label, stored, code) => {
    refusedBeforeAnyKey(attempt(stored), code);
  });
});
