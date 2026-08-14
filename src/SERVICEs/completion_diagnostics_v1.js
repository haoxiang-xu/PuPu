import { sanitizeMemoryV2TraceBundle } from "./runtime_events/memory_v2_trace_presenter";

export const COMPLETION_DIAGNOSTICS_V1_SCHEMA =
  "pupu.completion_diagnostics.v1";
export const COMPLETION_DIAGNOSTICS_V1_MAX_BYTES = 128 * 1024;

const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 64;
const MAX_OBJECT_KEYS = 96;
const MAX_STRING_LENGTH = 8192;
const DIAGNOSTIC_KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
const BLOCKED_KEY_PATTERN =
  /(?:reasoning|chain[_-]?of[_-]?thought|hidden[_-]?thought|password|passwd|secret|credential|api[_-]?key|access[_-]?token|refresh[_-]?token)/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const isPlainObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const utf8ByteLength = (value) => {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
};

const utf8Bytes = (value) => {
  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return bytes;
};

const rotateRight = (value, count) =>
  (value >>> count) | (value << (32 - count));

const sha256Hex = (text) => {
  const source = utf8Bytes(text);
  const bitLength = source.length * 8;
  const paddedLength = Math.ceil((source.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  const view = new DataView(bytes.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const prior15 = words[index - 15];
      const prior2 = words[index - 2];
      const sigma0 =
        rotateRight(prior15, 7) ^
        rotateRight(prior15, 18) ^
        (prior15 >>> 3);
      const sigma1 =
        rotateRight(prior2, 17) ^
        rotateRight(prior2, 19) ^
        (prior2 >>> 10);
      words[index] =
        (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 =
        (h + sum1 + choice + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
};

const canonicalize = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export class CompletionDiagnosticsV1Error extends Error {
  constructor(message) {
    super(`[completion_diagnostics_invalid] ${message}`);
    this.name = "CompletionDiagnosticsV1Error";
    this.code = "completion_diagnostics_invalid";
  }
}

const fail = (message) => {
  throw new CompletionDiagnosticsV1Error(message);
};

const normalizeDiagnosticNode = (value, depth = 0, path = "memory_v2") => {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail(`${path} contains a non-canonical number`);
    }
    return value;
  }
  if (typeof value === "string") {
    if ([...value].length > MAX_STRING_LENGTH) {
      fail(`${path} contains an oversized string`);
    }
    return value;
  }
  if (depth >= MAX_DEPTH) {
    fail(`${path} exceeds the recursive depth limit`);
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      fail(`${path} exceeds the array item limit`);
    }
    return value.map((item, index) =>
      normalizeDiagnosticNode(item, depth + 1, `${path}[${index}]`),
    );
  }
  if (!isPlainObject(value)) fail(`${path} contains a non-JSON value`);
  const keys = Object.keys(value);
  if (keys.length > MAX_OBJECT_KEYS) {
    fail(`${path} exceeds the object key limit`);
  }
  const normalized = {};
  for (const key of keys.sort()) {
    if (!DIAGNOSTIC_KEY_PATTERN.test(key) || BLOCKED_KEY_PATTERN.test(key)) {
      fail(`${path}.${key} is not an admitted diagnostics key`);
    }
    normalized[key] = normalizeDiagnosticNode(
      value[key],
      depth + 1,
      `${path}.${key}`,
    );
  }
  return normalized;
};

export const computeCompletionDiagnosticsDigestV1 = (memoryV2) =>
  sha256Hex(
    canonicalize({
      schema: COMPLETION_DIAGNOSTICS_V1_SCHEMA,
      memory_v2: memoryV2,
    }),
  );

/**
 * Strict renderer admission for the host-owned envelope emitted beside a
 * canonical RunBundle. The existing presenter defines the exact top-level
 * allowlist; this admission layer additionally rejects any value that is not
 * already in the producer's cross-language canonical digest domain.
 */
export const normalizeCompletionDiagnosticsV1 = (value) => {
  if (value === null || value === undefined) return null;
  if (!isPlainObject(value)) fail("envelope must be a plain object");
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "diagnostics_digest" ||
    keys[1] !== "memory_v2" ||
    keys[2] !== "schema"
  ) {
    fail("envelope has an unexpected key set");
  }
  if (value.schema !== COMPLETION_DIAGNOSTICS_V1_SCHEMA) {
    fail("schema is unsupported");
  }
  if (!isPlainObject(value.memory_v2)) {
    fail("memory_v2 must be a plain object");
  }

  const presenterProjection = sanitizeMemoryV2TraceBundle(value.memory_v2);
  if (!presenterProjection) fail("memory_v2 is empty");
  const sourceKeys = Object.keys(value.memory_v2);
  if (
    sourceKeys.length !== Object.keys(presenterProjection).length ||
    sourceKeys.some(
      (key) => !Object.prototype.hasOwnProperty.call(presenterProjection, key),
    )
  ) {
    fail("memory_v2 has a key outside the renderer allowlist");
  }
  const memoryV2 = normalizeDiagnosticNode(value.memory_v2);
  if (
    typeof value.diagnostics_digest !== "string" ||
    !SHA256_PATTERN.test(value.diagnostics_digest)
  ) {
    fail("diagnostics_digest must be a lowercase sha256");
  }
  const expectedDigest = computeCompletionDiagnosticsDigestV1(memoryV2);
  if (value.diagnostics_digest !== expectedDigest) {
    fail("diagnostics_digest does not match the canonical body");
  }

  const normalized = {
    schema: COMPLETION_DIAGNOSTICS_V1_SCHEMA,
    diagnostics_digest: expectedDigest,
    memory_v2: memoryV2,
  };
  if (
    utf8ByteLength(canonicalize(normalized)) >
    COMPLETION_DIAGNOSTICS_V1_MAX_BYTES
  ) {
    fail("envelope exceeds the canonical byte limit");
  }
  return normalized;
};
