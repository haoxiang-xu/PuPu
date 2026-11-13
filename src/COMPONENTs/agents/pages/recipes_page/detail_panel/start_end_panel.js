import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import InputVariablesSection from "./input_variables_section";
import OutputVariablesSection, { visible_output_rows } from "./output_variables_section";
import { Block } from "./process_timeline";
import { Region } from "./panel_style";
import { visible_input_rows } from "./system_context_visibility";
import { start_context_for_view } from "../start_context";

/* The two ends of a graph, in the Agent panel's language: one column, the
   same quiet caption over each part, the same regions of rows. Each holds only
   two short lists, so neither folds; the count sits where a folded part
   would keep it. What the caption cannot say goes behind its info icon. */

const MUTED = (isDark) => (isDark ? "#a6a6af" : "#686870");
const ERROR = (isDark) => (isDark ? "#ff8c8c" : "#b02020");

const countOf = (rows) => String(rows.filter(Boolean).length);

/* What the caller hands a Start. It is described, not edited, so a row is the
   same row shape as an editable one but holds no control. */
function CallerInputs({ context, isDark }) {
  const { t } = useTranslation();
  if (context.kind === "invalid") {
    return <span data-testid="skeleton-start-context-problem"
      style={{ fontSize: 11.5, lineHeight: 1.45, color: ERROR(isDark) }}>{context.message}</span>;
  }
  const fields = context.kind === "unknown"
    ? [{ name: t("agents.io.caller_input"), type: "object", whole: true }]
    : context.fields;
  if (fields.length === 0) {
    return <span style={{ fontSize: 11.5, lineHeight: 1.45, color: MUTED(isDark) }}>
      {t("agents.io.this_start_declares_no_caller_fields")}</span>;
  }
  return (
    <Region isDark={isDark}>
      {fields.map((field) => (
        <div key={field.name} data-testid={`start-caller-input-${field.name}`}
          style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, minHeight: 32,
            padding: "6px 10px 6px 11px", boxSizing: "border-box" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflowWrap: "anywhere",
            color: isDark ? "#eeeef1" : "#26262c",
            fontFamily: field.whole ? undefined : "ui-monospace, Menlo, monospace" }}>{field.name}</span>
          <span style={{ flexShrink: 0, fontSize: 11.5, color: MUTED(isDark) }}>{field.type}</span>
          <span aria-label={t("agents.io.read_only_caller_input")} title={t("agents.io.read_only_caller_input")}
            style={{ display: "inline-flex", flexShrink: 0, opacity: 0.55 }}>
            <Icon src="lock" color={MUTED(isDark)} style={{ width: 12, height: 12 }} />
          </span>
        </div>
      ))}
    </Region>
  );
}

export default function StartEndPanel({ document, node, revision, isDark, onChange, rowDiagnostics, startContext }) {
  const { t } = useTranslation();
  const start = node.type === "start";
  const inputProblems = Object.values(rowDiagnostics?.inputs || {}).flat();
  const outputProblems = Object.values(rowDiagnostics?.outputs || {}).flat();
  const context = start ? startContext || start_context_for_view([], [], document, t) : null;

  const input = start ? (
    <div data-testid="skeleton-input-variables" style={{ display: "contents" }}>
    <Block section="start-input" title={t("agents.io.input_variables")} isDark={isDark}
      help={context.kind !== "invalid" ? <span data-testid="skeleton-start-context-caption">{context.message}</span> : undefined}
      problems={context.kind === "invalid" ? [context.message] : []}>
      <CallerInputs context={context} isDark={isDark} />
    </Block>
    </div>
  ) : (
    <Block section="end-input" title={t("agents.io.input_variables")} isDark={isDark}
      problems={inputProblems} aside={countOf(visible_input_rows(document, node, rowDiagnostics?.inputs))}>
      <InputVariablesSection document={document} node={node} rowDiagnostics={rowDiagnostics?.inputs}
        isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />
    </Block>
  );

  return (
    <div data-testid={`${node.type}-detail`} style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
      {input}
      <Block section={`${node.type}-output`} title={t("agents.io.output_variables")} isDark={isDark}
        help={start ? t("agents.io.start_result_caption") : t("agents.io.end_input_caption")}
        problems={outputProblems} aside={countOf(visible_output_rows(node, rowDiagnostics?.outputs, document))}>
        <OutputVariablesSection document={document} node={node} revision={revision}
          rowDiagnostics={rowDiagnostics?.outputs} isDark={isDark} onChange={onChange}
          hideHeading addAtEnd breadcrumb />
      </Block>
    </div>
  );
}
