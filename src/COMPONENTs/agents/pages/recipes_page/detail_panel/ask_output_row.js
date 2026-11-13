import React from "react";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Input from "./panel_input";
import Select from "./panel_select";
import VariablePill, { variablePillField } from "./variable_pill";
import useTakenName from "./taken_name";
import { identity_of } from "../document_values";
import { ASK_TYPES, ask_type_key } from "../agent_asks";
import { muted, problem as problemStyle } from "./panel_style";

/* One "Ask the agent for…" output: the name both the output and the schema
   field go by, the kind of value, and what the agent should put there. The
   value is the agent's to produce, so there is nothing to wire. */
export default function AskOutputRow({ field, index, taken, revision, nodeId, isDark, testid, problems = [], onChange, onRemove }) {
  const { t } = useTranslation();
  const name = useTakenName(field.name, taken, identity_of([revision, nodeId, index]));
  const typeLabel = t("agents.io.ask.type_label");
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <VariablePill testid={testid} isDark={isDark} name={name.shown}
        onNameChange={(next) => {
          const stored = name.type(next);
          if (stored !== null) onChange({ name: stored });
        }}
        onRemove={onRemove}
        removeLabel={t("agents.io.ask.remove", { name: field.name || "…" })}>
        <Select
          aria_label={typeLabel}
          options={ASK_TYPES.map((entry) => ({ value: entry.key, label: t(`agents.io.ask.type_${entry.key}`) }))}
          value={ask_type_key(field)}
          set_value={(next) => onChange({ type: next })}
          filterable={false}
          style={{ ...variablePillField, width: "100%", gap: 4 }}
        />
      </VariablePill>
      <div style={{ padding: "0 8px 7px 8px" }}>
        <Input
          aria_label={t("agents.io.ask.description_label")}
          value={field.description || ""}
          set_value={(next) => onChange({ description: next })}
          placeholder={t("agents.io.ask.description_placeholder")}
          style={{ width: "100%", fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 5, color: muted(isDark) }}
        />
      </div>
      {name.held !== null && name.taken && (
        <span data-testid={`${testid}-name-taken`} style={{ ...problemStyle(isDark), padding: "0 10px 7px" }}>
          {t("agents.io.ask.name_taken", { name: name.held })}
        </span>
      )}
      {problems.map((item, i) => (
        <span key={i} data-testid={`${testid}-problem-${i}`} style={{ ...problemStyle(isDark), padding: "0 10px 7px" }}>
          {item.message}
        </span>
      ))}
    </div>
  );
}
