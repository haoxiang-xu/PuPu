import PanelHelp from "./panel_help";
import { agentEnglishText } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { RefPicker } from "./binding_row";
import MissingPolicySelect from "./missing_policy_select";
import usePendingText from "./pending_text";
import { binding_sources } from "./input_variables_section";
import { safe_text } from "../document_values";
import { node_bindings } from "../skeleton_document";
import { binding_default, expression_is_editable, expression_summary, literal_expression, make_binding } from "../skeleton_io";
import { read_toolkit_catalog } from "../toolkit_pool_config";
import {
  APPROVAL_LIMIT_MS,
  ON_ERROR_CHOICES,
  argument_layout,
  literal_from_text,
  literal_to_text,
  tool_availability,
  tool_call_problems,
  tool_settings,
  with_argument,
  with_tool_settings,
} from "../tool_call_config";

/* A Tool Call node: one tool, the arguments you fix, and what happens when it
 * fails (#352). Every rule here is the fixed runtime's (see `tool_call_config`):
 *
 *   - the tool is picked from the same library the Toolkit Pool panel reads,
 *     and stored by name only, which is all the runtime stores;
 *   - its arguments ARE the node's inputs, so this section takes the place of
 *     Input Variables: one row per property of the tool's own schema (read
 *     from the runtime, `listSkeletonToolSchemas`), each a fixed value or a
 *     value from an upstream node, and no free-form row — an argument the tool
 *     does not declare would be refused by the tool;
 *   - a row the schema does not declare is kept and shown, so it can be
 *     removed deliberately rather than vanishing;
 *   - the error policy and the approval wait are required by the runtime and
 *     never chosen for the author. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const problem_style = (isDark) => ({
  fontSize: 10.5,
  lineHeight: 1.45,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});
const KEY = "\u0000";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function Divider({ isDark }) {
  return <div style={{ height: 1, margin: "2px 0", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />;
}

function type_hint(row, t = agentEnglishText) {
  const parts = [row.type || t("agents.execution.tool.any_value")];
  if (row.required) parts.push(t("agents.schema.required"));
  if (row.has_default) parts.push(t("agents.execution.tool.default_value", { value1: literal_to_text(row.default, row.type) }));
  return parts.join(" · ");
}

/* A fixed value of the argument's own type. A text that is not yet a value of
   that type is held here and never written, so the document only ever carries
   what the tool can take. */
function LiteralField({ row, binding, onSet, editable, isDark, testid }) {
  const { t } = useTranslation();
  const stored = binding && binding.value && binding.value.kind === "literal" ? binding.value.value : undefined;
  const shown = stored === undefined ? "" : literal_to_text(stored, row.type);
  const pending = usePendingText(shown, testid);
  const write = (value) => onSet(make_binding({ name: row.name, value: literal_expression(value), missing: "error" }));

  if (Array.isArray(row.enum) || row.type === "boolean") {
    const values = Array.isArray(row.enum) ? row.enum : [true, false];
    return (
      <Select
        options={values.map((value) => ({ value: JSON.stringify(value), label: literal_to_text(value, row.type) }))}
        value={stored === undefined ? null : JSON.stringify(stored)}
        set_value={(next) => write(JSON.parse(next))}
        filterable={false}
        placeholder={t("agents.execution.tool.choose_a_value")}
        disabled={!editable}
        style={FIELD}
      />
    );
  }
  const text = pending.text !== null ? pending.text : shown;
  const parsed = pending.text !== null ? literal_from_text(pending.text, row.type, t) : null;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={row.type === "object" || row.type === "array" ? t("agents.execution.tool.json_placeholder", { type: row.type }) : t("agents.execution.tool.literal_placeholder")}
        set_value={(next) => {
          const result = literal_from_text(next, row.type);
          if (!result.ok) {
            pending.hold(next);
            return;
          }
          const arriving = literal_to_text(result.value, row.type);
          if (arriving !== next) pending.hold(next, arriving);
          else pending.release();
          write(result.value);
        }}
        style={FIELD}
      />
      {parsed && !parsed.ok && (
        <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>
          {t("agents.execution.tool.pending_literal", { problem: parsed.problem })}
        </span>
      )}
    </span>
  );
}

