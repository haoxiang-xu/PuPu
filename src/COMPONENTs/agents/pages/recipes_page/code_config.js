import { safe_text } from "./document_values";
import { schema_root_scope } from "./output_schema";
import { is_reserved_path, managed_sha, text_problem } from "./managed_code_sources";

/* The Code node's configuration (#357).
 *
 * Everything here mirrors the fixed installed runtime, measured before it was
 * written (code_capture.json; code-01/out/code-store-capture.json):
 *
 *   config.code  CLOSED {source, environment_profile_id, timeout_ms,
 *                max_result_bytes, max_log_bytes, result_schema, artifacts?}
 *                (`code_runtime.admit_code_config`)
 *   source       exactly {kind:"file", path}. Either a file the run reads
 *                beneath its authorized workspace root when it gets here
 *                (`FileCodeSourceResolver`), or — written in the panel — text
 *                the host keeps with the Agent, named by the generated path
 *                `__pupu_code__/sha256/<sha>.py` (#357 G1, managed_code_sources)
 *   limits       integers: timeout_ms 1 … 86 400 000, the two byte limits
 *                1 … 8 MiB
 *   result_schema a JSON Schema whose root is `type: "object"`, Draft 2020-12
 *   result       what `main(input, context)` returns, validated against that
 *                schema. A return that is not an object or does not match it
 *                fails the run (`invalid_type` / `output_invalid`); an
 *                exception or a timeout ends the run `outcome_unknown`
 *                (`handler_error`). `durable_execution.py:253` refuses the
 *                error receipt before publication, so nothing of the node —
 *                no result, no error field — reaches End or a downstream
 *                node, and there is no error policy to choose (measured on
 *                the pinned wheel: code-01-independent-review-20261024)
 *
 * The store saves every one of those shapes, right or wrong, and its draft
 * check says nothing about any of them; preflight names one problem at a
 * time, and a node with no `code` at all passes preflight and fails only when
 * the run starts. So the editor states the problems itself and never writes
 * a value the author did not choose. */

export const CODE_LIMITS = Object.freeze({
  timeout_ms: Object.freeze({ min: 1, max: 86400000 }),
  max_result_bytes: Object.freeze({ min: 1, max: 8 * 1024 * 1024 }),
  max_log_bytes: Object.freeze({ min: 1, max: 8 * 1024 * 1024 }),
});
export const LIMIT_KEYS = Object.freeze(Object.keys(CODE_LIMITS));
export const CODE_SETTING_KEYS = Object.freeze([
  "source",
  "environment_profile_id",
  ...LIMIT_KEYS,
  "result_schema",
  "artifacts",
]);
const REQUIRED_KEYS = CODE_SETTING_KEYS.filter((key) => key !== "artifacts");

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
/* Presence is a question about the key, never about its value: `own` answers
   with the stored value, so a stored null / false / 0 / "" read through it
   as "absent" and a malformed draft was then called incomplete, or passed
   over (R-357-04a). Every "is it there" below asks this instead. */
const has = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);

export function code_settings(node) {
  const config = node && node.config;
  return has(config, "code") && record(config.code) ? config.code : null;
}

/* Writes the whole `code` object of exactly one Code node; the rest of its
   config — the execution rows, and anything this editor does not know — is
   kept as it was. Anything else answers with the document unchanged. */
export function with_code_settings(document, node_id, code) {
  if (!record(document) || !Array.isArray(document.nodes) || !record(code)) return document;
  const matches = document.nodes.filter((node) => record(node) && node.id === node_id);
  if (matches.length !== 1 || matches[0].type !== "code" || !record(matches[0].config)) return document;
  const target = matches[0];
  return {
    ...document,
    nodes: document.nodes.map((node) => (node === target ? { ...node, config: { ...node.config, code } } : node)),
  };
}

/* ── The source ───────────────────────────────────────────────────────── */

/* `FileCodeSourceResolver`'s lexical rules, said before the run says them: a
   normalized relative path with no empty, `.` or `..` segment and no NUL. The
   runtime admits an absolute path at preflight and refuses it only when the
   node runs, so this is one of the places the editor speaks sooner. */
