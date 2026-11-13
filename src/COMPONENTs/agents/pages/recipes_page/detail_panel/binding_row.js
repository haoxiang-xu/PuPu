import VariableSettings, { VariableSettingRow } from "./variable_settings";
import { agentEnglishText } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useId, useState } from "react";
import Select from "./panel_select";
import Input from "./panel_input";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import MissingPolicySelect from "./missing_policy_select";
import {
  expression_is_editable,
  expression_summary,
  first_present_expression,
  literal_expression,
  ref_expression,
} from "../skeleton_io";

/* One input: `[local name] ← [source]`, plus what happens when the source has
 * nothing to give.
 *
 * The name is the author's own — `resolve_inputs` answers with `{name: value}`
 * and the prompt reads it back by that name — so it is typed, not picked. The
 * source is picked, because an expression the runtime cannot evaluate is a
 * refused document rather than an empty value.
 *
 * What an upstream node can supply is what it declares it exports: its own
 * output mappings. Offering anything else would let an author bind to a value
 * no node ever produces. */

const CAPTION = { fontSize: 11.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };

const SOURCE_KINDS = [
  { value: "ref", label: "From a node" },
  { value: "literal", label: "A fixed value" },
  { value: "first_present", label: "First of several" },
];

/* A source that only exists when its branch ran carries the hollow marker
   (Remix `circle`) and says so in words, so the mark is not the only signal. */
function ref_options(sources, t = agentEnglishText) {
  return sources.map((source) => ({
    value: `${source.node_id}\u0000${source.name}`,
    label: source.conditional
      ? t("agents.io.source_option_conditional", { node: source.node_label, name: source.name })
      : t("agents.io.source_option", { node: source.node_label, name: source.name }),
    ...(source.conditional ? { icon: "circle" } : {}),
  }));
}

function ref_key(expression) {
  if (!expression || expression.kind !== "ref") return "";
  const [first] = Array.isArray(expression.path) ? expression.path : [];
  return `${expression.node_id}\u0000${first === undefined ? "" : first}`;
}

function ref_from_key(key) {
  const [node_id, name] = String(key).split("\u0000");
  return ref_expression(node_id, name ? [name] : []);
}

/* Exported so the Tool Call panel's argument rows pick a source exactly the
   way an input row does (#352). */
export function RefPicker({ value, sources, onChange, testid, compact = false }) {
  const { t } = useTranslation();
  if (sources.length === 0) {
    return (
      <span data-testid={`${testid}-no-sources`} style={{ ...CAPTION, flex: 1 }}>
        {t("agents.io.nothing_upstream_exports_a_value_yet")}
      </span>
    );
  }
  return (
    <Select
      options={ref_options(sources, t)}
      value={ref_key(value)}
      set_value={(key) => onChange(ref_from_key(key))}
      filterable={sources.length > 8}
      trigger_wrapper_style={compact ? { width: "100%", minWidth: 0 } : undefined}
      style={{
        ...(compact ? { width: "100%", boxSizing: "border-box" } : {}),
        flex: 1,
        minWidth: 0,
        fontSize: 12,
        paddingVertical: 4,
        paddingHorizontal: 6,
        borderRadius: 8,
        gap: 4,
      }}
    />
  );
}

