/**
 * secret_capture — Memory V2 P0 renderer-side secret capture (PURE helpers).
 *
 * Explicit capture syntax inside an outgoing chat message:
 *
 *   {{secret:label}}VALUE{{/secret}}
 *
 * VALUE may span multiple lines. Explicit syntax and heuristic hits are ONE
 * decision: both are surfaced by scanOutgoingSecretText and both are settled
 * by useSecretCaptureGate before ANY optimistic user-message write /
 * chat-storage persist / journal entry. On "store", the gate deposits every
 * captured VALUE into the Electron memory vault (write-only control plane) and
 * replaces the whole wrapped span with a non-secret marker that carries ONLY
 * the label and the opaque vault handle:
 *
 *   <secret-handle label="label" handle="pvh1_<64hex>"/>
 *
 * Security invariants owned by this module (mirrors the vault sign-off):
 *  - NO plaintext ever appears in an error message, an error code, a log
 *    line, or a returned marker. Every user-facing message in
 *    SECRET_CAPTURE_MESSAGES is a STATIC string — never interpolate user
 *    content into it.
 *  - Parsing is fail-closed: malformed / unterminated / oversized secret
 *    syntax yields an error plan, and the caller must NOT send or persist
 *    the message.
 *  - This module performs NO bridge/IPC access — deposits happen in the
 *    caller (use_chat_stream) via SERVICEs/bridges/memory_vault_bridge.
 *
 * Label rules mirror the vault service exactly (NFC-normalize + trim,
 * control characters rejected, <=120 code points, <=512 UTF-8 bytes) so a
 * label that passes here cannot be rejected main-side for shape reasons.
 */

const SECRET_OPEN_PREFIX = "{{secret:";
const SECRET_OPEN_SUFFIX = "}}";
const SECRET_CLOSE_TAG = "{{/secret}}";

export const SECRET_CAPTURE_TOTAL_VALUE_MAX_BYTES = 64 * 1024;
const LABEL_MAX_CODE_POINTS = 120;
const LABEL_MAX_BYTES = 512;

/* ASCII-safe control-character check (no control chars in this source). */
const containsControlChars = (value) =>
  Array.from(String(value)).some((char) => {
    const code = char.codePointAt(0);
    return code < 32 || code === 127;
  });

/* STATIC user-facing texts. NEVER interpolate user content into these. */
export const SECRET_CAPTURE_MESSAGES = Object.freeze({
  secret_capture_malformed:
    "Secret syntax is incomplete. Wrap each secret exactly as " +
    "{{secret:label}}value{{/secret}} and send again. " +
    "The message was not sent.",
  secret_capture_invalid_label:
    "A secret label is empty, too long, or contains unsupported " +
    "characters. Use a short plain-text label like " +
    "{{secret:API key}}value{{/secret}}. The message was not sent.",
  secret_capture_empty_value:
    "A secret block is empty. Put the secret value between " +
    "{{secret:label}} and {{/secret}}. The message was not sent.",
  secret_capture_too_large:
    "The wrapped secret content exceeds the 64 KiB limit. " +
    "The message was not sent.",
  secret_capture_heuristic_blocked:
    "This message looks like it contains a plain-text credential. " +
    "Wrap it as {{secret:label}}your-secret{{/secret}} so PuPu can store " +
    "it encrypted, then send again. The message was not sent.",
  secret_capture_vault_unavailable:
    "Encrypted secret storage is unavailable, so a message containing " +
    "{{secret:...}} content was not sent. Plain messages still work.",
  secret_capture_deposit_failed:
    "Storing a wrapped secret failed, so the message was not sent. " +
    "Nothing was shared. Please try again.",
  secret_capture_ambiguous:
    "PuPu could not tell exactly where a credential starts and ends in " +
    "this message, so nothing was sent. Wrap it as " +
    "{{secret:label}}your-secret{{/secret}} and send again.",
  secret_capture_too_many_candidates:
    "This message looks like it contains more than 8 credentials. " +
    "Send them a few at a time. The message was not sent.",
  secret_capture_gate_required:
    "This message looks like it contains a plain-text credential and it " +
    "was not reviewed, so it was not sent. Nothing was shared.",
  secret_capture_legacy_queue_dropped:
    "A queued message saved before this update looked like it contained a " +
    "plain-text credential. It was deleted without being sent.",
});

