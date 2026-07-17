/**
 * custom_provider_store.js — single read/write entry point for user-defined
 * ("custom") model providers.
 *
 * Design: docs/features/custom-model-providers.md (§2, §3, §8.2, §9).
 *
 * Two physically separate stores under settings.model_providers:
 *   - custom_providers[]        — definitions (NEVER contain a key value)
 *   - custom_provider_secrets{} — slug -> API key value (the ONLY place a key lives)
 *
 * This module lives in SERVICEs (not COMPONENTs) because api.unchain.js — a
 * SERVICEs-layer module — also consumes it. Putting it in COMPONENTs would
 * invert the layering (SERVICEs -> COMPONENTs). See design §3.
 *
 * All write operations emit emitModelCatalogRefresh() so the model selector
 * re-reads configured providers.
 */

import { emitModelCatalogRefresh } from "./model_catalog_refresh";
import { normalizeModelInputCapabilities } from "./api.shared";

const SETTINGS_KEY = "settings";

/** Current config schema version for a stored custom provider entry. */
export const CUSTOM_PROVIDER_CONFIG_VERSION = 1;

/** Address prefix for a custom provider's model values. */
export const CUSTOM_PROVIDER_PREFIX = "custom.";

const CONFIG_FORMAT = "pupu-model-provider";
const CONFIG_FORMAT_VERSION = 1;

/** ~256 KB byte cap on an imported/parsed raw payload (§2.3). */
const MAX_RAW_BYTES = 256 * 1024;

/** slug pattern from schema §2.1 (1-32 chars, a-z0-9 and hyphen, no edge hyphen). */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

/** Reserved slugs that would visually impersonate a built-in provider (§2.1 / §4.1). */
const RESERVED_SLUGS = new Set([
  "openai",
  "anthropic",
  "ollama",
  "hyperspace",
  "auto",
  "custom",
  "default",
  "system",
  "unknown",
]);

const PROTOCOLS = new Set(["anthropic", "openai-responses", "ollama"]);
const AUTH_MODES = new Set(["x-api-key", "bearer", "header", "none"]);

/** extra_headers keys that must never carry auth material (§2.3, case-insensitive). */
const REJECTED_HEADER_NAMES = new Set([
  "authorization",
  "x-api-key",
  "api-key",
  "cookie",
  "proxy-authorization",
  "x-auth-token",
]);

/** Prototype-pollution guard: keys forbidden at ANY level (§2.3). */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** extra_headers count cap — mirrors schema maxProperties:10 and backend reject (§2.3). */
const MAX_EXTRA_HEADERS = 10;

/** Secret-shaped field names stripped at any level of imported payloads (§2.3). */
const SECRET_FIELD_PATTERN = /^(api[_-]?key|apikey|token|secret)$/i;

const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Heuristic secret sniff for warning on extra_headers / notes values (§2.3). */
const SUSPICIOUS_VALUE_PATTERN = /(sk-[A-Za-z0-9]|Bearer\s|[A-Za-z0-9_-]{40,})/;

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const nowIso = () => new Date().toISOString();

/**
 * Build a store error: a real Error carrying a `.code` (idiomatic here, see
 * mcp_install.js). Callers match on error.code.
 */
const storeError = (code, message) => {
  const err = new Error(message || code);
  err.code = code;
  return err;
};

/* ------------------------------------------------------------------ */
/* localStorage root read/write (mirrors model_providers/storage.js)   */
/* ------------------------------------------------------------------ */

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "{}");
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const writeSettingsRoot = (root) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
  } catch (_error) {
    /* ignore write errors — parity with existing helpers */
  }
};

const readModelProvidersBranch = (root) =>
  isObject(root.model_providers) ? root.model_providers : {};

/* ------------------------------------------------------------------ */
/* Addressing                                                          */
/* ------------------------------------------------------------------ */

/** "custom.<slug>" address key for a provider. */
export const customProviderKey = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  return cleaned ? `${CUSTOM_PROVIDER_PREFIX}${cleaned}` : "";
};

/**
 * Parse a providerKey / modelValue starting with "custom.".
 * Accepts either "custom.<slug>" or "custom.<slug>:<model...>".
 * Returns { slug, modelId } or null when not a custom key.
 * modelId keeps any embedded colons intact (§4.2).
 */
export const parseCustomProviderKey = (key) => {
  if (typeof key !== "string" || !key.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return null;
  }
  const remainder = key.slice(CUSTOM_PROVIDER_PREFIX.length);
  if (!remainder) {
    return null;
  }
  const colonIndex = remainder.indexOf(":");
  if (colonIndex === -1) {
    return { slug: remainder, modelId: "" };
  }
  return {
    slug: remainder.slice(0, colonIndex),
    modelId: remainder.slice(colonIndex + 1),
  };
};

/* ------------------------------------------------------------------ */
/* Normalize-on-read: definition upgrade + whitelist copy              */
/* ------------------------------------------------------------------ */

/**
 * Upgrade chain skeleton. Keyed by the config_version being upgraded FROM.
 * Each migrator receives an entry at version N and returns an entry at N+1.
 * A future v2 must add MIGRATIONS[1] here (§2.2 / §3).
 */
const MIGRATIONS = {
  // 1 -> 2 : (none yet)
};

const runUpgradeChain = (entry) => {
  let current = entry;
  let version = Number.isInteger(current.config_version)
    ? current.config_version
    : 1;
  // A stored entry authored by a NEWER PuPu (version above what we support)
  // must not be silently downgraded — skip it (§3 "需要升级 PuPu").
  if (version > CUSTOM_PROVIDER_CONFIG_VERSION) {
    return null;
  }
  // Walk the upgrade chain until we reach the current supported version.
  while (version < CUSTOM_PROVIDER_CONFIG_VERSION) {
    const migrate = MIGRATIONS[version];
    if (typeof migrate !== "function") {
      return null; // no path forward — skip this entry (§3)
    }
    const next = migrate(current);
    if (!isObject(next)) {
      return null;
    }
    current = next;
    version += 1;
  }
  return current;
};

