import PanelHelp from "./panel_help";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText, agentMessage, renderAgentMessage } from "../agents_i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import Select from "./panel_select";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import { FieldRow } from "./output_schema_section";
import { safe_text } from "../document_values";
import { is_unavailable, probe_python_profile, python_profiles, save_python_profile } from "../skeleton_resources";
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
  CODE_LIMITS,
  code_problems,
  code_settings,
  code_source_text,
  limit_from_text,
  profile_label,
  source_path_problem,
  with_code_settings,
} from "../code_config";
import { managed_path, sha256_text } from "../managed_code_sources";
import { CAPTION_TEXT, PANEL_SWITCH } from "./panel_style";

/* A Code node (#357): the Python it runs with, the file that holds
 * `main(input, context)`, how long and how much it may produce, and the
 * Result it declares. Every rule here is the fixed runtime's (see
 * `code_config`):
 *
 *   - the runtime is a profile on THIS machine, listed by the store, never a
 *     path stored in the Agent; naming a new Python is an absolute path to its
 *     executable, probed by the store before it is kept — no shell string, no
 *     `activate`;
 *   - the source is one file reference: either code written here, which the
 *     host keeps with the Agent under a path it generates from the text's
 *     digest (#357 G1), or a file the run reads under its workspace when it
 *     gets there. The panel edits the text, or the path, and never both;
 *   - the three limits are required integers with the runtime's bounds;
 *   - the Result schema is the one place in a graph where types are declared;
 *     the Output Variables below pick from its fields;
 *   - there is no error policy: a return that does not match Result fails the
 *     run, an exception or a timeout ends it `outcome_unknown`, and nothing
 *     of the node is published either way (R-357-02); the panel says so.
 *
 * Nothing is written that the author did not choose: a new node has no
 * `code` at all, and each control writes its own key the first time it is
 * used. The problems list says what is still missing. */

const LABEL = CAPTION_TEXT;
const NOTE = { fontSize: 11.5, color: "var(--pupu-text-muted)", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 8 };
const problem_style = (isDark) => ({
  fontSize: 11.5,
  lineHeight: 1.45,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});
const SECONDS = Object.freeze({ min: 1, max: CODE_LIMITS.timeout_ms.max / 1000 });
const EMPTY_CLOSED_SCHEMA = Object.freeze({ type: "object", properties: {}, additionalProperties: false });
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function Divider({ isDark }) {
  return <div aria-hidden="true" style={{ height: 6 }} />;
}

function refusal_text(result, fallback, t = agentEnglishText) {
  const error = result && result.error;
  const owned = renderAgentMessage(error, t);
  if (owned !== error) return owned;
  const message = error && typeof error.message === "string" ? error.message : "";
  const code = error && typeof error.code === "string" ? error.code : "";
  if (is_unavailable(result)) return t("agents.execution.code.store_unreachable");
  return message || code ? safe_text(message || code) : renderAgentMessage(fallback, t);
}

function usePythonProfiles() {
  const [state, setState] = useState({ status: "loading", profiles: null, error: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    setState((old) => ({ ...old, status: "loading" }));
    const result = await python_profiles();
    if (mine !== ticket.current) return;
    if (result.ok) setState({ status: "ready", profiles: result.data.profiles, error: null });
    else setState((old) => ({ ...old, status: "error", error: result }));
  }, []);
  useEffect(() => {
    read();
    return () => {
      ticket.current += 1;
    };
  }, [read]);
  return [state, read];
}

/* A whole number in a box, written only once it is one the runtime takes. */
function LimitInput({ stored, limit, scale = 1, placeholder, editable, testid, isDark, onWrite }) {
  const { t } = useTranslation();
  const shown = Number.isSafeInteger(stored) ? String(stored / scale) : "";
  const pending = usePendingText(shown, testid);
  const text = pending.text !== null ? pending.text : shown;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={placeholder}
        set_value={(next) => {
          const parsed = limit_from_text(next, limit);
          if (!parsed.ok) {
            pending.hold(next);
            return;
          }
          pending.release();
          onWrite(parsed.value * scale);
        }}
        style={{ ...FIELD, width: 120 }}
      />
      {pending.text !== null && (
        <span data-testid={`${testid}-problem`} style={problem_style(isDark)}>
          {t("agents.execution.code.pending_value", { problem: limit_from_text(pending.text, limit, t).problem })}
        </span>
      )}
    </span>
  );
}

