import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "./panel_input";
import Select from "./panel_select";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import usePendingText from "./pending_text";
import { binding_sources } from "./input_variables_section";
import { safe_text } from "../document_values";
import { node_bindings } from "../skeleton_document";
import { read_toolkit_catalog } from "../toolkit_pool_config";
import {
  APPROVAL_LIMIT_MS,
  ON_ERROR_CHOICES,
  argument_layout,
  tool_availability,
  tool_call_problems,
  tool_settings,
  with_argument,
  with_tool_settings,
} from "../tool_call_config";
import { addButtonStyle, CONTROL_RADIUS, note, pickerSelectProps, pickerSlotStyle, problem as problemOf, Region, SettingRow } from "./panel_style";
import { TableHeads, TABLE_CONTROL_INSET } from "./parameter_table";
import TypedInputRow, { typed_input_template } from "./typed_input_row";
import CommandTree from "../../../../chat-input/components/command_tree";
import { ToolkitIconFrame } from "../../../../toolkit/components/toolkit_icon";
import { withMcpStoreIcon } from "../../../../../SERVICEs/mcp_toolkit_store";
import { Block } from "./process_timeline";

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

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
/* An argument row inside the Arguments region brings its own padding. */
const ARGUMENT_ROW_PAD = { padding: "8px 10px 8px 11px", minWidth: 0 };
/* A text action that sits in a row beside what it removes. */
const inRowButtonStyle = (isDark) => ({ ...addButtonStyle(isDark), alignSelf: "center", flexShrink: 0 });
/* A tool's picker value: its toolkit and its name. The value is also the
   explorer row's id, so it is printable. */
