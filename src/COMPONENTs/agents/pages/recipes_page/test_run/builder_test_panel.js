import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import PanelSelect from "../detail_panel/panel_select";
import PanelHeader from "../detail_panel/panel_header";
import { Block, FoldBlock } from "../detail_panel/process_timeline";
import {
  Region, SettingRow, hairline, note, pickerSelectProps, pickerSlotStyle, primaryButtonStyle, problem as problemOf,
  statusColor, text as textColor, textFieldFill,
} from "../detail_panel/panel_style";
import { StreamingMessageStoreContext } from "../../../../chat-bubble/components/streaming_message_store_context";
import { api } from "../../../../../SERVICEs/api";
import { readWorkspaces } from "../../../../settings/runtime";
import { can_preflight } from "../skeleton_resource_session";
import { safe_text } from "../document_values";
import WorkflowTestInputs, { workflow_test_interface_key } from "./workflow_test_inputs";
import useBuilderTest from "./use_builder_test";
import { LIVE_STATUSES, panel_state } from "./test_status";
import { AgentTurn, StatusDot, WorkflowRun, secondaryButtonStyle } from "./test_result";

/* The Test panel: try the Agent or Workflow on screen without leaving the
 * Builder. It takes the detail panel's place and wears its clothes — the
 * same header, Regions and captions — and reads top to bottom as what to do:
 *
 *   1. one line that says whether it can run, and if not, which node to fix
 *      (with a button that opens that node);
 *   2. a Workflow's inputs, as the Name / Type / Value table its Start
 *      declares them in;
 *   3. what came back: an Agent as a conversation, a Workflow as its latest
 *      result with the earlier ones folded under it;
 *   4. the run's settings (workspace, extra tools), folded;
 *   5. at the bottom, always in view, the one thing to press: Send for an
 *      Agent, Run for a Workflow, Stop while it runs.
 *
 * The run itself belongs to `useBuilderTest`: this file only draws it. */

const TINT = "#2f9a68";
const headerIconStyle = (isDark) => ({
  ...secondaryButtonStyle(isDark), backgroundColor: "transparent", iconOnlyPaddingVertical: 5, iconOnlyPaddingHorizontal: 5, content: { icon: { width: 14, height: 14 } },
});

/* The sentence at the top, and the one thing to do about it. */
function StatusLine({ state, isDark, onAction }) {
  const { t } = useTranslation();
  const label = state.action === "fix" ? t("agents.test_run.fix")
    : state.action === "refresh" ? t("agents.test_run.refresh")
      : state.action === "recheck" ? t("agents.test_run.recheck") : null;
  return (
    <Region isDark={isDark} testid="test-run-status">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 10px 9px 12px", minWidth: 0 }}>
        <span style={{ display: "flex", height: 18, alignItems: "center" }}><StatusDot tone={state.tone} isDark={isDark} /></span>
        <span data-testid="skeleton-preflight-state" role={state.tone === "bad" ? "alert" : "status"}
          style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: "18px", overflowWrap: "anywhere",
            color: state.tone === "bad" ? statusColor("bad", isDark) : textColor(isDark) }}>
          {state.text}
        </span>
        {label && <Button label={label} onClick={onAction} style={{ ...secondaryButtonStyle(isDark), marginTop: -3, flexShrink: 0 }} />}
      </div>
    </Region>
  );
}

/* A request the panel made and the store refused: what it said, in red. */
function ControllerProblem({ error, isDark }) {
  return (
    <div role="alert" data-testid="test-run-request-problem" style={{ ...problemOf(isDark), display: "flex", flexDirection: "column", gap: 2 }}>
      <span>{error.message || error.code}</span>
      {error.message && error.code && <span style={{ ...note(isDark), fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10.5 }}>{error.code}</span>}
    </div>
  );
}

/* Where a test runs and what else it may use: the chat's workspace and
   toolkit choices, as the panel's pickers. */
