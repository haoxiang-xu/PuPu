import React, { useEffect, useMemo, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { callee_interface } from "../workflow_call_config";
import { workflow_parameters, workflow_signature_problems, parameter_type_matches, PARAMETER_TYPES } from "../workflow_parameters";
import { TableHeads, TableRow, TABLE_CONTROL_INSET } from "../detail_panel/parameter_table";
import { typed_input_template } from "../detail_panel/typed_input_row";
import {
  CONTROL_HEIGHT, CONTROL_RADIUS, REGION_RADIUS, Region, fieldBackground, muted, note, problem as problemOf, removeButtonStyle,
} from "../detail_panel/panel_style";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const WHOLE_OBJECT = "\u0000workflow-input";
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
/* One value cell: the panel's white field, one line high for a scalar and a
   region-cornered box for JSON, growing with what is typed. Its 4px inset
   puts a line of 12px text at the panel's control height. */
const cellStyle = (isDark, json) => ({
  width: "100%", minWidth: 0, fontSize: 12, padding: 4, minHeight: CONTROL_HEIGHT,
  borderRadius: json ? REGION_RADIUS : CONTROL_RADIUS, restFill: fieldBackground(isDark), restBorder: "1px solid transparent",
  ...(json ? MONO : {}),
});
const type_word = (type, t) => type === undefined ? t("agents.parameters.types.any")
  : PARAMETER_TYPES.includes(type) ? t(`agents.parameters.types.${type}`) : String(type);

// A local form identity, never a Host digest. Ignore graph-only edits and JSON
// key order, but do not carry arguments/drafts across a different interface.
export function workflow_test_interface_key(document) {
  const legacy = own(document, "input_schema") ? null : callee_interface(document);
  const contract = own(document, "input_schema")
    ? { declared: true, schema: document.input_schema }
    : { declared: false, readable: legacy?.readable, whole: legacy?.whole,
      keys: (legacy?.inputs || []).map(row => row.key).filter(key => typeof key === "string").sort() };
  return JSON.stringify(contract, (_key, value) => record(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

function parse_input(text, type, mode, t) {
  if (type === "string" || (type === undefined && mode === "text")) return { ok: true, value: text };
  if (type === "number" || type === "integer") {
    if (text.trim() === "") return { ok: false, message: t("agents.execution.tool.enter_a_number") };
    const value = Number(text);
    if (!Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) {
      return { ok: false, message: t(type === "integer" ? "agents.execution.tool.enter_a_whole_number" : "agents.execution.tool.enter_a_number") };
    }
    return { ok: true, value };
  }
  let value;
  try { value = JSON.parse(text); } catch (_) {
    return { ok: false, message: t("agents.execution.tool.enter_a_json_type", { type: type ? t(`agents.parameters.types.${type}`) : t("agents.parameters.types.any") }) };
  }
  if (type && !parameter_type_matches(value, type)) {
    return { ok: false, message: t("agents.execution.tool.enter_a_json_type", { type: t(`agents.parameters.types.${type}`) }) };
  }
  return { ok: true, value };
}

function initial_text(value, row, mode) {
  if (!own(value, row.name)) return "";
  const current = value[row.name];
  if (row.type === "string") return typeof current === "string" ? current : JSON.stringify(current) ?? "";
  if (row.type === undefined && mode === "text" && typeof current === "string") return current;
  try { return JSON.stringify(current, null, 2) ?? ""; } catch (_) { return ""; }
}

function server_error(errors, key) {
  if (!Array.isArray(errors)) return null;
  return errors.find((error) => {
    const path = Array.isArray(error?.path) ? error.path : typeof error?.path === "string" ? error.path.split(".") : [];
    return path.at(-1) === key;
  }) || null;
}

/** Controlled run-time arguments form. It never changes or saves the Workflow document.
 *
 * Drawn as the panel's one table of named, typed values — Name / Type /
 * Value, the same as Start's Parameters and a Workflow Call's Inputs — so the
 * place a Workflow's inputs are declared and the place they are filled in for
 * a test look like the same list. */
export default function WorkflowTestInputs({ document, value, onChange, onValidityChange, isDark, disabled = false, errors = [] }) {
  const { t } = useTranslation();
  const [drafts, setDrafts] = useState({});
  const [modes, setModes] = useState(() => new Map());
  const model = useMemo(() => {
    const hasSignature = own(document, "input_schema");
    const signatureErrors = hasSignature ? workflow_signature_problems(document.input_schema) : [];
    const declared = hasSignature ? workflow_parameters(document) : null;
    const legacy = !hasSignature ? callee_interface(document) : null;
    const malformed = hasSignature ? signatureErrors.length > 0 || declared === null : !legacy?.readable;
    const rows = hasSignature
      ? (declared || []).map(({ name, field, required }) => ({
        name, type: field?.type, required,
        has_default: !!field && Object.prototype.hasOwnProperty.call(field, "default"),
        default: field?.default,
        description: typeof field?.description === "string" ? field.description : "",
      }))
      : (legacy?.inputs || []).map(({ key }) => ({ name: key, type: undefined, required: true }));
    return { hasSignature, legacy, malformed, rows };
  }, [document]);
  const { hasSignature, legacy, malformed, rows } = model;
  const supplied = record(value) ? value : {};
  const visibleValue = useMemo(() => ({ ...(record(value) ? value : {}) }), [value]);
  const problems = useMemo(() => {
    if (malformed) return [{ path: "input_schema", message: t("agents.parameters.invalid", { path: "input_schema" }), code: "invalid_schema" }];
    const found = Object.entries(drafts).filter(([, draft]) => !draft.ok).map(([path, draft]) => ({ path: path === WHOLE_OBJECT ? "input" : path, message: draft.message, code: "invalid_value" }));
    rows.forEach((row) => {
      if (row.required && !own(visibleValue, row.name)) found.push({ path: row.name, message: t("agents.parameters.required_value", { key: row.name }), code: "missing_value" });
    });
    return found;
  }, [drafts, malformed, rows, visibleValue, t]);
  useEffect(() => { onValidityChange?.(problems); }, [onValidityChange, problems]);

  const update = (key, parsed, raw, isWhole = false) => {
    if (disabled) return;
    if (!parsed.ok) {
      setDrafts((current) => ({ ...current, [key]: { text: raw, ...parsed, ok: false } }));
      return;
    }
    setDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    const next = { ...supplied };
    if (isWhole) {
      Object.keys(next).forEach((name) => delete next[name]);
      Object.assign(next, parsed.value);
    } else next[key] = parsed.value;
    onChange?.(next);
  };
  const remove = (key) => {
    if (disabled) return;
    setDrafts((current) => { const next = { ...current }; delete next[key]; return next; });
    const next = { ...supplied };
    delete next[key];
    onChange?.(next);
  };

  if (malformed) return <div role="alert" data-testid="workflow-test-inputs-invalid" style={problemOf(isDark)}>
    {t("agents.parameters.invalid", { path: "input_schema" })}
  </div>;

  const template = typed_input_template(rows.map((row) => row.name));
  const renderRow = (row) => {
    const key = row.name;
    const draft = drafts[key];
    const anyMode = row.type === undefined;
    const mode = anyMode ? modes.has(key) ? modes.get(key) : own(supplied, key) && typeof supplied[key] !== "string" ? "json" : "text" : null;
    const json = row.type === "object" || row.type === "array" || mode === "json";
    const text = draft ? draft.text : initial_text(supplied, row, mode);
    const error = server_error(errors, key);
    /* Nothing typed is a placeholder: the default the Workflow falls back
       to, or what kind of value goes here. */
    const placeholder = row.has_default ? t("agents.execution.tool.default_value", { value1: JSON.stringify(row.default) })
      : json ? t("agents.execution.tool.json_placeholder", { type: row.type || "JSON" })
        : row.required ? t("agents.execution.tool.literal_placeholder") : t("agents.parameters.default_short");
    const word = type_word(row.type, t);
    return (
      <TableRow key={key} template={template} testid={`workflow-test-input-${key}`} below={<>
        {anyMode && (
          <div data-testid={`workflow-test-input-${key}-mode`} style={{ display: "flex", padding: "0 6px 6px 10px" }}>
            <SegmentedButton options={[
              { value: "text", label: t("agents.test_run.text_mode") },
              { value: "json", label: t("agents.test_run.json_mode") },
            ]} value={mode} on_change={(next) => {
              setModes((current) => new Map(current).set(key, next));
              setDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[key]; return nextDrafts; });
            }} disabled={disabled} style={{ fontSize: 11, padding: 2, borderRadius: CONTROL_RADIUS }} button_style={{ padding: "2px 8px" }} />
          </div>
        )}
        {draft && !draft.ok && <span role="status" style={{ ...problemOf(isDark), padding: "0 10px 6px" }}>{draft.message}</span>}
        {error && <span role="status" style={{ ...problemOf(isDark), padding: "0 10px 6px" }}>{error.message || error.code || t("agents.execution.tool.arguments_failed")}</span>}
      </>}>
        <label htmlFor={`workflow-test-input-control-${encodeURIComponent(key)}`} title={[key, row.description].filter(Boolean).join(" — ")}
          style={{ ...ELLIPSIS, ...MONO, fontSize: 11.5 }}>
          {key}{row.required && <span aria-label={t("agents.schema.required")} style={{ color: problemOf(isDark).color, marginLeft: 2 }}>*</span>}
        </label>
        <span title={word} style={{ ...ELLIPSIS, fontSize: 11.5, color: muted(isDark) }}>{word}</span>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TextField aria_label={key} textarea_ref={(element) => {
              if (element) {
                element.id = `workflow-test-input-control-${encodeURIComponent(key)}`;
                element.dataset.testid = `workflow-test-input-control-${key}`;
              }
            }} value={text} disabled={disabled} min_rows={1} max_display_rows={json ? 8 : 4} placeholder={placeholder}
              set_value={(next) => update(key, parse_input(next, row.type, mode, t), next)} style={cellStyle(isDark, json)} />
          </div>
          {own(supplied, key) && <Button ariaLabel={t("agents.parameters.remove", { name: key })} label={null} prefix_icon="close" disabled={disabled}
            onClick={() => remove(key)} style={{ ...removeButtonStyle(isDark), marginTop: 2 }} />}
        </div>
      </TableRow>
    );
  };

  const whole = !hasSignature && legacy.whole;
  const wholeDraft = drafts[WHOLE_OBJECT];
  let wholeText = wholeDraft ? wholeDraft.text : "";
  if (!wholeDraft) {
    try { wholeText = JSON.stringify(supplied, null, 2) ?? ""; } catch (_) { wholeText = ""; }
  }
  if (rows.length === 0 && !whole) return <span data-testid="workflow-test-inputs" style={note(isDark)}>{t("agents.parameters.none")}</span>;
  return <div data-testid="workflow-test-inputs" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
    {rows.length > 0 && (
      <Region isDark={isDark}>
        <TableHeads key="heads" testid="workflow-test-input-heads" isDark={isDark} template={template}
          columns={[{ label: t("agents.parameters.name_short") }, { label: t("agents.parameters.type") },
            { label: t("agents.execution.tool.value_mode"), inset: TABLE_CONTROL_INSET }]} />
        {rows.map(renderRow)}
      </Region>
    )}
    {whole && <div data-testid="workflow-test-input-whole" style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label htmlFor="workflow-test-input-whole-control" style={note(isDark)}>{t("agents.test_run.input_object")}</label>
      <TextField aria_label={t("agents.test_run.input_object")} textarea_ref={(element) => {
        if (element) {
          element.id = "workflow-test-input-whole-control";
          element.dataset.testid = "workflow-test-input-whole-control";
        }
      }} value={wholeText} disabled={disabled} min_rows={3} max_display_rows={8}
        set_value={(next) => {
          const parsed = parse_input(next, "object", "json", t);
          update(WHOLE_OBJECT, parsed, next, true);
        }} style={{ ...cellStyle(isDark, true), padding: 8 }} />
      {wholeDraft && !wholeDraft.ok && <span role="status" style={problemOf(isDark)}>{wholeDraft.message}</span>}
    </div>}
  </div>;
}