const KEY = "::";
const ACCENT = "#ea7547";

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

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

  /* The tools as the library files them: one folder per toolkit, with the
     toolkit's icon, each tool with its own (or its toolkit's) icon — the
     explorer Select the Workflow and Skill pickers use. Typing searches every
     tool flat; a row's description is its tooltip. */
  const icon_of = (kit, item) => (
    <ToolkitIconFrame icon={(item && item.icon) || withMcpStoreIcon(kit).toolkitIcon || {}} isDark={isDark}
      size={16} iconSize={10} transparentIconSize={14} borderRadius={4} fallbackColor={ACCENT} />
  );
  const unlisted = name && !home && library.status === "ready"
    ? { value: `${KEY}${name}`, label: homes.length > 1 ? t("agents.execution.tool.ambiguous_option", { name }) : t("agents.execution.tool.unlisted_option", { name }), pinned: true }
    : null;
  const options = [
    ...(unlisted ? [unlisted] : []),
    ...visible.flatMap((kit) => kit.tools.filter((item) => item.hidden !== true).map((item) => ({
      value: `${kit.toolkitId}${KEY}${item.name}`,
      label: item.title || item.name,
      icon: icon_of(kit, item),
      description: item.description || "",
    }))),
  ];
  const optionsKey = options.map((option) => option.value).join("\n");
  const tree = useMemo(() => {
    const data = {};
    const byValue = new Map(options.map((option) => [option.value, option]));
    const leaf = (value) => {
      data[value] = { id: value, label: byValue.get(value).label, type: "file", kind: "command", option: byValue.get(value) };
      return value;
    };
    const root = unlisted ? [leaf(unlisted.value)] : [];
    visible.forEach((kit) => {
      const children = kit.tools.filter((item) => item.hidden !== true).map((item) => leaf(`${kit.toolkitId}${KEY}${item.name}`));
      if (children.length === 0) return;
      const id = `folder:${kit.toolkitId}`;
      const mark = withMcpStoreIcon(kit).toolkitIcon || {};
      data[id] = { id, label: kit.toolkitName || kit.toolkitId, type: "folder", kind: "folder", children,
        prefix_icon: "tool",
        prefix_render: (size) => <ToolkitIconFrame icon={mark} isDark={isDark} size={size} iconSize={Math.round(size * 0.62)}
          transparentIconSize={size} borderRadius={4} fallbackColor={ACCENT} /> };
      root.push(id);
    });
    return { data, root };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, isDark]);
  const renderTree = ({ highlighted_value, render_option, on_hover_row, on_visible_change }) => (
    <CommandTree data={tree.data} root={tree.root} activeNodeId={highlighted_value ?? null}
      onHover={on_hover_row} onVisibleChange={on_visible_change} defaultExpanded={false} isDark={isDark} bare width="100%"
      renderRow={({ node: row, depth }) => (
        <div title={row.option.description || undefined}>{render_option(row.option, { depth })}</div>
      )} />
  );
  const selected = !name ? null : home ? `${home.toolkitId}${KEY}${name}` : `${KEY}${name}`;

  const layout = argument_layout(parameters, node_bindings(node));
  const order = layout.rows.map((row) => row.name);
  const sources = binding_sources(document, node.id);
  const nodes_by_id = new Map(((document && document.nodes) || []).map((entry) => [entry && entry.id, entry]));
  const source_tag = (node_id) => (nodes_by_id.has(node_id) ? { node: nodes_by_id.get(node_id) } : null);
  const template = typed_input_template(layout.rows.map((row) => row.name));
  const problems = tool_call_problems(node, parameters, t);
  const extras_keys = tool ? Object.keys(tool).filter((key) => !["name", "on_error", "approval_timeout_ms"].includes(key)) : [];
  const seconds = tool && Number.isSafeInteger(tool.approval_timeout_ms) ? tool.approval_timeout_ms / 1000 : null;
  const pendingSeconds = usePendingText(seconds === null ? "" : String(seconds), `tool-call-approval-${node.id}`);

  return (
    <section data-testid="tool-call-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <div style={problemOf(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="tool-call-tool" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Block section="tool-call-tool" title={t("agents.execution.tool.tool")} isDark={isDark}>
        <div style={{ ...ROW, minWidth: 0 }}>
          <span data-testid="tool-call-picker" style={pickerSlotStyle}>
            <Select
              options={options}
              value={selected}
              set_value={(value) => {
                const picked = String(value).split(KEY)[1];
                if (picked && picked !== name) setTool({ ...(tool || {}), name: picked });
              }}
              filterable
              palette_tree={renderTree}
              placeholder={library.status === "loading" ? t("agents.execution.tool.reading_library") : t("agents.execution.tool.pick_tool")}
              disabled={!editable}
              dropdown_style={{ maxHeight: "min(320px, 45vh)" }}
              {...pickerSelectProps}
            />
          </span>
          {home && <span style={{ ...note(isDark), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{home.toolkitName || home.toolkitId}</span>}
        </div>
        {library.status === "error" && (
          <span data-testid="tool-call-library-error" style={problemOf(isDark)}>{t("agents.execution.tool.library_failed")}<Button label={t("agents.explorer.try_again")} onClick={reloadLibrary} style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {listed && listed.description && <span style={note(isDark)}>{listed.description}</span>}
        {listed && (
          <span data-testid="tool-call-confirmation" style={note(isDark)}>
            {listed.requiresConfirmation
              ? t("agents.execution.tool.approval_required_note")
              : t("agents.execution.tool.no_approval_note")}
          </span>
        )}
        {home && tool_availability(document, name, home.toolkitId) === "chat_only" && (
          <span data-testid="tool-call-availability" style={note(isDark)}>
            {t("agents.execution.tool.chat_only", { toolkit: home.toolkitName || home.toolkitId })}
          </span>
        )}
      </Block>
      </div>

      <div data-testid="tool-call-arguments" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Block section="tool-call-arguments" title={t("agents.execution.tool.arguments")} isDark={isDark}
        aside={schema && layout.rows.length > 0 ? layout.rows.length : undefined}>
        {!name && <span style={note(isDark)}>{t("agents.execution.tool.pick_before_arguments")}</span>}
        {name && home && schemas.status === "loading" && <span style={note(isDark)}>{t("agents.execution.tool.reading_arguments", { tool: name })}</span>}
        {name && home && schemas.status === "error" && (
          <span data-testid="tool-call-schema-error" style={problemOf(isDark)}>
            {safe_text((schemas.error && schemas.error.message) || t("agents.execution.tool.arguments_failed"))}{" "}
            <Button label={t("agents.explorer.try_again")} onClick={reloadSchemas} style={{ fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 }} />
          </span>
        )}
        {name && home && schemas.status === "ready" && !schema && (
          <span style={problemOf(isDark)}>{t("agents.execution.tool.no_schema", { tool: name })}</span>
        )}
        {name && !home && library.status === "ready" && (
          <span style={problemOf(isDark)}>
            {homes.length > 1 ? t("agents.execution.tool.ambiguous_arguments", { name }) : t("agents.execution.tool.unlisted_arguments", { name })}
          </span>
        )}
        {schema && layout.readable && layout.rows.length === 0 && <span style={note(isDark)}>{t("agents.execution.tool.no_arguments", { tool: name })}</span>}
        <Region isDark={isDark}>
        {schema && layout.rows.length > 0 && (
          <TableHeads key="heads" testid="tool-call-argument-heads" isDark={isDark} template={template}
            columns={[{ label: t("agents.parameters.name_short") }, { label: t("agents.parameters.type") },
              { label: t("agents.execution.tool.value_mode"), inset: TABLE_CONTROL_INSET }]} />
        )}
        {schema && layout.rows.map((row) => (
          <TypedInputRow key={row.name} testid={`tool-call-argument-${row.name}`} template={template}
            name={row.name} type={row.type || null} required={row.required} hasDefault={row.has_default} defaultValue={row.default}
            description={row.description} choices={row.enum} binding={row.binding} sources={sources} sourceTag={source_tag}
            editable={editable} isDark={isDark}
            onSet={(binding) => commit(with_argument(document, node.id, row.name, binding, order))} />
        ))}
        {layout.extras.map(({ binding, index }) => {
          const extraName = record(binding) && typeof binding.name === "string" ? binding.name : "";
          return (
            <div key={`extra-${index}`} data-testid={`tool-call-extra-${index}`} style={{ ...ROW, ...ARGUMENT_ROW_PAD, justifyContent: "space-between" }}>
              <span style={problemOf(isDark)}>
                {schema ? t("agents.execution.tool.extra_argument", { argument: "{argument}", tool: "{tool}" }).split(/(\{argument\}|\{tool\})/g).map((part, index) => ({ __proto__: null, "{argument}": (<span key={index} style={MONO}>{safe_text(extraName) || t("agents.execution.tool.unnamed")}</span>), "{tool}": name }[part] || part)) : t("agents.execution.tool.stored_argument", { argument: "{argument}" }).split(/(\{argument\})/g).map((part, index) => ({ __proto__: null, "{argument}": (<span key={index} style={MONO}>{safe_text(extraName) || t("agents.execution.tool.unnamed")}</span>), "{tool}": name }[part] || part))}
              </span>
              {schema && (
                <Button
                  label={t("agents.execution.tool.remove")}
                  ariaLabel={t("agents.execution.tool.remove_stored_argument", { extraName: extraName })}
                  disabled={!editable}
                  onClick={() => commit(with_argument(document, node.id, extraName, null, order))}
                  style={inRowButtonStyle(isDark)}
                />
              )}
            </div>
          );
        })}
        </Region>
      </Block>
      </div>

      {/* What happens around the call: one region, a label on the left and
          its control on the right. */}
      <div data-testid="tool-call-when" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Block section="tool-call-when" title={t("agents.execution.tool.when_it_runs")} isDark={isDark} help={
        <span>
            <span data-testid="tool-call-on-error-note">
              {t("agents.execution.tool.error_contract", { ok: "{ok}", error: "{error}", denied: "{denied}", tool_error: "{tool_error}", result: "{result}", tool_failed: "{tool_failed}" }).split(/(\{ok\}|\{error\}|\{denied\}|\{tool_error\}|\{result\}|\{tool_failed\})/g).map((part, index) => ({ __proto__: null, "{ok}": (<span key={index} style={MONO}>ok</span>), "{error}": (<span key={index} style={MONO}>error</span>), "{denied}": (<span key={index} style={MONO}>denied</span>), "{tool_error}": (<span key={index} style={MONO}>tool_error</span>), "{result}": (<span key={index} style={MONO}>result</span>), "{tool_failed}": (<span key={index} style={MONO}>tool_failed</span>) }[part] || part))}
            </span>
            {" "}<span>{t("agents.execution.tool.approval_limit_note")}</span>
        </span>
      }>
        <Region isDark={isDark}>
          <div data-testid="tool-call-on-error" style={{ padding: "2px 6px 2px 10px" }}>
            <SettingRow label={t("agents.execution.tool.on_error")} isDark={isDark}>
              <span style={{ opacity: editable && name ? 1 : 0.5, pointerEvents: editable && name ? "auto" : "none" }}>
                <SegmentedButton
                  options={ON_ERROR_CHOICES.map((choice) => ({ ...choice, label: choice.value === "stop" ? t("agents.execution.tool.fail_run") : t("agents.execution.tool.continue") }))}
                  value={tool?.on_error ?? null}
                  on_change={(value) => setTool({ ...(tool || {}), on_error: value })}
                  disabled={!editable || !name}
                  style={{ fontSize: 12, padding: 2, borderRadius: CONTROL_RADIUS }}
                  button_style={{ height: 22, padding: "0 9px", fontWeight: 500 }}
                />
              </span>
            </SettingRow>
          </div>
          {/* The runtime's own rule, measured (steps-352/qualify-a1/measure-results):
              a result object with `ok: false` or a non-null `error` is a failure,
              as is a denied approval; returned text never is, whatever it says. */}
          <div data-testid="tool-call-approval" style={{ padding: "2px 6px 2px 10px", display: "flex", flexDirection: "column" }}>
            <SettingRow label={t("agents.execution.tool.approval_wait")} isDark={isDark}>
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
                style={{ ...FIELD, width: 72 }}
              />
              <span style={note(isDark)}>{t("agents.execution.tool.seconds")}</span>
            </SettingRow>
            {pendingSeconds.text !== null && (
              <span data-testid="tool-call-approval-problem" style={{ ...problemOf(isDark), paddingBottom: 6 }}>{t("agents.execution.tool.pending_approval_wait")}</span>
            )}
          </div>
        </Region>
      </Block>
      </div>

      {extras_keys.map((key) => (
        <div key={key} data-testid={`tool-call-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problemOf(isDark)}>{t("agents.execution.tool.unsupported_setting", { key: safe_text(key) })}</span>
          <Button
            label={t("agents.execution.tool.remove_setting")}
            ariaLabel={t("agents.execution.tool.remove_setting_key", { key: key })}
            disabled={!editable}
            onClick={() => {
              const next = { ...tool };
              delete next[key];
              setTool(next);
            }}
            style={inRowButtonStyle(isDark)}
          />
        </div>
      ))}

      {problems.length > 0 && (
        <div data-testid="tool-call-problems" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {problems.map((problem, index) => (
            <span key={index} style={problemOf(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