function RunSettings({ active, busy, running, workspace, setWorkspace, toolkits, setToolkits, isDark }) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    if (!active) return undefined;
    let wanted = true;
    api.unchain.getToolkitCatalog?.()
      .then((result) => { if (wanted) setCatalog(Array.isArray(result?.toolkits) ? result.toolkits : []); })
      .catch(() => {});
    return () => { wanted = false; };
  }, [active]);
  const workspaces = active ? readWorkspaces() : [];
  const locked = busy || running;
  return (
    <FoldBlock section="test-run-settings" title={t("agents.test_run.settings")} isDark={isDark}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <Region isDark={isDark}>
          <div style={{ padding: "4px 8px 4px 12px" }}>
            <SettingRow label={t("agents.test_run.workspace")} isDark={isDark} testid="test-run-workspace">
              <span style={pickerSlotStyle}>
                <PanelSelect {...pickerSelectProps} value={workspace} set_value={setWorkspace} disabled={locked}
                  placeholder={t("agents.test_run.no_workspace")}
                  options={[{ value: "", label: t("agents.test_run.no_workspace"), icon: "folder" },
                    ...workspaces.map((row) => ({ value: row.id, label: row.name || row.path || row.id, description: row.path, icon: "folder" }))]} />
              </span>
            </SettingRow>
          </div>
          <div style={{ padding: "4px 8px 4px 12px" }}>
            <SettingRow label={t("agents.test_run.tools")} isDark={isDark} testid="test-run-tools">
              <span style={pickerSlotStyle}>
                <PanelSelect {...pickerSelectProps} value={toolkits} set_value={setToolkits} multi disabled={locked}
                  placeholder={t("agents.test_run.no_tools")}
                  options={catalog.map((row) => ({ value: row.name, label: row.name, icon: "tool" }))} />
              </span>
            </SettingRow>
          </div>
        </Region>
        <span style={note(isDark)}>{t("agents.test_run.real_tools")}</span>
      </div>
    </FoldBlock>
  );
}

