const {
  buildSkeletonCredentialQuery,
  resolveSkeletonCredentials,
  trustedCustomProviders,
} = require("../../main/services/unchain/skeleton_credentials");

const selection = {
  schema: "pupu.skeleton_chat_selection.v1",
  kind: "resource",
  resource_id: "agent-one",
};
const start = (changes = {}) => ({
  threadId: "session-one",
  owner_chat_id: "chat-one",
  options: { skeleton_selection: selection },
  ...changes,
});
const query = () => buildSkeletonCredentialQuery(start());
const profile = (changes = {}) => ({
  id: "openai:model-one",
  credential_ref: "openai",
  provider: "openai",
  model: "model-one",
  protocol: "openai-responses",
  endpoint: "https://api.openai.com/v1",
  ...changes,
});
const requirements = (profiles = [profile()], changes = {}) => ({
  schema: "pupu.skeleton_credential_requirements.v1",
  kind: "skeleton",
  scope: {
    schema: "pupu.skeleton_credential_scope.v1",
    mode: "start",
    session_id: "session-one",
    owner_chat_id: "chat-one",
    interaction_id: "",
    source_attempt_id: "",
    selection_digest: "a".repeat(64),
    workflows_digest: "b".repeat(64),
    launch_digest: "",
    memory_provider: "openai",
  },
  profiles,
  ...changes,
});
const registration = (changes = {}) => ({
  config_version: 1,
  id: "private-one",
  enabled: true,
  protocol: "openai-responses",
  base_url: "https://private.example/v1",
  auth: { mode: "bearer" },
  models: [{ id: "private-model" }],
  ...changes,
});
const customProfile = (changes = {}) => profile({
  id: "custom.private-one:private-model",
  credential_ref: "custom.private-one",
  provider: "custom.private-one",
  model: "private-model",
  endpoint: "https://private.example/v1",
  ...changes,
});
const secrets = () => jest.fn((kind, id) => `SENTINEL:${kind}:${id}`);
const resolve = (body, overrides = {}, issued = query()) =>
  resolveSkeletonCredentials(body, issued, {
    customProviders: [],
    readSecret: secrets(),
    ...overrides,
  });

describe("Skeleton credential discovery query", () => {
  test("ordinary first sends remain outside the native path", () => {
    expect(buildSkeletonCredentialQuery({ options: { modelId: "openai:model" } })).toBeNull();
    expect(buildSkeletonCredentialQuery({ options: { recipe_name: "Legacy" } })).toBeNull();
  });

  test("native query preserves exact selection and public memory config without caller credentials", () => {
    const memory = { displayName: "Memory Agent", additionalInstructions: "", provider: "anthropic", modelId: "memory-model" };
    const payload = start({
      memory_agent_config: memory,
      options: { skeleton_selection: selection, skeleton_credentials: { ATTACKER: "value" }, skeleton_credential_scope: { ATTACKER: true } },
    });
    const before = JSON.stringify(payload);
    expect(buildSkeletonCredentialQuery(payload)).toEqual({
      schema: "pupu.skeleton_credential_query.v1", mode: "start",
      session_id: "session-one", owner_chat_id: "chat-one",
      interaction_id: "", source_attempt_id: "", selection,
      recipe_name: "", memory_agent_config: memory,
    });
    expect(JSON.stringify(payload)).toBe(before);
  });

  test("native discovery follows HTTP identities rather than Main-only aliases", () => {
    // BC-033 replaces the old alias-precedence assertion: the stream route
    // never reads execution/session aliases or camelCase ownerChatId.
    expect(buildSkeletonCredentialQuery(start({ executionId: "execution-one", session_id: "ignored" }))).toMatchObject({ session_id: "session-one", owner_chat_id: "chat-one" });
    expect(buildSkeletonCredentialQuery(start({ execution_id: " padded ", threadId: "valid" })).session_id).toBe("valid");
    expect(() => buildSkeletonCredentialQuery(start({ owner_chat_id: undefined, ownerChatId: "chat-alias" }))).toThrow();
    expect(() => buildSkeletonCredentialQuery(start({ owner_chat_id: 7 }))).toThrow();
    expect(() => buildSkeletonCredentialQuery(start({ owner_chat_id: "" }))).toThrow();
  });

  test("any own native selector triggers discovery instead of silently falling back", () => {
    expect(buildSkeletonCredentialQuery(start({ options: { skeleton_selection: null } }))).toMatchObject({ selection: null });
    expect(buildSkeletonCredentialQuery(start({ options: { skeleton_selection: "malformed" } }))).toMatchObject({ selection: "malformed" });
    expect(buildSkeletonCredentialQuery({ options: Object.create({ skeleton_selection: selection }) })).toBeNull();
  });

  test("all resumes query even empty options, ignoring fresh selector and recipe", () => {
    // Use the snake_case identities consumed by the actual resume route.
    const issued = buildSkeletonCredentialQuery(start({ mode: "resume_interaction", interaction_id: "interaction-one", source_attempt_id: "root-one", options: { skeleton_selection: selection, recipe_name: "Fresh Legacy" } }));
    expect(issued).toMatchObject({ mode: "resume", interaction_id: "interaction-one", source_attempt_id: "root-one", selection: null, recipe_name: "" });
    expect(buildSkeletonCredentialQuery(start({ mode: "resume_interaction", interaction_id: "interaction-one", options: {} }))).toMatchObject({ mode: "resume", source_attempt_id: "" });
    expect(() => buildSkeletonCredentialQuery(start({ mode: "resume_interaction", options: {} }))).toThrow();
  });

  test("invalid exact IDs and non-JSON config never gain a canonical query", () => {
    for (const id of [null, 1, " x", "x ", "", "x\n", "x/y"]) {
      expect(() => buildSkeletonCredentialQuery(start({ threadId: id }))).toThrow();
    }
    expect(() => buildSkeletonCredentialQuery(start({ memory_agent_config: { bad: undefined } }))).toThrow();
  });
});