export function ArgumentRow({ row, sources, toolName, editable, onSet, isDark }) {
  const { t } = useTranslation();
  const binding = row.binding;
  const testid = `tool-call-argument-${row.name}`;
  const stored_mode = !binding ? null : binding.value && binding.value.kind === "literal" ? "value" : "variable";
  const [mode, setMode] = useState(stored_mode);
  useEffect(() => {
    if (stored_mode) setMode(stored_mode);
  }, [stored_mode]);
  const kind = binding && binding.value ? binding.value.kind : null;
  /* The picker is handed only a ref it can read — the same precondition the
     IO editor's own rows check. The store keeps a ref whose node or field is
     not a name (R-352-04); it is not the picker's value, so it stays shown
     below as stored until the author replaces it. */
  const picked = kind === "ref" && expression_is_editable(binding.value) ? binding.value : null;

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ ...ROW, justifyContent: "space-between" }}>
        <span style={{ ...MONO, fontSize: 11 }}>
          {row.name}
          {row.required && <span aria-label={t("agents.schema.required")} style={{ color: problem_style(isDark).color, marginLeft: 3 }}>*</span>}
        </span>
        <PanelHelp label={row.name}>
          {type_hint(row, t)}{row.description ? ` — ${row.description}` : ""}
        </PanelHelp>
        <span data-testid={`${testid}-mode`} style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedButton
            options={[{ value: "value", label: t("agents.execution.tool.value_mode") }, { value: "variable", label: t("agents.execution.tool.variable_mode") }]}
            value={mode}
            on_change={setMode}
            disabled={!editable}
            style={{ fontSize: 11.5, padding: 2, borderRadius: 8 }}
            button_style={{ height: 22, padding: "0 9px", fontWeight: 500 }}
          />
        </span>
      </div>

      {mode === null && (
        <span data-testid={`${testid}-unset`} style={row.required ? problem_style(isDark) : NOTE}>
          {row.required ? t("agents.execution.tool.required_unset", { toolName: toolName }) : t("agents.execution.tool.unset_default", { toolName: toolName })}
        </span>
      )}
      {/* Each mode always opens its editor. A required argument has no Unset,
          so this is the only way to replace what is stored (R-352-01); the
          editor composes the replacement and nothing is written until one is
          actually typed or picked. */}
      {mode === "value" && (
        <LiteralField row={row} binding={binding} onSet={onSet} editable={editable} isDark={isDark} testid={`${testid}-value`} />
      )}
      {mode === "variable" && (
        <div style={ROW}>
          <RefPicker
            value={picked}
            sources={sources}
            onChange={(expression) => onSet(make_binding({
              name: row.name,
              value: expression,
              missing: binding ? binding.missing : "error",
              default_value: binding_default(binding),
            }))}
            testid={`${testid}-ref`}
          />
        </div>
      )}
      {/* Until then what is stored stays in the document and is shown as it
          is: a fixed value while Variable is open, a source while Value is,
          several sources, which neither editor composes, or a ref the picker
          cannot read. */}
      {binding && ((mode === "value" && kind !== "literal") || (mode === "variable" && !picked)) && (
        <span data-testid={`${testid}-kept`} style={NOTE}>
          {t("agents.execution.tool.stored_value", { value: "{value}" }).split(/(\{value\})/g).map((part, index) => ({ __proto__: null, "{value}": (<span key={index} style={MONO}>{safe_text(expression_summary(binding.value, t))}</span>) }[part] || part))}
        </span>
      )}
      {binding && kind !== "literal" && (
        <MissingPolicySelect
          binding={binding}
          isDark={isDark}
          onChange={(next) => onSet(next)}
        />
      )}
      {binding && !row.required && editable && (
        <span>
          <Button
            label={t("agents.execution.tool.unset")}
            ariaLabel={t("agents.execution.tool.unset_argument", { row_name: row.name })}
            onClick={() => {
              setMode(null);
              onSet(null);
            }}
            style={{ fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5, opacity: 0.75 }}
          />
        </span>
      )}
    </div>
  );
}