/** Whitelist-copy of the auth sub-object from a *stored* (already-normalized) entry. */
const copyStoredAuth = (auth) => {
  const source = isObject(auth) ? auth : {};
  const mode = AUTH_MODES.has(source.mode) ? source.mode : null;
  const result = { mode: mode || "none" };
  if (typeof source.header_name === "string" && source.header_name) {
    result.header_name = source.header_name;
  }
  if (typeof source.key_label === "string") {
    result.key_label = source.key_label;
  }
  if (typeof source.key_hint === "string") {
    result.key_hint = source.key_hint;
  }
  return result;
};

/** Whitelist-copy of a single model entry from a stored (normalized) entry. */
const copyStoredModel = (model) => {
  const source = isObject(model) ? model : {};
  const result = { id: typeof source.id === "string" ? source.id : "" };
  if (typeof source.display_name === "string") {
    result.display_name = source.display_name;
  }
  if (isObject(source.capabilities)) {
    result.capabilities = { ...source.capabilities };
  }
  if (isObject(source.default_payload)) {
    result.default_payload = { ...source.default_payload };
  }
  return result;
};

/**
 * Whitelist-copy a stored entry into a clean object, dropping any stray keys
 * that a corrupt localStorage blob might carry (defence in depth alongside
 * normalizeCustomProvider). Returns null when structurally unusable.
 */
const sanitizeStoredEntry = (entry) => {
  if (!isObject(entry)) {
    return null;
  }
  const upgraded = runUpgradeChain(entry);
  if (!upgraded) {
    return null;
  }
  const slug = typeof upgraded.id === "string" ? upgraded.id.trim() : "";
  if (!slug || !SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    return null;
  }
  if (!PROTOCOLS.has(upgraded.protocol)) {
    return null;
  }
  if (typeof upgraded.base_url !== "string" || !upgraded.base_url) {
    return null;
  }
  const models = Array.isArray(upgraded.models)
    ? upgraded.models.map(copyStoredModel).filter((m) => m.id)
    : [];
  if (models.length === 0) {
    return null;
  }

  const clean = {
    config_version: CUSTOM_PROVIDER_CONFIG_VERSION,
    id: slug,
    display_name:
      typeof upgraded.display_name === "string" && upgraded.display_name
        ? upgraded.display_name
        : slug,
    protocol: upgraded.protocol,
    base_url: upgraded.base_url,
    auth: copyStoredAuth(upgraded.auth),
    models,
    enabled: upgraded.enabled === true,
    source:
      typeof upgraded.source === "string" && upgraded.source
        ? upgraded.source
        : "manual",
    created_at:
      typeof upgraded.created_at === "string" && upgraded.created_at
        ? upgraded.created_at
        : nowIso(),
    updated_at:
      typeof upgraded.updated_at === "string" && upgraded.updated_at
        ? upgraded.updated_at
        : nowIso(),
  };
  if (typeof upgraded.description === "string") {
    clean.description = upgraded.description;
  }
  if (isObject(upgraded.extra_headers)) {
    clean.extra_headers = { ...upgraded.extra_headers };
  }
  if (Number.isInteger(upgraded.timeout_seconds)) {
    clean.timeout_seconds = upgraded.timeout_seconds;
  }
  if (typeof upgraded.default_model === "string" && upgraded.default_model) {
    clean.default_model = upgraded.default_model;
  }
  if (isObject(upgraded.metadata)) {
    clean.metadata = { ...upgraded.metadata };
  }
  if (typeof upgraded.notes === "string") {
    clean.notes = upgraded.notes;
  }
  return clean;
};

/* ------------------------------------------------------------------ */
/* Definition store: read / find / add / update / remove / enable      */
/* ------------------------------------------------------------------ */

/**
 * Read all stored custom provider definitions (never any secret).
 * Corrupt / missing storage returns []. Each entry is normalized-on-read
 * through the upgrade chain and whitelist copy; unusable entries are skipped
 * with a console.warn (no field values printed).
 */
export const readCustomProviders = () => {
  const root = readSettingsRoot();
  const branch = readModelProvidersBranch(root);
  const rawList = Array.isArray(branch.custom_providers)
    ? branch.custom_providers
    : [];
  const result = [];
  const seenSlugs = new Set();
  for (const raw of rawList) {
    const clean = sanitizeStoredEntry(raw);
    if (!clean) {
      // eslint-disable-next-line no-console
      console.warn("custom_provider_store: skipped unusable stored entry");
      continue;
    }
    if (seenSlugs.has(clean.id)) {
      continue; // first-wins on duplicate slug
    }
    seenSlugs.add(clean.id);
    result.push(clean);
  }
  return result;
};

/**
 * Read the custom providers that exist in storage but are UNAVAILABLE in this
 * PuPu build because they were authored by a newer version (config_version
 * above the supported ceiling). readCustomProviders() intentionally omits
 * these (they can't be rendered as usable models); this companion surfaces
 * them so the settings UI can show an "upgrade PuPu" placeholder row instead
 * of them vanishing silently (design §3, C10 layer 2).
 *
 * Returns a list of `{ id, display_name, config_version, unavailable: true,
 * reason: "config_version_too_new" }`. No secret, no other field values — just
 * enough for a placeholder row. Corrupt/missing storage returns [].
 */
