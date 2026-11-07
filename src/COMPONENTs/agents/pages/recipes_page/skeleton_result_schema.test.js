import { result_roots_for } from "./skeleton_result_roots";
import { result_root_problems } from "./detail_panel/output_variables_section";
import { output_schema_problems } from "./output_schema";
import { CAPTURED_RESULT_SCHEMAS } from "./skeleton_result_schema_capture";

/* The inventory against the runtime that produced it, both directions: every
   field the real pipeline published has to be offerable, and nothing may be
   called nonexistent unless the real pipeline refused to publish it. */

const agent = (json_schema) => ({
  id: "n",
  type: "agent",
  config: { execution: {}, kernel: { json_schema } },
});

const mapping = (name) => ({
  name: "out",
  source: { kind: "result", path: [name] },
});

const BUILT_INS = ["message", "context"];

describe("a loaded output schema is read the way the runtime reads it", () => {
  CAPTURED_RESULT_SCHEMAS.cases.forEach((case_) => {
    describe(case_.label, () => {
      test("every field the runtime published is offered", () => {
        const { roots } = result_roots_for(agent(case_.schema));
        case_.parsed_keys.forEach((name) => {
          expect(roots).toContain(name);
        });
      });

      test("the built-ins are still there and offered once", () => {
        const { roots } = result_roots_for(agent(case_.schema));
        BUILT_INS.forEach((name) => {
          expect(roots.filter((root) => root === name)).toEqual([name]);
        });
      });

      test("closedness is the runtime's answer, not a reading of the schema", () => {
        expect(result_roots_for(agent(case_.schema)).closed).toBe(case_.closed);
      });

      test("every field offered really exported a value", () => {
        const exported = new Set(
          case_.exports
            .filter((entry) => entry.exported)
            .map((entry) => entry.root),
        );
        result_roots_for(agent(case_.schema)).roots.forEach((root) => {
          expect(exported.has(root)).toBe(true);
        });
      });

      test("a field is called nonexistent only where the schema is closed", () => {
        const problems = result_root_problems(agent(case_.schema), [
          mapping("zz_not_declared_anywhere"),
        ]);
        expect(problems.length > 0).toBe(case_.closed);
      });
    });
  });
});

describe("what a schema declares deeper down is not a root", () => {
  const find = (label) =>
    CAPTURED_RESULT_SCHEMAS.cases.find((case_) => case_.label === label);

  test("a nested object's own property is not offered", () => {
    const case_ = find("a nested object declares names that are not roots");
    const { roots } = result_roots_for(agent(case_.schema));
    expect(roots).toContain("outer");
    expect(roots).not.toContain("inner");
  });

  test("a definition nothing references is not offered", () => {
    const case_ = find("$defs that nothing references");
    const { roots } = result_roots_for(agent(case_.schema));
    expect(roots).toContain("answer");
    expect(roots).not.toContain("ghost");
  });

  test("a bounded root does not offer the name its own $ref declares", () => {
    /* The runtime refused it with `output_invalid` — `notes` records the call
       — so offering it would be offering an address that cannot exist. */
    const case_ = find("bounded root beside a $ref that declares another name");
    const { roots, closed } = result_roots_for(agent(case_.schema));
    expect(closed).toBe(true);
    expect(roots).toContain("a");
    expect(roots).not.toContain("b");
    expect(CAPTURED_RESULT_SCHEMAS.notes).toEqual([
      {
        label: "bounded root accepts the $ref's own name",
        accepted: false,
        code: "output_invalid",
      },
    ]);
  });
});

describe("the fields a declaration construct contributes", () => {
  test("a root $ref contributes its target's fields", () => {
    const node = agent({
      type: "object",
      $ref: "#/$defs/Payload",
      $defs: { Payload: { type: "object", properties: { score: {} } } },
    });
    expect(result_roots_for(node).roots).toEqual([...BUILT_INS, "score"]);
  });

  test("anyOf contributes every alternative's fields", () => {
    const node = agent({
      type: "object",
      anyOf: [
        { type: "object", properties: { score: {} } },
        { type: "object", properties: { label: {} } },
      ],
    });
    expect(result_roots_for(node).roots).toEqual([
      ...BUILT_INS,
      "score",
      "label",
    ]);
  });

  test("a field whose legal name is the empty string is kept", () => {
    const node = agent({ type: "object", properties: { "": {} } });
    expect(result_roots_for(node).roots).toEqual([...BUILT_INS, ""]);
  });

  test("an unresolvable reference leaves the list open rather than closing it", () => {
    const node = agent({ type: "object", $ref: "#/$defs/Missing" });
    expect(result_roots_for(node).closed).toBe(false);
  });

  test("a reference the runtime does not support contributes no bound", () => {
    /* `_resolve_local_reference` takes `#/$defs/` only. A bound read through
       anything else would be a bound the runtime never agreed to. */
    const node = agent({
      type: "object",
      $ref: "#/elsewhere",
      elsewhere: { type: "object", properties: { score: {} }, additionalProperties: false },
    });
    expect(result_roots_for(node).closed).toBe(false);
  });

  test("a reference cycle is survived without closing the list", () => {
    const node = agent({
      type: "object",
      $ref: "#/$defs/A",
      $defs: { A: { type: "object", $ref: "#/$defs/A" } },
    });
    expect(() => result_roots_for(node)).not.toThrow();
    expect(result_roots_for(node).closed).toBe(false);
  });

  test("no schema at all is closed on the two built-ins", () => {
    expect(result_roots_for(agent(null))).toEqual({
      known: true,
      roots: BUILT_INS,
      closed: true,
      reason: null,
    });
  });

  test("a schema this editor cannot read says so instead of closing", () => {
    const roots = result_roots_for(agent("nope"));
    expect(roots.roots).toEqual(BUILT_INS);
    expect(roots.closed).toBe(false);
    expect(roots.reason).toBeTruthy();
  });
});

describe("the inventory follows only references the runtime would follow", () => {
  /* A pointer into a `const` lands on an ordinary JSON object. The runtime
     refuses the schema outright — `invalid_reference`, because the target is
     not a schema node its walker registered — so whatever field names happen
     to be spelled inside that value describe nothing. Offering them would put
     a root on the picker that cannot exist, in a draft that cannot be saved. */
  const through_a_const = {
    type: "object",
    $ref: "#/$defs/A/const",
    $defs: { A: { const: { properties: { ghost: { type: "string" } } } } },
  };

  test("a name spelled inside a const value is not offered as a root", () => {
    const { roots } = result_roots_for(agent(through_a_const));
    expect(roots).toEqual(BUILT_INS);
    expect(roots).not.toContain("ghost");
  });

  test("and the list is not called closed on the strength of it", () => {
    expect(result_roots_for(agent(through_a_const)).closed).toBe(false);
  });

  test("the editor refuses that schema, the way the runtime does", () => {
    expect(output_schema_problems(through_a_const).map((p) => p.code)).toContain(
      "invalid_reference",
    );
  });

  test("a reference to a real schema node is still followed", () => {
    const node = agent({
      type: "object",
      $ref: "#/$defs/A",
      $defs: { A: { type: "object", properties: { real: { type: "string" } } } },
    });
    expect(result_roots_for(node).roots).toEqual([...BUILT_INS, "real"]);
  });
});
