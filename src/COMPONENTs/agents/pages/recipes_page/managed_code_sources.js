/* Code text the host keeps for a Code node (#357, G1).
 *
 * The host owns it; the document does not carry it. What the document carries
 * is the one shape the host itself writes into a node it manages —
 *
 *   config.code.source = {kind: "file", path: "__pupu_code__/sha256/<sha>.py"}
 *
 * where <sha> is the SHA-256 of the text's UTF-8 bytes — and the text travels
 * beside the document: in a v2 resource aggregate's `contents`, and in a v2
 * Save's `managed_sources` (docs/implementation/managed-code-interface-v2.md).
 *
 * So the editor keeps the same shape, and that is the whole design. Typing
 * writes the generated path for the new text into the node, and the text into
 * a map keyed by that SHA. The node carries its own text identity wherever it
 * goes — moved, reordered, deleted, duplicated, undone, inside an embedded
 * graph — because it is part of the node, and a text keyed by its own digest
 * can never be the text of the wrong node: there is nothing to keep in sync.
 * Which node a text belongs to is decided only when Save is built, from where
 * each node is in the document Save sends, which is the one address the host
 * accepts (a typed position, never a node id or an entry id).
 *
 * A referenced Agent is not walked: it is another resource, opened and saved
 * as itself. An embedded graph is walked: it is part of this one.
 *
 * Nothing here substitutes. A node naming generated text that is not on hand
 * is refused, never sent as an empty string, and a reply that does not
 * describe its own document exactly is refused, never trimmed to the part
 * that does. */

export const EDIT_SCHEMA = "pupu.skeleton-edit.v2";
export const RESOURCE_SCHEMA = "pupu.skeleton-resource.v2";
export const VERSION_SCHEMA = "pupu.skeleton-workflow-version.v2";
export const PUBLISH_SCHEMA = "pupu.skeleton-publish.v2";
export const PREFLIGHT_SCHEMA = "pupu.skeleton-preflight.v2";
export const MANIFEST_SCHEMA = "pupu.skeleton-code-sources.v1";
export const MANAGED_PREFIX = "__pupu_code__/";
export const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
export const MAX_BINDINGS = 256;
export const PROTOCOL_ERROR = "managed_source_protocol_error";

const MANAGED_PATH = /^__pupu_code__\/sha256\/([0-9a-f]{64})\.py$/;
const DIGEST = /^[0-9a-f]{64}$/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const closed = (value, keys) =>
  record(value) && Object.keys(value).length === keys.length && keys.every((key) => own(value, key));

/* A text→digest table keyed by data: a SHA is data, and an inherited member
   must never answer for one. */
export function empty_sources() {
  return Object.create(null);
}

export function managed_path(sha) {
  return `${MANAGED_PREFIX}sha256/${sha}.py`;
}

/* The digest a source names, when it is exactly the host's generated shape. */
export function managed_sha(source) {
  if (!closed(source, ["kind", "path"]) || source.kind !== "file" || typeof source.path !== "string") return null;
  const match = MANAGED_PATH.exec(source.path);
  return match ? match[1] : null;
}

/* Whether a path is in the host's reserved space at all — a malformed name
   there is not a workspace file either. */
export function is_reserved_path(path) {
  return typeof path === "string" && path.startsWith(MANAGED_PREFIX);
}

/* ── Bytes ─────────────────────────────────────────────────────────────── */

/* Strict UTF-8: the host encodes with Python's `str.encode("utf-8")`, which
   refuses a lone surrogate, so this refuses it too rather than writing the
   replacement character a lenient encoder would. */
export function utf8_bytes(text) {
  if (typeof text !== "string" || LONE_SURROGATE.test(text)) return null;
  /* Well-formed from here, so the platform encoder and the loop below give
     the same bytes; the loop is for an environment without one. */
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
  const out = [];
  for (let index = 0; index < text.length; index += 1) {
    let point = text.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff) {
      point = 0x10000 + ((point - 0xd800) << 10) + (text.charCodeAt(index + 1) - 0xdc00);
      index += 1;
    }
    if (point < 0x80) out.push(point);
    else if (point < 0x800) out.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point < 0x10000) out.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    else out.push(0xf0 | (point >> 18), 0x80 | ((point >> 12) & 0x3f), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
  }
  return Uint8Array.from(out);
}

const K = Uint32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/* SHA-256 (FIPS 180-4) of bytes, synchronously: the digest is the node's
   text identity and is written in the same edit as the text, so it cannot
   wait for an asynchronous `crypto.subtle` answer that a later keystroke
   could overtake. */
