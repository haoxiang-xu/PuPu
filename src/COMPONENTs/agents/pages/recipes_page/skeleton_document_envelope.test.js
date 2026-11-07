import { document_problems } from "./skeleton_document";
import { CAPTURED_DOCUMENT_ENVELOPE } from "./skeleton_document_envelope_capture";

/* The format mirror against the format validator, rule by rule. This is the
   layer `save_draft` runs, so a document the editor accepts and the store
   refuses is a draft the author cannot save and was not told about. */

const found = (document) =>
  document_problems(document).map((problem) => `${problem.code} @ ${problem.where}`);

const where_of = (path) =>
  path
    .reduce(
      (text, step) => (typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`),
      "",
    )
    .replace(/^\./, "");

/* JavaScript has one number type: `JSON.parse("1.0")` is `1` and
   `JSON.stringify(1)` is `"1"`. This editor can neither see the difference
   nor send one back, so the disagreement is not observable from here. */
const DECLARED_GAP = "schema_version is a float";

describe("the editor refuses exactly what the format check refuses", () => {
  CAPTURED_DOCUMENT_ENVELOPE.filter((case_) => case_.label !== DECLARED_GAP).forEach(
    (case_) => {
      test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
        expect(document_problems(case_.document).length === 0).toBe(case_.accepted);
      });
    },
  );

  CAPTURED_DOCUMENT_ENVELOPE.filter(
    (case_) => !case_.accepted && case_.label !== DECLARED_GAP,
  ).forEach((case_) => {
    test(`says why, at the validator's own path: ${case_.label}`, () => {
      expect(found(case_.document)).toContain(`${case_.code} @ ${where_of(case_.path)}`);
    });
  });

  test("the declared gap is the only one, and it is unobservable", () => {
    const gap = CAPTURED_DOCUMENT_ENVELOPE.find((case_) => case_.label === DECLARED_GAP);
    expect(gap.accepted).toBe(false);
    expect(JSON.parse(gap.json).schema_version).toBe(1);
    expect(document_problems(gap.document)).toEqual([]);
  });
});

describe("the case set is worth the name", () => {
  test("both verdicts, and every code the grammar has", () => {
    const refused = CAPTURED_DOCUMENT_ENVELOPE.filter((case_) => !case_.accepted);
    expect(CAPTURED_DOCUMENT_ENVELOPE.length).toBeGreaterThan(40);
    expect(refused.length).toBeGreaterThan(30);
    const seen = new Set(refused.map((case_) => case_.code));
    [
      "invalid_type",
      "invalid_value",
      "missing_field",
      "missing_value",
      "unknown_field",
      "unknown_variant",
      "duplicate_name",
    ].forEach((code) => expect([...seen]).toContain(code));
  });

  test("nothing in it throws", () => {
    CAPTURED_DOCUMENT_ENVELOPE.forEach((case_) => {
      expect(() => document_problems(case_.document)).not.toThrow();
    });
  });
});
