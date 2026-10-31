/* The structured view's model: an output schema as a list of named fields.
 *
 * The rows cover a flat object of named scalars and arrays of scalars, with the
 * bounds the admitted subset has and a description. That is most of what an
 * Agent's output schema is in practice, and it is nowhere near all a schema may
 * be: the subset also admits `$defs` and `$ref`, `anyOf`, nested objects, a
 * type given as a list, `enum` and `const`. A row model that pretended to hold
 * those would either lose them on load or invent them on save, and a loaded
 * schema quietly rewritten is the worst thing this editor could do — the author
 * would not be told, and the node would stop producing what it used to.
 *
 * So representability is not asserted here, it is *checked*, and checked
 * against the composer rather than against a list of conditions: a schema is
 * row-shaped exactly when composing its rows back produces the same schema.
 * The check and the composer cannot drift apart, because the check is the
 * composer. Everything else is shown as JSON, with the reason.
 *
 * The comparison is on JSON meaning, not on spelling: object keys are
 * unordered, so two orderings of the same properties are the same schema. An
 * array is ordered and compared in order, because `required` and `enum` are
 * arrays whose order the runtime preserves. */

import { own } from "./document_values";

const is_object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* Every table in this file is read with a name out of a draft, so every read
   goes through `own` — the one reader for that, in `document_values`. */

/* `properties[name] = ...` is not how you add a property whose name the author
   chose. For `__proto__` it calls the prototype setter and adds nothing, so a
   field the runtime admits and publishes was composed away into an empty
   object. `constructor` and `toString` are legal names too; they survive plain
   assignment, which is exactly why the one that does not went unnoticed. */
function define(target, name, value) {
  Object.defineProperty(target, name, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return target;
}

/* No "object": a nested object needs fields of its own, which is a nested row
   list and not this model. It is not missing from the subset — it is missing
   from the rows, and a schema using one is shown as JSON. */
export const FIELD_TYPES = Object.freeze([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "null",
]);

export const ITEM_TYPES = Object.freeze([
  "string",
  "number",
  "integer",
  "boolean",
  "null",
]);

/* Which bounds belong to which type, as `kernel_output.py` admits them. A
   bound on the wrong type is not refused by the runtime — `minLength` beside
   `type: "number"` simply never applies — but offering it would be offering
   something that silently does nothing. */
export const BOUNDS_BY_TYPE = Object.freeze({
  string: Object.freeze(["minLength", "maxLength"]),
  number: Object.freeze(["minimum", "maximum"]),
  integer: Object.freeze(["minimum", "maximum"]),
  array: Object.freeze(["minItems", "maxItems"]),
  boolean: Object.freeze([]),
  null: Object.freeze([]),
});

/* The bounds a type has, or none — never whatever a prototype happens to
   answer for a name out of a draft. */
export function bounds_for(type) {
  return own(BOUNDS_BY_TYPE, type) || [];
}

export const BOUND_LABEL = Object.freeze({
  minLength: "min length",
  maxLength: "max length",
  minimum: "min",
  maximum: "max",
  minItems: "min items",
  maxItems: "max items",
});

/* What a bound box's text means, if it means anything yet.
 *
 * A box is typed into one character at a time, and the spellings on the way
 * to a number are not that number: `0.5` passes through `0.`, and `-1.25`
 * through `-`. Read with `Number` alone, `0.` is zero — so the box stored
 * zero, redrew itself from the document as `0`, and the author's next
 * keystroke landed on `05`. Typing `0.5` wrote `5`, and nothing said so.
 * Rewriting what was typed into a different legal value is worse than
 * refusing it, for the same reason a path step does not strip the minus out
 * of `-1`: the wrong value is accepted everywhere the right one would be.
 *
 * So this reads the spelling rather than coercing it, the caller keeps the
 * text on screen either way, and the two halves of the answer are separate:
 * whether it is a number at all, and which number. `undefined` is a real
 * answer — an empty box means there is no bound, which is not the bound zero.
 *
 * `Number` takes spellings this document would never hold — `0x10`, ` 12 `,
 * `Infinity` — and they are refused here rather than silently canonicalised
 * into something the author did not write. A leading zero is the one
 * canonicalisation that loses nothing, so `02` is two.
 *
 * Counted bounds are the four the runtime requires to be non-negative
 * integers (`_require_nonnegative_integer`, `kernel_output.py:410`), so there
 * is no partial spelling of one: a point in that box is not a number being
 * typed, it is a number that box cannot hold. */
const NUMBER_TEXT = /^-?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const COUNT_TEXT = /^[0-9]+$/;

export function bound_from_text(text, counted) {
  const raw = String(text);
  if (raw.trim() === "") return { ok: true, value: undefined };
  if (!(counted ? COUNT_TEXT : NUMBER_TEXT).test(raw)) return { ok: false };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false };
  /* Past the safe integers a count is no longer the number that was typed,
     and storing a different one is the whole defect this guards. */
  if (counted && !Number.isSafeInteger(value)) return { ok: false };
  return { ok: true, value };
}

