import { CAPTURED_OUTPUT_CASES } from "./skeleton_output_cases";
import { output_mapping_problems, output_mapping_is_editable } from "./skeleton_io";
import { output_source_kinds_for } from "./skeleton_document";
import { output_surface_problems } from "./detail_panel/output_variables_section";

/* The row field a problem is about, so a JS `where` string and a Python path
 * tuple can be compared without either being rewritten into the other. */
function js_verdicts(case_) {
  const node = {
    id: "n",
    type: case_.type,
    config: { execution: { inputs: case_.inputs || [], outputs: case_.outputs } },
  };
  return [
    ...output_mapping_problems(case_.outputs),
    ...output_surface_problems(node, case_.outputs),
  ].map((problem) => ({
    code: problem.code,
    field: problem.where.replace(/^mappings\[\d+\]\.?/, "").replace(/\[\d+\]$/, ""),
    row: Number(problem.where.match(/^mappings\[(\d+)\]/)[1]),
  }));
}

function captured_verdicts(case_) {
  return case_.diagnostics
    .filter((d) => typeof d.path[1] === "number")
    .map((d) => ({
      code: d.code,
      field: d.path
        .slice(2)
        .filter((part) => typeof part === "string")
        .join("."),
      row: d.path[1],
    }));
}

describe("the builder agrees with the real validator about output rows", () => {
  test("every case was captured", () => {
    expect(CAPTURED_OUTPUT_CASES).toHaveLength(20);
  });

  test.each(CAPTURED_OUTPUT_CASES.map((c) => [c.label, c]))(
    "%s",
    (_label, case_) => {
      /* A branch's whole section is refused, not a row in it; the section is
         not rendered at all, so there is no row to carry it and the partition
         has to report it elsewhere. */
      if (!output_source_kinds_for(case_.type).length) {
        expect(case_.diagnostics.map((d) => d.code)).toEqual(["unknown_field"]);
        return;
      }
      expect(js_verdicts(case_).sort((a, b) => a.row - b.row)).toEqual(
        captured_verdicts(case_).sort((a, b) => a.row - b.row),
      );
    },
  );
});

describe("a row the editor refuses to take apart is one the validator refused", () => {
  /* The two questions are different — the validator decides admission, the
   * editor decides whether its controls would rewrite what is there — so this
   * only holds one way: everything unreadable must also be invalid. A valid
   * row that the editor declines to edit would be a silently read-only row. */
  test.each(CAPTURED_OUTPUT_CASES.map((c) => [c.label, c]))(
    "%s",
    (_label, case_) => {
      (case_.outputs || []).forEach((mapping, index) => {
        if (output_mapping_is_editable(mapping)) return;
        const against = case_.diagnostics.filter((d) => d.path[1] === index);
        expect(against.length).toBeGreaterThan(0);
      });
    },
  );

  test("every row the validator accepted is editable", () => {
    CAPTURED_OUTPUT_CASES.forEach((case_) => {
      if (!output_source_kinds_for(case_.type).length) return;
      (case_.outputs || []).forEach((mapping, index) => {
        const wire = case_.diagnostics.filter(
          (d) =>
            d.path[1] === index &&
            ["invalid_type", "invalid_path", "unknown_variant"].includes(d.code),
        );
        if (wire.length === 0) {
          expect(output_mapping_is_editable(mapping)).toBe(true);
        }
      });
    });
  });
});