export function source_path_problem(path) {
  if (typeof path !== "string") return "The source must be text naming a file.";
  if (path === "") return "Name the file that holds main(input, context).";
  /* The host's own space for text written here: a workspace file of that
     name would be taken for host-kept text, and a typed digest names text
     nobody wrote. */
  if (is_reserved_path(path)) return "Paths under __pupu_code__/ are kept for code written in this panel; choose another file.";
  if (path.includes("\u0000")) return "The path cannot contain a NUL character.";
  if (path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\")) {
    return "The path is read inside the run's workspace, so it must be relative to it.";
  }
  const parts = path.split("/");
  if (parts.includes("..")) return "The path cannot step out of the workspace with \"..\".";
  if (parts.includes(".")) return "The path cannot contain a \".\" segment.";
  if (parts.includes("")) return "The path cannot contain an empty segment.";
  return null;
}

function source_problem(source, sources) {
  if (!record(source) || Object.keys(source).length !== 2 || source.kind !== "file" || !has(source, "path")) {
    return "The source must be exactly one file reference: {kind: \"file\", path}.";
  }
  const sha = managed_sha(source);
  if (sha !== null) {
    if (!has(sources, sha)) return "The text of this code is not loaded here, so it cannot be shown or saved. Reopen this Agent.";
    const problem = text_problem(sources[sha]);
    return problem ? problem.message : null;
  }
  return source_path_problem(source.path);
}

/* The one reader the code block, the viewer and the panel's editor draw
 * from (G1).
 *
 * Text written here is kept by the host and named by its digest, so it is
 * read from the session's table (`sources`) by the digest the node's source
 * names: present, it is the text, byte for byte; absent, it is "not loaded"
 * and never an empty program. A workspace file is still read by the run when
 * it gets there, under that run's workspace root, and nothing carries its
 * text, so it answers "not here" with the path, and the drawings fall back
 * to the node's header. */
export function code_source_text(node, sources) {
  const code = code_settings(node);
  const source = code ? code.source : null;
  const path = record(source) && typeof source.path === "string" ? source.path : null;
  if (!code) {
    return { available: false, managed: false, text: null, path: null, reason: "No code settings yet." };
  }
  const sha = managed_sha(source);
  if (sha !== null) {
    return has(sources, sha) && typeof sources[sha] === "string"
      ? { available: true, managed: true, text: sources[sha], path, reason: null }
      : { available: false, managed: true, text: null, path, reason: "The text of this code is not loaded here. Reopen this Agent to read it." };
  }
  if (is_reserved_path(path)) {
    return { available: false, managed: true, text: null, path, reason: "This source names host-kept code in a form this editor cannot read." };
  }
  return {
    managed: false,
    available: false,
    text: null,
    path,
    reason: "The code is read from this file inside the run's workspace when the run gets here; its text is not stored in the Agent.",
  };
}

/* ── Limits ───────────────────────────────────────────────────────────── */

export function limit_from_text(text, limit) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!/^\d+$/.test(raw)) return { ok: false, problem: "Enter a whole number." };
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < limit.min || value > limit.max) {
    return { ok: false, problem: `Enter a whole number from ${limit.min} to ${limit.max}.` };
  }
  return { ok: true, value };
}

const limit_ok = (value, limit) => Number.isSafeInteger(value) && value >= limit.min && value <= limit.max;

/* ── Python profiles ──────────────────────────────────────────────────── */

/* What the store lists: `{id, kind: bundled|venv, executable, fingerprint,
   available, changed, edit_token}`. A version is known only from a probe the
   author asks for, so the label never pretends to one. */
export function profile_label(profile) {
  if (!record(profile) || typeof profile.id !== "string") return "(unreadable profile)";
  const where = profile.kind === "bundled"
    ? "built-in Python"
    : typeof profile.executable === "string" && profile.executable
      ? safe_text(profile.executable.split("/").filter(Boolean).pop() || profile.executable)
      : "a named Python";
  return `${safe_text(profile.id)} · ${where}${profile.available === false ? " (unavailable)" : ""}`;
}

/* ── What the result declares ─────────────────────────────────────────── */

/* The one node where types are declared: the Result schema names its fields,
   and the Output Variables pick from them. Closed only when the schema closes
   its own key list — an open schema may carry fields it does not name, and
   the runtime publishes them. */
export function code_result_roots(node) {
  const code = code_settings(node);
  const schema = code ? code.result_schema : undefined;
  if (!record(schema) || schema.type !== "object") {
    return {
      known: false,
      roots: [],
      closed: false,
      reason: code
        ? "This Code node's Result schema is not a shape this editor can read, so its fields are not listed."
        : "Declare the fields main() returns in Result; the Output Variables pick from them.",
    };
  }
  const scope = schema_root_scope(schema);
  return {
    known: true,
    roots: scope.names,
    closed: scope.closed,
    reason: scope.closed
      ? null
      : "This Result schema does not close its own field list, so the result can carry a field it does not name.",
  };
}