export function new_field(name) {
  return {
    name: name || "",
    type: "string",
    items_type: "string",
    required: false,
    description: "",
    bounds: {},
  };
}

/* One property, from one row. Only what the row actually carries is written:
   an absent bound is absent rather than null, because `null` is not a value
   any of these keywords takes and the document would be refused. */
function property_of(field) {
  const type = FIELD_TYPES.includes(field.type) ? field.type : "string";
  const property = { type };
  if (field.description) property.description = field.description;
  if (type === "array") {
    const items = ITEM_TYPES.includes(field.items_type) ? field.items_type : "string";
    property.items = { type: items };
  }
  bounds_for(type).forEach((bound) => {
    const value = field.bounds ? own(field.bounds, bound) : undefined;
    if (typeof value === "number" && Number.isFinite(value)) property[bound] = value;
  });
  return property;
}

/* The two root-level values the rows carry beside the fields.
 *
 * `description` is authored prose about the output as a whole and is shown.
 * `$schema` is not: it has exactly one admitted value, it says nothing an
 * author chooses, and it is the most ordinary thing to find at the top of a
 * JSON Schema. Dropping it would rewrite the document; showing it would be a
 * control with one option. So it is carried and not displayed — and because it
 * is carried, the round-trip check still covers it. */
export function schema_from_fields(fields, closed, root) {
  const rows = Array.isArray(fields) ? fields : [];
  const properties = {};
  rows.forEach((field) => {
    define(properties, (field && field.name) || "", property_of(field));
  });
  const required = rows
    .filter((field) => field && field.required)
    .map((field) => field.name || "");
  const schema = {};
  if (root && root.dialect) schema.$schema = root.dialect;
  schema.type = "object";
  if (root && root.description) schema.description = root.description;
  schema.properties = properties;
  if (required.length > 0) schema.required = required;
  if (closed) schema.additionalProperties = false;
  return schema;
}

/* The reading half. Best effort by design: it is only trusted once the
   composer has agreed with it, which `fields_hold_schema` asks. */
export function schema_fields(schema) {
  const properties = is_object(schema) && is_object(schema.properties) ? schema.properties : {};
  const required =
    is_object(schema) && Array.isArray(schema.required) ? schema.required : [];
  const fields = Object.keys(properties).map((name) => {
    const property = is_object(properties[name]) ? properties[name] : {};
    const type = typeof property.type === "string" ? property.type : "string";
    const bounds = {};
    bounds_for(type).forEach((bound) => {
      const value = own(property, bound);
      if (typeof value === "number") bounds[bound] = value;
    });
    return {
      name,
      type,
      items_type:
        is_object(property.items) && typeof property.items.type === "string"
          ? property.items.type
          : "string",
      required: required.includes(name),
      description: typeof property.description === "string" ? property.description : "",
      bounds,
    };
  });
  return {
    fields,
    closed: is_object(schema) && schema.additionalProperties === false,
    root: {
      dialect: is_object(schema) && typeof schema.$schema === "string" ? schema.$schema : "",
      description:
        is_object(schema) && typeof schema.description === "string"
          ? schema.description
          : "",
    },
  };
}

export function same_json(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((entry, index) => same_json(entry, right[index]))
    );
  }
  if (is_object(left) || is_object(right)) {
    if (!is_object(left) || !is_object(right)) return false;
    const keys = Object.keys(left);
    if (keys.length !== Object.keys(right).length) return false;
    return keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        same_json(left[key], right[key]),
    );
  }
  return false;
}

/* The one question the structured view is allowed to ask of a loaded schema. */
/* Which names more than one row claims.
 *
 * A JSON object holds one value per key, so a colliding rename cannot be
 * written at all — and writing it anyway kept the later row's declaration,
 * deleted the earlier one entirely, and moved its `required` marker across.
 * Reported rather than resolved: there is no resolution that is not a choice
 * about which of the author's two declarations to destroy, and that is not the
 * composer's to make. The names are compared as names, so `""` and
 * `"__proto__"` collide like any other. */