/* UTF-8 byte length without TextEncoder (keeps the helper environment-free). */
export const utf8ByteLength = (text) => {
  if (typeof text !== "string") return 0;
  let bytes = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
};

export const hasSecretCaptureSyntax = (text) =>
  typeof text === "string" &&
  (text.includes(SECRET_OPEN_PREFIX) || text.includes(SECRET_CLOSE_TAG));

const malformed = () => ({ ok: false, code: "secret_capture_malformed" });

/* Shared by the explicit-syntax parser and normalizeSecretLabel so a label can
   never pass one and fail the other. */
const isUsableLabel = (label) =>
  label.length > 0 &&
  !containsControlChars(label) &&
  Array.from(label).length <= LABEL_MAX_CODE_POINTS &&
  utf8ByteLength(label) <= LABEL_MAX_BYTES;

/**
 * Offset-aware parse of every {{secret:label}}VALUE{{/secret}} block.
 *
 * This is the single source of truth for explicit-syntax parsing. It returns
 * the exact UTF-16 spans the gate needs:
 *
 *   start / end             the WHOLE wrapper, `{{secret:` .. `{{/secret}}`
 *   valueStart / valueEnd   the inner VALUE only
 *
 * Two spans instead of one because the two user decisions need different
 * replacements: storing swaps the whole wrapper for a handle marker, while an
 * explicit plaintext approval swaps the whole wrapper for just its value (the
 * wrapper is PuPu syntax and must never reach the model either way).
 *
 * Fail-closed on malformed / unterminated / bad-label / empty / oversized
 * input — there is no partial result.
 */
export const parseSecretCaptureBlocks = (text) => {
  const source = typeof text === "string" ? text : "";
  if (!source.includes(SECRET_OPEN_PREFIX)) {
    if (source.includes(SECRET_CLOSE_TAG)) return malformed();
    return { ok: true, blocks: [] };
  }

  const blocks = [];
  let cursor = 0;
  let totalValueBytes = 0;

  for (;;) {
    const openStart = source.indexOf(SECRET_OPEN_PREFIX, cursor);
    if (openStart === -1) break;

    const plain = source.slice(cursor, openStart);
    if (plain.includes(SECRET_CLOSE_TAG)) return malformed();

    const labelStart = openStart + SECRET_OPEN_PREFIX.length;
    const labelEnd = source.indexOf(SECRET_OPEN_SUFFIX, labelStart);
    if (labelEnd === -1) return malformed();

    const rawLabel = source.slice(labelStart, labelEnd);
    if (rawLabel.includes("{{") || rawLabel.includes("}}")) return malformed();
    const label = rawLabel.normalize("NFC").trim();
    if (!isUsableLabel(label)) {
      return { ok: false, code: "secret_capture_invalid_label" };
    }

    const valueStart = labelEnd + SECRET_OPEN_SUFFIX.length;
    const closeStart = source.indexOf(SECRET_CLOSE_TAG, valueStart);
    if (closeStart === -1) return malformed();

    const value = source.slice(valueStart, closeStart);
    if (value.includes(SECRET_OPEN_PREFIX)) return malformed();
    if (value.length === 0) {
      return { ok: false, code: "secret_capture_empty_value" };
    }
    totalValueBytes += utf8ByteLength(value);
    if (totalValueBytes > SECRET_CAPTURE_TOTAL_VALUE_MAX_BYTES) {
      return { ok: false, code: "secret_capture_too_large" };
    }

    blocks.push({
      label,
      start: openStart,
      end: closeStart + SECRET_CLOSE_TAG.length,
      valueStart,
      valueEnd: closeStart,
    });
    cursor = closeStart + SECRET_CLOSE_TAG.length;
  }

  if (source.slice(cursor).includes(SECRET_CLOSE_TAG)) return malformed();

  return { ok: true, blocks };
};

const escapeXmlAttribute = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/* Marker carries ONLY the label and the opaque handle — never the value. */
export const buildSecretHandleMarker = (label, handle) =>
  `<secret-handle label="${escapeXmlAttribute(label)}" handle="${escapeXmlAttribute(handle)}"/>`;