/* ── What the panel says is wrong ─────────────────────────────────────── */

export function code_problems(node, profiles, sources) {
  const code = code_settings(node);
  if (!code) {
    return [{ code: "code_missing", message: "Choose a runtime, name the source file, set the limits and declare the Result." }];
  }
  const problems = [];
  REQUIRED_KEYS.filter((key) => !has(code, key)).forEach((key) => {
    if (LIMIT_KEYS.includes(key)) {
      problems.push({ code: "limit_missing", setting: key, message: `Set ${key.replace(/_/g, " ")}; the runtime requires it.` });
    } else if (key === "source") {
      problems.push({ code: "source_missing", message: "Write the code that defines main(input, context), or name the file that holds it." });
    } else if (key === "environment_profile_id") {
      problems.push({ code: "profile_missing", message: "Choose the Python this code runs with." });
    } else {
      problems.push({ code: "schema_missing", message: "Declare the Result: the fields main() returns." });
    }
  });
  Object.keys(code).filter((key) => !CODE_SETTING_KEYS.includes(key)).forEach((key) => {
    problems.push({ code: "unknown_setting", setting: key, message: `This runtime does not read the setting “${safe_text(key)}”.` });
  });
  if (has(code, "source")) {
    const problem = source_problem(code.source, sources);
    if (problem) problems.push({ code: "source_invalid", message: problem });
  }
  if (has(code, "environment_profile_id")) {
    const id = code.environment_profile_id;
    if (typeof id !== "string" || !id) {
      problems.push({ code: "profile_invalid", message: "The runtime profile must be named." });
    } else if (Array.isArray(profiles)) {
      const listed = profiles.find((profile) => record(profile) && profile.id === id);
      if (!listed) {
        problems.push({ code: "profile_unknown", message: `No Python profile named “${safe_text(id)}” is on this machine. Choose one, or add it.` });
      } else if (listed.available === false) {
        problems.push({ code: "profile_unavailable", message: `The Python profile “${safe_text(id)}” is not available on this machine right now.` });
      }
    }
  }
  LIMIT_KEYS.filter((key) => has(code, key)).forEach((key) => {
    if (!limit_ok(code[key], CODE_LIMITS[key])) {
      problems.push({ code: "limit_invalid", setting: key, message: `${key.replace(/_/g, " ")} must be a whole number from ${CODE_LIMITS[key].min} to ${CODE_LIMITS[key].max}.` });
    }
  });
  if (has(code, "result_schema")) {
    const problem = schema_shape_problem(code.result_schema);
    if (problem) problems.push({ code: "schema_invalid", message: problem });
  }
  if (has(code, "artifacts")) {
    const artifacts = code.artifacts;
    if (!Array.isArray(artifacts) || artifacts.some((item) => !record(artifact_ok(item)))) {
      problems.push({ code: "artifacts_invalid", message: "The stored artifacts are not a list this runtime reads." });
    }
  }
  return problems;
}

/* The runtime admits the whole of Draft 2020-12 here (`check_schema`), which
   this editor does not mirror. What it says sooner is only the root shape the
   rows compose and the output rows read: an object whose `properties` is an
   object, whose `required` names strings and whose `additionalProperties`, if
   stated, is a boolean. Anything else is left to the store's refusal. */
function schema_shape_problem(schema) {
  if (!record(schema) || schema.type !== "object") {
    return "The Result schema must describe an object: the fields main() returns.";
  }
  if (has(schema, "properties") && !record(schema.properties)) {
    return "The Result schema's properties must be an object of named fields.";
  }
  if (has(schema, "required") && (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string"))) {
    return "The Result schema's required list must name fields.";
  }
  if (has(schema, "additionalProperties") && typeof schema.additionalProperties !== "boolean" && !record(schema.additionalProperties)) {
    return "The Result schema's additionalProperties must be true, false or a schema.";
  }
  return null;
}

const ARTIFACT_NAME = /^[A-Za-z0-9._-]{1,128}$/;
function artifact_ok(item) {
  if (!record(item) || Object.keys(item).length !== 2) return null;
  if (typeof item.name !== "string" || !ARTIFACT_NAME.test(item.name) || item.name === "." || item.name === "..") return null;
  if (typeof item.attachment !== "string" || !item.attachment) return null;
  return item;
}