export function colliding_field_names(fields) {
  const rows = Array.isArray(fields) ? fields : [];
  const seen = [];
  const collided = [];
  rows.forEach((field) => {
    const name = (field && field.name) || "";
    if (seen.includes(name)) {
      if (!collided.includes(name)) collided.push(name);
      return;
    }
    seen.push(name);
  });
  return collided;
}

/* A name a new row can actually be written under.
 *
 * The rows are derived from the schema, so a row only exists once it has a key
 * — which means two rows cannot both be unnamed, and adding a second one did
 * nothing at all: the composer wrote one key and the list came back one row
 * short. Starting unnamed is still the affordance where it is free, because an
 * empty name is a real name and the author is about to type over it; where it
 * is taken, the first free placeholder is used instead so the button does
 * something rather than appearing to fail. */
export function free_field_name(taken) {
  const used = Array.isArray(taken) ? taken : [];
  if (!used.includes("")) return "";
  for (let n = 1; n <= used.length + 1; n += 1) {
    const candidate = n === 1 ? "field" : `field_${n}`;
    if (!used.includes(candidate)) return candidate;
  }
  return `field_${used.length + 2}`;
}

export function fields_hold_schema(schema) {
  if (!is_object(schema)) return false;
  const { fields, closed, root } = schema_fields(schema);
  return same_json(schema_from_fields(fields, closed, root), schema);
}

/* Why the rows cannot hold it, in the author's terms rather than the subset's.
 *
 * Stated from what the schema actually contains, so it never guesses: the keys
 * the rows do not write, a property that is not a flat scalar, a type the rows
 * have no control for. Where none of those is the cause — an empty `required`
 * list, a bound on a type it does not apply to — it says the honest thing,
 * which is that it cannot take this one apart rather than that the schema is
 * wrong. */
const UNHELD_ROOT_KEYS = Object.freeze({
  $defs: "reusable definitions",
  $ref: "a reference to a definition",
  anyOf: "alternative shapes",
  enum: "a fixed set of values",
  const: "a fixed value",
  title: "a title",
  items: "array items at the root",
  minItems: "root bounds",
  maxItems: "root bounds",
  minLength: "root bounds",
  maxLength: "root bounds",
  minimum: "root bounds",
  maximum: "root bounds",
});

const UNHELD_PROPERTY_KEYS = Object.freeze({
  $ref: "a reference to a definition",
  anyOf: "alternative shapes",
  enum: "a fixed set of values",
  const: "a fixed value",
  properties: "a nested object",
  required: "a nested object",
  additionalProperties: "a nested object",
  $defs: "reusable definitions",
});

export function why_fields_cannot_hold(schema) {
  if (!is_object(schema)) return "this is not a schema object";
  const found = [];
  const note = (reason) => {
    if (reason && !found.includes(reason)) found.push(reason);
  };

  Object.keys(schema).forEach((key) => note(own(UNHELD_ROOT_KEYS, key)));

  const properties = is_object(schema.properties) ? schema.properties : {};
  Object.values(properties).forEach((property) => {
    if (!is_object(property)) {
      note("a property that is not a schema object");
      return;
    }
    Object.keys(property).forEach((key) => note(own(UNHELD_PROPERTY_KEYS, key)));
    if (Array.isArray(property.type)) note("a field that may be one of several types");
    else if (property.type === "object") note("a nested object");
    else if (typeof property.type !== "string") note("a field with no declared type");
    else if (!FIELD_TYPES.includes(property.type)) {
      note(`a type the rows have no control for, "${property.type}"`);
    }
    if (is_object(property.items) && property.items.type === "object") {
      note("a list of objects");
    }
  });

  /* No construct explains it, so the difference is in how the same parts are
     written. Rather than shrug, ask the composer what it would have produced
     and name the first thing that differs — `required` ordering and an empty
     `required` list are both legal, both benign and both reasons the rows
     would rewrite the document if they claimed to hold it. */
  if (found.length === 0) {
    const { fields, closed, root } = schema_fields(schema);
    const composed = schema_from_fields(fields, closed, root);
    const required = schema.required;
    if (Array.isArray(required)) {
      if (required.length === 0) return "an empty list of required fields";
      if (
        !same_json(required, composed.required) &&
        same_json([...required].sort(), [...(composed.required || [])].sort())
      ) {
        return "a required list in a different order than the fields";
      }
    }
    return "it is written in a way the rows cannot hold exactly";
  }
  if (found.length === 1) return `it uses ${found[0]}`;
  return `it uses ${found.slice(0, -1).join(", ")} and ${found[found.length - 1]}`;
}