export const readUnavailableCustomProviders = () => {
  return readPreservedRawEntries().map((raw) => {
    const slug =
      isObject(raw) && typeof raw.id === "string" ? raw.id.trim() : "";
    const displayName =
      isObject(raw) && typeof raw.display_name === "string" && raw.display_name
        ? raw.display_name
        : slug;
    const version =
      isObject(raw) && Number.isInteger(raw.config_version)
        ? raw.config_version
        : null;
    return {
      id: slug,
      display_name: displayName,
      config_version: version,
      unavailable: true,
      reason: "config_version_too_new",
    };
  });
};

/** Find a single stored definition by slug (normalized-on-read). */
export const findCustomProvider = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return null;
  }
  return readCustomProviders().find((p) => p.id === cleaned) || null;
};

/**
 * True when a raw stored entry was authored by a NEWER PuPu than we support
 * (config_version above the supported ceiling). readCustomProviders() skips
 * these from the usable list (they can't be rendered as models), but a WRITE
 * must NOT drop them — doing so permanently deletes a config the user can only
 * recover by upgrading, and orphans its secret (design §3, C10). Such entries
 * are preserved verbatim across every rewrite.
 */
const isHighVersionRawEntry = (raw) => {
  if (!isObject(raw)) {
    return false;
  }
  const version = Number.isInteger(raw.config_version) ? raw.config_version : 1;
  return version > CUSTOM_PROVIDER_CONFIG_VERSION;
};

/**
 * Read the raw entries that must survive a rewrite untouched: today, entries
 * authored by a newer PuPu (high config_version). Returned verbatim (never
 * normalized) so no field is lost when we persist them again. Keyed by a
 * best-effort slug so we can skip any that collide with a slug in the
 * caller's clean list (the clean list wins for an addressable slug).
 */
const readPreservedRawEntries = () => {
  const branch = readModelProvidersBranch(readSettingsRoot());
  const rawList = Array.isArray(branch.custom_providers)
    ? branch.custom_providers
    : [];
  return rawList.filter(isHighVersionRawEntry);
};

/**
 * Persist the full definition list back to storage (internal helper).
 *
 * `list` carries only the CURRENT-version, normalized entries. Before writing,
 * we re-attach any preserved raw entries (high config_version) that are not
 * shadowed by a slug already present in `list`, so an unrelated write can
 * never silently delete a newer-PuPu config (C10 / §3). Preserved entries are
 * appended after the clean list; ordering among them is unchanged.
 */
const persistCustomProviders = (root, list) => {
  const branch = readModelProvidersBranch(root);
  const cleanSlugs = new Set(
    (Array.isArray(list) ? list : [])
      .map((entry) =>
        isObject(entry) && typeof entry.id === "string" ? entry.id.trim() : "",
      )
      .filter(Boolean),
  );
  const preserved = readPreservedRawEntries().filter((raw) => {
    const rawSlug =
      isObject(raw) && typeof raw.id === "string" ? raw.id.trim() : "";
    // A clean entry for the same slug supersedes the preserved raw one.
    return !(rawSlug && cleanSlugs.has(rawSlug));
  });
  root.model_providers = {
    ...branch,
    custom_providers: [...(Array.isArray(list) ? list : []), ...preserved],
  };
  writeSettingsRoot(root);
};

/**
 * Add a new custom provider. `def` must already be a normalized provider
 * (the output of normalizeCustomProvider().provider). Throws
 * {code:"provider_id_exists"} on slug collision. Written entries are always
 * enabled:false unless the caller passed enabled:true explicitly.
 */
export const addCustomProvider = (def) => {
  if (!isObject(def) || typeof def.id !== "string" || !def.id) {
    throw storeError("invalid_provider_definition", "Definition is missing an id");
  }
  const root = readSettingsRoot();
  const list = readCustomProviders();
  if (list.some((p) => p.id === def.id)) {
    throw storeError("provider_id_exists", `Provider id already exists: ${def.id}`);
  }
  const timestamp = nowIso();
  const entry = {
    ...def,
    config_version: CUSTOM_PROVIDER_CONFIG_VERSION,
    enabled: def.enabled === true,
    source:
      typeof def.source === "string" && def.source ? def.source : "manual",
    created_at: timestamp,
    updated_at: timestamp,
  };
  persistCustomProviders(root, [...list, entry]);
  emitModelCatalogRefresh();
  return entry;
};

/**
 * Update an existing custom provider. The `id` (slug) is immutable after
 * creation (FM12) — any id in `def` is ignored; the addressed slug wins.
 * created_at and source are preserved from the existing entry.
 * Throws {code:"provider_not_found"} when the slug does not exist.
 */
export const updateCustomProvider = (slug, def) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    throw storeError("invalid_provider_definition", "slug is required");
  }
  if (!isObject(def)) {
    throw storeError("invalid_provider_definition", "Definition must be an object");
  }
  const root = readSettingsRoot();
  const list = readCustomProviders();
  const index = list.findIndex((p) => p.id === cleaned);
  if (index === -1) {
    throw storeError("provider_not_found", `Provider not found: ${cleaned}`);
  }
  const existing = list[index];
  const merged = {
    ...def,
    id: existing.id, // immutable
    config_version: CUSTOM_PROVIDER_CONFIG_VERSION,
    enabled: typeof def.enabled === "boolean" ? def.enabled : existing.enabled,
    source: existing.source,
    created_at: existing.created_at,
    updated_at: nowIso(),
  };
  const nextList = [...list];
  nextList[index] = merged;
  persistCustomProviders(root, nextList);
  emitModelCatalogRefresh();
  return merged;
};

/**
 * Remove a custom provider and its secret (linked delete, §3 / A2).
 * No-op if the slug does not exist.
 */
