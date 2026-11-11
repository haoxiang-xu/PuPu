import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import PanelHelp from "./panel_help";
import BindingRow from "./binding_row";
import InputValuePill from "./input_value_pill";
import {
  node_bindings,
  node_output_mappings,
  node_takes_inputs,
  upstream_node_ids,
  with_node_bindings,
} from "../skeleton_document";
import { binding_problems, make_binding, ref_expression } from "../skeleton_io";
import { conditional_sources } from "../skeleton_branch_config";
import { node_display_title } from "../node_display_labels";
import { start_context_for_view } from "../start_context";

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
  return node_display_title(node, node && node.id);
}

function StartCallerInputs({ context, isDark }) {
  const { t } = useTranslation();
  const fields = context.kind === "unknown"
    ? [{ name: "Caller input", type: "object" }]
    : context.fields;
  return (
    <div data-testid="skeleton-input-variables" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={SECTION_LABEL}>{t("agents.io.input_variables")}</span>
        {context.kind !== "invalid" && <PanelHelp label={t("agents.io.input_variables")}>
          <span data-testid="skeleton-start-context-caption">{context.message}</span>
        </PanelHelp>}
      </div>
      {context.kind === "invalid" && <span data-testid="skeleton-start-context-problem"
        style={{ fontSize: 11, lineHeight: 1.5, color: isDark ? "#a1a1aa" : "#68686f" }}>
        {context.message}
      </span>}
      {fields.map((field) => (
        <div key={field.name} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0,
          padding: "7px 8px", borderRadius: 5, background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)" }}>
          <span aria-label={t("agents.io.read_only_caller_input")} style={{ width: 12, height: 12, flexShrink: 0 }}>
            <Icon src="lock" />
          </span>
          <span style={{ fontSize: 11, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{context.kind === "unknown" ? t("agents.io.caller_input") : field.name}</span>
          <span style={{ fontSize: 10, color: isDark ? "#a1a1aa" : "#68686f" }}>{field.type}</span>
        </div>
      ))}
      {context.kind === "subagent" && fields.length === 0 && (
        <span style={{ fontSize: 11, color: isDark ? "#a1a1aa" : "#68686f" }}>{t("agents.io.this_start_declares_no_caller_fields")}</span>
      )}
    </div>
  );
}

export function binding_sources(document, node_id) {
  const by_id = new Map(
    ((document && document.nodes) || []).map((node) => [node && node.id, node]),
  );
  const sources = [];
  const upstream = upstream_node_ids(document, node_id);
  /* Downstream of a branch a source may not have run: some path from Start
     reaches this node without it (#351). The reference is still offered —
     binding it, or a first-present of several, is the author's call. */
  const conditional = conditional_sources(document, node_id, upstream);
  upstream.forEach((id) => {
    const node = by_id.get(id);
    node_output_mappings(node).forEach((mapping) => {
      if (!mapping || typeof mapping.name !== "string" || !mapping.name) return;
      sources.push({ node_id: id, node_label: node_label(node), name: mapping.name, conditional: conditional.has(id) });
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
  startContext,
  hideHeading = false,
  addAtEnd = false,
  breadcrumb = false,
}) {
  const { t } = useTranslation();
  /* Start has no execution.inputs key: these rows describe the caller and
     deliberately have no write callback or input controls. */
  if (node?.type === "start") {
    return <StartCallerInputs context={startContext || start_context_for_view([], [], document, t)} isDark={isDark} />;
  }
  /* A pool attaches rather than runs, so it carries no inputs. */
  if (!node_takes_inputs(node && node.type)) return null;

  const bindings = node_bindings(node);
  const sources = binding_sources(document, node && node.id);
  /* The builder's own check, so a row says what is wrong with it before any
     round trip. It mirrors `resolve_inputs`; it never decides admission. */
  const composed = binding_problems(bindings, t);

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
        missing: breadcrumb ? "null" : "error",
      }),
    ]);
  }

  const add_button = <Button
    prefix_icon={addAtEnd ? undefined : "add"}
    label={addAtEnd ? t("agents.io.add_input") : undefined}
    ariaLabel={t("agents.io.add_input")}
    title={t("agents.io.add_input")}
    onClick={add_binding}
    style={{ fontSize: 11, paddingVertical: addAtEnd ? 5 : 3, paddingHorizontal: addAtEnd ? 6 : 4,
      iconOnlyPaddingVertical: 3, iconOnlyPaddingHorizontal: 4, borderRadius: 5,
      alignSelf: addAtEnd ? "flex-start" : undefined,
      content: { icon: { width: 14, height: 14 } }, color: addAtEnd ? (isDark ? "#a1a1aa" : "#68686f") : "#4a5bd8" }} />;

  return (
    /* Addressable on its own, like the outputs section: the legacy Start and
       End panels head sections with the same words, and a probe searching by
       text cannot tell which model it found. */
    <div
      data-testid="skeleton-input-variables"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {(!hideHeading || !addAtEnd) && <div
        style={{
          display: "flex",
          justifyContent: hideHeading ? "flex-end" : "space-between",
          alignItems: "center",
        }}
      >
        {!hideHeading && <span style={SECTION_LABEL}>{t("agents.io.input_variables")}</span>}
        {!addAtEnd && add_button}
      </div>}

      {bindings.length === 0 && !addAtEnd && (
        <span style={{ fontSize: 11, color: "#86868b" }}>
          {t("agents.io.this_node_reads_nothing_from_the_graph")}
        </span>
      )}

      {bindings.map((binding, index) => {
        const Row = breadcrumb && binding?.value?.kind !== "first_present" ? InputValuePill : BindingRow;
        return <Row
          key={index}
          binding={binding}
          index={index}
          sources={sources}
          isDark={isDark}
          hideMissingPolicy={breadcrumb}
          problems={[
            ...composed.filter((problem) =>
              problem.where.startsWith(`bindings[${index}]`),
            ),
            ...((rowDiagnostics && rowDiagnostics[index]) || []),
          ]}
          onChange={(next) => {
            if (breadcrumb && next.value !== binding?.value) {
              next = { ...next, missing: "null" };
              delete next.default;
            }
            set_bindings(bindings.map((old, i) => (i === index ? next : old)));
          }}
          onRemove={() => set_bindings(bindings.filter((_, i) => i !== index))}
        />;
      })}
      {addAtEnd && add_button}
    </div>
  );
}
