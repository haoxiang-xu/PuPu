// This module never reads settings or the vault itself. The caller supplies
// Main-owned registrations and the existing Main-internal secret reader.
const QUERY_SCHEMA = "pupu.skeleton_credential_query.v1";
const REQUIREMENTS_SCHEMA = "pupu.skeleton_credential_requirements.v1";
const SCOPE_SCHEMA = "pupu.skeleton_credential_scope.v1";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CUSTOM_REF = /^custom\.([a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?)$/;
const SHIPPED_SLUGS = Object.freeze(["deepseek", "kimi", "kimi-cn"]);
const OFFICIAL = Object.freeze({
  openai: Object.freeze({ protocol: "openai-responses", endpoint: "https://api.openai.com/v1", aliases: ["openaiApiKey", "openai_api_key"] }),
  anthropic: Object.freeze({ protocol: "anthropic", endpoint: "https://api.anthropic.com", aliases: ["anthropicApiKey", "anthropic_api_key"] }),
  gemini: Object.freeze({ protocol: "gemini", endpoint: "https://generativelanguage.googleapis.com", aliases: ["geminiApiKey", "gemini_api_key"] }),
});
const QUERY_FIELDS = ["schema", "mode", "session_id", "owner_chat_id", "interaction_id", "source_attempt_id", "selection", "recipe_name", "memory_agent_config"];
const SCOPE_FIELDS = ["schema", "mode", "session_id", "owner_chat_id", "interaction_id", "source_attempt_id", "selection_digest", "workflows_digest", "launch_digest", "memory_provider"];
const PROFILE_FIELDS = ["id", "credential_ref", "provider", "model", "protocol", "endpoint"];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isRecord = (value) => value !== null && typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const exactText = (value) => typeof value === "string" && value.length > 0 && value === value.trim();
const identifier = (value) => typeof value === "string" && IDENTIFIER.test(value);

const fail = (code = "skeleton_credential_protocol_error") => {
  const messages = {
    skeleton_credential_query_invalid: "Invalid Skeleton credential query",
    skeleton_credential_protocol_error: "Invalid Skeleton credential requirements",
    skeleton_credential_target_mismatch: "Skeleton credential target is not authorized",
    skeleton_credential_registry_invalid: "Stored provider registrations are invalid",
    skeleton_credential_registry_unavailable: "Stored provider registrations are unavailable",
    skeleton_memory_provider_unsupported: "This Memory Agent provider has no scoped credential contract",
    provider_missing_api_key: "Required Skeleton credential is unavailable",
  };
  throw Object.assign(new Error(messages[code]), { code });
};

const closed = (value, fields) => isRecord(value) &&
  Reflect.ownKeys(value).length === fields.length && fields.every((key) =>
    has(value, key) && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), "value"));

// Copy only JSON data without invoking object hooks/getters. This also detaches
// the issued query from subsequent mutations of the renderer's selection.
const jsonCopy = (value, ancestors = new Set(), depth = 0) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (depth > 64 || (typeof value !== "object") || value === null || ancestors.has(value)) fail("skeleton_credential_query_invalid");
  if (!Array.isArray(value) && !isRecord(value)) fail("skeleton_credential_query_invalid");
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    if (Reflect.ownKeys(value).length !== value.length + 1 ||
        !Array.from({ length: value.length }, (_, index) => has(value, index)).every(Boolean)) fail("skeleton_credential_query_invalid");
    result = value.map((item) => jsonCopy(item, ancestors, depth + 1));
  } else {
    result = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || !has(descriptor, "value")) fail("skeleton_credential_query_invalid");
      Object.defineProperty(result, key, { value: jsonCopy(descriptor.value, ancestors, depth + 1), enumerable: true, writable: true, configurable: true });
    }
  }
  ancestors.delete(value);
  return result;
};

const buildSkeletonCredentialQuery = (payload) => {
  if (!isRecord(payload)) return null;
  const options = isRecord(payload.options) ? payload.options : {};
  const resume = typeof payload.mode === "string" && payload.mode.trim().toLowerCase() === "resume_interaction";
  if (!resume && !has(options, "skeleton_selection")) return null;
  // Match the actual HTTP route, not Main's legacy execution aliases. Native
  // requests need an explicit canonical thread; a separate timestamp fallback
  // could never be the identity later checked by the stream route.
  const sessionId = payload.threadId || payload.thread_id;
  const ownerChatId = payload.owner_chat_id;
  const interactionId = resume ? payload.interaction_id : "";
  const sourceAttemptId = resume ? payload.source_attempt_id ?? "" : "";
  if (!identifier(sessionId) || !identifier(ownerChatId) ||
      (resume && !identifier(interactionId)) ||
      (sourceAttemptId !== "" && !identifier(sourceAttemptId))) fail("skeleton_credential_query_invalid");
  const recipeName = resume ? "" : has(options, "recipe_name") ? options.recipe_name : "";
  if (typeof recipeName !== "string") fail("skeleton_credential_query_invalid");
  return {
    schema: QUERY_SCHEMA,
    mode: resume ? "resume" : "start",
    session_id: sessionId,
    owner_chat_id: ownerChatId,
    interaction_id: interactionId,
    source_attempt_id: sourceAttemptId,
    selection: resume ? null : jsonCopy(options.skeleton_selection),
    recipe_name: recipeName,
    memory_agent_config: has(payload, "memory_agent_config") ? jsonCopy(payload.memory_agent_config) : null,
  };
};