/* ---- conservative unwrapped-credential heuristic ------------------------ */

/* Each entry carries a STATIC display label. The label is the ONLY thing
   about a candidate that may reach React state — it is never derived from
   matched text, so it cannot leak a single byte of the value. */
const KNOWN_TOKEN_RULES = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, label: "OpenAI-style API key" },
  { pattern: /\bghp_[A-Za-z0-9]{20,}\b/g, label: "GitHub token" },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, label: "GitHub token" },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: "Slack token" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/g, label: "AWS access key ID" },
];

const KNOWN_TOKEN_PATTERNS = [
  ...KNOWN_TOKEN_RULES.map((rule) => rule.pattern),
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/* key = value / key: value assignment forms only — plain prose mentioning
   "password" never triggers. The value filter keeps this conservative:
   >=8 chars, at least one letter AND one digit, and not an obvious
   placeholder / env reference / template.

   THREE capture groups on purpose: (key)(separator)(value). The separator is
   its own group so the value's UTF-16 start index is computable exactly as
   `match.index + match[1].length + match[2].length` — never by searching for
   the value inside the match, which would mis-locate a value that also occurs
   in the key. Group indices are load-bearing; see
   use_chat_session_state.draft_secret_guard.test.js for the drift sentinel
   that locks this module's boolean behavior to the draft guard's local copy. */
const ASSIGNMENT_PATTERN =
  /(password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth[_-]?token)(["']?\s*[:=]\s*["']?)([^\s"']+)/gi;

/* Static display label per assignment key family. The matched key is
   lowercased and stripped of separators first, so the lookup key comes from a
   CLOSED set — an unknown shape falls back to a static generic label rather
   than echoing user text. */
const ASSIGNMENT_LABELS = Object.freeze({
  password: "Password",
  passwd: "Password",
  pwd: "Password",
  secret: "Secret",
  token: "Token",
  apikey: "API key",
  accesskey: "Access key",
  clientsecret: "Client secret",
  authtoken: "Auth token",
});

const assignmentLabelFor = (rawKey) => {
  const normalized = String(rawKey).toLowerCase().replace(/[_-]/g, "");
  return ASSIGNMENT_LABELS[normalized] || "Credential";
};

const PLACEHOLDER_VALUE_PATTERN =
  /^(<|\$\{|\{\{|\{|\[|\*+$|x{3,}$|your[_-]?|my[_-]|placeholder|example|sample|dummy|change[_-]?me|redacted|hidden|masked|omitted|unset$|none$|null$|undefined$|true$|false$|process\.env|os\.environ|env\[|secret-handle)/i;

/* Trailing sentence punctuation is not part of the credential. Returned so
   the scanner can shrink the replacement range by exactly the same amount the
   heuristic ignores — the two must never disagree about where a value ends. */
const trimTrailingPunctuation = (rawValue) =>
  String(rawValue).replace(/[.,;:!?)\]}]+$/, "");

const looksLikeCredentialValue = (rawValue) => {
  const value = trimTrailingPunctuation(rawValue);
  if (value.length < 8) return false;
  if (PLACEHOLDER_VALUE_PATTERN.test(value)) return false;
  return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
};

/**
 * True when the text appears to contain an UNWRAPPED credential. The caller
 * must then block the send with a STATIC hint — never echo the match.
 *
 * Behavior is frozen: the draft-side guard in use_chat_session_state.js keeps
 * a deliberate local copy and a parity test asserts the two agree exactly.
 */
export const detectLikelySecretAssignment = (text) => {
  const source = typeof text === "string" ? text : "";
  if (!source) return false;
  /* Several KNOWN_TOKEN_PATTERNS carry /g (the scanner iterates them), which
     makes .test() stateful. Reset lastIndex on every probe so this predicate
     stays pure — the same input must always give the same answer. */
  const matchesKnownToken = KNOWN_TOKEN_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    const hit = pattern.test(source);
    pattern.lastIndex = 0;
    return hit;
  });
  if (matchesKnownToken) return true;
  ASSIGNMENT_PATTERN.lastIndex = 0;
  let match = ASSIGNMENT_PATTERN.exec(source);
  while (match) {
    if (looksLikeCredentialValue(match[3])) {
      ASSIGNMENT_PATTERN.lastIndex = 0;
      return true;
    }
    match = ASSIGNMENT_PATTERN.exec(source);
  }
  ASSIGNMENT_PATTERN.lastIndex = 0;
  return false;
};

/**
 * Normalize a user-typed secret NAME with exactly the vault's label rules, so
 * a name accepted here cannot be rejected main-side for shape reasons.
 * Returns "" when the name is unusable; the caller then fails closed with the
 * static secret_capture_invalid_label text.
 *
 * A name is NOT secret material — it is the human-facing handle label that
 * ships in the marker and the vault descriptor. It may safely reach state.
 */
export const normalizeSecretLabel = (value) => {
  if (typeof value !== "string") return "";
  const label = value.normalize("NFC").trim();
  return isUsableLabel(label) ? label : "";
};

/* ---- precise range scanner (renderer secret gate) ------------------------
   Everything above answers "does this look like a credential?" as a boolean.
   The gate needs more: the EXACT UTF-16 [start, end) of every credential, so
   the confirmed message can be rebuilt by slicing the original string and
   splicing in handle markers. Locating a value by searching for its text
   after the fact (indexOf / split+join) is forbidden here — a value that also
   appears elsewhere in the message would be relocated to the wrong span and
   leak the real one. Every range below is derived arithmetically from the
   match offset, so it is exact by construction.

   Range rules:
     explicit    -> replacement span = the whole {{secret:..}}..{{/secret}}
                    wrapper; value span = the inner VALUE only
     assignment  -> the VALUE only (key, separator and quotes stay in place)
     known token -> the whole matched token
     PEM         -> the complete BEGIN..END block, inclusive

   Fail closed (no partial results, nothing sent) on: malformed explicit
   syntax, an unterminated PEM block, two candidates that partially overlap,
   or more than SECRET_CANDIDATE_MAX candidates.

   There is deliberately ONE scanner. An earlier revision had a heuristic-only
   scanner that treated explicit syntax as an EXCLUDED region — which meant a
   message using only {{secret:...}} scanned "clean" and skipped the gate
   entirely, taking a late, uncompensated deposit path deep inside
   runTurnRequest instead. Anything that decides "does this send need the
   gate?" must call scanOutgoingSecretText and nothing else. */

export const SECRET_CANDIDATE_MAX = 8;

const PEM_BEGIN_PATTERN = /-----BEGIN ([A-Z0-9 ]*)PRIVATE KEY-----/g;
const SECRET_HANDLE_MARKER_PATTERN = /<secret-handle\s[^>]*\/>/g;

const ambiguous = () => ({ ok: false, code: "secret_capture_ambiguous" });

/* Markers left by a previous capture. They carry a label and an opaque handle
   and never a value, so a heuristic hit inside one is noise to be dropped. */
const collectHandleMarkerRegions = (source) => {
  const regions = [];
  SECRET_HANDLE_MARKER_PATTERN.lastIndex = 0;
  let markerMatch = SECRET_HANDLE_MARKER_PATTERN.exec(source);
  while (markerMatch) {
    regions.push({
      start: markerMatch.index,
      end: markerMatch.index + markerMatch[0].length,
    });
    markerMatch = SECRET_HANDLE_MARKER_PATTERN.exec(source);
  }
  SECRET_HANDLE_MARKER_PATTERN.lastIndex = 0;
  return regions;
};

const collectRawCandidates = (source) => {
  const raw = [];

  /* Assignments: value range only, computed from the group lengths. */
  ASSIGNMENT_PATTERN.lastIndex = 0;
  let assignment = ASSIGNMENT_PATTERN.exec(source);
  while (assignment) {
    const rawValue = assignment[3];
    if (looksLikeCredentialValue(rawValue)) {
      const start =
        assignment.index + assignment[1].length + assignment[2].length;
      const end = start + trimTrailingPunctuation(rawValue).length;
      raw.push({
        kind: "assignment",
        label: assignmentLabelFor(assignment[1]),
        start,
        end,
      });
    }
    assignment = ASSIGNMENT_PATTERN.exec(source);
  }
  ASSIGNMENT_PATTERN.lastIndex = 0;

  /* Known tokens: the whole match. */
  for (const rule of KNOWN_TOKEN_RULES) {
    rule.pattern.lastIndex = 0;
    let tokenMatch = rule.pattern.exec(source);
    while (tokenMatch) {
      raw.push({
        kind: "known_token",
        label: rule.label,
        start: tokenMatch.index,
        end: tokenMatch.index + tokenMatch[0].length,
      });
      tokenMatch = rule.pattern.exec(source);
    }
    rule.pattern.lastIndex = 0;
  }

  /* PEM: the complete block. An unterminated BEGIN is unrecoverable — we
     cannot know how much of the rest of the message is key material. */
  PEM_BEGIN_PATTERN.lastIndex = 0;
  let pemMatch = PEM_BEGIN_PATTERN.exec(source);
  while (pemMatch) {
    const endTag = `-----END ${pemMatch[1]}PRIVATE KEY-----`;
    const endIndex = source.indexOf(endTag, pemMatch.index);
    if (endIndex === -1) {
      PEM_BEGIN_PATTERN.lastIndex = 0;
      return null;
    }
    const end = endIndex + endTag.length;
    raw.push({ kind: "pem", label: "Private key", start: pemMatch.index, end });
    PEM_BEGIN_PATTERN.lastIndex = end;
    pemMatch = PEM_BEGIN_PATTERN.exec(source);
  }
  PEM_BEGIN_PATTERN.lastIndex = 0;

  return raw;
};

/**
 * Scan one outgoing text for EVERYTHING the secret gate must decide about:
 * explicit {{secret:label}}value{{/secret}} blocks the user wrote on purpose,
 * plus unwrapped credentials the heuristic found.
 *
 * Returns
 *   { ok: true, candidates: [{ id, kind, label, start, end,
 *                              valueStart, valueEnd }] }
 * sorted by start and guaranteed non-overlapping, or { ok: false, code } to
 * fail the send closed. `id` is a stable ordinal key for React lists.
 *
 * `label` is a STATIC kind label for heuristic candidates. For explicit
 * candidates it is the name the user typed between `{{secret:` and `}}` —
 * that is a NAME, structurally outside the value span, and it is already the
 * label that ships in the handle marker and the vault descriptor. It is the
 * one piece of user-authored text allowed to reach React state here.
 */
export const scanOutgoingSecretText = (text) => {
  const source = typeof text === "string" ? text : "";
  if (!source) return { ok: true, candidates: [] };

  /* Explicit syntax first: malformed wrapping is unrecoverable, and we must
     know the wrapper spans before deciding which heuristic hits are noise. */
  const parsed = parseSecretCaptureBlocks(source);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const explicit = parsed.blocks.map((block) => ({
    kind: "explicit",
    label: block.label,
    start: block.start,
    end: block.end,
    valueStart: block.valueStart,
    valueEnd: block.valueEnd,
  }));

  const raw = collectRawCandidates(source);
  if (raw === null) return ambiguous();

  /* A heuristic hit fully inside an explicit block or an existing handle
     marker is already accounted for; one that only PARTIALLY overlaps means
     the rules disagree about the boundary, so the whole scan fails closed. */
  const excluded = [
    ...explicit.map((candidate) => ({
      start: candidate.start,
      end: candidate.end,
    })),
    ...collectHandleMarkerRegions(source),
  ];
  const kept = [];
  for (const candidate of raw) {
    let skip = false;
    for (const region of excluded) {
      const disjoint =
        candidate.end <= region.start || candidate.start >= region.end;
      if (disjoint) continue;
      const contained =
        candidate.start >= region.start && candidate.end <= region.end;
      if (!contained) return ambiguous();
      skip = true;
      break;
    }
    if (!skip) kept.push(candidate);
  }

  /* Widest-first so a nested duplicate (e.g. `api_key=sk-...` matching both
     the assignment rule and the known-token rule) collapses into the single
     wider span instead of being reported twice. */
  const sorted = [...kept].sort((a, b) =>
    a.start !== b.start ? a.start - b.start : b.end - a.end,
  );
  const merged = [];
  for (const candidate of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || candidate.start >= previous.end) {
      merged.push({
        ...candidate,
        /* A heuristic candidate's replacement span IS its value span. */
        valueStart: candidate.start,
        valueEnd: candidate.end,
      });
      continue;
    }
    /* Overlaps the previous span. Fully nested collapses; a partial overlap
       means two rules disagree about the boundary — fail the whole scan. */
    if (candidate.end <= previous.end) continue;
    return ambiguous();
  }

  const all = [...explicit, ...merged].sort((a, b) => a.start - b.start);
  if (all.length === 0) return { ok: true, candidates: [] };
  if (all.length > SECRET_CANDIDATE_MAX) {
    return { ok: false, code: "secret_capture_too_many_candidates" };
  }

  return {
    ok: true,
    candidates: all.map((candidate, index) => ({
      id: `cand-${index}`,
      kind: candidate.kind,
      label: candidate.label,
      start: candidate.start,
      end: candidate.end,
      valueStart: candidate.valueStart,
      valueEnd: candidate.valueEnd,
    })),
  };
};

/**
 * Slice out each candidate's plaintext. The result is secret material: it may
 * only live in a private ref/closure and must never reach React state, a log,
 * an error message, or storage.
 *
 * Reads valueStart/valueEnd so an explicit candidate yields the VALUE without
 * the {{secret:...}} wrapper — the wrapper is PuPu syntax, not the credential.
 */
export const extractSecretCandidateValues = (text, candidates) => {
  const source = typeof text === "string" ? text : "";
  return (Array.isArray(candidates) ? candidates : []).map((candidate) =>
    source.slice(
      Number.isInteger(candidate.valueStart)
        ? candidate.valueStart
        : candidate.start,
      Number.isInteger(candidate.valueEnd) ? candidate.valueEnd : candidate.end,
    ),
  );
};

/**
 * Rebuild the outgoing text with every candidate range replaced by its handle
 * marker. handles[i] belongs to candidates[i].
 *
 * Returns null (caller must NOT send) if anything about the inputs is off:
 * a missing handle, a range out of bounds, or ranges that are not strictly
 * ascending and non-overlapping. There is no partial application.
 */
export const applySecretHandleRanges = (text, candidates, handles) => {
  const source = typeof text === "string" ? text : "";
  const list = Array.isArray(candidates) ? candidates : [];
  const handleList = Array.isArray(handles) ? handles : [];
  if (list.length === 0 || list.length !== handleList.length) return null;

  let out = "";
  let cursor = 0;
  for (let index = 0; index < list.length; index += 1) {
    const { start, end, label } = list[index];
    const handle = handleList[index];
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < cursor ||
      end <= start ||
      end > source.length ||
      typeof handle !== "string" ||
      !handle.trim()
    ) {
      return null;
    }
    out += source.slice(cursor, start);
    out += buildSecretHandleMarker(label, handle.trim());
    cursor = end;
  }
  return out + source.slice(cursor);
};

