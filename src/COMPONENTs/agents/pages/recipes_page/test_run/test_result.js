import React, { useMemo } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Markdown from "../../../../../BUILTIN_COMPONENTs/markdown/markdown";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import TraceChain from "../../../../chat-bubble/trace_chain";
import InteractWrapper from "../../../../chat-bubble/interact/interact_wrapper";
import { TableHeads, TableRow } from "../detail_panel/parameter_table";
import {
  CONTROL_RADIUS, REGION_RADIUS, Region, fill, fillStrong, note, problem as problemOf, statusColor, text as textColor,
} from "../detail_panel/panel_style";
import { node_title } from "../node_title";
import { projectTestTrace } from "./test_trace";
import { LIVE_STATUSES, node_at_path, run_error_text } from "./test_status";

/* What one test run shows, in reading order: how it went, what it was given,
   the steps it took, anything it is waiting on, and what came out. Each part
   is the panel's own: a Region, the Name / Value table, the chat's own
   Markdown and the chat's own approval buttons. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
/* A small action beside what it acts on: a soft fill so it reads as a
   button, at a control's corners. */
export const secondaryButtonStyle = (isDark) => ({
  fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: CONTROL_RADIUS, color: textColor(isDark),
  backgroundColor: fillStrong(isDark), content: { icon: { color: textColor(isDark) } },
});

/* A status as a word with a dot of its colour. */
const TONES = {
  completed: "good", ready: "idle", starting: "busy", running: "busy", waiting: "wait",
  failed: "bad", cancelled: "idle", outcome_unknown: "bad",
};

export function StatusDot({ tone, isDark }) {
  return <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: statusColor(tone, isDark) }} />;
}

export function RunStatus({ status, isDark }) {
  const { t } = useTranslation();
  return (
    <span role="status" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: textColor(isDark) }}>
      <StatusDot tone={TONES[status] || "idle"} isDark={isDark} />
      {t(`agents.test_run.status.${status}`)}
    </span>
  );
}

/* A value as it would be read: text as text, everything else as JSON. */
export function ValueText({ value, isDark }) {
  if (typeof value === "string") {
    return <span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12, color: textColor(isDark) }}>{value}</span>;
  }
  let shown;
  try { shown = JSON.stringify(value, null, 2); } catch (_) { shown = String(value); }
  return <span style={{ ...MONO, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11.5, color: textColor(isDark) }}>{shown}</span>;
}

/* The values a run was given, on one quiet line. */
function inputs_line(inputs) {
  const parts = Object.entries(inputs || {}).map(([key, value]) => {
    let shown;
    try { shown = typeof value === "string" ? value : JSON.stringify(value); } catch (_) { shown = String(value); }
    return `${key} = ${shown}`;
  });
  return parts.join(", ");
}

const OUTPUT_TEMPLATE = "minmax(56px, auto) minmax(0, 1fr)";

/* A Workflow's End outputs: one row a name. */
export function WorkflowOutput({ output, isDark, testid = "test-workflow-output" }) {
  const { t } = useTranslation();
  const entries = Object.entries(output || {});
  if (entries.length === 0) return <span data-testid={testid} style={note(isDark)}>{t("agents.test_run.no_output")}</span>;
  return (
    <Region isDark={isDark} testid={testid}>
      <TableHeads key="heads" isDark={isDark} template={OUTPUT_TEMPLATE}
        columns={[{ label: t("agents.test_run.output_name") }, { label: t("agents.test_run.output_value") }]} />
      {entries.map(([name, value]) => (
        <TableRow key={name} template={OUTPUT_TEMPLATE} testid={`${testid}-${name}`}>
          <span title={name} style={{ ...MONO, fontSize: 11.5, alignSelf: "start", lineHeight: "18px", minWidth: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
          <span style={{ minWidth: 0, lineHeight: "18px" }}><ValueText value={value} isDark={isDark} /></span>
        </TableRow>
      ))}
    </Region>
  );
}

/* An Agent's answer, drawn the way the chat draws one. */
export function AgentReply({ output, isDark }) {
  const message = typeof output?.message === "string" ? output.message : null;
  return (
    <div data-testid="test-agent-reply" style={{ minWidth: 0, fontSize: 13, color: textColor(isDark) }}>
      {message !== null
        ? <Markdown markdown={message} style={{ fontSize: 13 }} />
        : <ValueText value={output} isDark={isDark} />}
    </div>
  );
}

/* What went wrong, in the panel's red, with the node it happened at when the
   path names one, and the engineer's code underneath for a bug report. */
export function RunError({ error, document, isDark, onFix, canShowOnCanvas }) {
  const { t } = useTranslation();
  const node = node_at_path(document, error.path);
  const name = node ? node_title(node, t).title : null;
  const said = run_error_text(error, t);
  return (
    /* The engineer's code is on the tooltip, for a bug report. */
    <div role="alert" data-testid="test-run-error" title={error.code || undefined} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px",
      borderRadius: REGION_RADIUS, background: isDark ? "rgba(255,120,120,0.08)" : "rgba(176,32,32,0.05)", minWidth: 0 }}>
      <span style={{ ...problemOf(isDark), fontWeight: 600 }}>
        {name ? t("agents.test_run.failed_at", { node: name }) : t("agents.test_run.error_title")}
      </span>
      {said && <span style={{ ...problemOf(isDark), color: textColor(isDark) }}>{said}</span>}
      {canShowOnCanvas && <span style={note(isDark)}>{t("agents.test_run.problem.see_canvas")}</span>}
      {node && onFix && (
        <Button label={t("agents.test_run.fix")} onClick={() => onFix(node.id)} style={{ ...secondaryButtonStyle(isDark), alignSelf: "flex-start" }} />
      )}
    </div>
  );
}