export default function CodeSection({ document, node, revision, sources, isDark, onChange }) {
  const { t } = useTranslation();
  const code = code_settings(node);
  const [library, reloadProfiles] = usePythonProfiles();
  const profiles = library.profiles;
  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && (document.kind === "agent" || document.kind === "workflow") &&
    document.schema_version === 1 && typeof onChange === "function";
  const commit = (next, typed = null) => {
    if (editable && next !== document) onChange(next, typed);
  };
  const setCode = (next) => commit(with_code_settings(document, node.id, next));
  const write = (key, value) => setCode({ ...(code || {}), [key]: value });

  /* ── Runtime ── */
  const profile_id = code && typeof code.environment_profile_id === "string" ? code.environment_profile_id : "";
  const listed = Array.isArray(profiles) ? profiles.find((profile) => record(profile) && profile.id === profile_id) || null : null;
  const options = [
    ...(profile_id && Array.isArray(profiles) && !listed ? [{ value: profile_id, label: t("agents.execution.code.unlisted_profile_option", { profile_id: safe_text(profile_id) }) }] : []),
    ...(Array.isArray(profiles) ? profiles.filter((profile) => record(profile) && typeof profile.id === "string").map((profile) => ({ value: profile.id, label: profile_label(profile, t) })) : []),
  ];
  const [probe, setProbe] = useState({ id: null, status: "idle", result: null });
  const [adding, setAdding] = useState(null);
  const [addState, setAddState] = useState({ status: "idle", result: null });
  /* A registration answers later than the render that asked for it. The
     answer may select the new profile only while the author still means
     it — the form is still open for that same request and this section is
     still on this node — and it writes exactly one key against the document
     as it is THEN, not the one the request closed over (R-357-01). Cancel,
     a reply for an older request, and unmounting all revoke the intent; the
     store still keeps the profile, which the reloaded list shows. */
  const latest = useRef({ document, code, editable, onChange });
  latest.current = { document, code, editable, onChange };
  const intent = useRef({ ticket: 0, pending: null, mounted: true });
  useEffect(() => () => {
    intent.current.pending = null;
    intent.current.mounted = false;
  }, []);
  const check = async () => {
    setProbe({ id: profile_id, status: "loading", result: null });
    const result = await probe_python_profile(profile_id);
    setProbe({ id: profile_id, status: "done", result });
  };
  const addProfile = async () => {
    const ticket = ++intent.current.ticket;
    intent.current.pending = ticket;
    setAddState({ status: "saving", result: null });
    const result = await save_python_profile(adding.id.trim(), adding.executable.trim());
    /* Only the request the author is still waiting for may consume the
       intent or settle the form. A reply for an older one — cancelled or
       replaced — leaves the current request exactly as it is (R-357-01a). */
    const meant = intent.current.pending === ticket;
    if (!meant) {
      /* The machine may now have the profile; the list says so. Nothing is
         selected and nothing is written. */
      if (intent.current.mounted && result.ok) reloadProfiles();
      return;
    }
    intent.current.pending = null;
    setAddState({ status: "done", result });
    if (!result.ok) return;
    setAdding(null);
    reloadProfiles();
    const now = latest.current;
    if (now.editable && result.data && typeof result.data.id === "string") {
      now.onChange(with_code_settings(now.document, node.id, { ...(now.code || {}), environment_profile_id: result.data.id }));
    }
  };
  const cancelAdd = () => {
    intent.current.pending = null;
    setAdding(null);
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
  /* The text box shows the stored text byte for byte. A text with a carriage
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
  const problems = code_problems(node, library.status === "ready" ? profiles : null, sources, t);

  return (
    <section data-testid="code-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="code-runtime" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.code.runtime")}</span>
          <PanelHelp label={t("agents.execution.code.runtime")}>
            <span style={NOTE}>
              {t("agents.execution.code.runtime_scope", { machine: "{machine}" }).split(/(\{machine\})/g).map((part, index) => ({ __proto__: null, "{machine}": (<b key={index}>{t("agents.execution.code.this_machine")}</b>) }[part] || part))}
            </span>
          </PanelHelp>
        </div>
        <span data-testid="code-runtime-picker">
          <Select
            options={options}
            value={profile_id || null}
            set_value={(value) => {
              if (typeof value === "string" && value && value !== profile_id) write("environment_profile_id", value);
            }}
            filterable={false}
            placeholder={library.status === "loading" ? t("agents.execution.code.reading_pythons") : t("agents.execution.code.choose_python")}
            disabled={!editable || library.status !== "ready"}
            style={FIELD}
          />
        </span>
        {library.status === "error" && (
          <span data-testid="code-runtime-error" style={problem_style(isDark)}>
            {t("agents.execution.code.profiles_refused", { message: refusal_text(library.error, agentMessage("agents.execution.code.store_refused"), t) })}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadProfiles} style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {listed && (
          <span data-testid="code-runtime-executable" style={{ ...NOTE, ...MONO, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {listed.kind === "bundled" ? t("agents.execution.code.bundled_interpreter") : safe_text(listed.executable)}
            {listed.available === false ? t("agents.execution.code.unavailable_suffix") : listed.changed === true ? t("agents.execution.code.changed_suffix") : ""}
          </span>
        )}
        {listed && (
          <div style={ROW}>
            <Button
              label={probe.status === "loading" && probe.id === profile_id ? t("agents.execution.code.checking") : t("agents.execution.code.check")}
              ariaLabel={t("agents.execution.code.check_profile_id", { profile_id: profile_id })}
              disabled={probe.status === "loading"}
              onClick={check}
              style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 }}
            />
            {probe.status === "done" && probe.id === profile_id && (
              <span data-testid="code-runtime-probe" style={probe.result.ok ? NOTE : problem_style(isDark)}>
                {probe.result.ok
                  ? t("agents.execution.code.python_version", { version: safe_text(probe.result.data && probe.result.data.version), implementation: safe_text(probe.result.data && probe.result.data.implementation) })
                  : refusal_text(probe.result, agentMessage("agents.execution.code.probe_failed"), t)}
              </span>
            )}
          </div>
        )}
        {editable && !adding && (
          <span>
            <Button
              label={t("agents.execution.code.name_a_python")}
              onClick={() => {
                setAddState({ status: "idle", result: null });
                setAdding({ id: "", executable: "" });
              }}
              style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, color: "var(--pupu-text-muted)" }}
            />
          </span>
        )}
        {adding && (
          <div data-testid="code-runtime-add" style={{ display: "flex", flexDirection: "column", gap: 6, padding: 0, background: "transparent" }}>
            <Input value={adding.id} placeholder={t("agents.execution.code.profile_name_placeholder")} set_value={(next) => setAdding({ ...adding, id: next })} style={FIELD} />
            <Input value={adding.executable} placeholder={t("agents.execution.code.executable_placeholder")} set_value={(next) => setAdding({ ...adding, executable: next })} style={{ ...FIELD, ...MONO }} />
            <span style={NOTE}>{t("agents.execution.code.executable_note")}</span>
            <div style={ROW}>
              <Button
                label={addState.status === "saving" ? t("agents.execution.code.probing") : t("agents.execution.code.add")}
                disabled={addState.status === "saving" || !adding.id.trim() || !adding.executable.trim()}
                onClick={addProfile}
                style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8 }}
              />
              <Button label={t("agents.explorer.cancel")} onClick={cancelAdd} style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 8, opacity: 0.75 }} />
            </div>
            {addState.status === "done" && !addState.result.ok && (
              <span data-testid="code-runtime-add-problem" style={problem_style(isDark)}>{refusal_text(addState.result, agentMessage("agents.execution.code.python_refused"), t)}</span>
            )}
          </div>
        )}

      </div>

      <Divider isDark={isDark} />

      <div data-testid="code-source" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...ROW, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={LABEL}>{mode === "here" ? t("agents.execution.code.code") : t("agents.execution.code.source_file")}</span>
            <PanelHelp label={t("agents.execution.code.code")}>
              <span data-testid="code-source-note" style={NOTE}>
                {mode === "here"
                ? t("agents.execution.code.stored_text")
                : source.managed ? t("agents.execution.code.read_named_file") : source.reason}{" "}
                {t("agents.execution.code.source_contract", { main: "{main}", input: "{input}", context: "{context}", print: "{print}" }).split(/(\{main\}|\{input\}|\{context\}|\{print\})/g).map((part, index) => ({ __proto__: null, "{main}": (<span key={index} style={MONO}>main(input, context)</span>), "{input}": (<span key={index} style={MONO}>input</span>), "{context}": (<span key={index} style={MONO}>context</span>), "{print}": (<span key={index} style={MONO}>print()</span>) }[part] || part))}
              </span>
            </PanelHelp>
          </div>
          {editable && (
            <Button
              label={mode === "here" ? t("agents.execution.code.use_workspace_file") : t("agents.execution.code.write_here")}
              onClick={() => {
                pendingPath.release();
                setMode(mode === "here" ? "file" : "here");
              }}
              style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 8, color: "var(--pupu-text-muted)" }}
            />
          )}
        </div>
        {mode === "here" && (
          <>
            {source.managed && !source.available ? (
              <span data-testid="code-text-missing" style={problem_style(isDark)}>{source.reason}</span>
            ) : (
              <span data-testid="code-text-editor">
                <TextField
                  value={shown_text}
                  disabled={!text_editable}
                  aria_label={t("agents.execution.code.editor_label", { node_id: safe_text(node.id) })}
                  placeholder={"def main(input, context):\n    return {}"}
                  set_value={(next) => {
                    if (text_editable && next !== shown_text) write_text(next);
                  }}
                  min_rows={8}
                  max_display_rows={24}
                  style={{ width: "100%", fontSize: 11.5, ...MONO, lineHeight: 1.45, borderRadius: 8, padding: 8 }}
                />
              </span>
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

      </div>

      <Divider isDark={isDark} />

      <div data-testid="code-limits" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.code.limits")}</span>
          <PanelHelp label={t("agents.execution.code.limits")}>
            <span style={NOTE}>{t("agents.execution.code.limits_note")}</span>
          </PanelHelp>
        </div>
        <div style={ROW}>
          <span style={{ ...NOTE, width: 96, flexShrink: 0 }}>{t("agents.execution.code.timeout")}</span>
          <LimitInput stored={code ? code.timeout_ms : undefined} limit={SECONDS} scale={1000} placeholder={t("agents.execution.code.seconds")} editable={editable} testid={`code-timeout-${node.id}`} isDark={isDark} onWrite={(value) => write("timeout_ms", value)} />
          <span style={NOTE}>{t("agents.execution.code.seconds")}</span>
        </div>
        <div style={ROW}>
          <span style={{ ...NOTE, width: 96, flexShrink: 0 }}>{t("agents.execution.code.result_at_most")}</span>
          <LimitInput stored={code ? code.max_result_bytes : undefined} limit={CODE_LIMITS.max_result_bytes} placeholder={t("agents.execution.code.bytes")} editable={editable} testid={`code-result-bytes-${node.id}`} isDark={isDark} onWrite={(value) => write("max_result_bytes", value)} />
          <span style={NOTE}>{t("agents.execution.code.bytes")}</span>
        </div>
        <div style={ROW}>
          <span style={{ ...NOTE, width: 96, flexShrink: 0 }}>{t("agents.execution.code.log_at_most")}</span>
          <LimitInput stored={code ? code.max_log_bytes : undefined} limit={CODE_LIMITS.max_log_bytes} placeholder={t("agents.execution.code.bytes")} editable={editable} testid={`code-log-bytes-${node.id}`} isDark={isDark} onWrite={(value) => write("max_log_bytes", value)} />
          <span style={NOTE}>{t("agents.execution.code.bytes")}</span>
        </div>

      </div>

      <Divider isDark={isDark} />

      <div data-testid="code-result" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.code.result")}</span>
          <PanelHelp label={t("agents.execution.code.result")}>
            <span style={NOTE}>
              {t("agents.execution.code.result_contract", { declare: "{declare}" }).split(/(\{declare\})/g).map((part, index) => ({ __proto__: null, "{declare}": (<b key={index}>{t("agents.execution.code.declare")}</b>) }[part] || part))}
            </span>
          </PanelHelp>
        </div>
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
            style={{ alignSelf: "flex-start", fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, color: "var(--pupu-text-muted)" }}
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
            style={{ width: "100%", fontSize: 11.5, ...MONO, borderRadius: 8, padding: 8 }}
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
            style={{ alignSelf: "flex-start", fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, color: "var(--pupu-text-muted)" }}
          />
        )}

      </div>

      <Divider isDark={isDark} />

      <div data-testid="code-on-error" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={LABEL}>{t("agents.execution.code.on_error")}</span>
          <PanelHelp label={t("agents.execution.code.on_error")}>
            <span style={NOTE}>
              {t("agents.execution.code.failure_contract", { output_invalid: "{output_invalid}", invalid_type: "{invalid_type}", outcome_unknown: "{outcome_unknown}", handler_error: "{handler_error}", main: "{main}", fails: "{fails}" }).split(/(\{output_invalid\}|\{invalid_type\}|\{outcome_unknown\}|\{handler_error\}|\{main\}|\{fails\})/g).map((part, index) => ({ __proto__: null, "{output_invalid}": (<span key={index} style={MONO}>output_invalid</span>), "{invalid_type}": (<span key={index} style={MONO}>invalid_type</span>), "{outcome_unknown}": (<span key={index} style={MONO}>outcome_unknown</span>), "{handler_error}": (<span key={index} style={MONO}>handler_error</span>), "{main}": (<span key={index} style={MONO}>main()</span>), "{fails}": (<b key={index}>{t("agents.execution.code.fails_the_run")}</b>) }[part] || part))}
            </span>
          </PanelHelp>
        </div>
        {/* Measured on the pinned wheel (code-01-independent-review-20261024,
            runtime-result.json): a return that is not an object or does not
            match Result -> run `failed` (invalid_type / output_invalid); an
            exception or a timeout -> run `outcome_unknown` (handler_error).
            `durable_execution.py:253` refuses an error receipt before any
            publication, so nothing of this node reaches End or a downstream
            node. There is no policy to choose. */}

      </div>

      {artifacts_present && (artifacts === null || artifacts.length > 0) && (
        <div data-testid="code-artifacts" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={LABEL}>{t("agents.execution.code.stored_artifacts")}</span>
          {artifacts === null && (
            <div style={{ ...ROW, justifyContent: "space-between" }}>
              <span style={{ ...problem_style(isDark), ...MONO, overflow: "hidden", textOverflow: "ellipsis" }}>{safe_text(raw_text(artifacts_raw))}</span>
              <Button
                label={t("agents.execution.code.remove_artifacts")}
                ariaLabel={t("agents.execution.code.remove_artifacts")}
                disabled={!editable}
                onClick={remove_artifacts_key}
                style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 }}
              />
            </div>
          )}
          {artifacts !== null && artifacts.map((item, index) => (
            <div key={index} style={{ ...ROW, justifyContent: "space-between" }}>
              <span style={{ ...(record(item) ? NOTE : problem_style(isDark)), ...MONO }}>
                {record(item) && typeof item.name === "string" && typeof item.attachment === "string" ? `${safe_text(item.name)} ← ${safe_text(item.attachment)}` : safe_text(raw_text(item))}
              </span>
              <Button
                label={t("agents.execution.code.remove")}
                ariaLabel={t("agents.execution.code.remove_artifact", { index: index })}
                disabled={!editable}
                onClick={() => write("artifacts", artifacts.filter((_, i) => i !== index))}
                style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 }}
              />
            </div>
          ))}
          <span style={NOTE}>
            {artifacts === null
              ? t("agents.execution.code.unreadable_artifacts")
              : t("agents.execution.code.artifacts_note")}
          </span>
        </div>
      )}

      {Object.keys(code || {}).filter((key) => !["source", "environment_profile_id", "timeout_ms", "max_result_bytes", "max_log_bytes", "result_schema", "artifacts"].includes(key)).map((key) => (
        <div key={key} data-testid={`code-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>{t("agents.execution.code.unsupported_setting", { key: safe_text(key) })}</span>
          <Button
            label={t("agents.execution.code.remove_setting")}
            ariaLabel={t("agents.execution.code.remove_setting_key", { key: key })}
            disabled={!editable}
            onClick={() => {
              const next = { ...code };
              delete next[key];
              setCode(next);
            }}
            style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 8 }}
          />
        </div>
      ))}

      {problems.length > 0 && (
        <div data-testid="code-problems" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {problems.map((problem, index) => (
            <span key={index} style={problem_style(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
