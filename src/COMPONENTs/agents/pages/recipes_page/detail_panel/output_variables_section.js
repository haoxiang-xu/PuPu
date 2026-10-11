import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import OutputRow from "./output_row";
import {
  node_bindings,
  node_declares_outputs,
  node_output_mappings,
  output_source_kinds_for,
  with_node_output_mappings,
} from "../skeleton_document";
import { make_output_mapping, output_mapping_problems } from "../skeleton_io";

/* Output Variables: what this node passes on, and from where.
 *
 * This is the other half of a binding. An input row reads a name some upstream
 * node exports; these rows are what that list is made of, so a graph wires up
 * from the bottom of one panel to the top of the next.
 *
 * Nothing here decides admission. The store's `diagnose` and the runtime's
 * `validate_static_execution_io` do, and the two checks below only mirror them
 * so a row can say what is wrong with it before any round trip — the same
 * split the input rows use. The mirror is deliberately narrow: it repeats only
 * what is statically knowable, and a result's shape is not. */

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

function input_names(node) {
  return node_bindings(node)
    .map((binding) => binding && binding.name)
    .filter((name) => typeof name === "string" && name);
}

/* The builder's reading of `StaticIOSurfaces.output_problem`, plus the one
   rule the draft diagnose states in words: "end outputs may only use inputs".
   Both are reachable from a loaded draft even though the controls will not
   compose them, so both have to be sayable on a row. */
export function output_surface_problems(node, mappings) {
  const problems = [];
  const names = input_names(node);
  const type = node && node.type;
  mappings.forEach((mapping, index) => {
    const source = mapping && mapping.source;
    if (!source || typeof source !== "object") return;
    const where = `mappings[${index}].source`;
    if (type === "end" && source.kind !== "input" && source.kind !== undefined) {
      problems.push({
        code: "invalid_value",
        where: `${where}.kind`,
        message: "An End can only export what it was given, not a result.",
      });
      return;
    }
    if (source.kind !== "input") return;
    const [first] = Array.isArray(source.path) ? source.path : [];
    if (first === undefined) return; /* The whole inputs object; nothing to name. */
    if (!names.includes(first)) {
      problems.push({
        code: "missing_value",
        where: `${where}.path[0]`,
        message: `This node has no input named "${first}".`,
      });
    }
  });
  return problems;
}

export default function OutputVariablesSection({
  document,
  node,
  rowDiagnostics,
  isDark,
  onChange,
}) {
  /* A branch selects an outlet rather than producing a value, and a pool
     attaches rather than runs, so neither has an outputs key at all. */
  if (!node_declares_outputs(node && node.type)) return null;

  const mappings = node_output_mappings(node);
  const kinds = output_source_kinds_for(node.type);
  const names = input_names(node);
  const composed = [
    ...output_mapping_problems(mappings),
    ...output_surface_problems(node, mappings),
  ];

  function set_mappings(next) {
    onChange(with_node_output_mappings(document, node.id, next));
  }

  function add_mapping() {
    const kind = kinds[0];
    set_mappings([
      ...mappings,
      make_output_mapping({
        name: "",
        kind,
        /* Seeded with a usable first step where one is knowable, so a new row
           is never born already refused. */
        path: kind === "input" && names.length > 0 ? [names[0]] : [],
      }),
    ]);
  }

  return (
    /* Addressable on its own: the legacy Start panel heads its own section with
       the same words, and although the two models never render together — a
       Skeleton page has no recipe and a recipe page has no document — a probe
       searching by that text cannot tell which one it found. */
    <div
      data-testid="skeleton-output-variables"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={SECTION_LABEL}>Output Variables</span>
        <Button
          label="+ Add output"
          onClick={add_mapping}
          style={{
            fontSize: 11,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 5,
            color: "#4a5bd8",
          }}
        />
      </div>

      {mappings.length === 0 && (
        <span style={{ fontSize: 11, color: "#86868b" }}>
          This node passes nothing on, so nothing downstream can read from it.
        </span>
      )}

      {mappings.map((mapping, index) => (
        <OutputRow
          key={index}
          mapping={mapping}
          index={index}
          nodeType={node.type}
          kinds={kinds}
          inputNames={names}
          isDark={isDark}
          problems={[
            ...composed.filter((problem) =>
              problem.where.startsWith(`mappings[${index}]`),
            ),
            ...((rowDiagnostics && rowDiagnostics[index]) || []),
          ]}
          onChange={(next) =>
            set_mappings(mappings.map((old, i) => (i === index ? next : old)))
          }
          onRemove={() => set_mappings(mappings.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}
