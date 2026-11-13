import { Block } from "./process_timeline";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import BareInput from "../../../../../BUILTIN_COMPONENTs/input/input";
import Input from "./panel_input";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import { FieldRow } from "./output_schema_section";
import CodeEditor from "./code_editor";
import { variablePillField } from "./variable_pill";
import { safe_text } from "../document_values";
import { python_profiles } from "../skeleton_resources";
import {
  colliding_field_names,
  fields_hold_schema,
  free_field_name,
  new_field,
  schema_fields,
  schema_from_fields,
  why_fields_cannot_hold,
} from "../output_schema_fields";
import {
  BUILTIN_PYTHON,
  CODE_DEFAULTS,
  CODE_LIMITS,
  code_problems,
  code_settings,
  code_source_text,
  limit_from_text,
  source_path_problem,
  with_code_settings,
} from "../code_config";
import { managed_path, sha256_text } from "../managed_code_sources";
import { PANEL_SWITCH, Region, SettingRow, addButtonStyle, muted, note, problem, removeButtonStyle, text as textColor, textFieldFill } from "./panel_style";

/* A Code node (#357): the Python file that holds `main(input, context)`, how
 * long it may run and how much it may hand back, the Result it declares, and
 * what happens when it fails. Every rule here is the fixed runtime's (see
 * `code_config`):
 *
 *   - it runs with the built-in Python. There is no picker: the first setting
 *     written on a node that names no Python writes the built-in one (the
 *     runtime refuses a node that names none), and a Python already stored is
 *     kept exactly as it is. Only a stored one this machine cannot run offers
 *     the way back to the built-in one;
 *   - the source is one file reference: either code written here, which the
 *     host keeps with the Agent under a path it generates from the text's
 *     digest (#357 G1), or a file the run reads under its workspace when it
 *     gets there. The panel edits the text, or the path, and never both;
 *   - the three limits are required whole numbers with the runtime's bounds,
 *     each an upper bound (`code_runtime.py`): the process is stopped once it
 *     has run for the time limit; a result whose JSON is longer than the
 *     result limit fails the node; printed output past the log limit is
 *     dropped (per stream) and the run goes on. None has a default: emptying
 *     a box removes the setting, which is how a new node stores it;
 *   - the Result schema is the one place in a graph where types are declared;
 *     the Output Variables below pick from its fields;
 *   - there is no error policy to choose: a return that does not match
 *     Result fails the run, an exception or a timeout ends it with an unknown
 *     outcome, and nothing of the node is published either way (R-357-02);
 *     the panel says so in plain words.
 *
 * Nothing else is written that the author did not choose: a new node has no
 * `code` at all, and each control writes its own key the first time it is
 * used. The problems list says what is still missing. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
const REGION_ROW = { padding: "6px 10px 6px 11px" };
const problem_style = problem;
const SECONDS = Object.freeze({ min: 1, max: CODE_LIMITS.timeout_ms.max / 1000 });
const EMPTY_CLOSED_SCHEMA = Object.freeze({ type: "object", properties: {}, additionalProperties: false });
const PROFILE_PROBLEMS = Object.freeze(["profile_invalid", "profile_unknown", "profile_unavailable"]);
/* Which section says each problem; anything else is said under the panel. */
const SECTION_PROBLEMS = Object.freeze({
  source: Object.freeze(["source_missing", "source_invalid", ...PROFILE_PROBLEMS]),
  limits: Object.freeze(["limit_invalid"]),
  result: Object.freeze(["schema_missing", "schema_invalid"]),
});
const SAID_IN_A_SECTION = Object.freeze(Object.values(SECTION_PROBLEMS).flat());

function ProblemList({ items, testid, isDark }) {
  if (items.length === 0) return null;
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {items.map((item, index) => <span key={index} style={problem(isDark)}>{item.message}</span>)}
    </div>
  );
}
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

/* The machine's Python profiles, read only to say whether a stored one is
   still there; nothing is offered from them. A failed read says nothing. */
function usePythonProfiles() {
  const [profiles, setProfiles] = useState(null);
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    const result = await python_profiles();
    if (mine !== ticket.current) return;
    setProfiles(result.ok ? result.data.profiles : null);
  }, []);
  useEffect(() => {
    read();
    return () => {
      ticket.current += 1;
    };
  }, [read]);
  return profiles;
}

