/* The Agent node's JSON output.
 *
 * An Agent always produces two locked built-ins: `message`, the final reply,
 * and `context`, the publishable execution record. Turning JSON output on adds
 * the schema's own top-level fields **beside** them — the runtime merges the
 * parsed object into the same result — which is why `message` and `context`
 * cannot be used as root property names: they would collide with the built-ins
 * rather than shadow them.
 *
 * The admission rules are mirrored from `unchain/skeleton/kernel_output.py`
 * (read 2026-09-28) so the editor refuses to compose a schema the runtime would
 * reject, and says which part is at fault. It never decides admission itself —
 * `validate_output_schema` does — and the frozen case set is checked against
 * that validator rather than against this mirror alone. */

export const JSON_OUTPUT_CONFIG_KEY = "json_schema";

/* A bounded Draft 2020-12 subset: a schema editor that offered more would let
 * an author write something the runtime refuses at save. */
export const ALLOWED_KEYWORDS = Object.freeze([
  "$schema",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "anyOf",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
]);

export const JSON_TYPES = Object.freeze([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
]);

export const RESERVED_ROOT_PROPERTIES = Object.freeze(["message", "context"]);

export const MAX_SCHEMA_BYTES = 8 * 1024 * 1024;

const KEYWORDS = new Set(ALLOWED_KEYWORDS);
const TYPES = new Set(JSON_TYPES);
const RESERVED = new Set(RESERVED_ROOT_PROPERTIES);

const is_object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* The limit is counted in UTF-8 bytes, as the runtime counts it. `TextEncoder`
 * is the fast path where it exists and is absent in some hosts, so the count is
 * also derivable without it rather than throwing on a schema nobody could have
 * saved anyway. */
function utf8_length(text) {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(text).length;
  }
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.codePointAt(i);
    if (code > 0xffff) i += 1;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

function problem(code, where, message) {
  return { code, where, message };
}

/* Reserved names are refused at the EFFECTIVE root — the root itself and
 * whatever its `$ref` and `anyOf` chains expand to. A schema nested under
 * `properties` describes a different object, so it may use those names freely;
 * refusing them everywhere would be a stricter rule than the runtime's and
 * would block valid schemas. */
function effective_roots(root) {
  const seen = new Set();
  const found = [];
  const visit = (node) => {
    if (!is_object(node) || seen.has(node)) return;
    seen.add(node);
    found.push(node);
    if (typeof node.$ref === "string") visit(resolve_local_ref(root, node.$ref));
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(visit);
  };
  visit(root);
  return found;
}

function resolve_local_ref(root, reference) {
  if (reference === "#") return root;
  if (!reference.startsWith("#/")) return null;
  return reference
    .slice(2)
    .split("/")
    .reduce(
      (node, raw) =>
        is_object(node)
          ? node[raw.replace(/~1/g, "/").replace(/~0/g, "~")]
          : null,
      root,
    );
}

function walk(node, where, problems, seen) {
  if (!is_object(node)) {
    problems.push(problem("invalid_schema", where, "schema nodes must be objects"));
    return;
  }
  if (seen.has(node)) return;
  seen.add(node);

  Object.keys(node).forEach((key) => {
    if (!KEYWORDS.has(key)) {
      problems.push(
        problem("unknown_keyword", `${where}.${key}`, "keyword is not in the allowed subset"),
      );
    }
  });

  if ("type" in node) {
    const declared = node.type;
    const list = Array.isArray(declared) ? declared : [declared];
    list.forEach((entry) => {
      if (typeof entry !== "string" || !TYPES.has(entry)) {
        problems.push(problem("invalid_schema", `${where}.type`, "unknown JSON type"));
      }
    });
  }

  if ("properties" in node) {
    if (!is_object(node.properties)) {
      problems.push(problem("invalid_schema", `${where}.properties`, "properties must be an object"));
    } else {
      Object.entries(node.properties).forEach(([name, child]) =>
        walk(child, `${where}.properties.${name}`, problems, seen),
      );
    }
  }
  if ("$defs" in node && is_object(node.$defs)) {
    Object.entries(node.$defs).forEach(([name, child]) =>
      walk(child, `${where}.$defs.${name}`, problems, seen),
    );
  }
  if ("items" in node) walk(node.items, `${where}.items`, problems, seen);
  if ("anyOf" in node) {
    if (!Array.isArray(node.anyOf)) {
      problems.push(problem("invalid_schema", `${where}.anyOf`, "anyOf must be an array"));
    } else {
      node.anyOf.forEach((child, i) => walk(child, `${where}.anyOf[${i}]`, problems, seen));
    }
  }
  if ("additionalProperties" in node && is_object(node.additionalProperties)) {
    walk(node.additionalProperties, `${where}.additionalProperties`, problems, seen);
  }
}

export function output_schema_problems(schema) {
  const problems = [];
  if (!is_object(schema)) {
    return [problem("invalid_schema", "schema", "schema must be an object")];
  }

  let encoded = null;
  try {
    encoded = JSON.stringify(schema);
  } catch (error) {
    return [problem("invalid_schema", "schema", "schema cannot be encoded as bounded JSON")];
  }
  if (encoded === undefined) {
    return [problem("invalid_schema", "schema", "schema cannot be encoded as bounded JSON")];
  }
  if (utf8_length(encoded) > MAX_SCHEMA_BYTES) {
    problems.push(problem("limit_bytes", "schema", "schema exceeds eight MiB"));
  }

  walk(schema, "schema", problems, new Set());

  if (schema.type !== "object") {
    problems.push(problem("invalid_schema", "schema.type", "root schema type must be object"));
  }

  effective_roots(schema).forEach((node) => {
    const properties = node && node.properties;
    if (!is_object(properties)) return;
    Object.keys(properties).forEach((name) => {
      if (RESERVED.has(name)) {
        problems.push(
          problem("reserved_name", "schema.properties", "root output property is reserved"),
        );
      }
    });
  });

  return problems;
}

/* What an Agent node can export. The two built-ins are always there and cannot
 * be renamed or removed; JSON output adds the schema's own top-level fields
 * beside them, at the same level, because the runtime merges the parsed object
 * into the same result. */
export function agent_result_sources(schema) {
  const sources = [
    {
      name: "message",
      type: "string",
      path: ["message"],
      locked: true,
      description: "The final reply",
    },
    {
      name: "context",
      type: "object",
      path: ["context"],
      locked: true,
      description: "The publishable execution record",
    },
  ];
  const properties = is_object(schema) ? schema.properties : null;
  if (!is_object(properties)) return sources;
  Object.entries(properties).forEach(([name, node]) => {
    if (RESERVED.has(name)) return;
    sources.push({
      name,
      type: is_object(node) && typeof node.type === "string" ? node.type : null,
      path: [name],
      locked: false,
      description: (is_object(node) && node.description) || "",
    });
  });
  return sources;
}
