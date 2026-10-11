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

/* `io.py:11-12`, counted over the schema's own JSON. */
export const MAX_SCHEMA_DEPTH = 64;
export const MAX_SCHEMA_NODES = 100000;

export const DRAFT_2020_12 = "https://json-schema.org/draft/2020-12/schema";

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

/* The reference resolver the runtime has, and no more of one.
 *
 * `_resolve_local_reference` (`kernel_output.py:132-160`) takes `#/$defs/`
 * only, refuses percent-encoding so it cannot disagree with the validator's
 * own fragment handling, and decodes `~0`/`~1`. Anything else is
 * `unsupported_reference` — including `#`, the root itself, which reads like
 * the most natural reference there is and is not supported. A resolver here
 * that were more generous would follow a reference the runtime refuses, and
 * every answer drawn through it would then be about a schema nobody can save. */

const POINTER_INDEX = /^(0|[1-9][0-9]*)$/;

function decode_pointer_token(token) {
  let out = "";
  for (let i = 0; i < token.length; i += 1) {
    if (token[i] !== "~") {
      out += token[i];
      continue;
    }
    const next = token[i + 1];
    if (next !== "0" && next !== "1") return null;
    out += next === "0" ? "~" : "/";
    i += 1;
  }
  return out;
}

export const REFERENCE_PREFIX = "#/$defs/";

/* `{ ok: true, target }`, or `{ ok: false, code }` carrying the runtime's own
   code — "this kind of reference is not supported" and "this reference points
   at nothing" are different faults and the author fixes them differently. */
function resolve_reference(root, reference) {
  if (typeof reference !== "string") return { ok: false, code: "invalid_schema" };
  if (reference.includes("%")) return { ok: false, code: "unsupported_reference" };
  if (!reference.startsWith(REFERENCE_PREFIX)) {
    return { ok: false, code: "unsupported_reference" };
  }
  let current = root;
  const tokens = reference.slice(2).split("/");
  for (let i = 0; i < tokens.length; i += 1) {
    const token = decode_pointer_token(tokens[i]);
    if (token === null) return { ok: false, code: "invalid_reference" };
    if (Array.isArray(current)) {
      if (!POINTER_INDEX.test(token)) return { ok: false, code: "invalid_reference" };
      const index = Number(token);
      if (index >= current.length) return { ok: false, code: "invalid_reference" };
      current = current[index];
    } else if (is_object(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) {
        return { ok: false, code: "invalid_reference" };
      }
      current = current[token];
    } else {
      return { ok: false, code: "invalid_reference" };
    }
  }
  if (!is_object(current)) return { ok: false, code: "invalid_reference" };
  return { ok: true, target: current };
}

/* For the readers that ask the narrower question: not whether a reference is
   admissible, but where it goes if the runtime would follow it. */
function resolve_local_ref(root, reference) {
  const found = resolve_reference(root, reference);
  return found.ok ? found.target : null;
}

/* `resolve_references` (`kernel_output.py:253-267`) walks the reference graph
   and refuses a cycle. Nothing in the editor needs to follow one; it needs to
   say so before the save does. */
function reference_cycle(root) {
  const active = new Set();
  const done = new Set();
  const visit = (node) => {
    if (!is_object(node) || done.has(node)) return false;
    if (active.has(node)) return true;
    active.add(node);
    let found = false;
    if ("$ref" in node) found = visit(resolve_local_ref(root, node.$ref)) || found;
    if (is_object(node.$defs)) {
      Object.values(node.$defs).forEach((child) => {
        found = visit(child) || found;
      });
    }
    if (is_object(node.properties)) {
      Object.values(node.properties).forEach((child) => {
        found = visit(child) || found;
      });
    }
    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((child) => {
        found = visit(child) || found;
      });
    }
    if ("items" in node) found = visit(node.items) || found;
    active.delete(node);
    done.add(node);
    return found;
  };
  return visit(root);
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
    if ("$ref" in node) visit(resolve_local_ref(root, node.$ref));
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(visit);
  };
  visit(root);
  return found;
}

const is_plain_integer = (value) =>
  typeof value === "number" && Number.isInteger(value);

/* A value the schema carries verbatim — an `enum` entry, a `const`. The
   encoding check at the entry point has already refused a cycle or a value
   JSON cannot hold, so this is only about what survives that and is still not
   JSON. */
