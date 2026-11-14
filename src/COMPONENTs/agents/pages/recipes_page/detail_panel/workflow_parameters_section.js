import React, { useEffect, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import { checkManagedCodeResponse } from "../../../../../SERVICEs/managed_code_api";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import PanelInput from "./panel_input";
import PanelSelect from "./panel_select";
import { Block } from "./process_timeline";
import { PANEL_SWITCH, Region, errorColor, muted, note, problem as problemStyle, removeButtonStyle, text as textColor } from "./panel_style";
import AddButton from "./add_button";
import { TABLE_CONTROL_INSET, TABLE_ROW_PAD, TableHeads } from "./parameter_table";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import useListIdentities from "./list_identity";
import usePendingText from "./pending_text";
import { PARAMETER_TYPES, with_workflow_parameters, workflow_parameters, workflow_signature_problems } from "../workflow_parameters";
import { identity_of, own } from "../document_values";

export function workflow_parameters_capability(response) {
  try { checkManagedCodeResponse("capabilities", response); } catch (_) { return false; }
  const protocol = response.runtime_manifest?.protocols?.find((item) => item.id === "skeleton_execution");
  return protocol?.major === 1 && Number.isSafeInteger(protocol.minor) && protocol.minor >= 11
    && Array.isArray(protocol.features) && protocol.features.includes("workflow_parameters_v1");
}

const seed_default = (type) => own({ string: "", number: 0, integer: 0, boolean: false, object: {}, array: [], null: null }, type) ?? null;

/* The row's controls take the If / Else rows' measure: tag corners, text read
   from the left, one size of type. A parameter is an identifier, so it is set
   in the panel's monospace like every other variable name. */
const FIELD_TEXT = { width: "100%", minWidth: 0, fontSize: 12, paddingVertical: 3, paddingHorizontal: 7 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const TYPE_WIDTH = 84;
const SWITCH_WIDTH = 48;
const REMOVE_WIDTH = 22;
const LABEL = (isDark) => ({ fontSize: 11.5, lineHeight: 1.45, color: muted(isDark), flexShrink: 0 });

/* What a default's text means for its type, or why it means nothing. Text is
   taken as typed; every other type is read as JSON, and a number must be one. */
export function read_default(type, text) {
  if (type === "string") return { value: text };
  let value;
  try { value = JSON.parse(text); } catch (_) {
    return { problem: type === "number" || type === "integer" ? "invalid_number" : "invalid_json" };
  }
  if ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value))) return { problem: "invalid_number" };
  if (type === "integer" && !Number.isInteger(value)) return { problem: "invalid_integer" };
  return { value };
}

/* The panel's switch with the keyboard and an accessible name, as the Switch /
   Case boolean value has it: the switch commits its own click, the span
   answers a key and an assistive click. */
function RowSwitch({ on, label, disabled, onFlip, testid, children }) {
  const flip = () => { if (!disabled) onFlip(!on); };
  return (
    <span role="switch" aria-checked={on} aria-label={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      data-testid={testid}
      onClick={(event) => { if (event.target === event.currentTarget) flip(); }}
      onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); flip(); } }}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1 }}>
      {children}
      <span style={{ display: "inline-flex", pointerEvents: disabled ? "none" : undefined }}>
        <SemiSwitch on={on} set_on={flip} style={PANEL_SWITCH} />
      </span>
    </span>
  );
}

/* A default, edited as what its type holds: a switch for a boolean, a box for
   the rest. A box whose text cannot be the type's value keeps the text and
   says why, instead of keeping it silently. */