export const removeCustomProvider = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return false;
  }
  const root = readSettingsRoot();
  const list = readCustomProviders();
  const nextList = list.filter((p) => p.id !== cleaned);
  const removed = nextList.length !== list.length;

  // Preserve high-version raw entries authored by a newer PuPu (C10 / §3), but
  // honor an explicit removal of that very slug — the user asked to delete it.
  const branch = readModelProvidersBranch(root);
  const preserved = readPreservedRawEntries().filter((raw) => {
    const rawSlug =
      isObject(raw) && typeof raw.id === "string" ? raw.id.trim() : "";
    return rawSlug !== cleaned;
  });
  const removedHighVersion = readPreservedRawEntries().some((raw) => {
    const rawSlug =
      isObject(raw) && typeof raw.id === "string" ? raw.id.trim() : "";
    return rawSlug === cleaned;
  });

  // Remove the secret map entry in the same write to avoid an orphan.
  const secrets = isObject(branch.custom_provider_secrets)
    ? { ...branch.custom_provider_secrets }
    : {};
  const hadSecret = Object.prototype.hasOwnProperty.call(secrets, cleaned);
  if (hadSecret) {
    delete secrets[cleaned];
  }
  root.model_providers = {
    ...branch,
    custom_providers: [...nextList, ...preserved],
    custom_provider_secrets: secrets,
  };
  writeSettingsRoot(root);

  if (removed || hadSecret || removedHighVersion) {
    emitModelCatalogRefresh();
  }
  return removed || removedHighVersion;
};

/** Toggle a provider's enabled flag. Throws provider_not_found on unknown slug. */
export const setCustomProviderEnabled = (slug, enabled) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    throw storeError("invalid_provider_definition", "slug is required");
  }
  const root = readSettingsRoot();
  const list = readCustomProviders();
  const index = list.findIndex((p) => p.id === cleaned);
  if (index === -1) {
    throw storeError("provider_not_found", `Provider not found: ${cleaned}`);
  }
  const nextList = [...list];
  nextList[index] = {
    ...list[index],
    enabled: enabled === true,
    updated_at: nowIso(),
  };
  persistCustomProviders(root, nextList);
  emitModelCatalogRefresh();
  return nextList[index];
};

/* ------------------------------------------------------------------ */
/* Secret store (independent path; return shapes disjoint from defs)   */
/* ------------------------------------------------------------------ */

/** Read the raw secret value for a slug, or "" when absent. */
export const getCustomProviderSecret = (slug) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return "";
  }
  const branch = readModelProvidersBranch(readSettingsRoot());
  const secrets = isObject(branch.custom_provider_secrets)
    ? branch.custom_provider_secrets
    : {};
  const value = secrets[cleaned];
  return typeof value === "string" ? value : "";
};

/**
 * Store a secret value for a slug. Empty/blank value removes the entry.
 * emitModelCatalogRefresh() runs so the selector re-gates on key presence.
 */
export const setCustomProviderSecret = (slug, value) => {
  const cleaned = typeof slug === "string" ? slug.trim() : "";
  if (!cleaned) {
    return;
  }
  const trimmed = typeof value === "string" ? value.trim() : "";
  const root = readSettingsRoot();
  const branch = readModelProvidersBranch(root);
  const secrets = isObject(branch.custom_provider_secrets)
    ? { ...branch.custom_provider_secrets }
    : {};
  if (trimmed) {
    secrets[cleaned] = trimmed;
  } else {
    delete secrets[cleaned];
  }
  root.model_providers = { ...branch, custom_provider_secrets: secrets };
  writeSettingsRoot(root);
  emitModelCatalogRefresh();
};

/** Remove a secret value for a slug. */
export const removeCustomProviderSecret = (slug) => {
  setCustomProviderSecret(slug, "");
};

/** UI-only boolean: does this slug currently have a stored secret? */
export const hasCustomProviderSecret = (slug) =>
  getCustomProviderSecret(slug).length > 0;

/* ------------------------------------------------------------------ */
/* normalizeCustomProvider — 宽进严出 + full semantic validation       */
/* ------------------------------------------------------------------ */

const pushDiag = (diagnostics, code, path, message, severity = "error") => {
  diagnostics.push({ code, path, message, severity });
};

/** True if any key at any level of `value` is a forbidden prototype key. */
const hasForbiddenKeyDeep = (value) => {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenKeyDeep);
  }
  if (isObject(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return true;
      }
      if (hasForbiddenKeyDeep(value[key])) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Recursively strip secret-shaped fields from a plain-data object graph
 * (used for default_payload). Records a stripped_secret_field warning once
 * when anything was removed. Also drops forbidden prototype keys.
 * Returns a fresh, whitelist-constructed value.
 */
const scrubDataValue = (value, path, diagnostics, state) => {
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      scrubDataValue(item, `${path}[${i}]`, diagnostics, state),
    );
  }
  if (isObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue; // never copy a prototype key
      }
      if (SECRET_FIELD_PATTERN.test(key)) {
        if (!state.strippedSecret) {
          state.strippedSecret = true;
          pushDiag(
            diagnostics,
            "stripped_secret_field",
            `${path}.${key}`,
            "导入文件不应包含密钥，已忽略",
            "warning",
          );
        }
        continue;
      }
      out[key] = scrubDataValue(value[key], `${path}.${key}`, diagnostics, state);
    }
    return out;
  }
  return value;
};

