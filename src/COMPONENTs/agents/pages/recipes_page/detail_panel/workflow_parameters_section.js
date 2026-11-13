import React, { useEffect, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import { checkManagedCodeResponse } from "../../../../../SERVICEs/managed_code_api";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import PanelInput from "./panel_input";
import PanelSelect from "./panel_select";
import { Block } from "./process_timeline";
import { Region } from "./panel_style";
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

function Parameter({ row, index, identity, allowed, isDark, onChange, onRemove, error }) {
  const { t } = useTranslation();
  const [name, setName] = useState(row.name);
  const [nameError, setNameError] = useState(false);
  useEffect(() => { setName(row.name); setNameError(false); }, [row.name]);
  const field = row.field && typeof row.field === "object" && !Array.isArray(row.field) ? row.field : {};
  const hasType = Object.prototype.hasOwnProperty.call(field, "type");
  const invalidType = hasType && !PARAMETER_TYPES.includes(field.type);
  const selectedType = invalidType ? "stored" : hasType ? field.type : "any";
  const shown = field.type === "string" ? field.default ?? "" : JSON.stringify(field.default) ?? "";
  const pending = usePendingText(shown, identity_of([identity, field.type]));
  const inputStyle = { width: "100%", fontSize: 12, paddingVertical: 5, paddingHorizontal: 7 };
  return <div data-testid={`workflow-parameter-${index}`} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <PanelInput aria_label={t("agents.parameters.name")} value={name} disabled={!allowed}
        set_value={(next) => { setName(next); setNameError(!onChange({ ...row, name: next }, { from: row.name, to: next })); }}
        style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      <span style={{ flex: "0 1 110px", minWidth: 75 }}>
        <PanelSelect value={selectedType} disabled={!allowed} filterable={false}
          options={[...(invalidType ? [{ value: "stored", label: t("agents.execution.tool.stored_value", { value: JSON.stringify(field.type) }), disabled: true }] : []),
            { value: "any", label: t("agents.parameters.types.any") }, ...PARAMETER_TYPES.map((type) => ({ value: type, label: t(`agents.parameters.types.${type}`) }))]}
          set_value={(type) => {
            if (type !== "any" && !PARAMETER_TYPES.includes(type)) return;
            const next = { ...field }; if (type === "any") delete next.type; else next.type = type; onChange({ ...row, field: next });
          }}
          style={{ width: "100%", fontSize: 12, paddingVertical: 5, paddingHorizontal: 6 }} />
      </span>
      <Button prefix_icon="close" ariaLabel={t("agents.parameters.remove", { name: row.name })} disabled={!allowed} onClick={onRemove}
        style={{ borderRadius: 999, iconOnlyPaddingHorizontal: 4, iconOnlyPaddingVertical: 4, content: { icon: { width: 12, height: 12 } } }} />
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ flex: "0 1 120px", minWidth: 80 }}>
        <PanelSelect value={row.required ? "required" : "default"} disabled={!allowed} filterable={false}
          options={[{ value: "required", label: t("agents.parameters.required") }, { value: "default", label: t("agents.parameters.default") }]}
          set_value={(mode) => {
            const next = { ...field };
            if (mode === "required") delete next.default;
            else if (!Object.prototype.hasOwnProperty.call(next, "default")) next.default = seed_default(field.type);
            onChange({ ...row, required: mode === "required", field: next });
          }} style={{ width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6 }} />
      </span>
      {!row.required && <PanelInput aria_label={t("agents.parameters.default")} disabled={!allowed} value={pending.text ?? shown}
        set_value={(text) => {
          let value;
          try { value = field.type === "string" ? text : JSON.parse(text); } catch (_) { pending.hold(text); return; }
          pending.release(); onChange({ ...row, field: { ...field, default: value } });
        }} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />}
    </div>
    {(nameError || error) && <span role="status" style={{ fontSize: 11, overflowWrap: "anywhere", color: isDark ? "#ff8c8c" : "#b02020" }}>
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
    <Block section="workflow-parameters" title={t("agents.parameters.title")} isDark={isDark} aside={rows?.length || 0}>
      {capability === false && <span style={{ fontSize: 11.5, color: isDark ? "#a1a1aa" : "#68686f" }}>{t("agents.parameters.unsupported")}</span>}
      {rows === null ? <span style={{ fontSize: 11.5, color: isDark ? "#ff8c8c" : "#b02020" }}>{t("agents.parameters.invalid", { path: "input_schema" })}</span> : <>
        <Region isDark={isDark}>{rows.map((row, index) => <Parameter key={identities.ids[index]} identity={identities.ids[index]} row={row} index={index}
          allowed={capability === true} isDark={isDark} error={errors.find((error) => error.path[1] === "properties" && error.path[2] === row.name)}
          onChange={(next, rename) => commit(rows.map((old, at) => at === index ? next : old), rename)}
          onRemove={() => { identities.removed(index); commit(rows.filter((_, at) => at !== index)); }} />)}</Region>
        <Button prefix_icon="add" label={t("agents.parameters.add")} ariaLabel={t("agents.parameters.add")} disabled={capability !== true} onClick={add}
          style={{ alignSelf: "flex-start", fontSize: 12, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 5 }} />
      </>}
    </Block>
  </div>;
}
