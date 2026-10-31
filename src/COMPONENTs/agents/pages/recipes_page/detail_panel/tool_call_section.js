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

function type_hint(row) {
  const parts = [row.type || "any value"];
  if (row.required) parts.push("required");
  if (row.has_default) parts.push(`defaults to ${literal_to_text(row.default, row.type)}`);
  return parts.join(" · ");
}

/* A fixed value of the argument's own type. A text that is not yet a value of
   that type is held here and never written, so the document only ever carries
   what the tool can take. */
function LiteralField({ row, binding, onSet, editable, isDark, testid }) {
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
        placeholder="choose a value"
        disabled={!editable}
        style={FIELD}
      />
    );
  }
  const text = pending.text !== null ? pending.text : shown;
  const parsed = pending.text !== null ? literal_from_text(pending.text, row.type) : null;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
      <Input
        value={text}
        disabled={!editable}
        placeholder={row.type === "object" || row.type === "array" ? `a JSON ${row.type}` : "a value written here"}
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
          {parsed.problem} Nothing is stored until it is one.
        </span>
      )}
    </span>
  );
}

function ArgumentRow({ row, sources, toolName, editable, onSet, isDark }) {
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
          {row.required && <span aria-label="required" style={{ color: problem_style(isDark).color, marginLeft: 3 }}>*</span>}
        </span>
        <span data-testid={`${testid}-mode`} style={{ opacity: editable ? 1 : 0.5, pointerEvents: editable ? "auto" : "none" }}>
          <SegmentedButton
            options={[{ value: "value", label: "Value" }, { value: "variable", label: "Variable" }]}
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
          {row.required ? `Required by ${toolName}. Choose a value or a variable.` : `Not set. ${toolName} uses its own default.`}
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
          Stored: <span style={MONO}>{safe_text(expression_summary(binding.value))}</span>. Kept as it is until you replace it.
        </span>
      )}
      {binding && kind !== "literal" && (
        <MissingPolicySelect
          binding={binding}
          isDark={isDark}
          onChange={(next) => onSet(next)}
        />
      )}
      <span style={NOTE}>
        {type_hint(row)}
        {row.description ? ` — ${row.description}` : ""}
      </span>
      {binding && !row.required && editable && (
        <span>
          <Button
            label="Unset"
            ariaLabel={`Unset ${row.name}`}
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
  const editable = unique && document.kind === "agent" && document.schema_version === 1 && typeof onChange === "function";
  const commit = (next) => {
    if (editable && next !== document) onChange(next);
  };
  const setTool = (next) => commit(with_tool_settings(document, node.id, next));

  const options = [
    ...(name && !home && library.status === "ready"
      ? [{ value: `${KEY}${name}`, label: `${name} (${homes.length > 1 ? "in more than one toolkit" : "not in the tool library now"})` }]
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
  const problems = tool_call_problems(node, parameters);
  const extras_keys = tool ? Object.keys(tool).filter((key) => !["name", "on_error", "approval_timeout_ms"].includes(key)) : [];
  const seconds = tool && Number.isSafeInteger(tool.approval_timeout_ms) ? tool.approval_timeout_ms / 1000 : null;
  const pendingSeconds = usePendingText(seconds === null ? "" : String(seconds), `tool-call-approval-${node.id}`);

  return (
    <section data-testid="tool-call-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? "Duplicate node ids prevent editing this step." : "These stored settings are read-only here."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Tool</span>
        <span data-testid="tool-call-picker">
          <Select
            options={options}
            value={selected}
            set_value={(value) => {
              const picked = String(value).split(KEY)[1];
              if (picked && picked !== name) setTool({ ...(tool || {}), name: picked });
            }}
            filterable
            placeholder={library.status === "loading" ? "reading the tool library…" : "pick a tool"}
            disabled={!editable}
            dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
            style={FIELD}
          />
        </span>
        {library.status === "error" && (
          <span data-testid="tool-call-library-error" style={problem_style(isDark)}>
            The tool library could not be read. <Button label="Try again" onClick={reloadLibrary} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {listed && listed.description && <span style={NOTE}>{listed.description}</span>}
        {listed && (
          <span data-testid="tool-call-confirmation" style={NOTE}>
            {listed.requiresConfirmation
              ? "This tool asks for approval each time it runs. The run waits for it; configuring this step approves nothing."
              : "This tool runs without asking for approval."}
          </span>
        )}
        {home && tool_availability(document, name, home.toolkitId) === "chat_only" && (
          <span data-testid="tool-call-availability" style={NOTE}>
            No Toolkit Pool in this Agent includes {home.toolkitName || home.toolkitId}, so this step runs only when that toolkit is selected for the chat.
          </span>
        )}
      </div>

      <Divider isDark={isDark} />

      <div data-testid="tool-call-arguments" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={LABEL}>Arguments</span>
        {!name && <span style={NOTE}>Pick a tool first. Its arguments come from the tool itself.</span>}
        {name && home && schemas.status === "loading" && <span style={NOTE}>Reading {name}’s arguments…</span>}
        {name && home && schemas.status === "error" && (
          <span data-testid="tool-call-schema-error" style={problem_style(isDark)}>
            {safe_text((schemas.error && schemas.error.message) || "The tool's arguments could not be read.")}{" "}
            <Button label="Try again" onClick={reloadSchemas} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {name && home && schemas.status === "ready" && !schema && (
          <span style={problem_style(isDark)}>The runtime lists no schema for {name}, so its arguments cannot be shown.</span>
        )}
        {name && !home && library.status === "ready" && (
          <span style={problem_style(isDark)}>
            {homes.length > 1 ? `${name} is in more than one toolkit, so its arguments cannot be told apart here.` : `${name} is not in the tool library now. Its stored arguments are kept.`}
          </span>
        )}
        {schema && layout.readable && layout.rows.length === 0 && <span style={NOTE}>{name} takes no arguments.</span>}
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
                <span style={MONO}>{safe_text(extraName) || "(unnamed)"}</span>{schema ? ` is not an argument of ${name}; the tool would refuse it.` : " is stored for this step."}
              </span>
              {schema && (
                <Button
                  label="Remove"
                  ariaLabel={`Remove stored argument ${extraName}`}
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
        <span style={LABEL}>On error</span>
        <span style={{ opacity: editable && name ? 1 : 0.5, pointerEvents: editable && name ? "auto" : "none" }}>
          <SegmentedButton
            options={ON_ERROR_CHOICES}
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
        <span data-testid="tool-call-on-error-note" style={NOTE}>
          A call fails when it is denied, or when the tool answers with <span style={MONO}>ok</span> false or an
          {" "}<span style={MONO}>error</span>; text the tool returns is never read as a failure. Continue finishes this
          step with <span style={MONO}>ok</span> false, an <span style={MONO}>error</span> code (<span style={MONO}>denied</span>
          {" "}or <span style={MONO}>tool_error</span>) and whatever the tool returned in <span style={MONO}>result</span>, so an
          If / Else downstream can handle it. Fail the run stops the run with <span style={MONO}>tool_failed</span>.
        </span>
      </div>

      <div data-testid="tool-call-approval" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Approval wait</span>
        <div style={ROW}>
          <Input
            value={pendingSeconds.text !== null ? pendingSeconds.text : seconds === null ? "" : String(seconds)}
            disabled={!editable || !name}
            placeholder="seconds"
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
          <span style={NOTE}>seconds</span>
        </div>
        {pendingSeconds.text !== null && (
          <span data-testid="tool-call-approval-problem" style={problem_style(isDark)}>
            Enter whole seconds from 1 to 86400 (24 hours). Nothing is stored until it is one.
          </span>
        )}
        <span style={NOTE}>
          If the tool asks for approval, the run waits up to this long for an answer. The runtime requires a limit, at most 24 hours.
        </span>
      </div>

      {extras_keys.map((key) => (
        <div key={key} data-testid={`tool-call-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>Unsupported setting: {safe_text(key)}</span>
          <Button
            label="Remove setting"
            ariaLabel={`Remove setting ${key}`}
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