export function sha256_bytes(bytes) {
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const bits = length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  const h = Uint32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let t = 0; t < 16; t += 1) w[t] = view.getUint32(offset + t * 4);
    for (let t = 16; t < 64; t += 1) {
      const a = w[t - 15];
      const b = w[t - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let t = 0; t < 64; t += 1) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      k = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + k) >>> 0;
  }
  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
}

export function sha256_text(text) {
  const bytes = utf8_bytes(text);
  return bytes ? sha256_bytes(bytes) : null;
}

/* What the host would refuse about one text, said before Save is pressed. */
export function text_problem(text) {
  if (typeof text !== "string") return { code: "invalid_type", message: "Code text must be text." };
  const bytes = utf8_bytes(text);
  if (!bytes) return { code: "invalid_value", message: "This code contains a character that is not valid Unicode, so it cannot be stored." };
  if (bytes.length > MAX_SOURCE_BYTES) return { code: "limit_bytes", message: "This code is larger than 4 MiB, the most one Code node can store." };
  return null;
}

/* ── Where Code nodes are ──────────────────────────────────────────────── */

/* Every Code node this resource owns, with its full typed address: the
   resource's own nodes and the nodes of every embedded graph inside it, at
   any depth. The host's own walk (`_code_sources`) visits the same places —
   embedded Subagent entries and Hook Workflows are part of this resource. */
export function owned_code_nodes(document) {
  const found = [];
  const walk = (body, prefix) => {
    if (!record(body) || !Array.isArray(body.nodes)) return;
    body.nodes.forEach((node, index) => {
      if (!record(node) || !record(node.config)) return;
      const address = [...prefix, "nodes", index];
      if (node.type === "code") {
        found.push({ node_path: address, node });
      } else if (node.type === "subagent_pool" && Array.isArray(node.config.subagents)) {
        node.config.subagents.forEach((entry, offset) => {
          const source = record(entry) ? entry.source : null;
          if (record(source) && source.kind === "embedded") {
            walk(source.document, [...address, "config", "subagents", offset, "source", "document"]);
          }
        });
      } else if (node.type === "hooks_pool" && Array.isArray(node.config.hooks)) {
        node.config.hooks.forEach((entry, offset) => {
          const source = record(entry) ? entry.workflow : null;
          if (record(source) && source.kind === "embedded") {
            walk(source.document, [...address, "config", "hooks", offset, "workflow", "document"]);
          }
        });
      }
    });
  };
  walk(document, []);
  return found;
}

const source_of = (node) => (record(node.config.code) ? node.config.code.source : undefined);

/* The node a manifest row addresses, read exactly as the host reads it
   (`_code_at`): a step is `nodes, i` and, between graphs, `config,
   subagents, j, source, document` or `config, hooks, j, workflow, document`
   through the corresponding embedded pool entry. Anything else addresses nothing. */
export function code_node_at(document, address) {
  if (!Array.isArray(address) || address.length < 2 || address.length > 256) return null;
  const index_ok = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  let body = document;
  let offset = 0;
  for (;;) {
    if (offset + 2 > address.length || address[offset] !== "nodes" || !index_ok(address[offset + 1])) return null;
    if (!record(body) || !Array.isArray(body.nodes) || address[offset + 1] >= body.nodes.length) return null;
    const node = body.nodes[address[offset + 1]];
    if (!record(node) || !record(node.config)) return null;
    offset += 2;
    if (offset === address.length) return node.type === "code" ? node : null;
    const subagent = node.type === "subagent_pool" && address[offset + 1] === "subagents" && address[offset + 3] === "source";
    const hook = node.type === "hooks_pool" && address[offset + 1] === "hooks" && address[offset + 3] === "workflow";
    const entries = subagent ? node.config.subagents : hook ? node.config.hooks : null;
    if (
      offset + 5 >= address.length ||
      address[offset] !== "config" ||
      !index_ok(address[offset + 2]) ||
      address[offset + 4] !== "document" ||
      (!subagent && !hook) ||
      !Array.isArray(entries) ||
      address[offset + 2] >= entries.length
    ) {
      return null;
    }
    const entry = entries[address[offset + 2]];
    const source = record(entry) ? (subagent ? entry.source : entry.workflow) : null;
    if (!record(source) || source.kind !== "embedded") return null;
    body = source.document;
    offset += 5;
  }
}

/* The host's canonical order for manifest rows: element by element, a string
   step before a number step, then by value; a shorter address first. */
function compare_addresses(left, right) {
  const count = Math.min(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    const a = left[index];
    const b = right[index];
    const rank_a = typeof a === "string" ? 0 : 1;
    const rank_b = typeof b === "string" ? 0 : 1;
    if (rank_a !== rank_b) return rank_a - rank_b;
    if (a !== b) return a < b ? -1 : 1;
  }
  return left.length - right.length;
}