/* The steps a run took: the chat's own trace, compact. */
export function RunSteps({ run }) {
  const projection = useMemo(() => projectTestTrace(run), [run]);
  if (!projection.frames.length) return null;
  // Interactions have one authoritative controller immediately below the trace.
  // Historical approval frames must not present a second submission surface.
  return (
    <div className="scrollable" style={{ minWidth: 0, maxWidth: "100%", overflowX: "auto" }}>
      <TraceChain {...projection} messageId={run.id} compact showContainerHeader={false} bubbleOwnsFinalMessage bubbleOwnsLiveText={false}
        status={LIVE_STATUSES.has(run.status) ? "streaming" : run.status === "failed" ? "error" : run.status === "cancelled" ? "cancelled" : "done"} />
    </div>
  );
}

/* What a run is waiting on: a tool to allow, a question to answer, a budget
   to extend, or a recorded answer to resume from. The chat's own controls. */
export function PendingInteraction({ run, busy, confirmed, onRespond, onResume, answered, problem, isDark }) {
  const { t } = useTranslation();
  const pending = run.pending;
  /* The answer given here, held until the run moves on: the buttons go, and
     the card says what was chosen and that the run goes on. */
  const said = answered && answered.interaction_id === pending.interaction_id ? answered : null;
  const call = pending.presentation.tool_call || {};
  const tool = call.tool_display_name || pending.payload.tool_name || "";
  const args = call.arguments && typeof call.arguments === "object" ? call.arguments : null;
  const title = pending.kind === "human_input" ? t("agents.test_run.answer_title")
    : pending.kind === "max_budget" ? t("agents.test_run.budget_title") : t("agents.test_run.approval_title");
  return (
    /* A region like every other in the panel; the dot says it needs you. */
    <div data-testid="test-pending" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", minWidth: 0,
      borderRadius: REGION_RADIUS, background: fill(isDark) }}>
      <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 600, color: textColor(isDark) }}>
        <StatusDot tone={said ? "busy" : "wait"} isDark={isDark} />{title}
      </span>
      {pending.kind === "tool_approval" && tool && (
        <span style={{ fontSize: 12, color: textColor(isDark) }}>{t("agents.test_run.approval_tool", { tool })}</span>
      )}
      {pending.kind !== "human_input" && args && Object.keys(args).length > 0 && (
        <div style={{ padding: "6px 8px", borderRadius: CONTROL_RADIUS, background: fillStrong(isDark), minWidth: 0 }}>
          <ValueText value={args} isDark={isDark} />
        </div>
      )}
      {said ? (
        <span data-testid="test-pending-answered" role="status" style={{ ...note(isDark), color: textColor(isDark) }}>
          {t(pending.kind === "human_input" ? "agents.test_run.answered_continuing"
            : said.approved ? "agents.test_run.approved_continuing" : "agents.test_run.denied_continuing")}
        </span>
      ) : pending.status === "receipt_recorded" ? (
        <>
          <span style={note(isDark)}>{t("agents.test_run.receipt")}</span>
          <Button label={t("agents.test_run.resume")} onClick={onResume} disabled={busy || !confirmed}
            style={{ ...secondaryButtonStyle(isDark), alignSelf: "flex-start" }} />
        </>
      ) : pending.kind === "human_input" ? (
        <InteractWrapper key={pending.interaction_id} type={call.interact_type} config={call.interact_config}
          onSubmit={(answer) => onRespond(true, answer)} isDark={isDark} disabled={busy || !confirmed} allowSessionApproval={false} />
      ) : (
        <InteractWrapper key={pending.interaction_id} type="confirmation" config={call.interact_config}
          onSubmit={(answer) => onRespond(Boolean(answer && answer.approved))} isDark={isDark} disabled={busy || !confirmed}
          allowSessionApproval={false} />
      )}
      {problem && !said && <span role="alert" style={problemOf(isDark)}>{problem}</span>}
    </div>
  );
}

