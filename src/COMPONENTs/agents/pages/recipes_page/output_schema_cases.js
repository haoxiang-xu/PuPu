/* Output schemas the editor may compose, as one case set both sides can be
 * checked against.
 *
 * Verified against `unchain.skeleton.kernel_output.validate_output_schema` on
 * 2026-09-28. That run used an unpinned working tree, so it is evidence of
 * agreement on that day, not the paired contract test; the set is frozen here
 * so the real test can emit from it once a pinned artifact exists. */

const object_of = (properties, extra) => ({
  type: "object",
  properties,
  ...(extra || {}),
});

export const OUTPUT_SCHEMA_CASES = Object.freeze([
  {
    label: "a flat object of scalars",
    accepted: true,
    doc: object_of({
      answer: { type: "string" },
      score: { type: "number", minimum: 0, maximum: 1 },
    }),
  },
  {
    label: "a nested object and an array",
    accepted: true,
    doc: object_of({
      items: { type: "array", items: { type: "string" }, maxItems: 10 },
      detail: object_of({ note: { type: "string", maxLength: 200 } }),
    }),
  },
  {
    label: "enum and const",
    accepted: true,
    doc: object_of({
      verdict: { type: "string", enum: ["pass", "fail"] },
      kind: { const: "review" },
    }),
  },
  {
    label: "a local $ref into $defs",
    accepted: true,
    doc: {
      type: "object",
      $defs: { Row: object_of({ name: { type: "string" } }) },
      properties: { row: { $ref: "#/$defs/Row" } },
    },
  },
  {
    label: "a reserved name nested under properties describes another object",
    accepted: true,
    /* `message` here is a field of `detail`, not of the result, so it cannot
     * collide with the built-in. Refusing it everywhere would be stricter than
     * the runtime and would block a reasonable schema. */
    doc: object_of({ detail: object_of({ message: { type: "string" } }) }),
  },

  {
    label: "a root that is not an object",
    accepted: false,
    doc: { type: "array", items: { type: "string" } },
  },
  {
    label: "a root property named message",
    accepted: false,
    doc: object_of({ message: { type: "string" } }),
  },
  {
    label: "a root property named context",
    accepted: false,
    doc: object_of({ context: { type: "object" } }),
  },
  {
    label: "a reserved name reached through a root $ref",
    accepted: false,
    /* The root delegates to a definition that declares `message`, so the
     * effective root still exposes it. */
    doc: {
      type: "object",
      $defs: { Root: object_of({ message: { type: "string" } }) },
      $ref: "#/$defs/Root",
    },
  },
  {
    label: "a keyword outside the allowed subset",
    accepted: false,
    doc: object_of({ answer: { type: "string", pattern: "^a" } }),
  },
  {
    label: "a type the runtime does not know",
    accepted: false,
    doc: object_of({ answer: { type: "text" } }),
  },
  {
    label: "a schema node that is not an object",
    accepted: false,
    doc: object_of({ answer: "string" }),
  },
]);
