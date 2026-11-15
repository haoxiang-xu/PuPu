import React, { useEffect, useMemo, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { callee_interface } from "../workflow_call_config";
import { workflow_parameters, workflow_signature_problems, parameter_type_matches } from "../workflow_parameters";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);
const WHOLE_OBJECT = "\u0000workflow-input";
const FIELD_STYLE = { width: "100%", minWidth: 0, fontSize: 12, paddingVertical: 5, paddingHorizontal: 7 };
const muted = (isDark) => ({ color: isDark ? "#a1a1aa" : "#68686f" });
const problemStyle = (isDark) => ({ color: isDark ? "#ff8c8c" : "#b02020", fontSize: 11.5, overflowWrap: "anywhere" });

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

/** Controlled run-time arguments form. It never changes or saves the Workflow document. */
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
      }))
      : (legacy?.inputs || []).map(({ key }) => ({ name: key, required: true }));
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

  if (malformed) return <div role="alert" data-testid="workflow-test-inputs-invalid" style={problemStyle(isDark)}>
    {t("agents.parameters.invalid", { path: "input_schema" })}
  </div>;

  const renderRow = (row) => {
    const key = row.name;
    const draft = drafts[key];
    const anyMode = row.type === undefined;
    const mode = anyMode ? modes.has(key) ? modes.get(key) : own(supplied, key) && typeof supplied[key] !== "string" ? "json" : "text" : null;
    const text = draft ? draft.text : initial_text(supplied, row, mode);
    const error = server_error(errors, key);
    const summary = row.required ? t("agents.parameters.required")
      : row.has_default ? t("agents.execution.tool.default_value", { value1: JSON.stringify(row.default) }) : "";
    return <div key={key} data-testid={`workflow-test-input-${key}`} style={{ display: "flex", flexDirection: "column", gap: 5, padding: "7px 0", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <label htmlFor={`workflow-test-input-control-${encodeURIComponent(key)}`} style={{ minWidth: 0, overflowWrap: "anywhere", fontSize: 12, fontWeight: 600 }}>
          {key}{row.type ? <span style={{ ...muted(isDark), fontWeight: 400 }}> · {t(`agents.parameters.types.${row.type}`)}</span> : null}
        </label>
        <span style={{ ...muted(isDark), fontSize: 11, minWidth: 0, maxWidth: "65%", overflowWrap: "anywhere", textAlign: "right" }}>{summary}</span>
      </div>
      {anyMode && <div data-testid={`workflow-test-input-${key}-mode`} style={{ alignSelf: "flex-start" }}>
        <SegmentedButton options={[
          { value: "text", label: t("agents.test_run.text_mode") },
          { value: "json", label: t("agents.test_run.json_mode") },
        ]} value={mode} on_change={(next) => {
          setModes((current) => new Map(current).set(key, next));
          setDrafts((current) => { const nextDrafts = { ...current }; delete nextDrafts[key]; return nextDrafts; });
        }} disabled={disabled} style={{ fontSize: 11, padding: 2 }} button_style={{ padding: "3px 8px" }} />
      </div>}
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        <TextField aria_label={key} textarea_ref={(element) => {
          if (element) {
            element.id = `workflow-test-input-control-${encodeURIComponent(key)}`;
            element.dataset.testid = `workflow-test-input-control-${key}`;
          }
        }} value={text} disabled={disabled} min_rows={1} max_display_rows={3}
          placeholder={row.type === "object" || row.type === "array" ? t("agents.execution.tool.json_placeholder", { type: row.type }) : t("agents.execution.tool.literal_placeholder")}
          set_value={(next) => update(key, parse_input(next, row.type, mode, t), next)} style={{ ...FIELD_STYLE, flex: 1, minHeight: 34, padding: 7 }} />
        {own(supplied, key) && <Button ariaLabel={t("agents.parameters.remove", { name: key })} label={null} prefix_icon="close" disabled={disabled}
          onClick={() => remove(key)} style={{ iconOnlyPaddingHorizontal: 5, iconOnlyPaddingVertical: 5, content: { icon: { width: 12, height: 12 } } }} />}
      </div>
      {draft && !draft.ok && <span role="status" style={problemStyle(isDark)}>{draft.message}</span>}
      {error && <span role="status" style={problemStyle(isDark)}>{error.message || error.code || t("agents.execution.tool.arguments_failed")}</span>}
    </div>;
  };

  const whole = !hasSignature && legacy.whole;
  const wholeDraft = drafts[WHOLE_OBJECT];
  let wholeText = wholeDraft ? wholeDraft.text : "";
  if (!wholeDraft) {
    try { wholeText = JSON.stringify(supplied, null, 2) ?? ""; } catch (_) { wholeText = ""; }
  }
  return <div data-testid="workflow-test-inputs" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
    {rows.map(renderRow)}
    {whole && <div data-testid="workflow-test-input-whole" style={{ display: "flex", flexDirection: "column", gap: 5, padding: "7px 0", minWidth: 0 }}>
      <label htmlFor="workflow-test-input-whole-control" style={{ fontSize: 12, fontWeight: 600 }}>{t("agents.test_run.input_object")}</label>
      <TextField aria_label={t('agents.test_run.input_object')} textarea_ref={(element) => {
        if (element) {
          element.id = "workflow-test-input-whole-control";
          element.dataset.testid = "workflow-test-input-whole-control";
        }
      }} value={wholeText} disabled={disabled} min_rows={3} max_display_rows={8}
        set_value={(next) => {
          const parsed = parse_input(next, "object", "json", t);
          update(WHOLE_OBJECT, parsed, next, true);
        }} style={{ ...FIELD_STYLE, minHeight: 78, padding: 7, fontFamily: "ui-monospace, Menlo, monospace" }} />
      {wholeDraft && !wholeDraft.ok && <span role="status" style={problemStyle(isDark)}>{wholeDraft.message}</span>}
    </div>}
    {rows.length === 0 && !whole && <span style={{ ...muted(isDark), fontSize: 11.5 }}>{t("agents.parameters.none")}</span>}
  </div>;
}
