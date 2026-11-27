const { buildSkeletonCredentialQuery, resolveSkeletonCredentials, trustedCustomProviders } =
  require("../../main/services/unchain/skeleton_credentials");

// The bundled preset is the actual producer. The requirements wrapper is a
// constructed sidecar reply; installed/binary producer replay is separate.
const providers = () => trustedCustomProviders({ status: "missing" });
const query = buildSkeletonCredentialQuery({ threadId: "auth-session", owner_chat_id: "auth-owner",
  options: { skeleton_selection: { schema: "pupu.skeleton_chat_selection.v1", kind: "resource", resource_id: "auth-agent" } } });
const profile = (provider) => ({ id: `custom.${provider.id}:auth`, provider: `custom.${provider.id}`,
  credential_ref: `custom.${provider.id}`, protocol: provider.protocol,
  model: provider.models[0].id, endpoint: provider.base_url, auth_mode: provider.auth.mode });
const body = (rows) => ({ schema: "pupu.skeleton_credential_requirements.v1", kind: "skeleton",
  profiles: rows, scope: { schema: "pupu.skeleton_credential_scope.v1", mode: "start",
    session_id: query.session_id, owner_chat_id: query.owner_chat_id, interaction_id: "", source_attempt_id: "",
    selection_digest: "a".repeat(64), workflows_digest: "b".repeat(64), launch_digest: "", memory_provider: "ollama" } });

test.each(["deepseek", "kimi", "kimi-cn"])("the real %s preset authorizes only its fixed authentication", (id) => {
  const customProviders = providers();
  const row = profile(customProviders.find((provider) => provider.id === id));
  const readSecret = jest.fn(() => "offline-auth-sentinel");
  const result = resolveSkeletonCredentials(body([row]), query, { customProviders, readSecret });
  expect(readSecret.mock.calls).toEqual([["custom_provider", `custom.${id}`]]);
  expect(result.credentials[`custom.${id}`]).toEqual({ provider: row.provider,
    endpoint: row.endpoint, api_key: "offline-auth-sentinel" });
});

test.each(["wrong-mode", "missing-mode", "disabled", "changed-endpoint", "unknown-field"])("%s fails before the first secret read", (fault) => {
  const customProviders = providers();
  const registration = customProviders.find((provider) => provider.id === "kimi");
  const row = profile(registration);
  if (fault === "wrong-mode") row.auth_mode = "x-api-key";
  if (fault === "missing-mode") delete row.auth_mode; // historical Anthropic default is x-api-key
  if (fault === "disabled") registration.enabled = false;
  if (fault === "changed-endpoint") row.endpoint = "https://another.invalid/v1";
  if (fault === "unknown-field") row.extra_auth = "bearer";
  const readSecret = jest.fn();
  expect(() => resolveSkeletonCredentials(body([row]), query, { customProviders, readSecret })).toThrow();
  expect(readSecret).not.toHaveBeenCalled();
});

test("an authored registration's auth policy remains authoritative over the preset", () => {
  const authored = providers().find((provider) => provider.id === "kimi");
  authored.auth.mode = "x-api-key";
  const customProviders = trustedCustomProviders({ status: "ready", providers: [authored] });
  const row = profile(authored);
  const readSecret = jest.fn(() => "offline-auth-sentinel");
  expect(resolveSkeletonCredentials(body([row]), query, { customProviders, readSecret }).credentials[row.provider]).toBeDefined();
  row.auth_mode = "bearer";
  readSecret.mockClear();
  expect(() => resolveSkeletonCredentials(body([row]), query, { customProviders, readSecret })).toThrow();
  expect(readSecret).not.toHaveBeenCalled();
});
