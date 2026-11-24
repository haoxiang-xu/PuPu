import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import ChatInput from "../../../../chat-input/chat_input";
import PanelSelect from "../detail_panel/panel_select";
import PanelHeader from "../detail_panel/panel_header";
import { ControlHint, CHROME_BUTTON_RADIUS } from "../canvas_chrome";
import { Block, FoldBlock } from "../detail_panel/process_timeline";
import {
  REGION_RADIUS, Region, SettingRow, hairline, note, pickerSelectProps, pickerSlotStyle, primaryButtonStyle, problem as problemOf,
  statusColor, text as textColor,
} from "../detail_panel/panel_style";
import { StreamingMessageStoreContext } from "../../../../chat-bubble/components/streaming_message_store_context";
import { api } from "../../../../../SERVICEs/api";
import { readWorkspaces } from "../../../../settings/runtime";
import { can_preflight } from "../skeleton_resource_session";
import { safe_text } from "../document_values";
import WorkflowTestInputs, { workflow_test_interface_key } from "./workflow_test_inputs";
import useBuilderTest from "./use_builder_test";
import { LIVE_STATUSES, approval_problem_text, approval_refused_for_good, model_unusable, own_model_id, panel_state, request_problem_text, unconfigured_agents } from "./test_status";
import { kernel_profiles } from "../skeleton_resources";
import { readMemoryAgentSettings } from "../../../../../SERVICEs/memory_agent_settings";
import { StatusDot, WorkflowRun, agent_messages, pending_requests, secondaryButtonStyle } from "./test_result";
import ChatMessages from "../../../../chat-messages/chat_messages";

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
 *   5. at the bottom, always in view: for an Agent, the chat's own composer
 *      (its model, tools and workspace in the same attach row); for a
 *      Workflow, Run. Stop while it runs.
 *
 * An Agent node the author left with no model runs with the model picked in
 * that composer, as a chat would; a node with its own model keeps it, and the
 * composer's model pill then shows that model and cannot be changed.
 *
 * The run itself belongs to `useBuilderTest`: this file only draws it. */

const TINT = "#2f9a68";
/* The panel toggle's own measure (canvas_chrome's fitted glyph). */
const toggleRowButtonStyle = { fontSize: 14, color: "var(--pupu-text)", borderRadius: CHROME_BUTTON_RADIUS, iconOnlyPaddingVertical: 5, iconOnlyPaddingHorizontal: 5 };

/* The composer's bottom margin (its 12px padding): the conversation is
   masked out there, so nothing scrolls visibly beneath the box. */
const COMPOSER_EDGE_MASK = "linear-gradient(to top, transparent 0, transparent 12px, #000 12px)";
/* Before the composer is measured: its compact box and margins. */
const COMPOSER_MIN_HEIGHT = 120;
/* A line floating over the conversation reads on the same frost as the
   composer's attach row. */