/* One Workflow run: a Region headed by how it went, then its parts. */
export function WorkflowRun({ run, document, controller, busy, confirmed, onObserve, onFix, answered, answerProblem, onAnswer, isDark }) {
  const { t } = useTranslation();
  const line = inputs_line(run.inputs);
  return (
    <section data-testid={`test-turn-${run.id}`} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <RunStatus status={run.status} isDark={isDark} />
        <span title={line} style={{ ...note(isDark), flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
        {run.graphs.length > 0 && onObserve && (
          <Button label={t("agents.test_run.view_run")} prefix_icon="eye_open" onClick={() => onObserve(run)} style={secondaryButtonStyle(isDark)} />
        )}
      </div>
      {run.status === "outcome_unknown" && <span style={note(isDark)}>{t("agents.test_run.outcome_unknown_note")}</span>}
      <RunSteps run={run} />
      {!run.trace_complete && <span style={note(isDark)}>{t("agents.test_run.trace_limit")}</span>}
      {run.pending && <PendingInteraction run={run} busy={busy} confirmed={confirmed} isDark={isDark}
        answered={answered} problem={answerProblem}
        onRespond={(approved, answer) => onAnswer(run, approved, answer ?? null)} onResume={() => controller.resume(run)} />}
      {run.error && <RunError error={run.error} document={document} isDark={isDark} onFix={onFix} canShowOnCanvas={run.graphs.length > 0 && Boolean(onObserve)} />}
      {run.output !== null && <WorkflowOutput output={run.output} isDark={isDark} />}
    </section>
  );
}

/* One Agent turn: what was sent, on the right, as the chat shows yours; then
   the steps and the answer, full width. */
export function AgentTurn({ run, document, controller, busy, confirmed, onObserve, onFix, answered, answerProblem, onAnswer, isDark }) {
  const { t } = useTranslation();
  const settled = !LIVE_STATUSES.has(run.status);
  return (
    <section data-testid={`test-turn-${run.id}`} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div aria-label={t("agents.test_run.you")} style={{ alignSelf: "flex-end", maxWidth: "85%", padding: "7px 11px", borderRadius: REGION_RADIUS,
        background: fillStrong(isDark), whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 13, color: textColor(isDark) }}>
        {run.inputs.message}
      </div>
      <RunSteps run={run} />
      {!run.trace_complete && <span style={note(isDark)}>{t("agents.test_run.trace_limit")}</span>}
      {run.pending && <PendingInteraction run={run} busy={busy} confirmed={confirmed} isDark={isDark}
        answered={answered} problem={answerProblem}
        onRespond={(approved, answer) => onAnswer(run, approved, answer ?? null)} onResume={() => controller.resume(run)} />}
      {run.error && <RunError error={run.error} document={document} isDark={isDark} onFix={onFix} canShowOnCanvas={run.graphs.length > 0 && Boolean(onObserve)} />}
      {run.output !== null && <AgentReply output={run.output} isDark={isDark} />}
      {(!settled || run.status !== "completed" || (run.graphs.length > 0 && onObserve)) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(run.status !== "completed") && <RunStatus status={run.status} isDark={isDark} />}
          <span style={{ flex: 1 }} />
          {run.graphs.length > 0 && onObserve && (
            <Button label={t("agents.test_run.view_run")} prefix_icon="eye_open" onClick={() => onObserve(run)} style={secondaryButtonStyle(isDark)} />
          )}
        </div>
      )}
      {run.status === "outcome_unknown" && <span style={note(isDark)}>{t("agents.test_run.outcome_unknown_note")}</span>}
    </section>
  );
}