/* ── The reply ─────────────────────────────────────────────────────────── */

function protocol(message) {
  return { ok: false, error: { code: PROTOCOL_ERROR, path: [], message } };
}

/* A v2 resource aggregate, admitted on its own terms here as well as in Main:
 * the consumer that renders the text is the last one before the author, and
 * trusting a transport to have checked the shape is not checking it.
 *
 * Exactly the five keys; the resource's document; one row per owned Code
 * node, in canonical order, each at an address that reaches a Code node whose
 * source names exactly that row's digest; one body per digest, sorted, whose
 * bytes hash to it; and no owned Code node naming generated text the manifest
 * does not bind — that would be a node whose text nobody can show. The
 * aggregate digest is the host's identity and stays opaque: it is Python's
 * canonical JSON, which this side cannot reproduce number for number.
 *
 * Answers `{ok, resource, sources}` with the text table, or a refusal. */
export function admit_resource_aggregate(value) {
  if (!closed(value, ["schema", "resource", "sources_manifest", "contents", "content_digest"])) {
    return protocol("The resource reply is not a v2 aggregate.");
  }
  if (value.schema !== RESOURCE_SCHEMA) return protocol("The resource reply has an unsupported schema.");
  const resource = value.resource;
  if (!record(resource) || !record(resource.document) || typeof resource.id !== "string" || resource.document.id !== resource.id) {
    return protocol("The resource reply does not carry its own document.");
  }
  if (typeof resource.edit_token !== "string" || !resource.edit_token) {
    return protocol("The resource reply carries no edit token.");
  }
  const admitted = admit_sources(resource.document, value);
  return admitted.ok ? { ok: true, resource, sources: admitted.sources } : admitted;
}

/* A published Workflow revision, as `getManagedSkeletonWorkflowVersion` and
 * `publishManagedSkeletonWorkflow` answer it (#357 Workflow Call): the same
 * aggregate with `version` in place of `resource`, and `version` exactly the
 * host's six fields. Its document must be a Workflow and name its own id, and
 * its text is admitted by the same rules as a resource's. A revision is
 * immutable on the host (its rows refuse update and delete), which is what
 * lets a caller keep the admitted answer. */
export function admit_version_aggregate(value) {
  if (!closed(value, ["schema", "version", "sources_manifest", "contents", "content_digest"])) {
    return protocol("The version reply is not a v2 aggregate.");
  }
  if (value.schema !== VERSION_SCHEMA) return protocol("The version reply has an unsupported schema.");
  const version = value.version;
  if (!closed(version, ["workflow_id", "revision_id", "ordinal", "definition_digest", "document", "dependencies"])) {
    return protocol("The version reply does not carry a Workflow revision.");
  }
  if (typeof version.workflow_id !== "string" || !version.workflow_id || typeof version.revision_id !== "string" || !version.revision_id
      || !Number.isSafeInteger(version.ordinal) || version.ordinal < 1 || typeof version.definition_digest !== "string"
      || !DIGEST.test(version.definition_digest) || !Array.isArray(version.dependencies)) {
    return protocol("The Workflow revision's identity is malformed.");
  }
  if (!record(version.document) || version.document.id !== version.workflow_id || version.document.kind !== "workflow") {
    return protocol("The Workflow revision does not carry its own Workflow document.");
  }
  const admitted = admit_sources(version.document, value);
  return admitted.ok ? { ok: true, version, sources: admitted.sources } : admitted;
}

/* The manifest and bodies of one aggregate, against the document they
   describe. */