describe("strict Main-owned credential target admission", () => {
  test("mixed official closure and keyless Ollama read only exact targets once", () => {
    const readSecret = secrets();
    const profiles = [profile(), profile({ id: "openai:second", model: "second" }),
      profile({ id: "anthropic:model", provider: "anthropic", credential_ref: "anthropic", protocol: "anthropic", endpoint: "https://api.anthropic.com" }),
      profile({ id: "gemini:model", provider: "gemini", credential_ref: "gemini", protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com" }),
      profile({ id: "ollama:local", provider: "ollama", credential_ref: "ollama", protocol: "ollama", endpoint: "http://localhost:11434" })];
    const body = requirements(profiles);
    const before = JSON.stringify(body);
    const result = resolve(body, { readSecret });
    expect(readSecret.mock.calls).toEqual([["provider", "openai"], ["provider", "anthropic"], ["provider", "gemini"]]);
    expect(result.credentials).toEqual({
      openai: { provider: "openai", endpoint: "https://api.openai.com/v1", api_key: "SENTINEL:provider:openai" },
      anthropic: { provider: "anthropic", endpoint: "https://api.anthropic.com", api_key: "SENTINEL:provider:anthropic" },
      gemini: { provider: "gemini", endpoint: "https://generativelanguage.googleapis.com", api_key: "SENTINEL:provider:gemini" },
    });
    expect(result.providerOptions).toEqual({ openaiApiKey: "SENTINEL:provider:openai", openai_api_key: "SENTINEL:provider:openai", anthropicApiKey: "SENTINEL:provider:anthropic", anthropic_api_key: "SENTINEL:provider:anthropic", geminiApiKey: "SENTINEL:provider:gemini", gemini_api_key: "SENTINEL:provider:gemini" });
    expect(result.scope).toEqual(body.scope);
    expect(JSON.stringify(body)).toBe(before);
  });

  test("Memory Agent official provider is acquired independently of Kernel provider", () => {
    const body = requirements(); body.scope.memory_provider = "gemini";
    const readSecret = secrets();
    const result = resolve(body, { readSecret });
    expect(readSecret.mock.calls).toEqual([["provider", "openai"], ["provider", "gemini"]]);
    expect(result.credentials.gemini).toBeUndefined();
    expect(result.providerOptions.gemini_api_key).toBe("SENTINEL:provider:gemini");
    expect(result.providerOptions.api_key).toBeUndefined();
  });

  test("custom Memory Agent remains an explicit unsupported consumer before decrypt", () => {
    const body = requirements(); body.scope.memory_provider = "custom.private-one";
    const readSecret = secrets();
    expect(() => resolve(body, { readSecret, customProviders: [registration()] })).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });

  test("two configured custom providers remain separately endpoint-bound", () => {
    const body = requirements([customProfile(), customProfile({ id: "custom.private-two:model", credential_ref: "custom.private-two", provider: "custom.private-two", endpoint: "https://two.example/api", protocol: "anthropic" })]);
    body.scope.memory_provider = "ollama";
    const readSecret = secrets();
    const result = resolve(body, { readSecret, customProviders: [registration(), registration({ id: "private-two", base_url: "https://two.example/api", protocol: "anthropic", auth: { mode: "x-api-key" } })] });
    expect(readSecret.mock.calls).toEqual([["custom_provider", "custom.private-one"], ["custom_provider", "custom.private-two"]]);
    expect(result.credentials["custom.private-two"]).toMatchObject({ provider: "custom.private-two", endpoint: "https://two.example/api", api_key: "SENTINEL:custom_provider:custom.private-two" });
    expect(result.providerOptions).toEqual({});
  });

  test("configured keyless custom Ollama requires no vault access", () => {
    const body = requirements([customProfile({ protocol: "ollama" })]); body.scope.memory_provider = "ollama";
    const readSecret = secrets();
    expect(resolve(body, { readSecret, customProviders: [registration({ protocol: "ollama", auth: { mode: "none" } })] }).credentials).toEqual({});
    expect(readSecret).not.toHaveBeenCalled();
  });

  test.each([
    ["official endpoint", profile({ endpoint: "https://attacker.example/v1" })],
    ["official protocol", profile({ protocol: "anthropic" })],
    ["official ref", profile({ credential_ref: "anthropic" })],
    ["unknown provider", profile({ provider: "unknown", credential_ref: "unknown" })],
    ["prototype provider", profile({ provider: "__proto__", credential_ref: "__proto__" })],
    ["URL credentials", customProfile({ endpoint: "https://user:pass@private.example/v1" })],
    ["URL query", customProfile({ endpoint: "https://private.example/v1?x=1" })],
  ])("all authorizations precede any key read: %s", (_name, bad) => {
    const readSecret = secrets();
    expect(() => resolve(requirements([profile(), bad]), { readSecret, customProviders: [registration()] })).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", []], ["disabled", [registration({ enabled: false })]],
    ["endpoint", [registration({ base_url: "https://other.example/v1" })]],
    ["protocol", [registration({ protocol: "anthropic" })]],
    ["model", [registration({ models: [{ id: "other-model" }] })]],
    ["unsupported auth", [registration({ auth: { mode: "header", header_name: "x-api-key" } })]],
    ["wrong auth", [registration({ auth: { mode: "x-api-key" } })]],
    ["alternate bearer header", [registration({ auth: { mode: "bearer", header_name: "X-Private-Key" } })]],
    ["unknown auth transport", [registration({ auth: { mode: "bearer", extra_headers: { "X-Key": "value" } } })]],
    ["malformed auth label", [registration({ auth: { mode: "bearer", key_label: { toString: null } } })]],
    ["headers", [registration({ extra_headers: { "X-Other": "value" } })]],
    ["malformed headers", [registration({ extra_headers: [] })]],
    ["new config", [registration({ config_version: 99 })]],
    ["duplicate registry", [registration(), registration()]],
  ])("configured target refuses %s before decrypt", (_name, customProviders) => {
    const readSecret = secrets();
    expect(() => resolve(requirements([profile(), customProfile()]), { readSecret, customProviders })).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });

  test("shared refs cannot be retargeted, and duplicate profile IDs are refused", () => {
    const readSecret = secrets();
    for (const row of [profile(), profile({ model: "other" }), customProfile({ credential_ref: "openai" })]) {
      expect(() => resolve(requirements([profile(), row]), { readSecret, customProviders: [registration()] })).toThrow();
    }
    expect(readSecret).not.toHaveBeenCalled();
  });

  test("empty, throwing or non-string vault outcomes fail with safe typed errors", () => {
    for (const value of [null, "", 4, {}]) {
      try { resolve(requirements(), { readSecret: () => value }); throw new Error("unexpected success"); }
      catch (error) { expect(error.code).toBe("provider_missing_api_key"); expect(error.message).not.toContain("SENTINEL"); }
    }
    expect(() => resolve(requirements(), { readSecret: () => { throw new Error("SENTINEL_SECRET"); } })).toThrow("Required Skeleton credential is unavailable");
  });
});

describe("closed requirements and scope", () => {
  test.each([
    (r) => { r.extra = true; },
    (r) => { r.scope.extra = true; },
    (r) => { delete r.scope.owner_chat_id; },
    (r) => { r.scope.owner_chat_id = "other"; },
    (r) => { r.scope.session_id = "other"; },
    (r) => { r.scope.selection_digest = "A".repeat(64); },
    (r) => { r.scope.workflows_digest = "x"; },
    (r) => { r.scope.launch_digest = "c".repeat(64); },
    (r) => { r.scope.interaction_id = "wrong"; },
    (r) => { r.profiles[0].extra = true; },
    (r) => { delete r.profiles[0].model; },
    (r) => { r.profiles[0].provider = { toString: null }; },
    (r) => { r.profiles = []; },
    (r) => { r.profiles = [null]; },
    (r) => { r.profiles = "bad"; },
  ])("malformed wire is refused before a vault read (%#)", (mutate) => {
    const body = requirements(); mutate(body);
    const readSecret = secrets();
    expect(() => resolve(body, { readSecret })).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });

  test("not_skeleton is legal only for an exact closed resume outcome", () => {
    const other = { schema: "pupu.skeleton_credential_requirements.v1", kind: "not_skeleton" };
    const issued = buildSkeletonCredentialQuery(start({ mode: "resume_interaction", interaction_id: "interaction-one" }));
    const readSecret = secrets();
    expect(resolve(other, { readSecret }, issued)).toBeNull();
    expect(() => resolve(other)).toThrow();
    expect(() => resolve({ ...other, scope: {} }, { readSecret }, issued)).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
  });

  test("resume is bound to its original interaction, source and launch digest", () => {
    const issued = buildSkeletonCredentialQuery(start({ mode: "resume_interaction", interaction_id: "interaction-one", source_attempt_id: "root-one" }));
    const body = requirements(); Object.assign(body.scope, { mode: "resume", interaction_id: "interaction-one", source_attempt_id: "root-one", launch_digest: "c".repeat(64) });
    expect(resolve(body, {}, issued).scope).toEqual(body.scope);
    body.scope.source_attempt_id = "other-root";
    const readSecret = secrets();
    expect(() => resolve(body, { readSecret }, issued)).toThrow();
    expect(readSecret).not.toHaveBeenCalled();
    const noSource = { ...issued, source_attempt_id: "" };
    body.scope.source_attempt_id = "root-one";
    expect(resolve(body, {}, noSource).scope.source_attempt_id).toBe("root-one");
  });
});

describe("Main-owned custom registration inventory", () => {
  test("authored registration stays whole while unregistered shipped slugs use their bundled source", () => {
    // BC-032 intentionally replaces the old bundle-wins policy for Skeleton
    // authorization; the dedicated registry suite covers disabled/invalid rows.
    const authored = registration({ id: "deepseek", base_url: "https://registered.example/v1" });
    const snapshot = { status: "ready", providers: [registration(), authored] };
    const providers = trustedCustomProviders(snapshot);
    expect(providers.map((p) => p.id).sort()).toEqual(["deepseek", "kimi", "kimi-cn", "private-one"]);
    const deepseek = providers.find((p) => p.id === "deepseek");
    expect(deepseek).toEqual(authored);
    expect(providers.find((p) => p.id === "sap-hyperspace")).toBeUndefined();
    const row = deepseek.models[0];
    const body = requirements([profile({ id: "custom.deepseek:model", provider: "custom.deepseek", credential_ref: "custom.deepseek", model: row.id, protocol: deepseek.protocol, endpoint: deepseek.base_url })]);
    body.scope.memory_provider = "ollama";
    expect(resolve(body, { customProviders: providers }).credentials["custom.deepseek"].endpoint).toBe(deepseek.base_url);
  });

  test("only a proven missing registry permits the shipped fallback", () => {
    expect(trustedCustomProviders({ status: "missing" }).map((p) => p.id).sort()).toEqual(["deepseek", "kimi", "kimi-cn"]);
    expect(() => trustedCustomProviders(null)).toThrow();
    expect(() => trustedCustomProviders({ namespaces: Object.create({ model_providers: { custom_providers: [registration()] } }) })).toThrow();
  });

  test("the single shared preset source is included in the packaged Main files", () => {
    const pkg = require("../../../package.json");
    expect(pkg.build.files).toContain("src/SERVICEs/custom_provider_presets.json");
  });
});
