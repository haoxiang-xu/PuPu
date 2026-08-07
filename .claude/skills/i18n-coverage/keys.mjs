// Pure helpers for i18n key/placeholder manipulation. No file I/O.

/** Flatten nested messages to { "a.b.c": "value" } for string leaves only, in source order. */
export function flattenKeys(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flattenKeys(v, path));
    } else if (typeof v === "string") {
      out[path] = v;
    }
  }
  return out;
}

/** Set of {placeholder} token names appearing in a string. */
export function extractPlaceholders(str) {
  const set = new Set();
  if (typeof str !== "string") return set;
  for (const m of str.matchAll(/\{(\w+)\}/g)) set.add(m[1]);
  return set;
}

/**
 * Merge en's structure (for ordering) with a locale, filling missing keys from `translations`
 * (a flat { "a.b": "译文" } map). Existing locale values are NEVER overwritten (additions only).
 * Orphan keys (present in locale, absent from en) are preserved, appended per-node after en keys.
 */
export function mergeLocale(enNode, localeNode, translations, prefix = "") {
  const out = {};
  const loc = localeNode && typeof localeNode === "object" ? localeNode : {};
  for (const [k, enVal] of Object.entries(enNode ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (enVal && typeof enVal === "object" && !Array.isArray(enVal)) {
      const child = mergeLocale(enVal, loc[k], translations, path);
      if (Object.keys(child).length > 0) out[k] = child;
    } else if (loc[k] !== undefined) {
      out[k] = loc[k]; // keep existing translation untouched
    } else if (Object.prototype.hasOwnProperty.call(translations, path)) {
      out[k] = translations[path]; // fill missing with provided translation
    }
    // else: not present and not translated → stays missing
  }
  for (const [k, v] of Object.entries(loc)) {
    if (!Object.prototype.hasOwnProperty.call(enNode ?? {}, k)) out[k] = v; // preserve orphans
  }
  return out;
}

/** Serialize a locale object exactly like the repo's json: 2-space indent + trailing newline. */
export function serializeLocale(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}
