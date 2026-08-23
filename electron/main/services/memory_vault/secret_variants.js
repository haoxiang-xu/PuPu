// Single source of truth for "what a secret can look like once something has
// encoded it".
//
// Three call sites need the SAME answer to that question:
//   1. the deposit label guard (a label must never embed the plaintext),
//   2. the sink worker's response leak check (`vault_worker_secret_leak`),
//   3. the executor-result redaction in the Vault service.
//
// They used to each carry their own list, and the lists had drifted (one had
// base64url, another had NFKC, none had all of them). A secret that leaks
// through the weakest list leaks through the whole boundary, so the coverage
// is defined once, here, and every guard consumes it.
//
// Coverage, per plaintext, per Unicode normalization form (raw / NFC / NFKC):
//   raw, trimmed raw, JSON-escaped inner, ASCII-only JSON escaped (and its
//   re-escaped form), encodeURIComponent, form encoding (%20 -> +), full
//   per-byte UTF-8 percent encoding, base64 and base64url (padded and
//   unpadded), UTF-8 hex (lower and upper).
//
// Comparison is additionally case-insensitive (see `containsAnyVariant`), so
// case-folded encodings — hex, percent escapes, base64 that survived a
// case-mangling transport — are covered without doubling the variant set.
//
// This module is deliberately dependency-free and pure: it never logs, never
// throws on hostile input (including lone UTF-16 surrogates), and never
// returns anything derived from a secret to a caller that did not already
// hold that secret.

const REDACTION_PLACEHOLDER = "[REDACTED]";

// Unicode normalization forms a transport may have applied. `normalize()` is
// total for well-formed strings and does not throw on lone surrogates, but it
// stays wrapped: a hostile input must never take down a fail-closed guard.
const NORMALIZATION_FORMS = Object.freeze(["NFC", "NFKC"]);

const normalizationForms = (value) => {
  const forms = [value];
  for (const form of NORMALIZATION_FORMS) {
    try {
      forms.push(value.normalize(form));
    } catch (_error) {
      // Unreachable for strings; remain fail-safe rather than fail-open.
    }
  }
  return forms;
};

// Every byte percent-escaped, including bytes encodeURIComponent leaves bare.
const fullPercentEncoding = (buffer) =>
  [...buffer].map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");

// JSON escaping restricted to ASCII output (the \uXXXX form a strict encoder
// or an ensure_ascii=True Python json.dumps produces). Iterates by code point
// so astral characters become a surrogate pair, and lone surrogates pass
// through as their own \uXXXX escape instead of throwing.
const asciiJsonEscape = (value) => {
  let escaped = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x7f) {
      escaped += JSON.stringify(character).slice(1, -1);
    } else if (codePoint <= 0xffff) {
      escaped += `\\u${codePoint.toString(16).padStart(4, "0")}`;
    } else {
      const normalized = codePoint - 0x10000;
      const high = 0xd800 + (normalized >> 10);
      const low = 0xdc00 + (normalized & 0x3ff);
      escaped += `\\u${high.toString(16)}\\u${low.toString(16)}`;
    }
  }
  return escaped;
};

const jsonInnerEscape = (value) => {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" && encoded.length >= 2
      ? encoded.slice(1, -1)
      : "";
  } catch (_error) {
    return "";
  }
};

const uriComponentEncoding = (value) => {
  try {
    // Also escape the sub-delims encodeURIComponent leaves literal, so the
    // stricter encoders (RFC 3986 style) are covered by the same variant.
    return encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  } catch (_error) {
    // Lone UTF-16 surrogates are not URI-encodable. The buffer-derived
    // variants below still cover the bytes any child runtime can observe.
    return "";
  }
};

// All encodings of ONE normalization form of one plaintext.
const encodingsOf = (value, sink) => {
  const raw = Buffer.from(value, "utf8");

  sink(value);
  sink(value.trim());
  sink(jsonInnerEscape(value));

  const ascii = asciiJsonEscape(value);
  sink(ascii);
  sink(jsonInnerEscape(ascii));

  const uriEncoded = uriComponentEncoding(value);
  if (uriEncoded) {
    sink(uriEncoded);
    // application/x-www-form-urlencoded spells a space as "+".
    sink(uriEncoded.replace(/%20/g, "+"));
  }
  sink(fullPercentEncoding(raw));

  const base64 = raw.toString("base64");
  sink(base64);
  sink(base64.replace(/=+$/u, ""));
  const base64url = raw.toString("base64url");
  sink(base64url);
  sink(base64url.replace(/=+$/u, ""));

  const hex = raw.toString("hex");
  sink(hex);
  sink(hex.toUpperCase());
};