function json_problems(value, where, problems) {
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (current === null) continue;
    if (typeof current === "string" || typeof current === "boolean") continue;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        problems.push(problem("invalid_json", where, "JSON number must be finite"));
      }
      continue;
    }
    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry));
      continue;
    }
    if (is_object(current)) {
      Object.values(current).forEach((entry) => stack.push(entry));
      continue;
    }
    problems.push(problem("invalid_json", where, "value is not JSON"));
  }
}

/* `_validate_json_tree` (`kernel_output.py:60-95`): the depth and node limits
 * and the cycle check, over the schema's own JSON, before a single keyword is
 * read. Iterative for the reason the Python is — a draft is edited, so it can
 * be arbitrarily deep, and a recursive reader would fall over on it instead of
 * reporting it. `JSON.stringify` is a recursive reader too, which is why the
 * byte check comes after this and not before: asked first, a deep draft came
 * back as "not encodable" rather than as too deep.
 *
 * Depth is counted with a key and its value one step apart, so each level of
 * `properties` costs two. The boundary is probed in the capture rather than
 * derived — thirty levels of the nesting shape there is the deepest the
 * runtime takes, and thirty-one is `limit_depth`. */
function json_tree_problems(schema, problems) {
  const LEAVE = Symbol("leave");
  const stack = [[schema, 0]];
  const active = new Set();
  let nodes = 0;
  while (stack.length) {
    const frame = stack.pop();
    if (frame[0] === LEAVE) {
      active.delete(frame[1]);
      continue;
    }
    const [current, depth] = frame;
    nodes += 1;
    if (nodes > MAX_SCHEMA_NODES) {
      problems.push(problem("limit_nodes", "schema", "schema exceeds the node limit"));
      return;
    }
    if (depth > MAX_SCHEMA_DEPTH) {
      problems.push(problem("limit_depth", "schema", "schema exceeds the depth limit"));
      return;
    }
    if (current === null || typeof current !== "object") {
      if (typeof current === "number" && !Number.isFinite(current)) {
        problems.push(problem("invalid_json", "schema", "JSON number must be finite"));
        return;
      }
      continue;
    }
    if (active.has(current)) {
      problems.push(problem("invalid_json", "schema", "JSON value cannot contain a cycle"));
      return;
    }
    active.add(current);
    stack.push([LEAVE, current]);
    const children = Array.isArray(current) ? current : Object.values(current);
    children.forEach((child) => stack.push([child, depth + 1]));
  }
}

/* Every rule `_SchemaWalker.walk` applies, with the Python line each comes
 * from. Twenty-four were missing when this mirror was first written, and all
 * twenty-four were missing in the same direction: the editor accepted a schema
 * the runtime refuses, so the author met the refusal at save rather than while
 * composing. The frozen set is `output_schema_admission_capture`, enumerated
 * from the validator instead of from a reading of it.
 *
 * The runtime raises on the first fault; this collects them all, because an
 * editor that reports one fault per attempt makes a schema something the
 * author discovers by repeated rejection. */