const frosted = (isDark) => ({
  borderRadius: REGION_RADIUS,
  backgroundColor: isDark ? "rgba(var(--pupu-surface-rgb),0.6)" : "rgba(var(--pupu-surface-rgb),0.72)",
  backdropFilter: "blur(20px) saturate(130%)", WebkitBackdropFilter: "blur(20px) saturate(130%)",
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
/* The engineer's code stays out of the sentence: it is on the line's
   tooltip, for a bug report. */
function ControllerProblem({ error, model, isDark }) {
  const { t } = useTranslation();
  return (
    <div role="alert" data-testid="test-run-request-problem" title={error.code || undefined}
      style={{ ...problemOf(isDark), display: "flex", flexDirection: "column", gap: 2 }}>
      <span>{request_problem_text(error, t, model)}</span>
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

export default function BuilderTestPanel({ active, session, onSave, onCheck, onFix, onRunStates, scopeNote, isDark }) {
  const { t } = useTranslation();
  const controller = useBuilderTest({ active, session, onSave });
  const { view, busy, error, uncertain, confirmed } = controller;
  const [message, setMessage] = useState("");
  const [values, setValues] = useState({});
  const [problems, setProblems] = useState([]);
  const [workspace, setWorkspace] = useState("");
  const [toolkits, setToolkits] = useState([]);
  /* The Agent composer's own choices, as the chat keeps them. */
  const [workspaceIds, setWorkspaceIds] = useState([]);
  const [modelCatalog, setModelCatalog] = useState(null);
  const [pickedModel, setPickedModel] = useState("");
  /* The Kernel catalog the node's model picker reads, so a model that cannot
     run an Agent is said before Send, with the reason. */
  const [kernelCatalog, setKernelCatalog] = useState(null);
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
  useEffect(() => { setMessage(""); setWorkspace(""); setToolkits([]); setWorkspaceIds([]); }, [resource]);
  useEffect(() => {
    if (!active || kind !== "agent") return undefined;
    let wanted = true;
    api.unchain.getModelCatalog?.()
      .then((catalog) => {
        if (!wanted || !catalog) return;
        setModelCatalog(catalog);
        setPickedModel((picked) => picked || catalog.activeModel || "");
      })
      .catch(() => {});
    kernel_profiles().then((result) => { if (wanted && result?.ok) setKernelCatalog(result.data); }).catch(() => {});
    return () => { wanted = false; };
  }, [active, kind]);
  const needsModel = kind === "agent" && unconfigured_agents(session.document).length > 0;
  const ownModel = kind === "agent" ? own_model_id(session.document) : null;
  const fallbackModel = needsModel && pickedModel ? pickedModel : null;
  /* A custom-provider model has no Memory Agent to go with it unless one is
     set: the Memory Agent defaults to the run's own provider, and only the
     built-in providers can be given its credential. */
  const memoryProvider = kind === "agent" ? readMemoryAgentSettings().provider : "";
  const fallbackProblem = fallbackModel
    ? model_unusable(kernelCatalog, fallbackModel) || (!memoryProvider && fallbackModel.startsWith("custom.") ? "memory_provider" : null)
    : null;
  const pickModel = (next) => {
    setPickedModel(next);
    controller.dismiss();
  };
  useEffect(() => { setValues({}); setProblems([]); }, [resource, inputContract]);

  const current = view?.session.resource_id === resource ? view : null;
  const runs = useMemo(() => current?.runs || [], [current]);
  const last = runs.at(-1);
  const running = Boolean(last && LIVE_STATUSES.has(last.status));
  /* An approval or answer just given: shown at once, and held until the
     recorded run moves past that interaction, so a click never looks
     ignored while the run picks up again. */
  const [answered, setAnswered] = useState(null);
  const answeredNow = answered && last?.pending?.interaction_id === answered.interaction_id ? answered : null;
  const answer = async (run, approved, reply) => {
    setAnswered({ interaction_id: run.pending.interaction_id, approved });
    const result = await controller.respond(run, approved, reply);
    if (!result) setAnswered((held) => (held && held.interaction_id === run.pending.interaction_id ? { ...held, failed: true } : held));
  };
  const shownLast = answeredNow && !answeredNow.failed && last ? { ...last, status: "running" } : last;
  /* An approval refused for good: the card stops offering its buttons and
     the status line says what to do instead of "waiting for you". */
  const deadApproval = Boolean(answeredNow?.failed && approval_refused_for_good(error));
  const state = deadApproval ? { tone: "bad", text: approval_problem_text(error, t) }
    : panel_state({ session, kind, last: shownLast, uncertain, confirmed, fallbackModel, fallbackProblem, error }, t);
  const traceContext = useMemo(() => ({ chatId: current?.session.id || "", store: null, notifyStreamingContentCommitted: null }), [current?.session.id]);

  /* The latest run's node states, for the canvas to draw on the graph the
     author is looking at. Only a run of the version on screen is drawn: a
     run of an older save, or under unsaved edits, would mark nodes that are
     no longer what ran. */
  const runStates = useMemo(() => {
    if (!active || !last || session.dirty || last.edit_token !== session.edit_token) return null;
    const ids = new Set((session.document?.nodes || []).map((node) => node?.id));
    const graph = last.graphs.find((item) => item.nodes.length > 0 && item.nodes.every((node) => ids.has(node.id))) || null;
    if (!graph) return null;
    const held = answeredNow && !answeredNow.failed;
    return graph.nodes.map((node) => ({ node_id: node.id,
      state: held && /^waiting/.test(node.status) ? "running" : node.status === "outcome_unknown" && last.error ? "failed" : node.status }));
  }, [active, last, session.dirty, session.edit_token, session.document, answeredNow]);
  const statesKey = JSON.stringify(runStates);
  useEffect(() => {
    if (onRunStates) onRunStates(runStates);
    // The key is the states' content: a new array with the same states is
    // not a change on the canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesKey, onRunStates]);
  useEffect(() => () => { if (onRunStates) onRunStates(null); }, [onRunStates]);
  const messages = useMemo(() => (kind === "agent" ? agent_messages(runs, t) : []), [kind, runs, t]);
  const requests = useMemo(() => pending_requests(last), [last]);
  /* The chat's confirmation state for the run's wait: idle offers the
     buttons, submitting shows the moment one is pressed; a refused answer
     goes back to idle with the reason. */
  const confirmationUi = useMemo(() => {
    const pending = requests && Object.keys(requests)[0];
    if (!pending) return {};
    if (answeredNow && !answeredNow.failed) return { [pending]: { status: "submitting", error: "" } };
    return { [pending]: { status: deadApproval ? "failed" : "idle", error: answeredNow?.failed && error ? approval_problem_text(error, t) : "" } };
  }, [requests, answeredNow, error, t, deadApproval]);
  /* The floating composer's live height: the conversation keeps that much
     clear at its end. */
  const composerRef = useRef(null);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_HEIGHT);
  useEffect(() => {
    const el = composerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const next = Math.ceil(entry.contentRect.height + 18);
        if (next > 0) setComposerHeight(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, kind]);
  const decide = ({ confirmationId, approved, userResponse }) => {
    if (!last?.pending || confirmationId !== last.pending.interaction_id) return;
    answer(last, last.pending.kind === "human_input" ? true : Boolean(approved), userResponse ?? null);
  };

  const disabled = busy || running || uncertain || Boolean(error && !confirmed) || session.saving || Boolean(session.conflict)
    || (kind === "workflow" && problems.length > 0) || Boolean(state.blocks);
  const unsaved = session.dirty || !session.edit_token;
  const start = async () => {
    const result = await controller.start(kind === "agent"
      ? { values: { message }, toolkits, workspace_id: workspaceIds[0] || "", fallback_model: fallbackModel }
      : { values, toolkits, workspace_id: workspace });
    if (result && kind === "agent") setMessage("");
  };
  const act = () => {
    if (state.action === "fix" && state.node_id && onFix) onFix(state.node_id);
    else if (state.action === "refresh") controller.refresh();
    else if (onCheck) onCheck();
  };

  if (!active) return null;
  const name = safe_text(session.document?.name) || resource || "";
  const status = <>
    <StatusLine state={state} isDark={isDark} onAction={act} />
    {scopeNote && <span style={note(isDark)}>{scopeNote}</span>}
    {/* A refused answer is said on its own card, not a second time here. */}
    {error && !uncertain && !answeredNow?.failed && !(fallbackProblem && error.code === "test_model_unavailable")
      && <ControllerProblem error={error} model={fallbackModel || ""} isDark={isDark} />}
  </>;
  const runProps = { document: session.document, controller, busy, confirmed, isDark,
    answered: answeredNow, answerProblem: answered && error ? approval_problem_text(error, t) : "", onAnswer: answer };
  const earlier = kind === "workflow" ? runs.slice(0, -1).reverse() : [];

  return (
    <StreamingMessageStoreContext.Provider value={traceContext}>
      <div data-testid="skeleton-run-menu" style={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div data-testid="builder-test-panel" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, color: textColor(isDark), fontSize: 12 }}>
          <PanelHeader testid="test-run-header" icon="play" tint={TINT} title={t("agents.test_run.title")} isDark={isDark}
            subtitle={t(kind === "agent" ? "agents.test_run.subtitle_agent" : "agents.test_run.subtitle_workflow", { name })}
            /* A Workflow has no conversation to start over: its corner runs it,
               the same action and state as the Run / Stop button below. An
               Agent's corner starts over, the chat's "new chat": the same glyph,
               on the row of the panel's own toggle, with the toggle's own hint. */
            toggleRowAction={kind === "workflow" ? (
              <ControlHint label={t(running ? "agents.test_run.stop" : unsaved ? "agents.test_run.save_and_run" : "agents.test_run.run")}
                testId="test-run-corner-run-hint" position="bottom">
                {running ? (
                  <Button ariaLabel={t("agents.test_run.stop")} prefix_icon="stop" dom_props={{ "data-testid": "test-run-corner-run" }}
                    onClick={() => controller.stop(last)} disabled={busy} style={toggleRowButtonStyle} />
                ) : (
                  <Button ariaLabel={t(unsaved ? "agents.test_run.save_and_run" : "agents.test_run.run")} prefix_icon="play"
                    dom_props={{ "data-testid": "test-run-corner-run" }} onClick={start} disabled={Boolean(disabled)} style={toggleRowButtonStyle} />
                )}
              </ControlHint>
            ) : runs.length > 0 ? (
              <ControlHint label={t("agents.test_run.start_over")} testId="test-run-start-over-hint" position="bottom">
                <Button ariaLabel={t("agents.test_run.start_over")} prefix_icon="chat_new" dom_props={{ "data-testid": "test-run-start-over" }}
                  onClick={controller.newConversation} disabled={busy || running || !session.edit_token} style={toggleRowButtonStyle} />
              </ControlHint>
            ) : null} />

          {kind === "agent" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0, padding: "14px 16px 0", flexShrink: 0 }}>
              {status}
            </div>
          )}
          {kind === "agent" && (
            /* The chat's own message list: bubbles, trace chain, the chat's
               approval and question controls, scrolling and its way back to
               the newest message. */
            <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
              {/* Under the composer's bottom margin nothing shows: the list
                  stops at the box's lower edge, as the chat's cover does. */}
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
                maskImage: COMPOSER_EDGE_MASK, WebkitMaskImage: COMPOSER_EDGE_MASK }}>
                {runs.some(run=>!run.trace_complete) && <div role="status" style={{...note(isDark),padding:"6px 16px"}}>{t("agents.test_run.trace_limit")}</div>}
                <ChatMessages chatId={current?.session.id || ""} messages={messages} isStreaming={running} disableActionButtons
                  pendingToolConfirmationRequests={requests} toolConfirmationUiStateById={confirmationUi}
                  onToolConfirmationDecision={decide} onStopStream={() => controller.stop(last)} allowSessionApprovals={false}
                  bottomViewportInset={composerHeight} />
              </div>
              {/* As in the chat, the composer floats over the conversation:
                  the list scrolls on underneath it and keeps the composer's
                  height clear at its end, so the frosted box and its attach
                  row (model, tools, workspace; it rises above the box while in
                  use) blur the messages passing behind them. The hint keeps
                  its own room, so the risen row never covers it. */}
            <div ref={composerRef} data-testid="test-run-composer"
              style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5, padding: "6px 12px 12px" }}>
              {/* Why Send does nothing right now, said where Send is. */}
              {running && (
                <div data-testid="test-run-composer-hint" role="status" style={{ ...note(isDark), display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", marginBottom: 6, ...frosted(isDark) }}>
                  <StatusDot tone={shownLast?.status === "waiting" ? "wait" : "busy"} isDark={isDark} />
                  {t(shownLast?.status === "waiting" ? "agents.test_run.composer_waiting" : "agents.test_run.composer_running")}
                </div>
              )}
              {last?.pending?.status === "receipt_recorded" && (
                <div style={{ ...note(isDark), display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", marginBottom: 6, ...frosted(isDark) }}>
                  <span style={{ flex: 1 }}>{t("agents.test_run.receipt")}</span>
                  <Button label={t("agents.test_run.resume")} onClick={() => controller.resume(last)} disabled={busy || !confirmed} style={secondaryButtonStyle(isDark)} />
                </div>
              )}
              {running && <div style={{ height: 44 }} aria-hidden="true" />}
              <ChatInput compact value={message} onChange={setMessage}
                onSend={() => { if (!disabled && message.trim()) start(); }}
                onStop={() => controller.stop(last)} isStreaming={running}
                sendDisabled={Boolean(disabled || !message.trim())}
                placeholder={t(unsaved ? "agents.test_run.message_placeholder_unsaved" : "agents.test_run.message_placeholder")}
                showAttachments attachmentsEnabled={false} onAttachFile={() => {}}
                modelCatalog={modelCatalog || undefined}
                selectedModelId={needsModel ? pickedModel : ownModel || pickedModel}
                onSelectModel={pickModel}
                modelSelectDisabled={!needsModel || busy || running}
                showAgentSelector={false}
                selectedToolkits={toolkits} onToolkitsChange={setToolkits} toolSelectDisabled={busy || running}
                selectedWorkspaceIds={workspaceIds} onWorkspaceIdsChange={setWorkspaceIds} />
            </div>
            </div>
          )}
          {kind === "workflow" && <div className="scrollable" data-sb-wall="4" data-sb-edge="2" data-sb-edge-top="4" data-sb-edge-bottom="12"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "14px 16px",
              display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              {status}
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

            <RunSettings active={active} busy={busy} running={running} workspace={workspace} setWorkspace={setWorkspace}
              toolkits={toolkits} setToolkits={setToolkits} isDark={isDark} />
          </div>}

          {kind !== "agent" && (
            <div style={{ padding: "10px 16px 14px", display: "flex", gap: 8, alignItems: "flex-end", flexShrink: 0,
              borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}` }}>
              {running ? (
                <Button label={t("agents.test_run.stop")} prefix_icon="stop" onClick={() => controller.stop(last)} disabled={busy}
                  style={{ ...primaryButtonStyle(isDark), flex: 1 }} />
              ) : (
                <Button prefix_icon="play" onClick={start} disabled={Boolean(disabled)}
                  label={t(unsaved ? "agents.test_run.save_and_run" : "agents.test_run.run")}
                  style={{ ...primaryButtonStyle(isDark), flex: 1 }} />
              )}
            </div>
          )}
        </div>
      </div>
    </StreamingMessageStoreContext.Provider>
  );
}