function DefaultEditor({ field, identity, allowed, isDark, testid, onValue }) {
  const { t } = useTranslation();
  const type = field.type;
  const shown = type === "string" ? field.default ?? "" : JSON.stringify(field.default) ?? "";
  const pending = usePendingText(shown, identity_of([identity, type]));
  if (type === "boolean" && typeof field.default === "boolean") {
    return (
      <RowSwitch on={field.default} label={t("agents.parameters.default")} disabled={!allowed} testid={`${testid}-default-boolean`}
        onFlip={(next) => onValue(next)}>
        <span style={{ fontSize: 12, minWidth: 34, color: textColor(isDark), ...MONO }}>{String(field.default)}</span>
      </RowSwitch>
    );
  }
  const text = pending.text ?? shown;
  const refused = pending.text === null ? null : read_default(type, pending.text).problem;
  return (
    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <PanelInput aria_label={t("agents.parameters.default")} disabled={!allowed} value={text}
        set_value={(next) => {
          const read = read_default(type, next);
          if (read.problem) { pending.hold(next); return; }
          pending.release(); onValue(read.value);
        }}
        style={{ ...FIELD_TEXT, ...(type === "string" ? {} : MONO), boxSizing: "border-box",
          ...(refused ? { border: `1px solid ${errorColor(isDark)}` } : {}) }} />
      {refused && <span role="status" data-testid={`${testid}-default-problem`} style={problemStyle(isDark)}>
        {t(`agents.parameters.${refused}`)}</span>}
    </span>
  );
}

/* The columns named once, over the rows, so a row stays on one line in the
   panel's default width instead of repeating "Required" beside every switch.
   The table's measure is shared with a Workflow Call's Inputs. */
function ColumnHeads({ isDark }) {
  const { t } = useTranslation();
  return <TableHeads testid="workflow-parameters-heads" isDark={isDark}
    template={`minmax(72px, 1fr) ${TYPE_WIDTH}px ${SWITCH_WIDTH + 6 + REMOVE_WIDTH}px`}
    columns={[{ label: t("agents.parameters.name_short"), inset: TABLE_CONTROL_INSET },
      { label: t("agents.parameters.type"), inset: TABLE_CONTROL_INSET }, { label: t("agents.parameters.required") }]} />;
}

function Parameter({ row, index, identity, allowed, isDark, onChange, onRemove, error }) {
  const { t } = useTranslation();
  const [name, setName] = useState(row.name);
  const [nameError, setNameError] = useState(false);
  useEffect(() => { setName(row.name); setNameError(false); }, [row.name]);
  const field = row.field && typeof row.field === "object" && !Array.isArray(row.field) ? row.field : {};
  const hasType = Object.prototype.hasOwnProperty.call(field, "type");
  const invalidType = hasType && !PARAMETER_TYPES.includes(field.type);
  const selectedType = invalidType ? "stored" : hasType ? field.type : "any";
  const testid = `workflow-parameter-${index}`;
  function setRequired(required) {
    const next = { ...field };
    if (required) delete next.default;
    else if (!Object.prototype.hasOwnProperty.call(next, "default")) next.default = seed_default(field.type);
    onChange({ ...row, required, field: next });
  }
  return <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6, padding: TABLE_ROW_PAD, minWidth: 0 }}>
    {/* Name and type keep the line; in a narrow panel Required and the way
        out move under them rather than squeezing the name to nothing. */}
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, minWidth: 0, minHeight: 26 }}>
      <span style={{ flex: "1 1 72px", minWidth: 72, display: "block" }}>
        <PanelInput aria_label={t("agents.parameters.name")} value={name} disabled={!allowed}
          set_value={(next) => { setName(next); setNameError(!onChange({ ...row, name: next }, { from: row.name, to: next })); }}
          style={{ ...FIELD_TEXT, ...MONO, boxSizing: "border-box", ...(nameError ? { border: `1px solid ${errorColor(isDark)}` } : {}) }} />
      </span>
      <span style={{ flex: `0 0 ${TYPE_WIDTH}px`, minWidth: 0, display: "flex" }}>
        <PanelSelect value={selectedType} disabled={!allowed} filterable={false} align="left"
          options={[...(invalidType ? [{ value: "stored", label: t("agents.execution.tool.stored_value", { value: JSON.stringify(field.type) }), disabled: true }] : []),
            { value: "any", label: t("agents.parameters.types.any") }, ...PARAMETER_TYPES.map((type) => ({ value: type, label: t(`agents.parameters.types.${type}`) }))]}
          set_value={(type) => {
            if (type !== "any" && !PARAMETER_TYPES.includes(type)) return;
            const next = { ...field }; if (type === "any") delete next.type; else next.type = type; onChange({ ...row, field: next });
          }}
          trigger_wrapper_style={{ width: "100%", minWidth: 0 }}
          style={{ ...FIELD_TEXT, width: TYPE_WIDTH, gap: 4 }} />
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
        <RowSwitch on={Boolean(row.required)} label={t("agents.parameters.required")} disabled={!allowed}
          testid={`${testid}-required`} onFlip={setRequired}>
        </RowSwitch>
        <Button prefix_icon="close" ariaLabel={t("agents.parameters.remove", { name: row.name })} disabled={!allowed} onClick={onRemove}
          style={removeButtonStyle(isDark)} />
      </span>
    </div>
    {!row.required && <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0, paddingRight: 28 }}>
      <span style={{ ...LABEL(isDark), width: 52, lineHeight: "26px" }}>{t("agents.parameters.default_short")}</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", minHeight: 26 }}>
        <DefaultEditor field={field} identity={identity} allowed={allowed} isDark={isDark} testid={testid}
          onValue={(value) => onChange({ ...row, field: { ...field, default: value } })} />
      </span>
    </div>}
    {(nameError || error) && <span role="status" style={problemStyle(isDark)}>
      {nameError ? t("agents.parameters.name_invalid") : t("agents.parameters.invalid", { path: error.path.join(".") })}
    </span>}
  </div>;
}