const validateQuery = (query) => {
  if (!closed(query, QUERY_FIELDS) || query.schema !== QUERY_SCHEMA ||
      !["start", "resume"].includes(query.mode) || !identifier(query.session_id) || !identifier(query.owner_chat_id) ||
      typeof query.recipe_name !== "string") fail();
  if (query.mode === "start") {
    if (query.interaction_id !== "" || query.source_attempt_id !== "") fail();
  } else if (!identifier(query.interaction_id) ||
      (query.source_attempt_id !== "" && !identifier(query.source_attempt_id)) ||
      query.selection !== null || query.recipe_name !== "") fail();
};

const admittedScope = (scope, query) => {
  if (!closed(scope, SCOPE_FIELDS) || scope.schema !== SCOPE_SCHEMA ||
      ["mode", "session_id", "owner_chat_id", "interaction_id"].some((key) => scope[key] !== query[key]) ||
      typeof scope.selection_digest !== "string" || !DIGEST.test(scope.selection_digest) ||
      typeof scope.workflows_digest !== "string" || !DIGEST.test(scope.workflows_digest) ||
      !exactText(scope.memory_provider)) fail();
  if (query.mode === "start") {
    if (scope.source_attempt_id !== "" || scope.launch_digest !== "") fail();
  } else if (!identifier(scope.source_attempt_id) ||
      (query.source_attempt_id !== "" && scope.source_attempt_id !== query.source_attempt_id) ||
      typeof scope.launch_digest !== "string" || !DIGEST.test(scope.launch_digest)) fail();
  if (scope.memory_provider !== "ollama" && !has(OFFICIAL, scope.memory_provider)) {
    fail("skeleton_memory_provider_unsupported");
  }
  return { ...scope };
};