function admit_sources(document, value) {
  if (typeof value.content_digest !== "string" || !DIGEST.test(value.content_digest)) {
    return protocol("The reply carries no aggregate digest.");
  }
  const manifest = value.sources_manifest;
  if (!closed(manifest, ["schema", "entries"]) || manifest.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.entries)) {
    return protocol("The source manifest is not a v1 manifest.");
  }
  if (manifest.entries.length > MAX_BINDINGS || !Array.isArray(value.contents) || value.contents.length > MAX_BINDINGS) {
    return protocol("The reply binds more sources than the host allows.");
  }
  const bound = new Set();
  const needed = new Set();
  let previous = null;
  for (const entry of manifest.entries) {
    if (!closed(entry, ["node_path", "sha256"]) || typeof entry.sha256 !== "string" || !DIGEST.test(entry.sha256)) {
      return protocol("A source binding is malformed.");
    }
    const node = code_node_at(document, entry.node_path);
    if (!node || managed_sha(source_of(node)) !== entry.sha256) {
      return protocol("A source binding does not match the Code node at its address.");
    }
    const key = JSON.stringify(entry.node_path);
    if (bound.has(key)) return protocol("A Code node is bound twice.");
    if (previous && compare_addresses(previous, entry.node_path) >= 0) {
      return protocol("The source bindings are not in canonical order.");
    }
    previous = entry.node_path;
    bound.add(key);
    needed.add(entry.sha256);
  }
  const sources = empty_sources();
  let total = 0;
  let last = "";
  for (const row of value.contents) {
    if (!closed(row, ["sha256", "text"]) || typeof row.sha256 !== "string" || !DIGEST.test(row.sha256) || typeof row.text !== "string") {
      return protocol("A source body is malformed.");
    }
    const bytes = utf8_bytes(row.text);
    if (!bytes || bytes.length > MAX_SOURCE_BYTES) return protocol("A source body is not storable text.");
    if (row.sha256 <= last) return protocol("The source bodies are not sorted and unique.");
    if (!needed.has(row.sha256)) return protocol("A source body is not bound to any Code node.");
    if (sha256_bytes(bytes) !== row.sha256) return protocol("A source body does not match its digest.");
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) return protocol("The source bodies exceed the host's limit.");
    last = row.sha256;
    sources[row.sha256] = row.text;
  }
  if (Object.keys(sources).length !== needed.size) return protocol("A bound source has no body.");
  for (const { node_path, node } of owned_code_nodes(document)) {
    const source = source_of(node);
    const path = record(source) ? source.path : undefined;
    if (!is_reserved_path(path)) continue;
    if (managed_sha(source) === null || !bound.has(JSON.stringify(node_path))) {
      return protocol("A Code node names host-kept text that the reply does not carry.");
    }
  }
  return { ok: true, sources };
}

/* ── The save ──────────────────────────────────────────────────────────── */

/* The complete owned set for one Save: one row for every owned Code node
   whose source is host-kept text, at the address it has in THIS document,
   with the text its digest names. Built from the document being sent, at the
   moment it is sent, so a node that moved, was reordered, deleted or
   duplicated is bound where it now is, and none is left out.

   A node naming generated text that is not on hand is refused here: sending
   it without its text is a Save the host refuses (`managed_source_required`)
   at best, and an empty string in its place would be a different program. */
export function managed_rows(document, sources) {
  const rows = [];
  for (const { node_path, node } of owned_code_nodes(document)) {
    const source = source_of(node);
    const path = record(source) ? source.path : undefined;
    if (!is_reserved_path(path)) continue;
    const where = ["document", ...node_path, "config", "code", "source"];
    const sha = managed_sha(source);
    if (sha === null) {
      return { ok: false, error: { code: "managed_source_invalid", path: where, message: "A Code node names a host-kept source this editor cannot read." } };
    }
    if (!record(sources) || !own(sources, sha) || typeof sources[sha] !== "string") {
      return { ok: false, error: { code: "managed_source_missing", path: where, message: "The text of a Code node is not loaded here, so nothing was saved. Reopen this Agent before saving." } };
    }
    const problem = text_problem(sources[sha]);
    if (problem) return { ok: false, error: { code: problem.code, path: where, message: problem.message } };
    rows.push({ node_path, text: sources[sha] });
  }
  return { ok: true, rows };
}

export function save_edit(document, expected_edit_token, sources) {
  const rows = managed_rows(document, sources);
  if (!rows.ok) return rows;
  return {
    ok: true,
    edit: {
      schema: EDIT_SCHEMA,
      document,
      expected_edit_token: typeof expected_edit_token === "string" && expected_edit_token ? expected_edit_token : null,
      managed_sources: rows.rows,
    },
  };
}

/* ── Keeping the table small ───────────────────────────────────────────── */

/* The digests any of these documents name: a text is kept while a document
   the author can still reach — on screen, one undo away, or held by a
   conflict — names it, and let go once none does. */
export function referenced_shas(documents) {
  const found = new Set();
  documents.forEach((document) => {
    owned_code_nodes(document).forEach(({ node }) => {
      const sha = managed_sha(source_of(node));
      if (sha) found.add(sha);
    });
  });
  return found;
}

export function merged_sources(base, added, keep) {
  const next = empty_sources();
  [base, added].forEach((table) => {
    if (!record(table)) return;
    Object.keys(table).forEach((sha) => {
      if (DIGEST.test(sha) && typeof table[sha] === "string" && (!keep || keep.has(sha))) next[sha] = table[sha];
    });
  });
  return next;
}