export default function WorkflowParametersSection({ document, isDark, onChange }) {
  const { t } = useTranslation();
  const [capability, setCapability] = useState(null);
  useEffect(() => {
    let current = true;
    setCapability(null);
    Promise.resolve().then(() => api.unchain.getManagedCodeCapabilities()).then((response) => {
      if (current) setCapability(workflow_parameters_capability(response));
    }, () => { if (current) setCapability(false); });
    return () => { current = false; };
  }, [document.id]);
  const rows = workflow_parameters(document);
  const identities = useListIdentities(document.id, rows?.length || 0, document.input_schema || document);
  const errors = Object.prototype.hasOwnProperty.call(document, "input_schema") ? workflow_signature_problems(document.input_schema) : [];
  function commit(nextRows, rename) {
    const next = with_workflow_parameters(document, nextRows, rename);
    if (capability !== true || next === document) return false;
    identities.carrying(next.input_schema); onChange(next); return true;
  }
  function add() {
    const names = new Set(rows.map((row) => row.name));
    let name = "parameter"; let index = 2;
    while (names.has(name)) name = `parameter_${index++}`;
    identities.added(); commit([...rows, { name, field: { type: "string" }, required: true }]);
  }
  return <div data-testid="workflow-parameters" style={{ minWidth: 0 }}>
    <Block section="workflow-parameters" title={t("agents.parameters.title")} isDark={isDark} aside={rows?.length || 0}
      help={t("agents.parameters.help")}>
      {capability === false && <span style={note(isDark)}>{t("agents.parameters.unsupported")}</span>}
      {rows === null ? <span style={problemStyle(isDark)}>{t("agents.parameters.invalid", { path: "input_schema" })}</span> : <>
        {rows.length === 0 && <span data-testid="workflow-parameters-empty" style={note(isDark)}>{t("agents.parameters.none")}</span>}
        <Region isDark={isDark}>{rows.length > 0 && <ColumnHeads key="heads" isDark={isDark} />}{rows.map((row, index) => <Parameter key={identities.ids[index]} identity={identities.ids[index]} row={row} index={index}
          allowed={capability === true} isDark={isDark} error={errors.find((error) => error.path[1] === "properties" && error.path[2] === row.name)}
          onChange={(next, rename) => commit(rows.map((old, at) => at === index ? next : old), rename)}
          onRemove={() => { identities.removed(index); commit(rows.filter((_, at) => at !== index)); }} />)}</Region>
        <AddButton label={t("agents.parameters.add")} disabled={capability !== true} onClick={add} isDark={isDark} />
      </>}
    </Block>
  </div>;
}
