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

/* Which names an instance of this schema may carry at its own root, and
 * whether that list is the whole of them.
 *
 * `properties` alone does not answer the first half. `validate_output_schema`
 * admits `$ref` into `$defs` and `anyOf` alternatives, and
 * `reject_effective_root_reservations` (`kernel_output.py:269-297`) treats
 * exactly that expansion as the result's own root — which is why the reserved
 * names are refused through it. A schema below `properties` describes a nested
 * object and is deliberately outside it. A field declared only through a
 * reference or an alternative is a real field: the runtime publishes it, and
 * an editor reading direct properties alone called it nonexistent.
 *
 * `closed` is the half that licenses refusing a name, so it is answered
 * conservatively. Draft 2020-12 bounds an object's keys when
 * `additionalProperties: false` sits beside the `properties` it bounds — in
 * the *same* schema object, because an adjacent `$ref` or `anyOf` applies a
 * separate constraint rather than widening that one. A bounded root therefore
 * refuses the name its own `$ref` declares, which is the easy thing to get
 * wrong by reading and is recorded as a real runtime call in
 * `skeleton_result_schema_capture`. So: the keys are bounded when any schema
 * applied to the instance bounds them, and an `anyOf` bounds them only when
 * every alternative does. Anything this cannot read — a reference the runtime
 * would not resolve either, a cycle, a budget overrun — proves no bound and
 * leaves the list open. Open means "may be incomplete", and nothing may be
 * called nonexistent on the strength of an incomplete list. */

/* A draft is edited, so it can hold a shape no save would admit. The walk is
   bounded rather than trusting the 8 MiB limit to have been enforced yet. */
const MAX_ROOT_SCHEMA_STEPS = 2000;

/* `_resolve_local_reference` takes `#/$defs/` and refuses percent-encoding. A
   bound read through anything else would be a bound the runtime never agreed
   to, so such a reference contributes names and no bound. */
const bounded_reference = (reference) =>
  typeof reference === "string" &&
  !reference.includes("%") &&
  reference.startsWith("#/$defs/");

function intersect_bounds(left, right) {
  if (left === null) return right;
  if (right === null) return left;
  return left.filter((name) => right.includes(name));
}

function root_scope(node, root, state) {
  if (state.steps <= 0 || !is_object(node) || state.active.has(node)) {
    return { names: [], bound: null };
  }
  state.steps -= 1;
  state.active.add(node);

  const own = is_object(node.properties) ? Object.keys(node.properties) : [];
  own.forEach((name) => {
    if (!state.declared.has(name)) state.declared.set(name, node.properties[name]);
  });
  let names = own.slice();
  let bound = node.additionalProperties === false ? own.slice() : null;

  if ("$ref" in node) {
    const target = bounded_reference(node.$ref)
      ? resolve_local_ref(root, node.$ref)
      : null;
    const via = root_scope(target, root, state);
    names = names.concat(via.names);
    bound = intersect_bounds(bound, via.bound);
  }

  if (Array.isArray(node.anyOf) && node.anyOf.length > 0) {
    let union = [];
    let every_alternative_bounded = true;
    node.anyOf.forEach((alternative) => {
      const via = root_scope(alternative, root, state);
      names = names.concat(via.names);
      if (via.bound === null) every_alternative_bounded = false;
      else union = union.concat(via.bound);
    });
    if (every_alternative_bounded) bound = intersect_bounds(bound, union);
  }

  state.active.delete(node);
  return { names, bound };
}

export function schema_root_scope(schema) {
  /* `readable: false` is not the same as declaring nothing. A draft can hold a
     schema that is not a schema, and the two cases need different words: one
     adds no fields, the other means the fields are unknown. */
  if (!is_object(schema)) {
    return { names: [], closed: false, readable: false, declared: new Map() };
  }
  const state = {
    active: new Set(),
    declared: new Map(),
    steps: MAX_ROOT_SCHEMA_STEPS,
  };
  const { names, bound } = root_scope(schema, schema, state);
  /* Where the keys are bounded the bound *is* the list: a name declared only
     outside it cannot arrive, so offering it would offer an address the
     runtime refuses. */
  const chosen = bound === null ? names : bound;
  return {
    names: chosen.filter((name, index) => chosen.indexOf(name) === index),
    closed: bound !== null,
    readable: true,
    declared: state.declared,
  };
}

/* What an Agent node can export. The two built-ins are always there and cannot
 * be renamed or removed; JSON output adds the schema's own root fields beside
 * them, at the same level, because the runtime merges the parsed object into
 * the same result — which is why those two names are reserved. The root fields
 * come from `schema_root_scope` rather than from `properties`, so a field
 * declared through a reference or an alternative is listed too; its `type` and
 * `description` are read from wherever it was declared. */
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
  const { names, declared } = schema_root_scope(schema);
  names.forEach((name) => {
    if (RESERVED.has(name)) return;
    const node = declared.get(name);
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