/**
 * Rebuild the outgoing text for an explicit PLAINTEXT approval.
 *
 * Every candidate span is replaced by its own VALUE. For a heuristic
 * candidate that is a no-op (the spans coincide), so the message goes out
 * exactly as typed. For an explicit candidate it strips the
 * {{secret:label}} / {{/secret}} wrapper while keeping the credential the
 * user deliberately chose to send — the wrapper is PuPu syntax and must never
 * reach the model, whichever decision the user made.
 *
 * Returns null (caller must NOT send) on the same inputs applySecretHandleRanges
 * rejects: out-of-bounds, non-ascending, or overlapping ranges.
 */
export const applySecretPlainRanges = (text, candidates) => {
  const source = typeof text === "string" ? text : "";
  const list = Array.isArray(candidates) ? candidates : [];
  if (list.length === 0) return source;

  let out = "";
  let cursor = 0;
  for (const candidate of list) {
    const { start, end } = candidate;
    const valueStart = Number.isInteger(candidate.valueStart)
      ? candidate.valueStart
      : start;
    const valueEnd = Number.isInteger(candidate.valueEnd)
      ? candidate.valueEnd
      : end;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < cursor ||
      end <= start ||
      end > source.length ||
      valueStart < start ||
      valueEnd > end ||
      valueEnd <= valueStart
    ) {
      return null;
    }
    out += source.slice(cursor, start);
    out += source.slice(valueStart, valueEnd);
    cursor = end;
  }
  return out + source.slice(cursor);
};
