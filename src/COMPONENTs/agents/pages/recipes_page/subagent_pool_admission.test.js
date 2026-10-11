import { subagent_pool_problems } from "./subagent_pool_config";
import {
  CAPTURED_POOL_ADMISSION,
  CAPTURED_POOL_REACHABILITY,
} from "./subagent_pool_admission_capture";

/* The mirror against the validator it mirrors, rule by rule, both directions.
   The direction that matters is the second: a pool the runtime refuses and
   the editor accepts is a pool the editor will help an author compose and
   then fail to run — and for this configuration there is no save-time
   refusal to fall back on, as the reachability rows below record. */

const codes = (config) => subagent_pool_problems(config).map((p) => p.code);
const found = (config) =>
  subagent_pool_problems(config).map((p) => `${p.code} @ ${p.where}`);

/* The one case this mirror declares it does not answer. An embedded Agent's
   Kernel configuration is the child's own subject: it is edited by drilling
   into that graph, where the whole panel applies to it. The row for an
   embedded entry says so rather than implying the graph is ready. If this
   gap is ever closed, this test is the thing that goes red — the boundary
   moved, and it should be deleted rather than worked around. */
const DECLARED_GAP = "embedded document has no kernel configuration";

describe("the editor refuses exactly what the runtime refuses", () => {
  CAPTURED_POOL_ADMISSION.filter((case_) => case_.label !== DECLARED_GAP).forEach(
    (case_) => {
      test(`${case_.accepted ? "admits" : "refuses"}: ${case_.label}`, () => {
        expect(subagent_pool_problems(case_.config).length === 0).toBe(
          case_.accepted,
        );
      });
    },
  );

  CAPTURED_POOL_ADMISSION.filter(
    (case_) => !case_.accepted && case_.label !== DECLARED_GAP,
  ).forEach((case_) => {
    test(`says why, at the runtime's own path: ${case_.label}`, () => {
      /* The runtime stops at the first problem and this does not, so the
         assertion is that its verdict is among them — not that it is alone. */
      const where = case_.path
        .reduce(
          (text, step) =>
            typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`,
          "",
        )
        .replace(/^\./, "");
      expect(found(case_.config)).toContain(`${case_.code} @ ${where}`);
    });
  });

  test("the declared gap is a gap, and nothing else is", () => {
    const gap = CAPTURED_POOL_ADMISSION.find(
      (case_) => case_.label === DECLARED_GAP,
    );
    expect(gap.accepted).toBe(false);
    expect(subagent_pool_problems(gap.config)).toEqual([]);
  });
});

describe("the case set is worth the name", () => {
  test("it exercises both verdicts and every code the validator has", () => {
    const refused = CAPTURED_POOL_ADMISSION.filter((c) => !c.accepted);
    expect(CAPTURED_POOL_ADMISSION.filter((c) => c.accepted).length).toBeGreaterThan(10);
    expect(refused.length).toBeGreaterThan(40);
    const seen = new Set(refused.map((c) => c.code));
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
    CAPTURED_POOL_ADMISSION.forEach((case_) => {
      expect(() => subagent_pool_problems(case_.config)).not.toThrow();
    });
  });

  test("every entry key the wire closes is listed in one place", () => {
    /* If the runtime adds a field, the capture's accepted cases stop being
       accepted and this is where it shows. */
    const accepted = CAPTURED_POOL_ADMISSION.find(
      (case_) => case_.label === "one referenced Agent",
    );
    expect(Object.keys(accepted.config.subagents[0]).sort()).toEqual([
      "allowed_modes",
      "allowed_tools",
      "description",
      "disabled_tools",
      "id",
      "memory_policy",
      "name",
      "output_mode",
      "parallel_safe",
      "source",
    ]);
  });
});

describe("why this mirror exists at all", () => {
  /* Frozen facts about the three boundaries, not about this code. If a
     refreshed capture ever shows the store refusing a broken pool, this test
     is where that arrives — and then the editor's refusals stop being the
     only ones the author can get. */
  test("the format check accepts every one of them", () => {
    CAPTURED_POOL_REACHABILITY.forEach((row) => {
      expect(row.format).toBe(null);
    });
  });

  test("the draft diagnostics say nothing about any of them", () => {
    CAPTURED_POOL_REACHABILITY.forEach((row) => {
      expect(row.draft).toEqual([]);
    });
  });

  test("and neither does the structural execution gate", () => {
    CAPTURED_POOL_REACHABILITY.forEach((row) => {
      expect(row.preflight_structure).toBe(null);
    });
  });

  test("only the Agent preparation refuses, which is Run", () => {
    const refused = CAPTURED_POOL_REACHABILITY.filter((row) => row.prepare !== null);
    expect(refused.length).toBeGreaterThan(3);
    refused.forEach((row) => {
      /* And the editor says the same thing about it, before Run does. */
      expect(codes(row.config)).toContain(row.prepare.code);
    });
  });
});