/** Validate a default_payload: JSON scalars + one nesting level, no "__" keys (§2.3). */
const normalizeDefaultPayload = (raw, path, diagnostics, state) => {
  if (!isObject(raw)) {
    return null;
  }
  const scrubbed = scrubDataValue(raw, path, diagnostics, state);
  const out = {};
  let valid = true;
  for (const key of Object.keys(scrubbed)) {
    if (key.startsWith("__")) {
      valid = false;
      break;
    }
    const val = scrubbed[key];
    if (val === null || ["string", "number", "boolean"].includes(typeof val)) {
      out[key] = val;
    } else if (isObject(val)) {
      // one nesting level of scalars only
      let nestedValid = true;
      const nested = {};
      for (const nk of Object.keys(val)) {
        if (nk.startsWith("__")) {
          nestedValid = false;
          break;
        }
        const nv = val[nk];
        if (nv === null || ["string", "number", "boolean"].includes(typeof nv)) {
          nested[nk] = nv;
        } else {
          nestedValid = false;
          break;
        }
      }
      if (!nestedValid) {
        valid = false;
        break;
      }
      out[key] = nested;
    } else {
      valid = false;
      break;
    }
  }
  if (!valid) {
    pushDiag(
      diagnostics,
      "invalid_default_payload",
      path,
      "default_payload 只允许 JSON 标量与一层嵌套，且 key 不以 __ 开头",
      "error",
    );
    return null;
  }
  return out;
};

const KNOWN_PROVIDER_KEYS = new Set([
  "config_version",
  "id",
  "display_name",
  "description",
  "protocol",
  "base_url",
  "auth",
  "extra_headers",
  "timeout_seconds",
  "default_model",
  "models",
  "metadata",
  "notes",
]);

const KNOWN_MODEL_KEYS = new Set([
  "id",
  "display_name",
  "capabilities",
  "default_payload",
]);

const KNOWN_AUTH_KEYS = new Set([
  "mode",
  "header_name",
  "key_label",
  "key_hint",
]);

const KNOWN_CAPABILITY_KEYS = new Set([
  "supports_tools",
  "supports_vision",
  "supports_reasoning",
  "max_tokens",
  "max_context_window_tokens",
]);

/** Detect an obviously-suspicious secret value in a free-text string. */
const looksSuspiciousSecret = (value) =>
  typeof value === "string" && SUSPICIOUS_VALUE_PATTERN.test(value);

const normalizeAuth = (rawAuth, diagnostics, state) => {
  if (!isObject(rawAuth)) {
    pushDiag(diagnostics, "invalid_auth_config", "provider.auth", "auth 缺失或不是对象");
    return null;
  }
  // Auth is a security-sensitive node: unknown keys are a HARD error (§2.2).
  for (const key of Object.keys(rawAuth)) {
    if (FORBIDDEN_KEYS.has(key)) {
      // handled by top-level forbidden check, but be explicit
      pushDiag(diagnostics, "forbidden_key", `provider.auth.${key}`, "非法字段名");
      return null;
    }
    if (!KNOWN_AUTH_KEYS.has(key)) {
      pushDiag(
        diagnostics,
        "invalid_auth_config",
        `provider.auth.${key}`,
        `auth 内不允许未知字段: ${key}`,
      );
      return null;
    }
  }
  const mode = rawAuth.mode;
  if (!AUTH_MODES.has(mode)) {
    pushDiag(diagnostics, "invalid_auth_config", "provider.auth.mode", "auth.mode 非法");
    return null;
  }
  const auth = { mode };
  if (mode === "header") {
    const headerName =
      typeof rawAuth.header_name === "string" ? rawAuth.header_name.trim() : "";
    if (!headerName || !HEADER_NAME_PATTERN.test(headerName)) {
      pushDiag(
        diagnostics,
        "invalid_auth_config",
        "provider.auth.header_name",
        'auth.mode === "header" 时 header_name 必填且需匹配 ^[A-Za-z0-9-]{1,64}$',
      );
      return null;
    }
    auth.header_name = headerName;
  } else if (typeof rawAuth.header_name === "string" && rawAuth.header_name.trim()) {
    // header_name only meaningful for header mode; keep if valid, else drop silently
    const headerName = rawAuth.header_name.trim();
    if (HEADER_NAME_PATTERN.test(headerName)) {
      auth.header_name = headerName;
    }
  }
  if (typeof rawAuth.key_label === "string") {
    auth.key_label = rawAuth.key_label.slice(0, 120);
  }
  if (typeof rawAuth.key_hint === "string") {
    auth.key_hint = rawAuth.key_hint.slice(0, 500);
    if (looksSuspiciousSecret(auth.key_hint)) {
      state.suspicious = true;
    }
  }
  return auth;
};

const normalizeExtraHeaders = (rawHeaders, diagnostics) => {
  if (rawHeaders === undefined) {
    return undefined;
  }
  if (!isObject(rawHeaders)) {
    pushDiag(
      diagnostics,
      "unknown_field",
      "provider.extra_headers",
      "extra_headers 不是对象，已忽略",
      "warning",
    );
    return undefined;
  }
  // Count cap mirrors the schema `maxProperties: 10` and the backend
  // `too many extra_headers` reject (C3): without this, a definition with >10
  // headers validates client-side but fails on every chat/test request.
  if (Object.keys(rawHeaders).length > MAX_EXTRA_HEADERS) {
    pushDiag(
      diagnostics,
      "custom_provider_invalid_headers",
      "provider.extra_headers",
      `extra_headers 最多 ${MAX_EXTRA_HEADERS} 个`,
    );
    return { __error: true };
  }
  const out = {};
  for (const key of Object.keys(rawHeaders)) {
    if (FORBIDDEN_KEYS.has(key)) {
      pushDiag(diagnostics, "forbidden_key", `provider.extra_headers.${key}`, "非法字段名");
      return { __error: true };
    }
    const lower = key.toLowerCase();
    if (REJECTED_HEADER_NAMES.has(lower)) {
      // HARD error — auth material smuggling attempt (§2.3).
      pushDiag(
        diagnostics,
        "auth_header_in_extra_headers",
        `provider.extra_headers.${key}`,
        `extra_headers 不允许携带认证头: ${key}`,
      );
      return { __error: true };
    }
    if (!HEADER_NAME_PATTERN.test(key)) {
      pushDiag(
        diagnostics,
        "unknown_field",
        `provider.extra_headers.${key}`,
        `extra_headers key 不合法，已忽略: ${key}`,
        "warning",
      );
      continue;
    }
    const value = rawHeaders[key];
    if (typeof value !== "string") {
      continue;
    }
    if (looksSuspiciousSecret(value)) {
      pushDiag(
        diagnostics,
        "suspicious_secret_value",
        `provider.extra_headers.${key}`,
        `extra_headers 值疑似包含密钥: ${key}`,
        "warning",
      );
    }
    out[key] = value.slice(0, 200);
  }
  return out;
};