export default function BindingRow({
  binding,
  index,
  sources,
  problems,
  isDark,
  onChange,
  onRemove,
  hideMissingPolicy = false,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const settingsId = useId();
  const value = binding && binding.value;
  const kind = value && value.kind;
  /* A shape the controls cannot take apart is shown rather than edited: every
     control here would rewrite it into something the author never wrote. */
  const editable = expression_is_editable(value);

  function set_value(next) {
    onChange({ ...binding, value: next });
  }

  function set_kind(next) {
    if (next === kind) return;
    if (next === "ref") {
      const first = sources[0];
      set_value(first ? ref_expression(first.node_id, [first.name]) : ref_expression("", []));
      return;
    }
    if (next === "literal") {
      set_value(literal_expression(""));
      return;
    }
    /* Two is the minimum the runtime accepts, so the row starts with two rather
       than composing something it would reject. */
    const seed =
      kind === "ref" && value ? value : ref_expression(sources[0]?.node_id || "", sources[0] ? [sources[0].name] : []);
    set_value(first_present_expression([seed, { ...seed }]));
  }

  const rowProblems = problems || [];

  return (
    <div data-testid={`binding-row-${index}`} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div data-testid={`binding-row-${index}-header`}
        style={{ display: "grid", gridTemplateColumns: "minmax(48px, 0.85fr) 10px minmax(0, 1.4fr) 24px", alignItems: "center", gap: 4 }}>
        <Input value={(binding && binding.name) || ""}
          set_value={(next) => onChange({ ...binding, name: next })}
          placeholder={t("agents.io.name_placeholder")}
          style={{ width: "100%", minWidth: 0, fontSize: 12, ...MONO, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
        <span aria-hidden="true" style={CAPTION}>←</span>
        <div data-testid={`binding-row-${index}-source`} style={{ display: "flex", minWidth: 0 }}>
          {editable && kind === "ref" ? (
            <RefPicker value={value} sources={sources} onChange={set_value} testid={`binding-row-${index}`} compact />
          ) : editable && kind === "literal" ? (
            <Input value={typeof value.value === "string" ? value.value : JSON.stringify(value.value)}
              set_value={(next) => set_value(literal_expression(next))}
              placeholder={t("agents.io.a_value_written_here_not_read_from_the_graph")}
              style={{ width: "100%", minWidth: 0, fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
          ) : (
            <Button label={editable ? t("agents.io.source.first_present") : "—"}
              onClick={() => setExpanded(true)}
              style={{ minWidth: 0, maxWidth: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
          )}
        </div>
        <Button prefix_icon="more" ariaLabel={`${binding?.name || t("agents.io.input_variables")} · ${t("chat.attach.more")}`}
          dom_props={{ "aria-expanded": expanded, "aria-controls": settingsId }}
          onClick={() => setExpanded(!expanded)}
          style={{ width: 24, height: 24, iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, borderRadius: 8, color: "#86868b", content: { icon: { width: 15, height: 15 } } }} />
      </div>
      {/* Keep editors mounted: closing settings must not discard unfinished text. */}
      <VariableSettings id={settingsId} testid={`binding-row-${index}-settings`} expanded={expanded} isDark={isDark}
        footer={(
          <Button prefix_icon="delete" label={binding?.name ? t("agents.io.remove_input", { name: binding.name }) : t("agents.io.remove_input_unnamed")}
          ariaLabel={binding?.name ? t("agents.io.remove_input", { name: binding.name }) : t("agents.io.remove_input_unnamed")}
          onClick={onRemove} style={{ alignSelf: "flex-start", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 }} />
        )}>

        <VariableSettingRow label={t("model_providers.custom.import_source")}>
          <Select options={SOURCE_KINDS.map((source) => ({ ...source, label: source.value === "ref"
          ? t("agents.io.source.ref") : source.value === "literal" ? t("agents.io.source.literal") : t("agents.io.source.first_present") }))}
          value={kind} set_value={set_kind} filterable={false} trigger_wrapper_style={{ width: "100%", minWidth: 0 }}
          style={{ width: "100%", boxSizing: "border-box", justifyContent: "flex-start", minWidth: 0, fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8, gap: 4 }} />
        </VariableSettingRow>
      {editable && kind === "first_present" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {!hideMissingPolicy && <span style={CAPTION}>
            {t("agents.io.first_present_caption")}
          </span>}
          {(value.values || []).map((entry, i) => (
            <div
              key={i}
              data-testid={`binding-row-${index}-alt-${i}`}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <RefPicker
                value={entry}
                sources={sources}
                onChange={(next) =>
                  set_value(
                    first_present_expression(
                      value.values.map((old, j) => (j === i ? next : old)),
                    ),
                  )
                }
                testid={`binding-row-${index}-alt-${i}`}
              />
              <Button
                prefix_icon="close"
                ariaLabel={t("agents.io.remove_source", { position: i + 1 })}
                disabled={(value.values || []).length <= 2}
                onClick={() =>
                  set_value(
                    first_present_expression(value.values.filter((_, j) => j !== i)),
                  )
                }
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 4,
                  borderRadius: 8,
                  content: { icon: { width: 11, height: 11 } },
                }}
              />
            </div>
          ))}
          <Button
            label={t("agents.io.add_a_source")}
            onClick={() =>
              set_value(
                first_present_expression([
                  ...value.values,
                  sources[0]
                    ? ref_expression(sources[0].node_id, [sources[0].name])
                    : ref_expression("", []),
                ]),
              )
            }
            style={{
              alignSelf: "flex-start",
              fontSize: 11.5,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 8,
              color: "var(--pupu-text-muted)",
            }}
          />
        </div>
      )}

        {!hideMissingPolicy && <MissingPolicySelect binding={binding} onChange={onChange} isDark={isDark} labelWidth={64} />}
      </VariableSettings>
      {!editable && (
        <div
          data-testid={`binding-row-${index}-unreadable`}
          style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}
        >
          <span style={CAPTION}>
            {t("agents.io.unreadable_binding")}
          </span>
          <span
            style={{
              ...MONO,
              fontSize: 11.5,
              lineHeight: 1.45,
              wordBreak: "break-all",
              color: isDark ? "#c9c9d1" : "#55555d",
            }}
          >
            {expression_summary(value, t)}
          </span>
        </div>
      )}

      {rowProblems.map((problem, i) => (
        <span
          key={i}
          data-testid={`binding-row-${index}-problem-${i}`}
          style={{
            marginTop: 6,
            fontSize: 11.5,
            lineHeight: 1.45,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {problem.message}
        </span>
      ))}
    </div>
  );
}
