import {
  MISSING_POLICIES,
  MISSING_POLICY_VALUES,
  OUTPUT_SOURCE_KINDS,
  binding_problems,
  first_present_expression,
  literal_expression,
  make_binding,
  make_output_mapping,
  missing_policy,
  output_mapping_problems,
  ref_expression,
  with_missing_policy,
} from "./skeleton_io";
import { BINDING_CASES, OUTPUT_MAPPING_CASES } from "./skeleton_io_cases";

const ref = ref_expression("start", ["text"]);

describe("the builder emits the exact objects the runtime accepts", () => {
  test("a binding carries three keys, and a fourth only for the default policy", () => {
    /* The consumer's objects are CLOSED: an unknown key is rejected, not
     * ignored, so a `default` carried along beside another policy is a refused
     * document rather than a harmless leftover. */
    expect(Object.keys(make_binding({ name: "topic", value: ref, missing: "error" })).sort()).toEqual(
      ["missing", "name", "value"],
    );
    expect(
      Object.keys(
        make_binding({ name: "topic", value: ref, missing: "default", default_value: "none" }),
      ).sort(),
    ).toEqual(["default", "missing", "name", "value"]);
    expect(
      make_binding({ name: "topic", value: ref, missing: "null", default_value: "ignored" }),
    ).not.toHaveProperty("default");
  });

  test("an output mapping carries a name and a source, and no type", () => {
    const mapping = make_output_mapping({ name: "answer", kind: "result", path: ["message"] });
    expect(Object.keys(mapping).sort()).toEqual(["name", "source"]);
    expect(Object.keys(mapping.source).sort()).toEqual(["kind", "path"]);
    /* The type is inherited from what the value came from; the `{name, type}`
     * rows the legacy format stores are a different shape. */
    expect(mapping).not.toHaveProperty("type");
    expect(mapping.source).not.toHaveProperty("type");
  });

  test("the three value expressions are what the runtime knows", () => {
    expect(literal_expression(7)).toEqual({ kind: "literal", value: 7 });
    expect(ref_expression("a1", ["output", 0])).toEqual({
      kind: "ref",
      node_id: "a1",
      path: ["output", 0],
    });
    expect(first_present_expression([ref, literal_expression(null)])).toEqual({
      kind: "first_present",
      values: [ref, { kind: "literal", value: null }],
    });
  });

  test("paths are copied, so editing a row cannot reach into another", () => {
    const path = ["text"];
    const made = ref_expression("start", path);
    path.push("leaked");
    expect(made.path).toEqual(["text"]);
  });
});

describe("a policy says what happens when the value is absent", () => {
  test("the three policies are the runtime's tokens", () => {
    expect(MISSING_POLICY_VALUES).toEqual(["error", "null", "default"]);
  });

  test("every label names a behaviour, never a type constraint", () => {
    /* "Required" and "Nullable" read as claims about what the value may be.
     * `error` does not forbid an explicit null, and `default` applies only on
     * absence — so a user reading the label as a type constraint would be
     * reading it wrong. */
    MISSING_POLICIES.forEach((policy) => {
      expect(policy.label).not.toMatch(/required|nullable|optional/i);
      expect(policy.label).toMatch(/missing/i);
      expect(policy.description).toBeTruthy();
    });
    expect(missing_policy("error").label).toBe("Fail if missing");
    expect(missing_policy("nope")).toBeNull();
  });

  test("choosing `error` still lets an explicit null be passed", () => {
    /* The policy is about absence. A resolved null is a value, and the builder
     * must not refuse to compose that binding. */
    const binding = make_binding({
      name: "topic",
      value: literal_expression(null),
      missing: "error",
    });
    expect(binding_problems([binding])).toEqual([]);
  });

  test("changing the policy rebuilds the object instead of leaving a stale default", () => {
    const withDefault = make_binding({
      name: "topic",
      value: ref,
      missing: "default",
      default_value: "none",
    });
    const toNull = with_missing_policy(withDefault, "null");
    expect(toNull).not.toHaveProperty("default");
    expect(binding_problems([toNull])).toEqual([]);
    /* Going back offers the default that was there rather than losing it. */
    expect(with_missing_policy(toNull, "default", "none").default).toBe("none");
  });
});