export default function BuilderTestPanel({ active, session, onSave, onCheck, onObserve, onFix, onViewChatRun, scopeNote, isDark }) {
  const { t } = useTranslation();
  const controller = useBuilderTest({ active, session, onSave });
  const { view, busy, error, uncertain, confirmed } = controller;
  const [message, setMessage] = useState("");
  const [values, setValues] = useState({});
  const [problems, setProblems] = useState([]);
  const [workspace, setWorkspace] = useState("");
  const [toolkits, setToolkits] = useState([]);
  const resource = session.resource_id || session.document?.id;
  const kind = session.document?.kind;
  const inputContract = useMemo(() => (kind === "workflow" ? workflow_test_interface_key(session.document) : ""), [kind, session.document]);

  /* Opening the panel asks once, per saved version, whether it can run. */
  const checked = useRef(null);
  useEffect(() => {
    const version = `${resource}:${session.edit_token}`;
    if (!active || !onCheck || !can_preflight(session) || session.preflight || checked.current === version) return;
    checked.current = version;
    onCheck();
  }, [active, onCheck, resource, session]);
  useEffect(() => { setMessage(""); setWorkspace(""); setToolkits([]); }, [resource]);
  useEffect(() => { setValues({}); setProblems([]); }, [resource, inputContract]);

  const current = view?.session.resource_id === resource ? view : null;
  const runs = current?.runs || [];
  const last = runs.at(-1);
  const running = Boolean(last && LIVE_STATUSES.has(last.status));
  const state = panel_state({ session, kind, last, uncertain }, t);
  const traceContext = useMemo(() => ({ chatId: current?.session.id || "", store: null, notifyStreamingContentCommitted: null }), [current?.session.id]);

  /* An Agent's conversation reads downwards: keep its newest turn in view. */
  const bodyRef = useRef(null);
  const tail = `${runs.length}:${last?.status}:${last?.pending ? 1 : 0}`;
  useEffect(() => {
    if (kind !== "agent" || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [kind, tail]);

  const disabled = busy || running || uncertain || Boolean(error && !confirmed) || session.saving || Boolean(session.conflict)
    || (kind === "workflow" && problems.length > 0) || Boolean(state.blocks);
  const unsaved = session.dirty || !session.edit_token;
  const start = async () => {
    const result = await controller.start({ values: kind === "agent" ? { message } : values, toolkits, workspace_id: workspace });
    if (result && kind === "agent") setMessage("");
  };
  const observe = (run) => onObserve && onObserve({
    owner_chat_id: current.session.id, execution_id: current.session.id, root_run_id: run.id, resource_id: resource,
  });
  const act = () => {
    if (state.action === "fix" && state.node_id && onFix) onFix(state.node_id);
    else if (state.action === "refresh") controller.refresh();
    else if (onCheck) onCheck();
  };

  if (!active) return null;
  const name = safe_text(session.document?.name) || resource || "";
  const runProps = { document: session.document, controller, busy, confirmed, onObserve: onObserve ? observe : null, onFix, isDark };
  const earlier = kind === "workflow" ? runs.slice(0, -1).reverse() : [];

  return (
    <StreamingMessageStoreContext.Provider value={traceContext}>
      <div data-testid="skeleton-run-menu" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div data-testid="builder-test-panel" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, color: textColor(isDark), fontSize: 12 }}>
          <PanelHeader testid="test-run-header" icon="play" tint={TINT} title={t("agents.test_run.title")} isDark={isDark}
            subtitle={t(kind === "agent" ? "agents.test_run.subtitle_agent" : "agents.test_run.subtitle_workflow", { name })}
            actions={(runs.length > 0 || (kind === "agent" && onViewChatRun)) ? <>
              {kind === "agent" && onViewChatRun && (
                <Button ariaLabel={t("agents.test_run.view_chat_run")} title={t("agents.test_run.view_chat_run")} prefix_icon="eye_open"
                  onClick={onViewChatRun} style={headerIconStyle(isDark)} />
              )}
              {runs.length > 0 && (
                <Button ariaLabel={t("agents.test_run.start_over")} title={t("agents.test_run.start_over")} prefix_icon="add"
                  onClick={controller.newConversation} disabled={busy || running || !session.edit_token} style={headerIconStyle(isDark)} />
              )}
            </> : null} />

          <div ref={bodyRef} className="scrollable" data-sb-wall="4" data-sb-edge="2" data-sb-edge-top="4" data-sb-edge-bottom="12"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <StatusLine state={state} isDark={isDark} onAction={act} />
              {scopeNote && <span style={note(isDark)}>{scopeNote}</span>}
              {error && !uncertain && <ControllerProblem error={error} isDark={isDark} />}
            </div>

            {kind === "workflow" && (
              <Block section="test-run-inputs" title={t("agents.test_run.inputs")} isDark={isDark}>
                <WorkflowTestInputs key={inputContract} document={session.document} value={values} onChange={setValues} onValidityChange={setProblems}
                  isDark={isDark} disabled={busy} errors={error ? [error] : []} />
              </Block>
            )}

            {kind === "workflow" && last && (
              <Block section="test-run-result" title={t("agents.test_run.result")} isDark={isDark}>
                <WorkflowRun key={last.id} run={last} {...runProps} />
              </Block>
            )}
            {earlier.length > 0 && (
              <FoldBlock section="test-run-earlier" title={t("agents.test_run.earlier")} isDark={isDark}
                aside={<span style={{ ...note(isDark), marginLeft: 4 }}>{earlier.length}</span>}>
                <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0 }}>
                  {earlier.map((run, index) => (
                    <div key={run.id} style={{ padding: "12px 0", borderTop: index > 0 ? `1px solid ${hairline(isDark)}` : "none" }}>
                      <WorkflowRun run={run} {...runProps} />
                    </div>
                  ))}
                </div>
              </FoldBlock>
            )}

            {kind === "agent" && (
              <Block section="test-run-conversation" title={t("agents.test_run.conversation")} isDark={isDark}>
                {runs.length === 0
                  ? <span style={note(isDark)}>{t("agents.test_run.empty_agent")}</span>
                  : <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
                    {runs.map((run) => <AgentTurn key={run.id} run={run} {...runProps} />)}
                  </div>}
              </Block>
            )}

            <RunSettings active={active} busy={busy} running={running} workspace={workspace} setWorkspace={setWorkspace}
              toolkits={toolkits} setToolkits={setToolkits} isDark={isDark} />
          </div>

          <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>
            {kind === "agent" && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField value={message} set_value={setMessage} max_display_rows={5} aria_label={t("agents.test_run.message")} disabled={busy}
                  placeholder={t("agents.test_run.message_placeholder")}
                  on_key_down={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
                      event.preventDefault();
                      if (!disabled && message.trim()) start();
                    }
                  }}
                  style={{ ...textFieldFill(isDark), width: "100%", minWidth: 0, fontSize: 12.5, padding: 7 }} />
              </div>
            )}
            {running ? (
              <Button label={t("agents.test_run.stop")} prefix_icon="stop" onClick={() => controller.stop(last)} disabled={busy}
                style={{ ...primaryButtonStyle(isDark), ...(kind === "workflow" ? { flex: 1 } : {}) }} />
            ) : (
              <Button prefix_icon={kind === "agent" ? undefined : "play"} onClick={start} disabled={Boolean(disabled || (kind === "agent" && !message.trim()))}
                label={t(kind === "agent"
                  ? unsaved ? "agents.test_run.save_and_send" : "agents.test_run.send"
                  : unsaved ? "agents.test_run.save_and_run" : "agents.test_run.run")}
                style={{ ...primaryButtonStyle(isDark), ...(kind === "workflow" ? { flex: 1 } : {}) }} />
            )}
          </div>
        </div>
      </div>
    </StreamingMessageStoreContext.Provider>
  );
}
