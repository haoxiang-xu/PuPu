import {
  ALLOWED_KEYWORDS,
  JSON_OUTPUT_CONFIG_KEY,
  JSON_TYPES,
  RESERVED_ROOT_PROPERTIES,
  agent_result_sources,
  output_schema_problems,
} from "./output_schema";
import { OUTPUT_SCHEMA_CASES } from "./output_schema_cases";

const codes = (schema) => output_schema_problems(schema).map((p) => p.code);

describe("an Agent always exports message and context", () => {
  test("both are there with no schema at all, and neither can be edited", () => {
    const sources = agent_result_sources(null);
    expect(sources.map((s) => s.name)).toEqual(["message", "context"]);
    expect(sources.map((s) => s.type)).toEqual(["string", "object"]);
    expect(sources.every((s) => s.locked)).toBe(true);
  });

  test("JSON output adds its fields beside them, not underneath", () => {
    /* The runtime merges the parsed object into the same result, so a schema
     * field sits at the same level as the built-ins — which is exactly why the
     * two names are reserved. */
    const sources = agent_result_sources({
      type: "object",
      properties: { answer: { type: "string" }, score: { type: "number" } },
    });
    expect(sources.map((s) => s.name)).toEqual([
      "message",
      "context",
      "answer",
      "score",
    ]);
    expect(sources.map((s) => s.path)).toEqual([
      ["message"],
      ["context"],
      ["answer"],
      ["score"],
    ]);
    expect(sources.filter((s) => s.locked).map((s) => s.name)).toEqual([
      "message",
      "context",
    ]);
  });

  test("a schema field cannot displace a built-in", () => {
    /* Such a schema is refused, but the source list must not offer two
     * `message` entries even if one reaches it. */
    const sources = agent_result_sources({
      type: "object",
      properties: { message: { type: "string" } },
    });
    expect(sources.map((s) => s.name)).toEqual(["message", "context"]);
    expect(sources[0].locked).toBe(true);
  });
});

describe("the editor refuses what the runtime would reject", () => {
  test("the root must describe an object", () => {
    expect(codes({ type: "array", items: { type: "string" } })).toContain(
      "invalid_schema",
    );
    expect(codes({ type: "object", properties: {} })).toEqual([]);
  });

  RESERVED_ROOT_PROPERTIES.forEach((name) => {
    test(`a root property named ${name} is refused`, () => {
      expect(
        codes({ type: "object", properties: { [name]: { type: "string" } } }),
      ).toEqual(["reserved_name"]);
    });
  });

  test("the reserved names are refused at the effective root, not everywhere", () => {
    /* Nested under `properties` describes a different object, so it may use
     * them; through a root `$ref` it is still the result's own shape. */
    expect(
      codes({
        type: "object",
        properties: {
          detail: { type: "object", properties: { message: { type: "string" } } },
        },
      }),
    ).toEqual([]);
    expect(
      codes({
        type: "object",
        $defs: {
          Root: { type: "object", properties: { message: { type: "string" } } },
        },
        $ref: "#/$defs/Root",
      }),
    ).toContain("reserved_name");
  });

  test("only the bounded keyword subset is offered", () => {
    expect(ALLOWED_KEYWORDS).toContain("anyOf");
    expect(ALLOWED_KEYWORDS).not.toContain("pattern");
    expect(
      codes({ type: "object", properties: { a: { type: "string", pattern: "^a" } } }),
    ).toEqual(["unknown_keyword"]);
  });

  test("only the seven JSON types are offered", () => {
    expect(JSON_TYPES).toEqual([
      "array",
      "boolean",
      "integer",
      "null",
      "number",
      "object",
      "string",
    ]);
    expect(codes({ type: "object", properties: { a: { type: "text" } } })).toEqual([
      "invalid_schema",
    ]);
  });

  test("a schema node that is not an object is reported, not walked into", () => {
    expect(codes({ type: "object", properties: { a: "string" } })).toEqual([
      "invalid_schema",
    ]);
    expect(codes(null)).toEqual(["invalid_schema"]);
  });

  test("a cycle is refused rather than hanging the editor", () => {
    /* The code was `invalid_schema` here, which is not the runtime's: a cycle
       is caught by `_validate_json_tree` before any keyword is read, and it
       says `invalid_json` with "JSON value cannot contain a cycle". Asked of
       the pinned installation directly, that is the answer. A mirror that
       refuses the right schema under the wrong name still tells the author
       something false about why. */
    const schema = { type: "object", properties: {} };
    schema.properties.self = schema;
    expect(codes(schema)).toEqual(["invalid_json"]);
  });

  test("a reference cycle is refused with the code the runtime uses for it", () => {
    /* A different cycle: the JSON is finite, the reference graph is not.
       `resolve_references` answers this one, with `reference_cycle`. */
    expect(
      codes({
        type: "object",
        $ref: "#/$defs/A",
        $defs: { A: { type: "object", $ref: "#/$defs/B" }, B: { type: "object", $ref: "#/$defs/A" } },
      }),
    ).toContain("reference_cycle");
  });

  test("the config key is the one the runtime reads", () => {
    expect(JSON_OUTPUT_CONFIG_KEY).toBe("json_schema");
  });
});

describe("the case set the paired contract test will use", () => {
  test("the editor agrees with itself on every case", () => {
    OUTPUT_SCHEMA_CASES.forEach((c) => {
      expect({
        label: c.label,
        accepted: output_schema_problems(c.doc).length === 0,
      }).toEqual({ label: c.label, accepted: c.accepted });
    });
  });

  test("the set covers both verdicts, so a permissive editor cannot pass it", () => {
    expect(OUTPUT_SCHEMA_CASES.some((c) => c.accepted)).toBe(true);
    expect(OUTPUT_SCHEMA_CASES.some((c) => !c.accepted)).toBe(true);
  });
});
