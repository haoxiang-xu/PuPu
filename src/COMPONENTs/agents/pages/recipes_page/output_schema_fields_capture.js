/* Every schema the field rows can compose, with the real validator's verdict.
 *
 * This is the editor's safety property, and the only one worth having: what the
 * rows produce, the runtime accepts. It covers each field type alone, required
 * and not, described and not, open and closed; each bound the subset has at
 * zero and at a round number, and both bounds together; a list of each item
 * type; several fields mixed; and no fields at all. It also covers the names a
 * careless editor mangles — the empty name, a name holding a dot, a slash, a
 * tilde, a space, a non-ASCII name — because `validate_output_schema` reserves
 * only `message` and `context` and the rest are an author's to use.
 *
 * It also covers the two root-level values the rows carry without showing
 * one of them — the declared dialect and a description of the output as a
 * whole — and a negative and a fractional `minimum`, which the subset admits
 * there and refuses on the four length and count bounds.
 *
 * A later round added the names JavaScript treats specially — `__proto__`,
 * `constructor`, `toString`, `hasOwnProperty`, `valueOf`, `prototype` — and
 * the placeholder a second new row is seeded with. The runtime admits all of
 * them as field names and publishes a `__proto__` field; plain assignment
 * composed that one away into an empty `properties`, and the five that
 * survive plain assignment are why nobody noticed.
 *
 * Composed by `schema_from_fields` and then offered to the fixed installed
 * `unchain==0.2.0`
 * (`df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178`).
 * Nothing was rebuilt. A refusal here would mean the rows can build something
 * that cannot be saved, which is the defect the mirror was just corrected for,
 * one layer up.
 *
 * The schemas are held as the JSON text the validator was given, and parsed at
 * load. Not for tidiness: a JavaScript object literal cannot carry a
 * `__proto__` key at all — quoted or not, that spelling sets the prototype —
 * so a fixture written as a literal silently loses the very field this set
 * exists to pin. `JSON.parse` creates it as an own property, which is also how
 * a schema actually reaches this editor: out of the store, as text.
 */

const CAPTURED = [
 {
  "label": "one string field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one string field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one string field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one string field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one number field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one number field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"number\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one number field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one number field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one integer field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one integer field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"integer\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one integer field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one integer field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one boolean field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"boolean\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one boolean field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"boolean\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one boolean field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"boolean\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one boolean field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"type\": \"boolean\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one array field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one array field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one array field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one array field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one null field",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"null\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one null field, required",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"null\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "one null field, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"null\"}}, \"type\": \"object\"}"
 },
 {
  "label": "one null field, described",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"description\": \"what it holds\", \"type\": \"null\"}}, \"type\": \"object\"}"
 },
 {
  "label": "string with minLength at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minLength\": 0, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "string with minLength at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minLength\": 7, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "string with maxLength at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maxLength\": 0, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "string with maxLength at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maxLength\": 7, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "string with both bounds",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maxLength\": 9, \"minLength\": 1, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "number with minimum at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": 0, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "number with minimum at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": 7, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "number with maximum at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 0, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "number with maximum at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 7, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "number with both bounds",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 9, \"minimum\": 1, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "integer with minimum at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": 0, \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "integer with minimum at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": 7, \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "integer with maximum at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 0, \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "integer with maximum at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 7, \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "integer with both bounds",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 9, \"minimum\": 1, \"type\": \"integer\"}}, \"type\": \"object\"}"
 },
 {
  "label": "array with minItems at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"minItems\": 0, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "array with minItems at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"minItems\": 7, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "array with maxItems at 0",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"maxItems\": 0, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "array with maxItems at 7",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"maxItems\": 7, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "array with both bounds",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"maxItems\": 9, \"minItems\": 1, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a number with a negative minimum",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": -5, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a number with a fractional bound",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maximum\": 1.5, \"minimum\": 0.5, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a list of string",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a list of number",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"number\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a list of integer",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"integer\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a list of boolean",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"boolean\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a list of null",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"null\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "an empty name",
  "accepted": true,
  "json": "{\"properties\": {\"\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a name with a dot",
  "accepted": true,
  "json": "{\"properties\": {\"a.b\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a name with a slash",
  "accepted": true,
  "json": "{\"properties\": {\"a/b\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a name with a tilde",
  "accepted": true,
  "json": "{\"properties\": {\"a~b\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a unicode name",
  "accepted": true,
  "json": "{\"properties\": {\"输出\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a name with a space",
  "accepted": true,
  "json": "{\"properties\": {\"two words\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "several fields of mixed types and requirements",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"answer\": {\"description\": \"the reply\", \"type\": \"string\"}, \"ok\": {\"type\": \"boolean\"}, \"score\": {\"maximum\": 1, \"minimum\": 0, \"type\": \"number\"}, \"tags\": {\"items\": {\"type\": \"string\"}, \"maxItems\": 5, \"type\": \"array\"}}, \"required\": [\"answer\", \"ok\"], \"type\": \"object\"}"
 },
 {
  "label": "no fields at all",
  "accepted": true,
  "json": "{\"properties\": {}, \"type\": \"object\"}"
 },
 {
  "label": "no fields at all, closed",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {}, \"type\": \"object\"}"
 },
 {
  "label": "carrying the declared dialect",
  "accepted": true,
  "json": "{\"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "carrying a description of the whole output",
  "accepted": true,
  "json": "{\"description\": \"the classification and why\", \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "carrying both",
  "accepted": true,
  "json": "{\"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"additionalProperties\": false, \"description\": \"both at once\", \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "carrying a dialect with no fields",
  "accepted": true,
  "json": "{\"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"properties\": {}, \"type\": \"object\"}"
 },
 {
  "label": "a field named __proto__",
  "accepted": true,
  "json": "{\"properties\": {\"__proto__\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field named constructor",
  "accepted": true,
  "json": "{\"properties\": {\"constructor\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field named toString",
  "accepted": true,
  "json": "{\"properties\": {\"toString\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field named hasOwnProperty",
  "accepted": true,
  "json": "{\"properties\": {\"hasOwnProperty\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field named valueOf",
  "accepted": true,
  "json": "{\"properties\": {\"valueOf\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field named prototype",
  "accepted": true,
  "json": "{\"properties\": {\"prototype\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a required field named __proto__",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"__proto__\": {\"type\": \"string\"}}, \"required\": [\"__proto__\"], \"type\": \"object\"}"
 },
 {
  "label": "__proto__ beside an ordinary field",
  "accepted": true,
  "json": "{\"properties\": {\"__proto__\": {\"minimum\": 0, \"type\": \"number\"}, \"answer\": {\"type\": \"string\"}}, \"required\": [\"answer\"], \"type\": \"object\"}"
 },
 {
  "label": "the seeded placeholder beside an unnamed field",
  "accepted": true,
  "json": "{\"properties\": {\"\": {\"type\": \"string\"}, \"field\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 }
];

export const CAPTURED_FIELD_SCHEMAS = Object.freeze(
  CAPTURED.map((entry) => Object.freeze({ ...entry, doc: JSON.parse(entry.json) })),
);
