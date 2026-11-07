import {
  agent_result_sources,
  output_schema_problems,
  schema_root_scope,
} from "./output_schema";
import { CAPTURED_SCHEMA_ADMISSION } from "./output_schema_admission_capture";

/* The mirror against the validator it mirrors, rule by rule, both directions.
   The direction that matters is the second: a schema the runtime refuses and
   the editor accepts is a schema the editor will help an author compose and
   then fail to save. */

const codes = (schema) => output_schema_problems(schema).map((p) => p.code);

describe("the editor refuses exactly what the runtime refuses", () => {
  CAPTURED_SCHEMA_ADMISSION.forEach((case_) => {
    test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
      const problems = output_schema_problems(case_.doc);
      expect(problems.length === 0).toBe(case_.accepted);
    });
  });

  CAPTURED_SCHEMA_ADMISSION.filter((case_) => !case_.accepted).forEach((case_) => {
    test(`says why, the runtime's way: ${case_.label}`, () => {
      /* The runtime stops at the first problem and this does not, so the
         assertion is that its reason is among them — not that it is alone. */
      expect(codes(case_.doc)).toContain(case_.code);
    });
  });
});

describe("the case set is worth the name", () => {
  test("it holds both verdicts, and more refusals than admissions", () => {
    const refused = CAPTURED_SCHEMA_ADMISSION.filter((c) => !c.accepted);
    expect(CAPTURED_SCHEMA_ADMISSION.filter((c) => c.accepted).length).toBeGreaterThan(5);
    expect(refused.length).toBeGreaterThan(refused.length / 2);
  });

  test("every refusal code the runtime has a word for is exercised", () => {
    const seen = new Set(
      CAPTURED_SCHEMA_ADMISSION.filter((c) => !c.accepted).map((c) => c.code),
    );
    [
      "invalid_schema",
      "unknown_keyword",
      "reserved_name",
      "unsupported_reference",
      "invalid_reference",
      "limit_depth",
    ].forEach((code) => expect([...seen]).toContain(code));
  });

  test("nothing in it throws", () => {
    CAPTURED_SCHEMA_ADMISSION.forEach((case_) => {
      expect(() => output_schema_problems(case_.doc)).not.toThrow();
    });
  });
});

describe("a draft deep enough to break a recursive reader", () => {
  /* Both the keyword walk and the reference graph recurse, and an editor is
     given drafts rather than admitted schemas. The limit is reported and the
     recursive readers are not reached — the runtime's own order, and the
     reason the panel does not fall over inside the code that was about to
     explain the problem. */
  const nest = (levels) => {
    let node = { type: "string" };
    for (let i = 0; i < levels; i += 1) {
      node = { type: "object", properties: { n: node } };
    }
    return { type: "object", properties: { n: node } };
  };

  test("says the depth, once", () => {
    expect(codes(nest(4000))).toEqual(["limit_depth"]);
  });

  test("and does not throw getting there", () => {
    expect(() => output_schema_problems(nest(20000))).not.toThrow();
  });

  test("a draft just inside the limit is still read in full", () => {
    expect(codes(nest(30))).toEqual([]);
  });

  /* Admission is one reader of a draft and the result inventory is another.
     The outputs section asks what a schema declares at its root on every
     render, with no limit check in front of it, so every reader *it* reaches
     has to be bounded too. Collecting which objects the walk read as schemas
     — added so a `$ref` into a `const` could be refused — was written
     recursive, and this draft is what found it: the panel stopped rendering
     at all, rather than reporting a depth. */
  test("the root inventory answers for it instead of falling over", () => {
    expect(() => schema_root_scope(nest(4000))).not.toThrow();
    expect(schema_root_scope(nest(4000)).names).toEqual(["n"]);
    expect(schema_root_scope(nest(4000)).readable).toBe(true);
  });

  test("and so does the list of what an Agent exports", () => {
    expect(() => agent_result_sources(nest(4000))).not.toThrow();
    expect(agent_result_sources(nest(4000)).map((source) => source.name)).toEqual([
      "message",
      "context",
      "n",
    ]);
  });

  test("neither of them falls over on a draft far past the limit", () => {
    expect(() => schema_root_scope(nest(50000))).not.toThrow();
    expect(() => agent_result_sources(nest(50000))).not.toThrow();
  });

  test("a deeply nested alternative is bounded as well", () => {
    let node = { type: "object", properties: { deep: { type: "string" } } };
    for (let i = 0; i < 6000; i += 1) node = { type: "object", anyOf: [node] };
    expect(() => schema_root_scope(node)).not.toThrow();
    expect(() => output_schema_problems(node)).not.toThrow();
  });
});
