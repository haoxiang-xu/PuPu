/**
 * import_pipeline.js — pure(ish) logic shared by the import modal and the
 * preset picker (design §8.3 / §8.4). Everything here goes through the store
 * helpers; it never touches localStorage directly. Kept separate from the
 * React components so the branchy conflict/commit logic is unit-testable.
 */

import {
  readCustomProviders,
  findCustomProvider,
  addCustomProvider,
  updateCustomProvider,
  normalizeCustomProvider,
  setCustomProviderEnabled,
  removeCustomProviderSecret,
} from "../../../../SERVICEs/custom_provider_store";

const MAX_SLUG_LEN = 32;

/**
 * Parse a raw string (paste / file text) into an object, or return a
 * structured error the caller can render like a normalize diagnostic.
 */
export const parseImportText = (text) => {
  if (typeof text !== "string" || !text.trim()) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "empty_input",
          path: "",
          message: "No configuration provided.",
          severity: "error",
        },
      ],
    };
  }
  try {
    const parsed = JSON.parse(text);
    return { ok: true, data: parsed };
  } catch (_error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: "invalid_json",
          path: "",
          message: "The file is not valid JSON.",
          severity: "error",
        },
      ],
    };
  }
};

/**
 * Validate a raw import object via the store's normalizer (single source of
 * truth: format/format_version envelope check + full semantic validation).
 * Returns { ok, provider, diagnostics } — same shape as normalizeCustomProvider.
 */
export const validateImport = (raw) => normalizeCustomProvider(raw);

/**
 * Derive a free slug for "rename import": append -2, -3, … until one is not
 * taken, truncating the base so the result stays within the 32-char cap.
 * Returns null if it cannot find a free slug in a sane number of tries.
 */
export const deriveFreeSlug = (baseSlug) => {
  const base = typeof baseSlug === "string" ? baseSlug : "";
  if (!base) {
    return null;
  }
  const taken = new Set(readCustomProviders().map((p) => p.id));
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const room = MAX_SLUG_LEN - suffix.length;
    // Trim any trailing hyphen the truncation might expose (slug can't end "-").
    let stem = base.slice(0, room).replace(/-+$/, "");
    if (!stem) {
      stem = "provider";
    }
    const candidate = `${stem}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
  return null;
};

/**
 * Classify an incoming (already-normalized) provider against the current store.
 *   - { kind: "new" }                       — id is free
 *   - { kind: "conflict", existing, changed }
 *       changed = base_url / auth / extra_headers differs from the stored def
 *       (§8.3: a changed endpoint forces disable + secret wipe on overwrite).
 */
export const classifyConflict = (provider) => {
  const existing = findCustomProvider(provider.id);
  if (!existing) {
    return { kind: "new" };
  }
  const changed = endpointChanged(existing, provider);
  return { kind: "conflict", existing, changed };
};

/** True when base_url, auth, or extra_headers differ (structural endpoint change). */
export const endpointChanged = (existing, incoming) => {
  if ((existing.base_url || "") !== (incoming.base_url || "")) {
    return true;
  }
  if (
    stableStringify(existing.auth || {}) !== stableStringify(incoming.auth || {})
  ) {
    return true;
  }
  if (
    stableStringify(existing.extra_headers || {}) !==
    stableStringify(incoming.extra_headers || {})
  ) {
    return true;
  }
  return false;
};

/** Deterministic JSON for shallow compares (sorted keys, one level is enough here). */
const stableStringify = (obj) => {
  if (obj == null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj).sort();
  return JSON.stringify(keys.map((k) => [k, obj[k]]));
};

/**
 * Commit an import decision. `provider` is the normalized definition.
 * `mode` is one of:
 *   - "new"       — fresh add (id free); always enabled:false, secret empty.
 *   - "overwrite" — id exists; update in place. When the endpoint changed we
 *                   force enabled:false and wipe the stored secret so the user
 *                   must re-enter it (§8.3 / FM20). When it did not change we
 *                   preserve the existing enabled/secret.
 *   - "rename"    — write under a freshly derived slug; always enabled:false.
 *
 * Returns { ok, slug, requiresKey, endpointChanged } or { ok:false, diagnostics }.
 * source is stamped onto new/renamed writes ("import" | "preset").
 */
export const commitImport = (provider, mode, { source = "import" } = {}) => {
  const requiresKey = (provider.auth?.mode || "none") !== "none";

  if (mode === "overwrite") {
    const existing = findCustomProvider(provider.id);
    if (!existing) {
      // Fell through to overwrite but the target vanished — treat as new.
      mode = "new";
    } else {
      const changed = endpointChanged(existing, provider);
      const next = { ...provider };
      if (changed) {
        next.enabled = false;
        removeCustomProviderSecret(provider.id);
      } else {
        next.enabled = existing.enabled === true;
      }
      updateCustomProvider(provider.id, next);
      return {
        ok: true,
        slug: provider.id,
        requiresKey,
        endpointChanged: changed,
      };
    }
  }

  if (mode === "rename") {
    const freeSlug = deriveFreeSlug(provider.id);
    if (!freeSlug) {
      return {
        ok: false,
        diagnostics: [
          {
            code: "rename_failed",
            path: "provider.id",
            message: "Could not derive a free id for rename import.",
            severity: "error",
          },
        ],
      };
    }
    // Re-normalize with the new id so it re-passes slug/reserved rules.
    const renamed = normalizeCustomProvider({ ...provider, id: freeSlug });
    if (!renamed.ok) {
      return { ok: false, diagnostics: renamed.diagnostics };
    }
    addCustomProvider({ ...renamed.provider, enabled: false, source });
    return { ok: true, slug: freeSlug, requiresKey, endpointChanged: false };
  }

  // mode === "new"
  try {
    addCustomProvider({ ...provider, enabled: false, source });
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        {
          code: error?.code || "add_failed",
          path: "provider.id",
          message: error?.message || "Could not add this provider.",
          severity: "error",
        },
      ],
    };
  }
  return { ok: true, slug: provider.id, requiresKey, endpointChanged: false };
};