/* One limit: what it bounds, the comparison it really is, the number typed in
 * place (no fill, no border, no highlight — a variable row's field) and its
 * unit. A box holds only a whole number in the runtime's range; anything
 * else stays on screen unstored with the reason. Emptied, the setting is
 * removed again, which means the default: the placeholder shows it, and the
 * next save writes it. */
function LimitRow({ label, unit, stored, fallback, limit, scale = 1, editable, testid, isDark, onWrite, onClear }) {
  const { t } = useTranslation();
  const shown = Number.isSafeInteger(stored) ? String(stored / scale) : "";
  const pending = usePendingText(shown, testid);
  const value = pending.text !== null ? pending.text : shown;
  return (
    <div style={REGION_ROW}>
      <SettingRow label={label} isDark={isDark} testid={testid}>
        <span aria-hidden="true" data-testid={`${testid}-sign`} style={{ flexShrink: 0, fontSize: 13, color: muted(isDark) }}>≤</span>
        <span style={{ width: 76, flexShrink: 0, display: "flex" }}>
          <BareInput
            aria_label={`${label} ≤ ${unit}`}
            value={value}
            disabled={!editable}
            placeholder={String(fallback / scale)}
            set_value={(next) => {
              if (next.trim() === "") {
                pending.release();
                onClear();
                return;
              }
              const parsed = limit_from_text(next, limit);
              if (!parsed.ok) {
                pending.hold(next);
                return;
              }
              pending.release();
              onWrite(parsed.value * scale);
            }}
            style={{ ...variablePillField, width: "100%", color: textColor(isDark), fontVariantNumeric: "tabular-nums" }}
          />
        </span>
        <span style={{ flexShrink: 0, minWidth: 44, fontSize: 12, color: muted(isDark) }}>{unit}</span>
      </SettingRow>
      {pending.text !== null && (
        <span data-testid={`${testid}-problem`} style={{ ...problem_style(isDark), display: "block", paddingBottom: 2 }}>
          {t("agents.execution.code.pending_value", { problem: limit_from_text(pending.text, limit, t).problem })}
        </span>
      )}
    </div>
  );
}