const normalizeCapabilities = (rawCaps, path, diagnostics) => {
  if (!isObject(rawCaps)) {
    return undefined;
  }
  const out = {};
  for (const key of Object.keys(rawCaps)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue;
    }
    if (!KNOWN_CAPABILITY_KEYS.has(key)) {
      pushDiag(
        diagnostics,
        "unknown_field",
        `${path}.capabilities.${key}`,
        `未知 capability 字段，已忽略: ${key}`,
        "warning",
      );
      continue;
    }
    out[key] = rawCaps[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

const normalizeModels = (rawModels, diagnostics, state) => {
  if (!Array.isArray(rawModels) || rawModels.length === 0) {
    pushDiag(diagnostics, "invalid_model_id", "provider.models", "models 至少需要一个条目");
    return null;
  }
  const seen = new Set();
  const models = [];
  rawModels.forEach((rawModel, i) => {
    const path = `provider.models[${i}]`;
    if (!isObject(rawModel)) {
      pushDiag(diagnostics, "invalid_model_id", path, "model 条目不是对象");
      return;
    }
    for (const key of Object.keys(rawModel)) {
      if (FORBIDDEN_KEYS.has(key)) {
        continue;
      }
      if (!KNOWN_MODEL_KEYS.has(key)) {
        pushDiag(
          diagnostics,
          "unknown_field",
          `${path}.${key}`,
          `未知字段，已忽略: ${key}`,
          "warning",
        );
      }
    }
    const id = typeof rawModel.id === "string" ? rawModel.id.trim() : "";
    if (!id || /\s/.test(id) || id.length > 128) {
      pushDiag(diagnostics, "invalid_model_id", `${path}.id`, "model.id 缺失/含空白/过长");
      return;
    }
    if (seen.has(id)) {
      pushDiag(diagnostics, "duplicate_model_id", `${path}.id`, `重复的 model.id: ${id}`);
      return;
    }
    seen.add(id);
    const model = { id };
    if (typeof rawModel.display_name === "string") {
      model.display_name = rawModel.display_name.slice(0, 100);
    }
    const caps = normalizeCapabilities(rawModel.capabilities, path, diagnostics);
    if (caps) {
      model.capabilities = caps;
    }
    if (rawModel.default_payload !== undefined) {
      const payload = normalizeDefaultPayload(
        rawModel.default_payload,
        `${path}.default_payload`,
        diagnostics,
        state,
      );
      if (payload) {
        model.default_payload = payload;
      }
    }
    models.push(model);
  });
  if (models.length === 0) {
    return null;
  }
  return models;
};

const parseBaseUrl = (rawUrl, diagnostics) => {
  if (typeof rawUrl !== "string" || !/^https?:\/\//.test(rawUrl) || rawUrl.length > 2000) {
    pushDiag(diagnostics, "invalid_base_url", "provider.base_url", "base_url 必须以 http(s):// 开头");
    return { valid: false };
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    pushDiag(diagnostics, "invalid_base_url", "provider.base_url", "base_url 无法解析");
    return { valid: false };
  }
  const isLocalhost = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(
    parsed.hostname,
  );
  if (parsed.protocol === "http:" && !isLocalhost) {
    pushDiag(
      diagnostics,
      "insecure_base_url",
      "provider.base_url",
      "非 https 明文传输，请确认你信任该地址",
      "warning",
    );
  }
  return { valid: true, url: rawUrl, insecure: parsed.protocol === "http:" && !isLocalhost };
};

/**
 * Normalize a raw import/edit payload into a clean stored definition.
 *
 * Accepts either the full export envelope { format, format_version, provider }
 * OR a bare provider object (editor path).
 *
 * Returns { ok: true, provider } | { ok: false, diagnostics: [...] }.
 * Even on ok:true, `diagnostics` may carry warnings.
 *
 * 宽进严出 (§2.2): unknown fields at provider/model level -> warning + strip.
 * Security-sensitive nodes (auth, extra_headers auth keys) -> hard error.
 */
export const normalizeCustomProvider = (raw) => {
  const diagnostics = [];
  const state = { strippedSecret: false, suspicious: false };

  // Size guard first (§2.3) — cheap and bounds everything downstream.
  try {
    const serialized = JSON.stringify(raw);
    if (typeof serialized === "string" && serialized.length > MAX_RAW_BYTES) {
      pushDiag(diagnostics, "payload_too_large", "", "配置文件过大 (>256KB)");
      return { ok: false, diagnostics };
    }
  } catch (_error) {
    pushDiag(diagnostics, "invalid_json", "", "配置无法序列化");
    return { ok: false, diagnostics };
  }

  if (!isObject(raw)) {
    pushDiag(diagnostics, "invalid_json", "", "配置不是对象");
    return { ok: false, diagnostics };
  }

  // Prototype-pollution guard over the WHOLE graph (§2.3, before any copy).
  if (hasForbiddenKeyDeep(raw)) {
    pushDiag(diagnostics, "forbidden_key", "", "配置包含非法字段名 (__proto__/constructor/prototype)");
    return { ok: false, diagnostics };
  }

  // Accept full envelope or bare provider.
  let providerRaw;
  if (isObject(raw.provider) && (raw.format !== undefined || raw.format_version !== undefined)) {
    if (raw.format !== undefined && raw.format !== CONFIG_FORMAT) {
      pushDiag(diagnostics, "invalid_format", "format", "format 必须是 pupu-model-provider");
      return { ok: false, diagnostics };
    }
    if (raw.format_version !== undefined) {
      if (raw.format_version > CONFIG_FORMAT_VERSION) {
        pushDiag(
          diagnostics,
          "unsupported_format_version",
          "format_version",
          "此配置由更新版本的 PuPu 导出，请升级",
        );
        return { ok: false, diagnostics };
      }
      if (raw.format_version !== CONFIG_FORMAT_VERSION) {
        pushDiag(diagnostics, "invalid_format", "format_version", "format_version 非法");
        return { ok: false, diagnostics };
      }
    }
    providerRaw = raw.provider;
  } else if (isObject(raw.provider)) {
    providerRaw = raw.provider;
  } else {
    providerRaw = raw; // bare provider object
  }

  if (!isObject(providerRaw)) {
    pushDiag(diagnostics, "invalid_json", "provider", "provider 缺失");
    return { ok: false, diagnostics };
  }

  // config_version: only v1 supported for a stored entry today.
  if (
    providerRaw.config_version !== undefined &&
    providerRaw.config_version !== CUSTOM_PROVIDER_CONFIG_VERSION &&
    providerRaw.config_version > CUSTOM_PROVIDER_CONFIG_VERSION
  ) {
    pushDiag(
      diagnostics,
      "unsupported_format_version",
      "provider.config_version",
      "此配置需要更新版本的 PuPu",
    );
    return { ok: false, diagnostics };
  }

  // Unknown provider-level fields -> warning + strip (宽进).
  for (const key of Object.keys(providerRaw)) {
    if (!KNOWN_PROVIDER_KEYS.has(key)) {
      pushDiag(
        diagnostics,
        "unknown_field",
        `provider.${key}`,
        `未知字段，已忽略: ${key}`,
        "warning",
      );
    }
  }

  // id / slug
  const slug = typeof providerRaw.id === "string" ? providerRaw.id.trim() : "";
  if (!slug || !SLUG_PATTERN.test(slug)) {
    pushDiag(diagnostics, "invalid_provider_id", "provider.id", "id 非法（1-32 位小写字母数字/连字符）");
    return { ok: false, diagnostics };
  }
  if (RESERVED_SLUGS.has(slug)) {
    pushDiag(diagnostics, "reserved_provider_id", "provider.id", `id 是保留字，不允许: ${slug}`);
    return { ok: false, diagnostics };
  }

  // protocol
  if (!PROTOCOLS.has(providerRaw.protocol)) {
    pushDiag(diagnostics, "invalid_protocol", "provider.protocol", "protocol 非法");
    return { ok: false, diagnostics };
  }

  // display_name
  const displayName =
    typeof providerRaw.display_name === "string"
      ? providerRaw.display_name.trim()
      : "";
  if (!displayName) {
    pushDiag(diagnostics, "invalid_display_name", "provider.display_name", "display_name 必填");
    return { ok: false, diagnostics };
  }

  // base_url
  const baseUrlResult = parseBaseUrl(providerRaw.base_url, diagnostics);
  if (!baseUrlResult.valid) {
    return { ok: false, diagnostics };
  }

  // auth (hard errors inside)
  const auth = normalizeAuth(providerRaw.auth, diagnostics, state);
  if (!auth) {
    return { ok: false, diagnostics };
  }

  // extra_headers
  const extraHeaders = normalizeExtraHeaders(providerRaw.extra_headers, diagnostics);
  if (isObject(extraHeaders) && extraHeaders.__error) {
    return { ok: false, diagnostics };
  }

  // models
  const models = normalizeModels(providerRaw.models, diagnostics, state);
  if (!models) {
    return { ok: false, diagnostics };
  }

  // Build clean provider via WHITELIST construction (never Object.assign raw).
  const provider = {
    config_version: CUSTOM_PROVIDER_CONFIG_VERSION,
    id: slug,
    display_name: displayName.slice(0, 100),
    protocol: providerRaw.protocol,
    base_url: baseUrlResult.url,
    auth,
    models,
  };

  if (typeof providerRaw.description === "string") {
    provider.description = providerRaw.description.slice(0, 500);
  }
  if (extraHeaders && Object.keys(extraHeaders).length > 0) {
    provider.extra_headers = extraHeaders;
  }
  if (Number.isFinite(Number(providerRaw.timeout_seconds))) {
    const clamped = Math.min(900, Math.max(5, Math.floor(Number(providerRaw.timeout_seconds))));
    provider.timeout_seconds = clamped;
  }

  // default_model must exist in models, else clear + warning (§2.3).
  if (typeof providerRaw.default_model === "string" && providerRaw.default_model.trim()) {
    const dm = providerRaw.default_model.trim();
    if (models.some((m) => m.id === dm)) {
      provider.default_model = dm;
    } else {
      pushDiag(
        diagnostics,
        "invalid_default_model",
        "provider.default_model",
        "default_model 不在 models 中，已清除",
        "warning",
      );
    }
  }

  if (isObject(providerRaw.metadata)) {
    const meta = {};
    if (Number.isInteger(providerRaw.metadata.revision) && providerRaw.metadata.revision >= 1) {
      meta.revision = providerRaw.metadata.revision;
    }
    if (Object.keys(meta).length > 0) {
      provider.metadata = meta;
    }
  }

  if (typeof providerRaw.notes === "string") {
    provider.notes = providerRaw.notes.slice(0, 2000);
    if (looksSuspiciousSecret(provider.notes)) {
      pushDiag(
        diagnostics,
        "suspicious_secret_value",
        "provider.notes",
        "notes 疑似包含密钥",
        "warning",
      );
    }
  }

  return { ok: true, provider, diagnostics };
};

/* ------------------------------------------------------------------ */
/* buildProviderExportPayload — whitelist construction (§8.2)          */
/* ------------------------------------------------------------------ */

/**
 * Build the shareable export payload for a stored provider by
 * WHITELIST CONSTRUCTION (never copy-then-delete). Private fields
 * (enabled/source/timestamps) and any secret are structurally unreachable:
 * enabled/source/timestamps are simply not in the whitelist, and the secret
 * lives in a different store this function never touches.
 *
 * Returns the export envelope, or null when the slug is unknown.
 */
export const buildProviderExportPayload = (slug) => {
  const def = findCustomProvider(slug);
  if (!def) {
    return null;
  }

  const providerOut = {
    config_version: CUSTOM_PROVIDER_CONFIG_VERSION,
    id: def.id,
    display_name: def.display_name,
    protocol: def.protocol,
    base_url: def.base_url,
    auth: copyStoredAuth(def.auth),
    models: def.models.map((m) => {
      const model = { id: m.id };
      if (typeof m.display_name === "string") {
        model.display_name = m.display_name;
      }
      if (isObject(m.capabilities)) {
        model.capabilities = { ...m.capabilities };
      }
      if (isObject(m.default_payload)) {
        model.default_payload = { ...m.default_payload };
      }
      return model;
    }),
  };

  if (typeof def.description === "string") {
    providerOut.description = def.description;
  }
  if (isObject(def.extra_headers) && Object.keys(def.extra_headers).length > 0) {
    providerOut.extra_headers = { ...def.extra_headers };
  }
  if (Number.isInteger(def.timeout_seconds)) {
    providerOut.timeout_seconds = def.timeout_seconds;
  }
  if (typeof def.default_model === "string" && def.default_model) {
    providerOut.default_model = def.default_model;
  }
  if (isObject(def.metadata) && Object.keys(def.metadata).length > 0) {
    providerOut.metadata = { ...def.metadata };
  }
  if (typeof def.notes === "string") {
    providerOut.notes = def.notes;
  }

  return {
    format: CONFIG_FORMAT,
    format_version: CONFIG_FORMAT_VERSION,
    exported_at: nowIso(),
    provider: providerOut,
  };
};

/**
 * Map a declared custom-model capability object into the catalog input
 * capability shape used across the app (same shape as
 * defaultModelInputCapabilities()). Single source of truth for the mapping so
 * the catalog merge (api.unchain.js) and the chat page agree (design §6.4).
 *
 *   supports_vision === true -> "image" input modality
 *   supports_tools  === false -> supports_tools: false (hides tool selector)
 */
export const mapCustomModelCapabilities = (rawCapabilities) => {
  const rawCaps = isObject(rawCapabilities) ? rawCapabilities : {};
  const inputModalities = ["text"];
  if (rawCaps.supports_vision === true) {
    inputModalities.push("image");
  }
  const capabilityInput = { input_modalities: inputModalities };
  if (rawCaps.supports_tools === false) {
    capabilityInput.supports_tools = false;
  }
  return normalizeModelInputCapabilities(capabilityInput);
};

/**
 * Resolve the input capabilities for a custom.<slug>:<model> value directly
 * from the definition store (no catalog dependency). Returns null when the
 * value is not custom or the model is not declared.
 */
export const resolveCustomModelCapabilities = (modelValue) => {
  const parsed = parseCustomProviderKey(modelValue);
  if (!parsed || !parsed.slug || !parsed.modelId) {
    return null;
  }
  const def = findCustomProvider(parsed.slug);
  if (!def) {
    return null;
  }
  const model = def.models.find((m) => m.id === parsed.modelId);
  if (!model) {
    return null;
  }
  return mapCustomModelCapabilities(model.capabilities);
};

/**
 * Build the whitelist-sanitized definition that ships in
 * options.custom_provider on a chat request. NO enabled / timestamps /
 * source / secret — only what the backend needs to assemble the ModelIO.
 * This is the injection-facing counterpart to buildProviderExportPayload.
 */
export const buildProviderInjectionPayload = (def) => {
  if (!isObject(def) || typeof def.id !== "string" || !def.id) {
    return null;
  }
  const out = {
    slug: def.id,
    id: def.id,
    display_name: def.display_name,
    protocol: def.protocol,
    base_url: def.base_url,
    auth: copyStoredAuth(def.auth),
    models: def.models.map((m) => {
      const model = { id: m.id };
      if (isObject(m.capabilities)) {
        model.capabilities = { ...m.capabilities };
      }
      if (isObject(m.default_payload)) {
        model.default_payload = { ...m.default_payload };
      }
      return model;
    }),
  };
  if (isObject(def.extra_headers) && Object.keys(def.extra_headers).length > 0) {
    out.extra_headers = { ...def.extra_headers };
  }
  if (Number.isInteger(def.timeout_seconds)) {
    out.timeout_seconds = def.timeout_seconds;
  }
  if (typeof def.default_model === "string" && def.default_model) {
    out.default_model = def.default_model;
  }
  return out;
};
