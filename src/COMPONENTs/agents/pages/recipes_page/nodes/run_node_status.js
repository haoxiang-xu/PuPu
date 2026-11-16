import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "../agents_i18n";

/* The design's eight states (Agent Detail Panel Shell, "Eight run states on
 * the node"): a ring that carries urgency and a glyph that carries kind, so
 * the pair survives a colour-blind viewer and a zoomed-out canvas. Done and
 * absent states draw no ring: succeeded only shows its check, and skipped,
 * cancelled and pending fade instead of colouring. Suspended is a dashed
 * outline so it never reads as a wait owed by a person.
 * [glyph, colour, ring: "solid" | "dashed" | null, opacity] */
const STYLES = {
  pending: ["circle", "var(--pupu-text-muted)", null, 0.55],
  running: ["loader", "var(--pupu-accent)", "solid", 1],
  waiting: ["hand", "var(--pupu-warning)", "solid", 1],
  waiting_approval: ["hand", "var(--pupu-warning)", "solid", 1],
  suspended: ["pause", "var(--pupu-text-muted)", "dashed", 0.8],
  succeeded: ["check", "var(--pupu-success)", null, 1],
  failed: ["close", "var(--pupu-danger)", "solid", 1],
  skipped: ["subtract", "var(--pupu-text-muted)", null, 0.42],
  cancelled: ["forbid", "var(--pupu-text-muted)", null, 0.55],
  outcome_unknown: ["question_mark", "var(--pupu-warning)", "solid", 1],
};
const NODE_CORNER = 16;

export function run_status_caption(node, t = agentEnglishText) {
  if (node.phase === "result_received") return t("agents.run.result_received");
  if (node.phase === "receipt_recorded") return t("agents.run.receipt_recorded");
  if (node.phase === "receipt_recorded_upstream") return t("agents.run.receipt_recorded_upstream");
  if (node.phase === "waiting_for_child") return t("agents.run.waiting_for_child");
  if (node.phase === "awaiting_input") return t("agents.run.awaiting_input");
  const labels = { pending: t("agents.run.pending"), running: t("agents.run.running"), waiting: t("agents.run.waiting"), waiting_approval: t("agents.run.waiting_approval"),
    suspended: t("agents.run.suspended"), succeeded: t("agents.run.succeeded"), failed: t("agents.run.failed"), cancelled: t("agents.run.cancelled"), outcome_unknown: t("agents.run.outcome_unknown") };
  return Object.prototype.hasOwnProperty.call(labels, node.state) ? labels[node.state] : t("agents.run.unavailable");
}

/* Drawn around the node, outside its own layout: no coordinate,
 * configuration or port changes. The state's name is the glyph's label and
 * tooltip. A cancellation does not claim the tool never ran. */
export default function RunNodeStatus({ projection, isDark, children }) {
  const { t } = useTranslation();
  if (!projection) return children;
  const [icon, color, ring, opacity] = Object.prototype.hasOwnProperty.call(STYLES, projection.state)
    ? STYLES[projection.state] : ["question_mark", "var(--pupu-text-muted)", null, 1];
  const label = run_status_caption(projection, t);
  return (
    <div data-run-node-state={projection.state} style={{ position: "relative", display: "inline-block", verticalAlign: "top", borderRadius: NODE_CORNER,
      boxShadow: ring === "solid" ? `0 0 0 2px ${color}` : "none",
      outline: ring === "dashed" ? `1.5px dashed ${color}` : "none", outlineOffset: 0, opacity }}>
      {children}
      <span data-testid={`run-node-state-${projection.node_id}`} data-run-state={projection.state} role="img"
        aria-label={label} title={`${label}${projection.reason ? ` · ${projection.reason}` : ""}`}
        style={{ position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 999, display: "flex",
          alignItems: "center", justifyContent: "center", background: "var(--pupu-surface)", pointerEvents: "none",
          boxShadow: `0 0 0 1px ${isDark ? "rgba(255,255,255,0.12)" : "rgba(15,18,38,0.1)"}, 0 2px 6px rgba(15,18,38,0.12)` }}>
        <Icon src={icon} color={color} style={{ width: 13, height: 13, flexShrink: 0 }} />
      </span>
    </div>
  );
}