export default function CodeSection({ document, node, revision, sources, isDark, onChange }) {
  const { t } = useTranslation();
  const NOTE = note(isDark);
  const code = code_settings(node);
  const profiles = usePythonProfiles();
  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && (document.kind === "agent" || document.kind === "workflow") &&
    document.schema_version === 1 && typeof onChange === "function";
  const commit = (next, typed = null) => {
    if (editable && next !== document) onChange(next, typed);
  };
  /* Every write names the built-in Python when the node names none yet. */
  const setCode = (next) => commit(with_code_settings(document, node.id, next));
  const write = (key, value) => setCode({ ...(code || {}), [key]: value });
  const clear = (key) => {
    if (!code || !Object.prototype.hasOwnProperty.call(code, key)) return;
    const next = { ...code };
    delete next[key];
    setCode(next);
  };

  /* ── Source ── */
  const source = code_source_text(node, sources, t);
  /* Which of the two the author is editing. It starts as what is stored —
     host-kept text, or nothing yet, opens the text; a workspace path opens
     the path — and changes only by the author's choice; choosing writes
     nothing until they type. Remounted with the document, like the rest. */
  const [mode, setMode] = useState(() => (code && code.source !== undefined && !source.managed ? "file" : "here"));
  const stored_path = !source.managed && code && record(code.source) && typeof code.source.path === "string" ? code.source.path : "";
  const pendingPath = usePendingText(stored_path, `code-source-${node.id}`);
  const path_text = pendingPath.text !== null ? pendingPath.text : stored_path;
  const path_problem = pendingPath.text !== null
    ? source_path_problem(pendingPath.text, t)
    : code && code.source !== undefined && !source.managed ? source_path_problem(stored_path, t) : null;
  /* The editor shows the stored text byte for byte. A text with a carriage
     return is shown and not edited: a browser text box hands back its lines
     with LF endings, so the first keystroke would rewrite every line ending
     of a program the author did not mean to change. */
  const shown_text = source.available ? source.text : "";
  const keeps_cr = source.available && source.text.includes("\r");
  const text_editable = editable && !keeps_cr && (source.available || !source.managed);
  const write_text = (text) => {
    const sha = sha256_text(text);
    if (sha === null) return;
    const typed = Object.create(null);
    typed[sha] = text;
    commit(with_code_settings(document, node.id, { ...(code || {}), source: { kind: "file", path: managed_path(sha) } }), typed);
  };

  /* ── Result ── */
  const schema = code ? code.result_schema : undefined;
  const declared = record(schema);
  const held = declared && fields_hold_schema(schema);
  const { fields, closed, root } = schema_fields(declared ? schema : EMPTY_CLOSED_SCHEMA);
  const rows = useListIdentities(node.id, fields.length);
  /* Which view, and the JSON text the document does not hold. `of` is the
     schema this editor last derived its text from or wrote, so a schema
     that arrived from anywhere else resets the text — while the editor's
     own write, which hands the same object back, keeps it. The view is the
     author's: typing in the box asks for the box, and only the explicit
     switch (or a schema the rows cannot hold) decides otherwise; a document
     replaced from outside remounts this section (R-357-03). */
  const [editor, setEditor] = useState({ as_json: false, of: schema, text: null });
  if (!Object.is(editor.of, schema)) setEditor({ as_json: editor.as_json, of: schema, text: null });
  const jsonText = editor;
  /* The box exists while the author is typing in it, whatever the text
     parses to: `null`, `[]` and `0` are written (the store keeps them and
     preflight refuses them) but the box that wrote them stays, with its text
     and focus, until the author corrects it or switches view (R-357-03a). */
  const typing_json = editor.as_json && editor.text !== null;
  const as_json = (declared && (!held || editor.as_json)) || typing_json;
  const set_fields = (next_fields, next_closed, next_root) => {
    if (colliding_field_names(next_fields).length > 0) return;
    write("result_schema", schema_from_fields(next_fields, next_closed, next_root));
  };
  const json_shown = jsonText.text !== null ? jsonText.text : (() => {
    try {
      const encoded = JSON.stringify(schema, null, 2);
      return encoded === undefined ? "" : encoded;
    } catch (error) {
      return "";
    }
  })();
  const json_parsed = jsonText.text !== null ? (() => {
    try {
      return { ok: true, value: JSON.parse(jsonText.text) };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  })() : { ok: true };

  /* Shown as stored: a list, item by item, or whatever else the draft holds
     (the store saves `artifacts: {…}` and preflight refuses it) with one
     action that removes the key — never normalized on the way in (R-357-04). */
  /* By key, not by value: a stored null / false / 0 / "" is a value that is
     there (R-357-04a). */
  const artifacts_raw = code && Object.prototype.hasOwnProperty.call(code, "artifacts") ? code.artifacts : undefined;
  const artifacts_present = code !== null && code !== undefined && Object.prototype.hasOwnProperty.call(code, "artifacts");
  const artifacts = Array.isArray(artifacts_raw) ? artifacts_raw : null;
  const raw_text = (value) => {
    try {
      const text = JSON.stringify(value);
      return text === undefined ? String(value) : text;
    } catch (error) {
      return "(unreadable)";
    }
  };
  const remove_artifacts_key = () => {
    const next = { ...code };
    delete next.artifacts;
    setCode(next);
  };
  const problems = code_problems(node, profiles, sources, t);
  const problems_of = (codes) => problems.filter((item) => codes.includes(item.code));
  const python_problem = problems.find((item) => PROFILE_PROBLEMS.includes(item.code));
  const stored_python = code && Object.prototype.hasOwnProperty.call(code, "environment_profile_id") ? code.environment_profile_id : undefined;

  return (
    <section data-testid="code-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="code-source">
        <Block section="code-source" title={mode === "here" ? t("agents.execution.code.code") : t("agents.execution.code.source_file")} isDark={isDark}
          problems={problems_of(SECTION_PROBLEMS.source)}
          help={
            <span data-testid="code-source-note" style={NOTE}>
              {mode === "here"
              ? t("agents.execution.code.stored_text")
              : source.managed ? t("agents.execution.code.read_named_file") : source.reason}{" "}
              {t("agents.execution.code.source_contract", { main: "{main}", input: "{input}", context: "{context}", print: "{print}" }).split(/(\{main\}|\{input\}|\{context\}|\{print\})/g).map((part, index) => ({ __proto__: null, "{main}": (<span key={index} style={MONO}>main(input, context)</span>), "{input}": (<span key={index} style={MONO}>input</span>), "{context}": (<span key={index} style={MONO}>context</span>), "{print}": (<span key={index} style={MONO}>print()</span>) }[part] || part))}{" "}
              {t("agents.execution.code.python_note")}
            </span>
          }
          aside={editable ? (
            <Button
              label={mode === "here" ? t("agents.execution.code.use_workspace_file") : t("agents.execution.code.write_here")}
              onClick={() => {
                pendingPath.release();
                setMode(mode === "here" ? "file" : "here");
              }}
              style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6, color: "var(--pupu-text-muted)" }}
            />
          ) : undefined}>
        {mode === "here" && (
          <>
            {source.managed && !source.available ? (
              <span data-testid="code-text-missing" style={problem_style(isDark)}>{source.reason}</span>
            ) : (
              <CodeEditor
                testid="code-text-editor"
                value={shown_text}
                disabled={!text_editable}
                ariaLabel={t("agents.execution.code.editor_label", { node_id: safe_text(node.id) })}
                placeholder={"def main(input, context):\n    return {}"}
                onChange={(next) => {
                  if (text_editable && next !== shown_text) write_text(next);
                }}
                minRows={8}
                maxRows={24}
                isDark={isDark}
              />
            )}
            {keeps_cr && (
              <span data-testid="code-text-crlf" style={NOTE}>{t("agents.execution.code.crlf_read_only")}</span>
            )}
            {!source.managed && code && code.source !== undefined && (
              <span data-testid="code-text-replaces" style={NOTE}>
                {stored_path ? <>{t("agents.execution.code.replaces_file", { path: "{path}" }).split(/(\{path\})/g).map((part, index) => ({ __proto__: null, "{path}": (<span key={index} style={MONO}>{safe_text(stored_path)}</span>) }[part] || part))}</> : t("agents.execution.code.replaces_source")}
              </span>
            )}
          </>
        )}
        {mode === "file" && (
          <>
            <Input
              value={path_text}
              disabled={!editable}
              placeholder="tools/score.py"
              set_value={(next) => {
                if (source_path_problem(next)) {
                  pendingPath.hold(next);
                  return;
                }
                pendingPath.release();
                write("source", { kind: "file", path: next });
              }}
              style={{ ...FIELD, ...MONO }}
            />
            {path_problem && (
              <span data-testid="code-source-problem" style={problem_style(isDark)}>
                {pendingPath.text !== null ? t("agents.execution.code.pending_value", { problem: path_problem }) : path_problem}
              </span>
            )}
            {source.managed && (
              <span data-testid="code-file-replaces" style={NOTE}>{t("agents.execution.code.file_replaces_text")}</span>
            )}
          </>
        )}
        {/* A node saved with a Python this machine cannot run (or with none)
            gets one way back: the built-in Python. Nothing else is offered. */}
        <ProblemList items={problems_of(SECTION_PROBLEMS.source)} testid="code-problems-source" isDark={isDark} />
        {python_problem && editable && stored_python !== BUILTIN_PYTHON && (
          <div data-testid="code-python-repair" style={ROW}>
            <Button
              label={t("agents.execution.code.use_builtin_python")}
              onClick={() => setCode({ ...(code || {}), environment_profile_id: BUILTIN_PYTHON })}
              style={addButtonStyle(isDark)}
            />
          </div>
        )}
        </Block>
      </div>

      <div data-testid="code-limits">
        <Block section="code-limits" title={t("agents.execution.code.limits")} isDark={isDark}
          problems={problems_of(SECTION_PROBLEMS.limits)}
          help={<span style={NOTE}>{t("agents.execution.code.limits_note")}</span>}>
          <Region isDark={isDark}>
            <LimitRow label={t("agents.execution.code.limit_time")} unit={t("agents.execution.code.seconds")}
              stored={code ? code.timeout_ms : undefined} fallback={CODE_DEFAULTS.timeout_ms} limit={SECONDS} scale={1000} editable={editable}
              testid={`code-timeout-${node.id}`} isDark={isDark}
              onWrite={(value) => write("timeout_ms", value)} onClear={() => clear("timeout_ms")} />
            <LimitRow label={t("agents.execution.code.limit_result")} unit={t("agents.execution.code.bytes")}
              stored={code ? code.max_result_bytes : undefined} fallback={CODE_DEFAULTS.max_result_bytes} limit={CODE_LIMITS.max_result_bytes} editable={editable}
              testid={`code-result-bytes-${node.id}`} isDark={isDark}
              onWrite={(value) => write("max_result_bytes", value)} onClear={() => clear("max_result_bytes")} />
            <LimitRow label={t("agents.execution.code.limit_log")} unit={t("agents.execution.code.bytes")}
              stored={code ? code.max_log_bytes : undefined} fallback={CODE_DEFAULTS.max_log_bytes} limit={CODE_LIMITS.max_log_bytes} editable={editable}
              testid={`code-log-bytes-${node.id}`} isDark={isDark}
              onWrite={(value) => write("max_log_bytes", value)} onClear={() => clear("max_log_bytes")} />
          </Region>
          <ProblemList items={problems_of(SECTION_PROBLEMS.limits)} testid="code-problems-limits" isDark={isDark} />
        </Block>
      </div>

      <div data-testid="code-result">
        <Block section="code-result" title={t("agents.execution.code.result")} isDark={isDark}
          problems={problems_of(SECTION_PROBLEMS.result)} help={
          <span style={NOTE}>
            {t("agents.execution.code.result_contract", { declare: "{declare}" }).split(/(\{declare\})/g).map((part, index) => ({ __proto__: null, "{declare}": (<b key={index}>{t("agents.execution.code.declare")}</b>) }[part] || part))}
          </span>
        }>
        {!declared && !as_json && (
          <span data-testid="code-result-undeclared" style={NOTE}>
            {code && code.result_schema !== undefined
              ? t("agents.execution.code.unreadable_result_schema")
              : t("agents.execution.code.no_result_fields")}
          </span>
        )}
        {declared && !held && (
          <span data-testid="code-result-not-field-shaped" style={NOTE}>
            {t("agents.execution.code.schema_json_reason", { schema: why_fields_cannot_hold(schema, t) })}
          </span>
        )}
        {declared && !as_json && fields.map((field, index) => (
          <FieldRow
            key={rows.ids[index]}
            field={field}
            index={index}
            revision={revision}
            taken={fields.filter((_, i) => i !== index).map((other) => (other && other.name) || "")}
            isDark={isDark}
            onChange={(next) => set_fields(fields.map((old, i) => (i === index ? next : old)), closed, root)}
            onRemove={() => {
              rows.removed(index);
              set_fields(fields.filter((_, i) => i !== index), closed, root);
            }}
          />
        ))}
        {!as_json && (
          <Button
            label={t("agents.schema.add_field")}
            disabled={!editable}
            onClick={() => {
              rows.added();
              set_fields([...fields, new_field(free_field_name(fields.map((field) => (field && field.name) || "")))], declared ? closed : true, root);
            }}
            style={addButtonStyle(isDark)}
          />
        )}
        {declared && !as_json && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SemiSwitch on={closed} set_on={(next) => set_fields(fields, Boolean(next), root)} style={{ ...PANEL_SWITCH, flexShrink: 0 }} />
            <span data-testid="code-result-closed-caption" style={NOTE}>
              {closed
                ? t("agents.execution.code.closed_result_note")
                : t("agents.execution.code.open_result_note")}
            </span>
          </div>
        )}
        {as_json && (
          <TextField
            value={json_shown}
            set_value={(next) => {
              let value;
              try {
                value = JSON.parse(next);
              } catch (error) {
                /* Not JSON yet; nothing is stored, the text stays. */
                setEditor({ as_json: true, of: schema, text: next });
                return;
              }
              setEditor({ as_json: true, of: value, text: next });
              write("result_schema", value);
            }}
            min_rows={6}
            max_display_rows={18}
            style={{ width: "100%", fontSize: 11.5, ...MONO, ...textFieldFill(isDark), padding: 8 }}
          />
        )}
        {as_json && !json_parsed.ok && (
          <span data-testid="code-result-json-unreadable" style={problem_style(isDark)}>
            {t("agents.execution.code.pending_json", { json_parsed_message: json_parsed.message })}
          </span>
        )}
        {((declared && held) || (as_json && !declared)) && (
          <Button
            label={editor.as_json ? t("agents.schema.edit_as_fields") : t("agents.schema.edit_as_json")}
            onClick={() => setEditor({ as_json: !editor.as_json, of: schema, text: null })}
            style={addButtonStyle(isDark)}
          />
        )}
        <ProblemList items={problems_of(SECTION_PROBLEMS.result)} testid="code-problems-result" isDark={isDark} />
        </Block>
      </div>

      <div data-testid="code-on-error">
        {/* Measured on the pinned wheel (code-01-independent-review-20261024,
            runtime-result.json): a return that is not an object or does not
            match Result -> run `failed` (invalid_type / output_invalid); an
            exception or a timeout -> run `outcome_unknown` (handler_error).
            `durable_execution.py:253` refuses an error receipt before any
            publication, so nothing of this node reaches End or a downstream
            node. There is no policy to choose, so there is no control: two
            plain rows say what happens. */}
        <Block section="code-on-error" title={t("agents.execution.code.on_error")} isDark={isDark}
          help={<span style={NOTE}>{t("agents.execution.code.on_error_note")}</span>}>
          <Region isDark={isDark}>
            <div style={REGION_ROW}>
              <SettingRow label={t("agents.execution.code.on_error_raises")} isDark={isDark} testid="code-on-error-raises">
                <span style={{ flexShrink: 0, fontSize: 12, color: muted(isDark) }}>{t("agents.execution.code.on_error_stops")}</span>
              </SettingRow>
            </div>
            <div style={REGION_ROW}>
              <SettingRow label={t("agents.execution.code.on_error_mismatch")} isDark={isDark} testid="code-on-error-mismatch">
                <span style={{ flexShrink: 0, fontSize: 12, color: muted(isDark) }}>{t("agents.execution.code.on_error_stops")}</span>
              </SettingRow>
            </div>
          </Region>
        </Block>
      </div>

      {artifacts_present && (artifacts === null || artifacts.length > 0) && (
        <div data-testid="code-artifacts">
          <Block section="code-artifacts" title={t("agents.execution.code.stored_artifacts")} isDark={isDark}>
          <Region isDark={isDark}>
          {artifacts === null && (
            <div style={{ ...REGION_ROW, ...ROW, justifyContent: "space-between" }}>
              <span style={{ ...problem_style(isDark), ...MONO, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{safe_text(raw_text(artifacts_raw))}</span>
              <Button
                prefix_icon="close"
                ariaLabel={t("agents.execution.code.remove_artifacts")}
                disabled={!editable}
                onClick={remove_artifacts_key}
                style={removeButtonStyle(isDark)}
              />
            </div>
          )}
          {artifacts !== null && artifacts.map((item, index) => (
            <div key={index} style={{ ...REGION_ROW, ...ROW, justifyContent: "space-between" }}>
              <span style={{ ...(record(item) ? NOTE : problem_style(isDark)), ...MONO, minWidth: 0 }}>
                {record(item) && typeof item.name === "string" && typeof item.attachment === "string" ? `${safe_text(item.name)} ← ${safe_text(item.attachment)}` : safe_text(raw_text(item))}
              </span>
              <Button
                prefix_icon="close"
                ariaLabel={t("agents.execution.code.remove_artifact", { index: index })}
                disabled={!editable}
                onClick={() => write("artifacts", artifacts.filter((_, i) => i !== index))}
                style={removeButtonStyle(isDark)}
              />
            </div>
          ))}
          </Region>
          <span style={NOTE}>
            {artifacts === null
              ? t("agents.execution.code.unreadable_artifacts")
              : t("agents.execution.code.artifacts_note")}
          </span>
          </Block>
        </div>
      )}

      {Object.keys(code || {}).filter((key) => !["source", "environment_profile_id", "timeout_ms", "max_result_bytes", "max_log_bytes", "result_schema", "artifacts"].includes(key)).map((key) => (
        <div key={key} data-testid={`code-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>{t("agents.execution.code.unsupported_setting", { key: safe_text(key) })}</span>
          <Button
            prefix_icon="close"
            ariaLabel={t("agents.execution.code.remove_setting_key", { key: key })}
            disabled={!editable}
            onClick={() => clear(key)}
            style={removeButtonStyle(isDark)}
          />
        </div>
      ))}

      <ProblemList items={problems.filter((item) => !SAID_IN_A_SECTION.includes(item.code))} testid="code-problems" isDark={isDark} />
    </section>
  );
}
