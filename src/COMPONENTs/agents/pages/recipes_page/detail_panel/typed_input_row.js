import React, { useState } from "react";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { TableRow } from "./parameter_table";
import ValueCell from "./value_cell";
import usePillMissingPolicy from "./pill_missing_policy";
import { muted, problem as problemOf } from "./panel_style";
import { binding_default, make_binding } from "../skeleton_io";
import { literal_to_text } from "../tool_call_config";
import { PARAMETER_TYPES } from "../workflow_parameters";

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/* One table of typed inputs: a Workflow Call's Inputs (the called
   Workflow's Parameters seen from the caller) and a Tool Call's Arguments
   (the tool's schema) — the same table as Start's, Name / Type / Value, one
   line a row. The name
   column is as wide as the longest name needs and no wider, the type column
   is the type's word, and the value takes every pixel left, so a wider panel
   widens the value first. */
const NAME_CHAR = 6.95;
const TYPE_COLUMN = 46;
/* A longer name ends in an ellipsis and is read whole on hover, so the value
   keeps room for a source's tag in the panel's default width. */
const name_column = (names) => Math.round(Math.min(84, Math.max(40, Math.max(0, ...names.map((name) => name.length)) * NAME_CHAR + 10)));
export const typed_input_template = (names) => `${name_column(names)}px ${TYPE_COLUMN}px minmax(0, 1fr)`;
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

function type_word(type, t) {
  if (type === null || type === undefined) return t("agents.parameters.types.any");
  return PARAMETER_TYPES.includes(type) ? t(`agents.parameters.types.${type}`) : String(type);
}

/* One input: its name and type as the callee declares them, and one cell
   for its value (a schema's `enum` is offered as choices). What happens when a picked source has nothing is
   the row's "more", as on an Input Variables row. */
export default function TypedInputRow({ name, type, required, hasDefault, defaultValue, description, choices, binding, template, sources, sourceTag,
  editable, isDark, testid, onSet, children }) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState(null);
  const value = record(binding) ? binding.value : null;
  const set = (expression) => onSet(expression === null ? null : make_binding({
    name, value: expression, missing: record(binding) && expression.kind !== "literal" ? binding.missing : "error",
    default_value: expression.kind !== "literal" ? binding_default(binding) : undefined,
  }));
  const policy = usePillMissingPolicy({ binding, onChange: onSet, isDark,
    hidden: !record(binding) || !value || value.kind === "literal" || !editable, testid });
  const placeholder = hasDefault ? literal_to_text(defaultValue, type)
    : required ? t("agents.execution.tool.literal_placeholder") : t("agents.parameters.default_short");
  const word = type_word(type, t);
  return (
    <TableRow template={template} testid={testid} below={<>
      {policy.settings}
      {problem && <span data-testid={`${testid}-problem`} style={{ ...problemOf(isDark), padding: "0 10px 6px" }}>
        {t("agents.execution.tool.pending_literal", { problem })}</span>}
      {children}
    </>}>
      <span title={[name, description].filter(Boolean).join(" — ")} style={{ ...ELLIPSIS, ...MONO, fontSize: 11.5 }}>
        {name}{required && <span aria-label={t("agents.schema.required")} style={{ color: problemOf(isDark).color, marginLeft: 2 }}>*</span>}
      </span>
      <span title={word} style={{ ...ELLIPSIS, fontSize: 11.5, color: muted(isDark) }}>{word}</span>
      <ValueCell value={value} type={type} choices={choices} placeholder={placeholder} optional={!required} sources={sources} sourceTag={sourceTag}
        editable={editable} isDark={isDark} testid={`${testid}-value`} ariaLabel={name}
        onProblem={setProblem} onChange={set} trailing={policy.action} />
    </TableRow>
  );
}
