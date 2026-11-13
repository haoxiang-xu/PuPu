import { document_problems } from "./skeleton_document";
import { subagent_pool_problems } from "./subagent_pool_config";
import capture from "./skeleton_document_presentation_capture.json";

/* BC-AP-002 mirror: `document.presentation` against the REAL unchain
   validator's verdicts (skeleton_document_presentation_capture.json, produced
   by validate_skeleton_document and the Subagent Pool validator — never hand
   written). Both directions: every document the runtime admits the editor
   admits, and every one it refuses the editor refuses at the same code and
   path. */

const where_of = (path) =>
  path
    .reduce((text, step) => (typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`), "")
    .replace(/^\./, "");

const doc_found = (document) => document_problems(document).map((p) => `${p.code} @ ${p.where}`);
const pool_found = (config) => subagent_pool_problems(config).map((p) => `${p.code} @ ${p.where}`);

const ENVELOPE = capture.envelope.map((case_) => ({ ...case_, value: JSON.parse(case_.json) }));
const EMBEDDED = capture.embedded.map((case_) => ({ ...case_, value: JSON.parse(case_.json) }));

describe("document.presentation: the editor admits exactly what the runtime admits", () => {
  ENVELOPE.forEach((case_) => {
    test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
      expect(document_problems(case_.value).length === 0).toBe(case_.accepted);
    });
  });

  ENVELOPE.filter((case_) => !case_.accepted).forEach((case_) => {
    test(`says why at the runtime's own path: ${case_.label}`, () => {
      const found = doc_found(case_.value);
      expect(found).toContain(`${case_.code} @ ${where_of(case_.path)}`);
      /* No second, invented fault on a presentation the runtime faults once. */
      expect(found.filter((entry) => entry.includes("presentation"))).toHaveLength(1);
    });
  });
});

describe("embedded subagent documents carry the same presentation rule", () => {
  EMBEDDED.forEach((case_) => {
    test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
      expect(subagent_pool_problems(case_.value).length === 0).toBe(case_.accepted);
    });
  });

  EMBEDDED.filter((case_) => !case_.accepted).forEach((case_) => {
    test(`says why at the runtime's own path: ${case_.label}`, () => {
      expect(pool_found(case_.value)).toContain(`${case_.code} @ ${where_of(case_.path)}`);
    });
  });
});

describe("the capture is worth the name", () => {
  test("it came from the producer and covers both verdicts and every presentation code", () => {
    expect(capture.schema).toBe("pupu.capture.skeleton_document_presentation.v1");
    expect(capture.producer.module).toMatch(/validate_skeleton_document/);
    [ENVELOPE, EMBEDDED].forEach((cases) => {
      expect(cases.filter((c) => c.accepted).length).toBeGreaterThanOrEqual(5);
      expect(cases.filter((c) => !c.accepted).length).toBeGreaterThanOrEqual(25);
      const codes = new Set(cases.filter((c) => !c.accepted).map((c) => c.code));
      ["invalid_type", "invalid_value", "unknown_field"].forEach((code) => expect([...codes]).toContain(code));
    });
    const labels = ENVELOPE.map((c) => c.label);
    ["presentation has an extra key", "icon has uppercase", "color is uppercase",
      "color is short hex", "presentation is a string", "an empty presentation"].forEach((label) =>
      expect(labels).toContain(label));
  });
});