function useToolLibrary() {
  const [library, setLibrary] = useState({ status: "loading", rows: [] });
  const ticket = useRef(0);
  const alive = useRef(true);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    setLibrary((old) => ({ ...old, status: "loading" }));
    try {
      const rows = read_toolkit_catalog(await api.unchain.listToolModalCatalog({ strict: true }));
      if (alive.current && mine === ticket.current) setLibrary({ status: "ready", rows });
    } catch (_error) {
      if (alive.current && mine === ticket.current) setLibrary((old) => ({ ...old, status: "error" }));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    read();
    const unsubscribe = subscribeToolkitCatalogRefresh(read);
    return () => {
      alive.current = false;
      ticket.current += 1;
      unsubscribe();
    };
  }, [read]);
  return [library, read];
}

function useToolSchemas(toolkitId) {
  const [state, setState] = useState({ toolkitId: null, status: "idle", tools: null, error: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    if (!toolkitId) return;
    const mine = ++ticket.current;
    setState({ toolkitId, status: "loading", tools: null, error: null });
    try {
      const answer = await api.unchain.listSkeletonToolSchemas(toolkitId);
      if (mine === ticket.current) {
        setState({ toolkitId, status: "ready", tools: new Map(answer.tools.map((tool) => [tool.name, tool])), error: null });
      }
    } catch (error) {
      if (mine === ticket.current) setState({ toolkitId, status: "error", tools: null, error });
    }
  }, [toolkitId]);
  useEffect(() => {
    read();
    return () => {
      ticket.current += 1;
    };
  }, [read]);
  return [state.toolkitId === toolkitId ? state : { status: toolkitId ? "loading" : "idle", tools: null, error: null }, read];
}

