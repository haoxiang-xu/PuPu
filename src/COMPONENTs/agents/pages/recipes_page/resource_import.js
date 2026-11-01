import { safe_text } from "./document_values";
import { owned_code_nodes } from "./managed_code_sources";

/* Importing one Agent or Workflow file (#357).
 *
 * The file is the host's exported source text, and that text is what goes
 * back: it is read as strict UTF-8 (no replacement characters, the BOM kept)
 * and never parsed-and-reserialized, because the host's numbers — `1.0`,
 * `-0.0`, integers past 2^53 — and its digests are only true of the bytes it
 * wrote. It is parsed here for one purpose: to show what it holds and which
 * Code nodes need a local Python. Every such node is chosen by the author;
 * nothing is matched by name, and nothing in the file names an executable. */

export const IMPORT_SCHEMA = "pupu.skeleton-import.v2";
export const SNAPSHOT_SCHEMA = "pupu.skeleton-code-snapshot.v1";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function read_bytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("The file could not be read."));
    reader.readAsArrayBuffer(file);
  });
}

/* `{ok: true, text}` or `{ok: false, message}`. The limit is the host's
   advertised file size, checked before anything is read. */
export async function read_import_file(file, max_bytes) {
  if (!file || typeof file.size !== "number") return { ok: false, message: "No file was chosen." };
  if (Number.isSafeInteger(max_bytes) && file.size > max_bytes) {
    return { ok: false, message: `The file is ${file.size} bytes; the host takes at most ${max_bytes}.` };
  }
  if (typeof TextDecoder !== "function") {
    return { ok: false, message: "This build cannot read a file as UTF-8 text, so nothing was read." };
  }
  let bytes;
  try {
    bytes = await read_bytes(file);
  } catch (error) {
    return { ok: false, message: `The file could not be read: ${safe_text(error && error.message)}` };
  }
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) };
  } catch (_error) {
    return { ok: false, message: "The file is not UTF-8 text. Nothing in it was changed or replaced; choose the file as it was exported." };
  }
}

/* Why the text cannot be imported, or its document: an exported snapshot
   (the host's closed five-field frame) or a native graph. Only for showing
   it — the text itself is what is sent. */
export function import_document(text) {
  let value;
  const stripped = typeof text === "string" && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  try {
    value = JSON.parse(stripped);
  } catch (_error) {
    return { ok: false, message: "The file is not JSON." };
  }
  if (!record(value)) return { ok: false, message: "The file is not an exported Agent or Workflow." };
  if (own(value, "schema")) {
    if (value.schema !== SNAPSHOT_SCHEMA || !record(value.document)) {
      return { ok: false, message: `The file is a “${safe_text(value.schema)}”, not an export this build reads.` };
    }
    return { ok: true, document: value.document, snapshot: true };
  }
  if (!own(value, "schema_version")) return { ok: false, message: "The file is not an exported Agent or Workflow." };
  return { ok: true, document: value, snapshot: false };
}

/* The two places an embedded graph owned by this resource can sit, exactly
   as `owned_code_nodes` and the host address them: an embedded Subagent
   entry, and an embedded Hook Workflow. Read by the pool's type and the
   address's own member and slot together — never by guessing. */
const EMBEDDED_CONTAINERS = [
  { pool: "subagent_pool", member: "subagents", slot: "source", says: (pool, entry) => `${pool} › ${entry}` },
  { pool: "hooks_pool", member: "hooks", slot: "workflow", says: (pool, entry) => `${pool} › hook ${entry}` },
];

/* One owned Code node and where it sits, said in the author's words: the
   step's id and the embedded graphs it is inside. The address is the key —
   two embedded graphs can each hold a step with the same id. */
export function import_occurrences(document) {
  return owned_code_nodes(document).map(({ node_path, node }) => {
    const inside = [];
    let body = document;
    for (let at = 0; at + 2 < node_path.length; at += 7) {
      const pool = body.nodes[node_path[at + 1]];
      const container = EMBEDDED_CONTAINERS.find((item) =>
        pool.type === item.pool && node_path[at + 2] === "config" && node_path[at + 3] === item.member &&
        node_path[at + 5] === item.slot && node_path[at + 6] === "document");
      /* `owned_code_nodes` only ever walks into these two; anything else is
         an address this build cannot describe, and is said so. */
      if (!container) {
        inside.push("(an embedded graph this build cannot name)");
        break;
      }
      const entry = pool.config[container.member][node_path[at + 4]];
      inside.push(container.says(safe_text(pool.id), safe_text(record(entry) ? entry.id : node_path[at + 4])));
      body = entry[container.slot].document;
    }
    return {
      key: JSON.stringify(node_path),
      node_path,
      node_id: safe_text(node.id),
      inside,
      stored_profile: record(node.config.code) && typeof node.config.code.environment_profile_id === "string"
        ? node.config.code.environment_profile_id
        : null,
    };
  });
}

/* The body the host takes: the text exactly as read, and one binding per
   owned Code node, in the order they were listed. Null until every node has
   an explicit choice. */
export function import_payload(text, occurrences, choices) {
  if (typeof text !== "string" || !Array.isArray(occurrences)) return null;
  const bindings = [];
  for (const occurrence of occurrences) {
    const chosen = choices && own(choices, occurrence.key) ? choices[occurrence.key] : null;
    if (typeof chosen !== "string" || !chosen) return null;
    bindings.push({ node_path: occurrence.node_path, environment_profile_id: chosen });
  }
  return { schema: IMPORT_SCHEMA, source_json: text, runtime_bindings: bindings };
}

/* The host's refusal, kept whole: its code and path are shown as they came,
   with a sentence for the two an author acts on. */
export function import_refusal(error, document, occurrences) {
  const code = (error && error.code) || "import_failed";
  const path = Array.isArray(error && error.path) ? error.path : [];
  const message = safe_text((error && error.message) || "The host refused the import.");
  let sentence = null;
  if (code === "import_conflict") {
    const id = record(document) ? safe_text(document.id) : "";
    sentence = `“${id}” already exists here with different content. Nothing was changed: an import never replaces what an id holds and never makes a new id for it. A file can be imported under an id only while that id is unused here or already holds exactly this content.`;
  } else if (code === "profile_missing" && path[0] === "runtime_bindings" && Number.isSafeInteger(path[1]) && occurrences && occurrences[path[1]]) {
    sentence = `The Python chosen for ${occurrences[path[1]].node_id} is not on this machine. Nothing was imported.`;
  }
  return { code, path: JSON.stringify(path), message, sentence };
}
