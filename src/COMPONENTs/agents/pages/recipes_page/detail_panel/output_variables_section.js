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
import { identity_of } from "../document_values";
import { make_output_mapping, output_mapping_problems } from "../skeleton_io";
import { result_roots_for } from "../skeleton_result_roots";

/* Output Variables: what this node passes on, and from where.
 *
 * This is the other half of a binding. An input row reads a name some upstream
 * node exports; these rows are what that list is made of, so a graph wires up
 * from the bottom of one panel to the top of the next.
 *
 * Nothing here decides admission. The store's `diagnose` and the runtime's
 * `validate_static_execution_io` do, and `output_surface_problems` only mirrors
 * them so a row can say what is wrong with it before any round trip — the same
 * split the input rows use.
 *
 * `result_root_problems` is not a mirror, and the difference is worth keeping
 * visible. The static validator never looks at the result side at all, so a
 * result naming a field its producer does not have passes every check and
 * fails only once the node runs. The runtime does admit a closed result shape
 * for most node types, so saying it here is saying something true sooner —
 * but it is the builder speaking, not a repetition of a check that exists. An
 * earlier round of this file claimed a result's shape was not statically
 * knowable at all, which was wrong for every type but three; the round after
 * it over-corrected and spoke as if an Agent's schema always closed its own
 * field list, which is wrong whenever the schema does not say so. */

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
    /* A segment of any other shape is already refused by the path check as
       `invalid_path`, and it must not be touched to say so a second time. The
       store keeps `[{toString: null}]`, and composing it into a message
       converts it to a string, which throws — taking the whole panel with it
       before any diagnostic could be shown. */
    if (typeof first === "number") {
      problems.push({
        code: "missing_value",
        where: `${where}.path[0]`,
        message: "A list position cannot name an input. Choose one by name.",
      });
      return;
    }
    if (typeof first !== "string") return;
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

const PRODUCER_LABEL = {
  agent: "An Agent",
  tool_call: "A Tool Call",
  skill_read: "A Skill Read",
};

/* What the runtime will refuse, said earlier.
 *
 * This one is not a mirror: the static validator never looks at the result
 * side, so `result: ["typo"]` on an Agent draws no diagnostic at all and fails
 * only once the node runs, with `missing_value` at `mappings[0].source.path`.
 * Saying so here is saying something true sooner, not inventing a rule — but
 * only where the inventory is closed, and that is the whole of the second
 * half. An earlier round read an Agent's schema for its direct `properties`
 * and then spoke as if that list were exhaustive. It is not: without
 * `additionalProperties: false` the result may carry fields the schema never
 * names, and the runtime publishes them. A list that may be incomplete cannot
 * prove a name absent, so an open one says nothing at all rather than
 * something categorical about a field that really does arrive. */
export function result_root_problems(node, mappings) {
  const roots = result_roots_for(node);
  if (!roots.known || !roots.closed) return [];
  const label = PRODUCER_LABEL[node && node.type] || "This node";
  const problems = [];
  mappings.forEach((mapping, index) => {
    const source = mapping && mapping.source;
    if (!source || typeof source !== "object" || source.kind !== "result") return;
    const [first] = Array.isArray(source.path) ? source.path : [];
    if (first === undefined) return; /* The whole result. */
    const where = `mappings[${index}].source.path[0]`;
    if (typeof first !== "string") {
      /* A position cannot name a field of an object, and a shape the path
         check already refused is left to it. */
      if (typeof first === "number") {
        problems.push({
          code: "missing_value",
          where,
          message: `${label}'s result is an object, so a list position cannot name a field of it.`,
        });
      }
      return;
    }
    if (!roots.roots.includes(first)) {
      problems.push({
        code: "missing_value",
        where,
        message: `${label} produces no result named "${first}".`,
      });
    }
  });
  return problems;
}

export default function OutputVariablesSection({
  document,
  node,
  /* Which handed-over document this is — see `DetailPanel`. It belongs in the
     row identity below, where the rest of "which row is this" already is. */
  revision,
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
  const roots = result_roots_for(node);
  const composed = [
    ...output_mapping_problems(mappings),
    ...output_surface_problems(node, mappings),
    ...result_root_problems(node, mappings),
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
          /* What a row is, for the controls that hold text the document does
             not. The position alone is not it: remove a row and the next one
             takes its place, and anything still keyed to that place now
             describes a different mapping. The node and the row's own name
             narrow it as far as the wire allows — `{name, source}` is closed,
             so there is no id to carry. A rename drops a pending refusal,
             which is the harmless direction.
             This used to end "and the rest is caught by comparing the stored
             value", which is not true: a document arriving from the store can
             land on the same value, and the refused step then stayed on
             screen beside a page that said Saved. So the document it was
             typed against is part of what a row is, and a replacement remints
             the steps rather than leaving them to a comparison that cannot
             see it. Joined through `identity_of`, because a node id may hold
             a colon and `a + ":" + b` is not an encoding. */
          identity={identity_of([
            revision,
            node.id,
            index,
            (mapping && mapping.name) || "",
          ])}
          nodeType={node.type}
          kinds={kinds}
          inputNames={names}
          resultRoots={roots}
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
