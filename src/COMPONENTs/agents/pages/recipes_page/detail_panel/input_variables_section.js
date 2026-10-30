import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import BindingRow from "./binding_row";
import {
  node_bindings,
  node_output_mappings,
  node_takes_inputs,
  upstream_node_ids,
  with_node_bindings,
} from "../skeleton_document";
import { binding_problems, make_binding, ref_expression } from "../skeleton_io";

/* Input Variables: what this node reads, and from where.
 *
 * The sources offered are what nodes upstream of this one declare they export —
 * their own output mappings — because a node that has not run cannot supply a
 * value, and a value no node exports can never arrive. Both restrictions come
 * from the document rather than from a list kept here.
 *
 * Two kinds of problem show up on a row and they are not the same thing: the
 * builder's own refusal to compose something the runtime would reject, and a
 * diagnostic the store returned for the saved draft. The first is immediate and
 * local; the second arrives from `POST /skeleton_resources/diagnose`, which
 * since the runtime's CP17 repair reports per-node IO as well as the graph, and
 * is why an incomplete draft can be saved at all.
 *
 * The rows are handed their own problems rather than filtering a list: the
 * panel knows how many rows exist and routes a path to a row only when that row
 * is rendered, so nothing can claim a row that is not there and vanish. */

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

function node_label(node) {
  const name = node && node.config && node.config.name;
  return typeof name === "string" && name ? name : (node && node.id) || "";
}

export function binding_sources(document, node_id) {
  const by_id = new Map(
    ((document && document.nodes) || []).map((node) => [node && node.id, node]),
  );
  const sources = [];
  upstream_node_ids(document, node_id).forEach((id) => {
    const node = by_id.get(id);
    node_output_mappings(node).forEach((mapping) => {
      if (!mapping || typeof mapping.name !== "string" || !mapping.name) return;
      sources.push({ node_id: id, node_label: node_label(node), name: mapping.name });
    });
  });
  return sources;
}

export default function InputVariablesSection({
  document,
  node,
  rowDiagnostics,
  isDark,
  onChange,
}) {
  /* Start reads from the calling context, and a pool attaches rather than runs,
     so neither carries inputs at all — the runtime's execution config has no
     such key for them. */
  if (!node_takes_inputs(node && node.type)) return null;

  const bindings = node_bindings(node);
  const sources = binding_sources(document, node && node.id);
  /* The builder's own check, so a row says what is wrong with it before any
     round trip. It mirrors `resolve_inputs`; it never decides admission. */
  const composed = binding_problems(bindings);

  function set_bindings(next) {
    onChange(with_node_bindings(document, node.id, next));
  }

  function add_binding() {
    const first = sources[0];
    set_bindings([
      ...bindings,
      make_binding({
        name: "",
        value: first
          ? ref_expression(first.node_id, [first.name])
          : ref_expression("", []),
        missing: "error",
      }),
    ]);
  }

  return (
    /* Addressable on its own, like the outputs section: the legacy Start and
       End panels head sections with the same words, and a probe searching by
       text cannot tell which model it found. */
    <div
      data-testid="skeleton-input-variables"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={SECTION_LABEL}>Input Variables</span>
        <Button
          label="+ Add input"
          onClick={add_binding}
          style={{
            fontSize: 11,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: 5,
            color: "#4a5bd8",
          }}
        />
      </div>

      {bindings.length === 0 && (
        <span style={{ fontSize: 11, color: "#86868b" }}>
          This node reads nothing from the graph.
        </span>
      )}

      {bindings.map((binding, index) => (
        <BindingRow
          key={index}
          binding={binding}
          index={index}
          sources={sources}
          isDark={isDark}
          problems={[
            ...composed.filter((problem) =>
              problem.where.startsWith(`bindings[${index}]`),
            ),
            ...((rowDiagnostics && rowDiagnostics[index]) || []),
          ]}
          onChange={(next) =>
            set_bindings(bindings.map((old, i) => (i === index ? next : old)))
          }
          onRemove={() => set_bindings(bindings.filter((_, i) => i !== index))}
        />
      ))}
    </div>
  );
}