function walk(node, where, problems, state, options) {
  const root = Boolean(options && options.root);
  if (!is_object(node)) {
    problems.push(problem("invalid_schema", where, "schema nodes must be objects"));
    return;
  }
  if (state.seen.has(node)) return;
  state.seen.add(node);

  Object.keys(node).forEach((keyword) => {
    const at = `${where}.${keyword}`;
    const child = node[keyword];
    if (!KEYWORDS.has(keyword)) {
      problems.push(problem("unknown_keyword", at, "keyword is not in the allowed subset"));
      return;
    }
    switch (keyword) {
      /* :181-183 */
      case "$schema":
        if (child !== DRAFT_2020_12) {
          problems.push(problem("invalid_schema", at, "schema dialect is unsupported"));
        }
        return;
      /* :184-188 */
      case "$defs":
        if (!is_object(child)) {
          problems.push(problem("invalid_schema", at, "schema nodes must be objects"));
          return;
        }
        Object.entries(child).forEach(([name, definition]) =>
          walk(definition, `${at}.${name}`, problems, state),
        );
        return;
      /* :189-192, resolved at :246-252 */
      case "$ref": {
        const found = resolve_reference(state.root, child);
        if (found.ok) return;
        problems.push(
          problem(
            found.code,
            at,
            found.code === "unsupported_reference"
              ? `only local definition references are supported, written as "${REFERENCE_PREFIX}name"`
              : found.code === "invalid_reference"
                ? "reference target is unavailable"
                : "reference must be a string",
          ),
        );
        return;
      }
      /* :193-195 */
      case "title":
      case "description":
        if (typeof child !== "string") {
          problems.push(problem("invalid_schema", at, "schema annotation must be a string"));
        }
        return;
      /* :234-244 */
      case "type": {
        const list = Array.isArray(child) ? child : [child];
        const unusable =
          (Array.isArray(child) && child.length === 0) ||
          list.some((entry) => typeof entry !== "string" || !TYPES.has(entry)) ||
          new Set(list).size !== list.length;
        if (unusable) {
          problems.push(problem("invalid_schema", at, "unknown JSON type"));
        } else if (root && child !== "object") {
          problems.push(problem("invalid_schema", at, "root schema type must be object"));
        }
        return;
      }
      /* :198-204 */
      case "properties":
        if (!is_object(child)) {
          problems.push(problem("invalid_schema", at, "properties must be an object"));
          return;
        }
        Object.entries(child).forEach(([name, property]) =>
          walk(property, `${at}.${name}`, problems, state),
        );
        return;
      /* :205-209 */
      case "required":
        if (!Array.isArray(child) || child.some((name) => typeof name !== "string")) {
          problems.push(problem("invalid_schema", at, "required must be an array of strings"));
        } else if (new Set(child).size !== child.length) {
          problems.push(problem("invalid_schema", at, "required names must be unique"));
        }
        return;
      /* :210-212 — a boolean, never a schema. This mirror used to walk an
         object here as if it described the extra properties, which is what the
         keyword means everywhere except in this subset. */
      case "additionalProperties":
        if (typeof child !== "boolean") {
          problems.push(problem("invalid_schema", at, "additionalProperties must be boolean"));
        }
        return;
      /* :213-215 */
      case "items":
        walk(child, at, problems, state);
        return;
      /* :216-219 */
      case "enum":
        if (!Array.isArray(child) || child.length === 0) {
          problems.push(problem("invalid_schema", at, "enum must be a non-empty array"));
        } else {
          json_problems(child, at, problems);
        }
        return;
      /* :220-221 */
      case "const":
        json_problems(child, at, problems);
        return;
      /* :222-227 */
      case "anyOf":
        if (!Array.isArray(child) || child.length === 0) {
          problems.push(problem("invalid_schema", at, "anyOf must be a non-empty array"));
          return;
        }
        child.forEach((alternative, index) =>
          walk(alternative, `${at}[${index}]`, problems, state),
        );
        return;
      /* :228-229 */
      case "minItems":
      case "maxItems":
      case "minLength":
      case "maxLength":
        if (!is_plain_integer(child) || child < 0) {
          problems.push(
            problem("invalid_schema", at, "schema limit must be a non-negative integer"),
          );
        }
        return;
      /* :230-231 */
      case "minimum":
      case "maximum":
        if (typeof child !== "number" || !Number.isFinite(child)) {
          problems.push(
            problem("invalid_schema", at, "schema bound must be a finite JSON number"),
          );
        }
        return;
      default:
        return;
    }
  });
}

/* What the editor can say about a schema before the runtime is asked.
 *
 * One rule is deliberately not mirrored: `Draft202012Validator.check_schema`
 * (`:327-332`). That is a whole JSON Schema implementation, and pretending to
 * it here would be the same mistake in a new place. It is the reason the
 * editor still has to survive a refusal it did not predict. */
export function output_schema_problems(schema) {
  const problems = [];
  if (!is_object(schema)) {
    return [problem("invalid_schema", "schema", "schema must be an object")];
  }

  /* In the runtime's order, and alone when it fails: everything after this
     recurses — the keyword walk, the reference graph, `JSON.stringify` — so a
     draft that broke those is reported rather than survived. */
  json_tree_problems(schema, problems);
  if (problems.length > 0) return problems;

  let encoded = null;
  try {
    encoded = JSON.stringify(schema);
  } catch (error) {
    return [problem("invalid_json", "schema", "schema cannot be encoded as bounded JSON")];
  }
  if (encoded === undefined) {
    return [problem("invalid_json", "schema", "schema cannot be encoded as bounded JSON")];
  }
  if (utf8_length(encoded) > MAX_SCHEMA_BYTES) {
    problems.push(problem("limit_bytes", "schema", "schema exceeds eight MiB"));
  }

  walk(schema, "schema", problems, { root: schema, seen: new Set() }, { root: true });

  /* `validate_output_schema:323-324` asks this of the root a second time after
     the walk, which is why a root carrying no `type` at all is refused even
     though no keyword it does carry is wrong. */
  if (schema.type !== "object") {
    problems.push(problem("invalid_schema", "schema.type", "root schema type must be object"));
  }

  if (reference_cycle(schema)) {
    problems.push(
      problem("reference_cycle", "schema", "schema references cannot form a cycle"),
    );
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
