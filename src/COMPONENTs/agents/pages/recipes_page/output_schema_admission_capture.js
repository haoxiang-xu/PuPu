/* One schema per rule in `kernel_output.py`, with the real validator's verdict.
 *
 * `output_schema_cases` came first and says of itself that it was frozen
 * against an unpinned working tree — "evidence of agreement on that day, not
 * the paired contract test". Replayed against the pinned installed artifact it
 * does agree, 12/12. It is also twelve cases, and it agreed because it tested
 * the rules it happened to cover: a differential run over every rule in
 * `validate_output_schema` found the mirror accepting 24 of 43 schemas the
 * runtime refuses. All 24 in that direction — an editor built on it would let
 * an author compose a schema that is only refused at save.
 *
 * So the rules are enumerated from the validator rather than from a reading of
 * it, and both verdicts are recorded. The `code` is the runtime's own, because
 * a mirror that refuses the right schema for the wrong stated reason is still
 * telling the author something false about why.
 *
 * The runtime stops at the first problem and the editor does not — it reports
 * everything wrong at once — so a refused case pins *that the code appears*,
 * not that it is the only one.
 *
 * One rule is deliberately absent: `Draft202012Validator.check_schema`. That
 * is a whole JSON Schema implementation and is not mirrored; it is the reason
 * the editor still has to survive a save rejection it did not predict.
 *
 * Later rounds added the rules a review found the mirror still missing: a
 * `$ref` whose target is an ordinary JSON object rather than a schema node
 * the walker registered — reachable through `const` and `enum`, and through
 * `required`, which is an array of names — and the property names that are
 * legal here and dangerous in JavaScript: `__proto__`, `constructor`,
 * `toString`. The runtime admits all three as field names and publishes a
 * `__proto__` field; this editor erased it.
 *
 * Captured from the fixed installed `unchain==0.2.0`
 * (`df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178`).
 * Nothing was rebuilt. The depth boundary is probed, not assumed: thirty
 * levels of the nesting shape below is the deepest it takes, thirty-one is
 * `limit_depth`.
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
  "label": "$schema at the admitted dialect",
  "accepted": true,
  "json": "{\"$schema\": \"https://json-schema.org/draft/2020-12/schema\", \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "$schema at another dialect",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$schema"
  ],
  "json": "{\"$schema\": \"http://json-schema.org/draft-07/schema#\", \"type\": \"object\"}"
 },
 {
  "label": "$schema that is not a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$schema"
  ],
  "json": "{\"$schema\": 7, \"type\": \"object\"}"
 },
 {
  "label": "$defs that is not an object",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$defs"
  ],
  "json": "{\"$defs\": [], \"properties\": {}, \"type\": \"object\"}"
 },
 {
  "label": "$defs holding something that is not a schema",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$defs",
   "A"
  ],
  "json": "{\"$defs\": {\"A\": \"nope\"}, \"type\": \"object\"}"
 },
 {
  "label": "$ref that is not a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "$ref"
  ],
  "json": "{\"$ref\": 7, \"type\": \"object\"}"
 },
 {
  "label": "$ref to a definition that is absent",
  "accepted": false,
  "code": "invalid_reference",
  "path": [
   "schema",
   "$ref"
  ],
  "json": "{\"$ref\": \"#/$defs/Missing\", \"type\": \"object\"}"
 },
 {
  "label": "$ref that is percent-encoded",
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ],
  "json": "{\"$defs\": {\"A B\": {\"type\": \"object\"}}, \"$ref\": \"#/$defs/A%20B\", \"type\": \"object\"}"
 },
 {
  "label": "$ref outside $defs",
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ],
  "json": "{\"$ref\": \"#/properties/a\", \"properties\": {\"a\": {\"type\": \"object\"}}, \"type\": \"object\"}"
 },
 {
  "label": "$ref to the root itself",
  "accepted": false,
  "code": "unsupported_reference",
  "path": [
   "schema",
   "$ref"
  ],
  "json": "{\"$ref\": \"#\", \"type\": \"object\"}"
 },
 {
  "label": "$ref with a ~1 escape",
  "accepted": true,
  "json": "{\"$defs\": {\"a/b\": {\"properties\": {\"x\": {\"type\": \"string\"}}, \"type\": \"object\"}}, \"$ref\": \"#/$defs/a~1b\", \"type\": \"object\"}"
 },
 {
  "label": "title that is not a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "title"
  ],
  "json": "{\"title\": 7, \"type\": \"object\"}"
 },
 {
  "label": "description that is not a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "description"
  ],
  "json": "{\"description\": [], \"type\": \"object\"}"
 },
 {
  "label": "a nested type given as a list",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": [\"string\", \"null\"]}}, \"type\": \"object\"}"
 },
 {
  "label": "a nested type list with a repeat",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "type"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": [\"string\", \"string\"]}}, \"type\": \"object\"}"
 },
 {
  "label": "a nested type list that is empty",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "type"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": []}}, \"type\": \"object\"}"
 },
 {
  "label": "required naming its properties",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"required\": [\"a\"], \"type\": \"object\"}"
 },
 {
  "label": "required that is not an array",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"required\": \"a\", \"type\": \"object\"}"
 },
 {
  "label": "required holding a non-string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"required\": [7], \"type\": \"object\"}"
 },
 {
  "label": "required with a repeated name",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "required"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}, \"required\": [\"a\", \"a\"], \"type\": \"object\"}"
 },
 {
  "label": "additionalProperties as a schema",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "additionalProperties"
  ],
  "json": "{\"additionalProperties\": {\"type\": \"string\"}, \"type\": \"object\"}"
 },
 {
  "label": "additionalProperties as false",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "items on an array property",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "enum that is empty",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "enum"
  ],
  "json": "{\"properties\": {\"a\": {\"enum\": []}}, \"type\": \"object\"}"
 },
 {
  "label": "enum that is not an array",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "enum"
  ],
  "json": "{\"properties\": {\"a\": {\"enum\": \"ab\"}}, \"type\": \"object\"}"
 },
 {
  "label": "enum of scalars",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"enum\": [\"x\", 1, null]}}, \"type\": \"object\"}"
 },
 {
  "label": "const of null",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"const\": null}}, \"type\": \"object\"}"
 },
 {
  "label": "minItems that is negative",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minItems"
  ],
  "json": "{\"properties\": {\"a\": {\"minItems\": -1, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "minItems that is a float",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minItems"
  ],
  "json": "{\"properties\": {\"a\": {\"minItems\": 1.5, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "maxLength that is a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "maxLength"
  ],
  "json": "{\"properties\": {\"a\": {\"maxLength\": \"10\", \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "minimum that is a float",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"minimum\": 0.5, \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "minimum that is a string",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "minimum"
  ],
  "json": "{\"properties\": {\"a\": {\"minimum\": \"0\", \"type\": \"number\"}}, \"type\": \"object\"}"
 },
 {
  "label": "anyOf that is empty",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "anyOf"
  ],
  "json": "{\"anyOf\": [], \"type\": \"object\"}"
 },
 {
  "label": "anyOf that is not an array",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "anyOf"
  ],
  "json": "{\"anyOf\": {}, \"type\": \"object\"}"
 },
 {
  "label": "anyOf of two object alternatives",
  "accepted": true,
  "json": "{\"anyOf\": [{\"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}, {\"properties\": {\"b\": {\"type\": \"string\"}}, \"type\": \"object\"}], \"type\": \"object\"}"
 },
 {
  "label": "a reserved name reached through a root anyOf",
  "accepted": false,
  "code": "reserved_name",
  "path": [
   "schema",
   "properties"
  ],
  "json": "{\"anyOf\": [{\"properties\": {\"message\": {\"type\": \"string\"}}, \"type\": \"object\"}], \"type\": \"object\"}"
 },
 {
  "label": "a root with no type at all",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "type"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": \"string\"}}}"
 },
 {
  "label": "a root type given as a list holding object",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "type"
  ],
  "json": "{\"properties\": {}, \"type\": [\"object\"]}"
 },
 {
  "label": "properties that is not an object",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties"
  ],
  "json": "{\"properties\": [], \"type\": \"object\"}"
 },
 {
  "label": "a property whose schema is not an object",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a"
  ],
  "json": "{\"properties\": {\"a\": 7}, \"type\": \"object\"}"
 },
 {
  "label": "a property named with the empty string",
  "accepted": true,
  "json": "{\"properties\": {\"\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "minLength on a nested string",
  "accepted": true,
  "json": "{\"properties\": {\"a\": {\"maxLength\": 5, \"minLength\": 0, \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "nesting at the deepest the runtime takes",
  "accepted": true,
  "json": "{\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"type\": \"string\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}"
 },
 {
  "label": "nesting one step past it",
  "accepted": false,
  "code": "limit_depth",
  "path": [
   "schema",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "properties",
   "n",
   "type"
  ],
  "json": "{\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"properties\": {\"n\": {\"type\": \"string\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a keyword outside the allowed subset",
  "accepted": false,
  "code": "unknown_keyword",
  "path": [
   "schema",
   "properties",
   "a",
   "pattern"
  ],
  "json": "{\"properties\": {\"a\": {\"pattern\": \"^x$\", \"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a root property named message",
  "accepted": false,
  "code": "reserved_name",
  "path": [
   "schema",
   "properties"
  ],
  "json": "{\"properties\": {\"message\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a node that is not an object under items",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "items"
  ],
  "json": "{\"properties\": {\"a\": {\"items\": 7, \"type\": \"array\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference into an object inside const",
  "accepted": false,
  "code": "invalid_reference",
  "path": [
   "schema",
   "properties",
   "a",
   "$ref"
  ],
  "json": "{\"$defs\": {\"A\": {\"const\": {}}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/const\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference into an object inside enum",
  "accepted": false,
  "code": "invalid_reference",
  "path": [
   "schema",
   "properties",
   "a",
   "$ref"
  ],
  "json": "{\"$defs\": {\"A\": {\"enum\": [{}]}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/enum/0\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference to a real nested schema node",
  "accepted": true,
  "json": "{\"$defs\": {\"A\": {\"properties\": {\"a\": {\"type\": \"string\"}}, \"type\": \"object\"}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/properties/a\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference to a definition itself",
  "accepted": true,
  "json": "{\"$defs\": {\"A\": {\"type\": \"object\"}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field whose legal name is __proto__",
  "accepted": true,
  "json": "{\"additionalProperties\": false, \"properties\": {\"__proto__\": {\"type\": \"string\"}}, \"required\": [\"__proto__\"], \"type\": \"object\"}"
 },
 {
  "label": "a field whose name is constructor",
  "accepted": true,
  "json": "{\"properties\": {\"constructor\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field whose name is toString",
  "accepted": true,
  "json": "{\"properties\": {\"toString\": {\"type\": \"string\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a field whose declared type is __proto__",
  "accepted": false,
  "code": "invalid_schema",
  "path": [
   "schema",
   "properties",
   "a",
   "type"
  ],
  "json": "{\"properties\": {\"a\": {\"type\": \"__proto__\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference into items of a real schema",
  "accepted": true,
  "json": "{\"$defs\": {\"A\": {\"items\": {\"type\": \"string\"}, \"type\": \"array\"}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/items\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference into an anyOf alternative",
  "accepted": true,
  "json": "{\"$defs\": {\"A\": {\"anyOf\": [{\"type\": \"object\"}], \"type\": \"object\"}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/anyOf/0\"}}, \"type\": \"object\"}"
 },
 {
  "label": "a reference into required, which is not a schema",
  "accepted": false,
  "code": "invalid_reference",
  "path": [
   "schema",
   "properties",
   "a",
   "$ref"
  ],
  "json": "{\"$defs\": {\"A\": {\"properties\": {\"x\": {\"type\": \"string\"}}, \"required\": [\"x\"], \"type\": \"object\"}}, \"properties\": {\"a\": {\"$ref\": \"#/$defs/A/required\"}}, \"type\": \"object\"}"
 }
];

export const CAPTURED_SCHEMA_ADMISSION = Object.freeze(
  CAPTURED.map((entry) => Object.freeze({ ...entry, doc: JSON.parse(entry.json) })),
);