export default function ToolCallSection({ document, node, isDark, onChange }) {
  const { t } = useTranslation();
  const [library, reloadLibrary] = useToolLibrary();
  const tool = tool_settings(node);
  const name = tool && typeof tool.name === "string" ? tool.name : "";

  const visible = useMemo(() => library.rows.filter((kit) => kit.hidden !== true), [library.rows]);
  const homes = useMemo(
    () => (name ? visible.filter((kit) => kit.tools.some((item) => item.name === name && item.hidden !== true)) : []),
    [visible, name],
  );
  const home = homes.length === 1 ? homes[0] : null;
  const listed = home ? home.tools.find((item) => item.name === name) : null;
  const [schemas, reloadSchemas] = useToolSchemas(home ? home.toolkitId : null);
  const schema = schemas.status === "ready" && schemas.tools ? schemas.tools.get(name) || null : null;
  const parameters = schema ? schema.parameters : null;

  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && (document.kind === "agent" || document.kind === "workflow") &&
    document.schema_version === 1 && typeof onChange === "function";
  const commit = (next) => {
    if (editable && next !== document) onChange(next);
  };
  const setTool = (next) => commit(with_tool_settings(document, node.id, next));

  const options = [
    ...(name && !home && library.status === "ready"
      ? [{ value: `${KEY}${name}`, label: homes.length > 1 ? t("agents.execution.tool.ambiguous_option", { name }) : t("agents.execution.tool.unlisted_option", { name }) }]
      : []),
    ...visible.flatMap((kit) => kit.tools.filter((item) => item.hidden !== true).map((item) => ({
      value: `${kit.toolkitId}${KEY}${item.name}`,
      label: `${item.title || item.name} · ${kit.toolkitName || kit.toolkitId}`,
    }))),
  ];
  const selected = !name ? null : home ? `${home.toolkitId}${KEY}${name}` : `${KEY}${name}`;

  const layout = argument_layout(parameters, node_bindings(node));
  const order = layout.rows.map((row) => row.name);
  const sources = binding_sources(document, node.id);
  const problems = tool_call_problems(node, parameters, t);
  const extras_keys = tool ? Object.keys(tool).filter((key) => !["name", "on_error", "approval_timeout_ms"].includes(key)) : [];
  const seconds = tool && Number.isSafeInteger(tool.approval_timeout_ms) ? tool.approval_timeout_ms / 1000 : null;
  const pendingSeconds = usePendingText(seconds === null ? "" : String(seconds), `tool-call-approval-${node.id}`);

  return (
    <section data-testid="tool-call-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>{t("agents.execution.tool.tool")}</span>
        <span data-testid="tool-call-picker">
          <Select
            options={options}
            value={selected}
            set_value={(value) => {
              const picked = String(value).split(KEY)[1];
              if (picked && picked !== name) setTool({ ...(tool || {}), name: picked });
            }}
            filterable
            placeholder={library.status === "loading" ? t("agents.execution.tool.reading_library") : t("agents.execution.tool.pick_tool")}
            disabled={!editable}
            dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
            style={FIELD}
          />
        </span>
        {library.status === "error" && (
          <span data-testid="tool-call-library-error" style={problem_style(isDark)}>{t("agents.execution.tool.library_failed")}<Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {listed && listed.description && <span style={NOTE}>{listed.description}</span>}
        {listed && (
          <span data-testid="tool-call-confirmation" style={NOTE}>
            {listed.requiresConfirmation
              ? t("agents.execution.tool.approval_required_note")
              : t("agents.execution.tool.no_approval_note")}
          </span>
        )}
        {home && tool_availability(document, name, home.toolkitId) === "chat_only" && (
          <span data-testid="tool-call-availability" style={NOTE}>
            {t("agents.execution.tool.chat_only", { toolkit: home.toolkitName || home.toolkitId })}
          </span>
        )}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="tool-call-arguments" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>{t("agents.execution.tool.arguments")}</span>
        {!name && <span style={NOTE}>{t("agents.execution.tool.pick_before_arguments")}</span>}
        {name && home && schemas.status === "loading" && <span style={NOTE}>{t("agents.execution.tool.reading_arguments", { tool: name })}</span>}
        {name && home && schemas.status === "error" && (
          <span data-testid="tool-call-schema-error" style={problem_style(isDark)}>
            {safe_text((schemas.error && schemas.error.message) || t("agents.execution.tool.arguments_failed"))}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadSchemas} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {name && home && schemas.status === "ready" && !schema && (
          <span style={problem_style(isDark)}>{t("agents.execution.tool.no_schema", { tool: name })}</span>
        )}
        {name && !home && library.status === "ready" && (
          <span style={problem_style(isDark)}>
            {homes.length > 1 ? t("agents.execution.tool.ambiguous_arguments", { name }) : t("agents.execution.tool.unlisted_arguments", { name })}
          </span>
        )}
        {schema && layout.readable && layout.rows.length === 0 && <span style={NOTE}>{t("agents.execution.tool.no_arguments", { tool: name })}</span>}
        {schema && layout.rows.map((row) => (
          <ArgumentRow
            key={row.name}
            row={row}
            sources={sources}
            toolName={name}
            editable={editable}
            isDark={isDark}
            onSet={(binding) => commit(with_argument(document, node.id, row.name, binding, order))}
          />
        ))}
        {layout.extras.map(({ binding, index }) => {
          const extraName = record(binding) && typeof binding.name === "string" ? binding.name : "";
          return (
            <div key={`extra-${index}`} data-testid={`tool-call-extra-${index}`} style={{ ...ROW, justifyContent: "space-between" }}>
              <span style={problem_style(isDark)}>
                {schema ? t("agents.execution.tool.extra_argument", { argument: "{argument}", tool: "{tool}" }).split(/(\{argument\}|\{tool\})/g).map((part, index) => ({ __proto__: null, "{argument}": (<span key={index} style={MONO}>{safe_text(extraName) || t("agents.execution.tool.unnamed")}</span>), "{tool}": name }[part] || part)) : t("agents.execution.tool.stored_argument", { argument: "{argument}" }).split(/(\{argument\})/g).map((part, index) => ({ __proto__: null, "{argument}": (<span key={index} style={MONO}>{safe_text(extraName) || t("agents.execution.tool.unnamed")}</span>), "{tool}": name }[part] || part))}
              </span>
              {schema && (
                <Button
                  label={t("agents.execution.tool.remove")}
                  ariaLabel={t("agents.execution.tool.remove_stored_argument", { extraName: extraName })}
                  disabled={!editable}
                  onClick={() => commit(with_argument(document, node.id, extraName, null, order))}
                  style={{ fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 }}
                />
              )}
            </div>
          );
        })}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="tool-call-on-error" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.tool.on_error")}</span>
          <PanelHelp label={t("agents.execution.tool.on_error")}>
            <span data-testid="tool-call-on-error-note" style={NOTE}>
              {t("agents.execution.tool.error_contract", { ok: "{ok}", error: "{error}", denied: "{denied}", tool_error: "{tool_error}", result: "{result}", tool_failed: "{tool_failed}" }).split(/(\{ok\}|\{error\}|\{denied\}|\{tool_error\}|\{result\}|\{tool_failed\})/g).map((part, index) => ({ __proto__: null, "{ok}": (<span key={index} style={MONO}>ok</span>), "{error}": (<span key={index} style={MONO}>error</span>), "{denied}": (<span key={index} style={MONO}>denied</span>), "{tool_error}": (<span key={index} style={MONO}>tool_error</span>), "{result}": (<span key={index} style={MONO}>result</span>), "{tool_failed}": (<span key={index} style={MONO}>tool_failed</span>) }[part] || part))}
            </span>
          </PanelHelp>
        </div>
        <span style={{ opacity: editable && name ? 1 : 0.5, pointerEvents: editable && name ? "auto" : "none" }}>
          <SegmentedButton
            options={ON_ERROR_CHOICES.map((choice) => ({ ...choice, label: choice.value === "stop" ? t("agents.execution.tool.fail_run") : t("agents.execution.tool.continue") }))}
            value={tool?.on_error ?? null}
            on_change={(value) => setTool({ ...(tool || {}), on_error: value })}
            disabled={!editable || !name}
            style={{ fontSize: 11.5, padding: 2, borderRadius: 8 }}
            button_style={{ height: 22, padding: "0 9px", fontWeight: 500 }}
          />
        </span>
        {/* The runtime's own rule, measured (steps-352/qualify-a1/measure-results):
            a result object with `ok: false` or a non-null `error` is a failure,
            as is a denied approval; returned text never is, whatever it says. */}

      </div>

      <div data-testid="tool-call-approval" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.tool.approval_wait")}</span>
          <PanelHelp label={t("agents.execution.tool.approval_wait")}>
            <span style={NOTE}>{t("agents.execution.tool.approval_limit_note")}</span>
          </PanelHelp>
        </div>
        <div style={ROW}>
          <Input
            value={pendingSeconds.text !== null ? pendingSeconds.text : seconds === null ? "" : String(seconds)}
            disabled={!editable || !name}
            placeholder={t("agents.execution.tool.seconds")}
            set_value={(text) => {
              const parsed = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
              const ms = parsed * 1000;
              if (!Number.isSafeInteger(ms) || ms < APPROVAL_LIMIT_MS.min || ms > APPROVAL_LIMIT_MS.max) {
                pendingSeconds.hold(text);
                return;
              }
              pendingSeconds.release();
              setTool({ ...(tool || {}), approval_timeout_ms: ms });
            }}
            style={{ ...FIELD, width: 120 }}
          />
          <span style={NOTE}>{t("agents.execution.tool.seconds")}</span>
        </div>
        {pendingSeconds.text !== null && (
          <span data-testid="tool-call-approval-problem" style={problem_style(isDark)}>{t("agents.execution.tool.pending_approval_wait")}</span>
        )}

      </div>

      {extras_keys.map((key) => (
        <div key={key} data-testid={`tool-call-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>{t("agents.execution.tool.unsupported_setting", { key: safe_text(key) })}</span>
          <Button
            label={t("agents.execution.tool.remove_setting")}
            ariaLabel={t("agents.execution.tool.remove_setting_key", { key: key })}
            disabled={!editable}
            onClick={() => {
              const next = { ...tool };
              delete next[key];
              setTool(next);
            }}
            style={{ fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 }}
          />
        </div>
      ))}

      {problems.length > 0 && (
        <div data-testid="tool-call-problems" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {problems.map((problem, index) => (
            <span key={index} style={problem_style(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