describe("the builder refuses to compose what the runtime would reject", () => {
  const problemCodes = (bindings) => binding_problems(bindings).map((p) => p.code);

  test("a default beside another policy is an unknown field", () => {
    expect(problemCodes([{ name: "a", value: ref, missing: "null", default: 1 }])).toEqual([
      "unknown_field",
    ]);
  });

  test("the default policy without a default is a missing field", () => {
    expect(problemCodes([{ name: "a", value: ref, missing: "default" }])).toEqual([
      "missing_field",
    ]);
  });

  test("an unknown policy is refused rather than passed through", () => {
    expect(problemCodes([{ name: "a", value: ref, missing: "optional" }])).toEqual([
      "invalid_value",
    ]);
  });

  test("two bindings cannot claim one name", () => {
    expect(
      problemCodes([
        { name: "a", value: ref, missing: "error" },
        { name: "a", value: ref, missing: "error" },
      ]),
    ).toEqual(["duplicate_name"]);
  });

  test("first_present needs two values, because one is just that value", () => {
    expect(problemCodes([{ name: "a", value: first_present_expression([ref]), missing: "error" }])).toEqual(
      ["invalid_value"],
    );
    expect(
      problemCodes([
        { name: "a", value: first_present_expression([ref, ref]), missing: "error" },
      ]),
    ).toEqual([]);
  });

  test("a nested expression is checked too", () => {
    expect(
      binding_problems([
        {
          name: "a",
          value: first_present_expression([ref, { kind: "ref", node_id: "", path: [] }]),
          missing: "error",
        },
      ])[0].where,
    ).toBe("bindings[0].value.values[1].node_id");
  });

  test("a path item is a string or a non-negative index, never anything else", () => {
    expect(problemCodes([{ name: "a", value: ref_expression("x", [-1]), missing: "error" }])).toEqual([
      "invalid_path",
    ]);
    expect(problemCodes([{ name: "a", value: ref_expression("x", [1.5]), missing: "error" }])).toEqual([
      "invalid_path",
    ]);
    expect(problemCodes([{ name: "a", value: ref_expression("x", ["a", 0]), missing: "error" }])).toEqual(
      [],
    );
  });

  test("an unknown expression kind is refused", () => {
    expect(problemCodes([{ name: "a", value: { kind: "env" }, missing: "error" }])).toEqual([
      "unknown_variant",
    ]);
  });
});

describe("output mappings are checked the same way", () => {
  const codes = (mappings) => output_mapping_problems(mappings).map((p) => p.code);

  test("a source is an input or a result and nothing else", () => {
    expect(OUTPUT_SOURCE_KINDS).toEqual(["input", "result"]);
    expect(codes([make_output_mapping({ name: "a", kind: "input", path: ["topic"] })])).toEqual([]);
    expect(codes([make_output_mapping({ name: "a", kind: "context", path: [] })])).toEqual([
      "unknown_variant",
    ]);
  });

  test("two outputs cannot claim one name", () => {
    expect(
      codes([
        make_output_mapping({ name: "a", kind: "result", path: [] }),
        make_output_mapping({ name: "a", kind: "input", path: [] }),
      ]),
    ).toEqual(["duplicate_name"]);
  });

  test("a missing source is reported once, not chased further", () => {
    expect(codes([{ name: "a" }])).toEqual(["invalid_type"]);
  });
});

describe("the case set the paired contract test will use", () => {
  test("the builder agrees with itself on every binding case", () => {
    BINDING_CASES.forEach((c) => {
      expect({ label: c.label, accepted: binding_problems(c.doc).length === 0 }).toEqual({
        label: c.label,
        accepted: c.accepted,
      });
    });
  });

  test("the builder agrees with itself on every mapping case", () => {
    OUTPUT_MAPPING_CASES.forEach((c) => {
      expect({ label: c.label, accepted: output_mapping_problems(c.doc).length === 0 }).toEqual({
        label: c.label,
        accepted: c.accepted,
      });
    });
  });

  test("the set covers both verdicts, so a permissive builder cannot pass it", () => {
    const covers = (cases) =>
      cases.some((c) => c.accepted) && cases.some((c) => !c.accepted);
    expect(covers(BINDING_CASES)).toBe(true);
    expect(covers(OUTPUT_MAPPING_CASES)).toBe(true);
  });
});
