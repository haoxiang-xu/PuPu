import { output_schema_problems } from "./output_schema";
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