// The one generator. `plaintexts` are the secrets; `extraLiterals` are
// non-secret strings that must be redacted alongside them (Vault handles).
//
// Returns a deduplicated, empty-free array sorted LONGEST FIRST — redaction
// correctness depends on that order, so a long variant is never chopped up by
// an earlier replacement of one of its own substrings.
const secretVariants = (plaintexts = [], extraLiterals = []) => {
  const variants = new Set();
  const sink = (candidate) => {
    if (typeof candidate === "string" && candidate.length > 0) {
      variants.add(candidate);
    }
  };

  for (const literal of extraLiterals || []) sink(literal);

  for (const plaintext of plaintexts || []) {
    if (typeof plaintext !== "string" || plaintext.length === 0) continue;
    for (const form of normalizationForms(plaintext)) {
      if (typeof form !== "string" || form.length === 0) continue;
      encodingsOf(form, sink);
    }
  }

  return [...variants].sort((left, right) => right.length - left.length);
};

// Deterministic case-insensitive containment.
//
// `toLowerCase` (NOT `toLocaleLowerCase`) is locale-independent by spec, so
// this answer does not depend on the machine's locale. Case folding can change
// string LENGTH for a few code points; when it does, the folded comparison is
// skipped for that pair and the exact comparison still stands — never the
// other way round, so folding can only ever ADD detections.
const containsVariant = (haystack, variant) => {
  if (typeof haystack !== "string" || typeof variant !== "string") return false;
  if (variant.length === 0) return false;
  if (haystack.includes(variant)) return true;
  const foldedNeedle = variant.toLowerCase();
  if (foldedNeedle.length !== variant.length) return false;
  const foldedHaystack = haystack.toLowerCase();
  if (foldedHaystack.length !== haystack.length) return false;
  return foldedHaystack.includes(foldedNeedle);
};

const containsAnyVariant = (haystack, variants) => {
  if (typeof haystack !== "string" || haystack.length === 0) return false;
  for (const variant of variants || []) {
    if (containsVariant(haystack, variant)) return true;
  }
  return false;
};

// Convenience wrapper: generate + check in one call, for guards that do not
// reuse the variant list.
const containsAnySecret = (haystack, plaintexts, extraLiterals) =>
  containsAnyVariant(haystack, secretVariants(plaintexts, extraLiterals));

const replaceAllInsensitive = (haystack, needle, replacement) => {
  // Length-changing case folding would make the folded indices meaningless
  // against the original string; fall back to the exact (still correct, just
  // narrower) replacement rather than splicing at a wrong offset.
  const foldedNeedle = needle.toLowerCase();
  const foldedHaystack = haystack.toLowerCase();
  if (
    foldedNeedle.length !== needle.length ||
    foldedHaystack.length !== haystack.length
  ) {
    return haystack.split(needle).join(replacement);
  }
  let output = "";
  let cursor = 0;
  for (;;) {
    const index = foldedHaystack.indexOf(foldedNeedle, cursor);
    if (index === -1) break;
    output += haystack.slice(cursor, index) + replacement;
    cursor = index + needle.length;
  }
  return cursor === 0 ? haystack : output + haystack.slice(cursor);
};

// Replace every variant occurrence with a fixed placeholder. Case-insensitive
// for the same reason the containment check is: an encoder that case-mangled
// the secret must not smuggle it past redaction.
const redactVariants = (value, variants, replacement = REDACTION_PLACEHOLDER) => {
  if (typeof value !== "string" || value.length === 0) return value;
  let output = value;
  for (const variant of variants || []) {
    if (typeof variant !== "string" || variant.length === 0) continue;
    output = replaceAllInsensitive(output, variant, replacement);
  }
  return output;
};

module.exports = {
  secretVariants,
  containsVariant,
  containsAnyVariant,
  containsAnySecret,
  redactVariants,
  REDACTION_PLACEHOLDER,
};