const validEndpoint = (value) => {
  if (!exactText(value) || !/^https?:\/\//.test(value) || /[\\\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
};

const authorizeProfile = (profile, customProviders) => {
  if (!closed(profile, PROFILE_FIELDS) || !PROFILE_FIELDS.every((key) => exactText(profile[key])) || !validEndpoint(profile.endpoint)) fail();
  const { provider, credential_ref: ref, protocol, endpoint, model } = profile;
  if (has(OFFICIAL, provider)) {
    const official = OFFICIAL[provider];
    if (ref !== provider || endpoint !== official.endpoint || protocol !== official.protocol) fail("skeleton_credential_target_mismatch");
    return { kind: "provider", id: provider, profile };
  }
  if (provider === "ollama") {
    if (ref !== "ollama" || protocol !== "ollama") fail("skeleton_credential_target_mismatch");
    return { kind: null, id: ref, profile };
  }
  const custom = CUSTOM_REF.exec(provider);
  if (!custom || ref !== provider || !Array.isArray(customProviders)) fail("skeleton_credential_target_mismatch");
  const matches = customProviders.filter((entry) => isRecord(entry) && has(entry, "id") && entry.id === custom[1]);
  if (matches.length !== 1) fail("skeleton_credential_target_mismatch");
  const entry = matches[0];
  const expectedAuth = new Map([["openai-responses", "bearer"], ["anthropic", "x-api-key"], ["ollama", "none"]]).get(protocol);
  const auth = entry.auth;
  const authKeys = ["mode", "header_name", "key_label", "key_hint"];
  const authIsEquivalent = isRecord(auth) && has(auth, "mode") && auth.mode === expectedAuth &&
    Reflect.ownKeys(auth).every((key) => typeof key === "string" && authKeys.includes(key) && typeof auth[key] === "string") &&
    (!has(auth, "header_name") || auth.header_name === "" ||
      (expectedAuth === "x-api-key" && auth.header_name.toLowerCase() === "x-api-key"));
  if (entry.config_version !== 1 || entry.enabled !== true || entry.protocol !== protocol || entry.base_url !== endpoint ||
      !expectedAuth || !authIsEquivalent ||
      (has(entry, "extra_headers") && (!isRecord(entry.extra_headers) || Reflect.ownKeys(entry.extra_headers).length !== 0)) ||
      !Array.isArray(entry.models) || entry.models.filter((item) => isRecord(item) && has(item, "id") && item.id === model).length !== 1) {
    fail("skeleton_credential_target_mismatch");
  }
  return { kind: protocol === "ollama" ? null : "custom_provider", id: ref, profile };
};

const resolveSkeletonCredentials = (requirements, query, { customProviders = [], readSecret } = {}) => {
  validateQuery(query);
  if (!isRecord(requirements) || requirements.schema !== REQUIREMENTS_SCHEMA) fail();
  if (requirements.kind === "not_skeleton") {
    if (!closed(requirements, ["schema", "kind"]) || query.mode !== "resume") fail();
    return null;
  }
  if (!closed(requirements, ["schema", "kind", "scope", "profiles"]) || requirements.kind !== "skeleton" ||
      !Array.isArray(requirements.profiles) || requirements.profiles.length === 0) fail();
  const scope = admittedScope(requirements.scope, query);
  const profiles = new Map();
  const targets = new Map();
  const authorized = [];
  // This entire pass, including the memory consumer, precedes every readSecret.
  for (const profile of requirements.profiles) {
    const target = authorizeProfile(profile, customProviders);
    if (profiles.has(profile.id)) fail();
    profiles.set(profile.id, profile);
    const previous = targets.get(target.id);
    if (previous && (previous.profile.provider !== profile.provider || previous.profile.endpoint !== profile.endpoint)) fail("skeleton_credential_target_mismatch");
    if (!previous) { targets.set(target.id, target); authorized.push(target); }
  }
  const reads = new Map();
  const read = (kind, id) => {
    const key = `${kind}:${id}`;
    if (!reads.has(key)) {
      let value;
      try { value = typeof readSecret === "function" ? readSecret(kind, id) : null; }
      catch { fail("provider_missing_api_key"); }
      if (typeof value !== "string" || value.length === 0) fail("provider_missing_api_key");
      reads.set(key, value);
    }
    return reads.get(key);
  };
  const credentials = {};
  const providerOptions = {};
  const addOfficialOptions = (id, secret) => {
    for (const alias of OFFICIAL[id].aliases) providerOptions[alias] = secret;
  };
  for (const target of authorized) {
    if (!target.kind) continue;
    const secret = read(target.kind, target.id);
    credentials[target.id] = { provider: target.profile.provider, endpoint: target.profile.endpoint, api_key: secret };
    if (target.kind === "provider") addOfficialOptions(target.id, secret);
  }
  if (scope.memory_provider !== "ollama") addOfficialOptions(scope.memory_provider, read("provider", scope.memory_provider));
  return { credentials, providerOptions, scope };
};

const trustedCustomProviders = (snapshot) => {
  // Bootstrap omits unreadable namespace rows. Only this private reader's
  // explicit missing/ready result can authorize a bundled fallback.
  let authored;
  if (closed(snapshot, ["status"]) && snapshot.status === "missing") {
    authored = [];
  } else if (closed(snapshot, ["status"]) && snapshot.status === "unavailable") {
    fail("skeleton_credential_registry_unavailable");
  } else if (closed(snapshot, ["status", "providers"]) && snapshot.status === "ready" && Array.isArray(snapshot.providers)) {
    try { authored = jsonCopy(snapshot.providers); }
    catch { fail("skeleton_credential_registry_invalid"); }
    if (authored.some((entry) => !isRecord(entry) || !has(entry, "id") || !exactText(entry.id))) {
      fail("skeleton_credential_registry_invalid");
    }
  } else {
    fail("skeleton_credential_registry_invalid");
  }
  // package.json includes this exact source JSON for Main; the renderer reads
  // the same file. An authored entry owns all of its target/policy fields;
  // never merge it with a preset or discard a disabled/broken registration.
  const presets = require("../../../../src/SERVICEs/custom_provider_presets.json");
  if (!Array.isArray(presets)) fail("skeleton_credential_target_mismatch");
  const shipped = SHIPPED_SLUGS.map((slug) => {
    const matches = presets.filter((entry) => isRecord(entry) && isRecord(entry.provider) && entry.provider.id === slug);
    if (matches.length !== 1) fail("skeleton_credential_target_mismatch");
    return { ...jsonCopy(matches[0].provider), enabled: true };
  });
  return [...shipped.filter((entry) => !authored.some((stored) => stored.id === entry.id)), ...authored];
};

module.exports = { buildSkeletonCredentialQuery, resolveSkeletonCredentials, trustedCustomProviders };
