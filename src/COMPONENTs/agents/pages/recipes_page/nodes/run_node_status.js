import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "../agents_i18n";

const STYLES = {
  pending: ["circle", "#86868b"],
  running: ["loader", "#5273df"],
  waiting: ["pause", "#ac791f"],
  waiting_approval: ["hand", "#ac791f"],
  suspended: ["pause", "#86868b"],
  succeeded: ["check", "#32956d"],
  failed: ["close", "#d44c59"],
  cancelled: ["forbid", "#86868b"],
  outcome_unknown: ["question_mark", "#a87626"],
};

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

/* An outline and an existing glyph, never colour alone. The badge is outside
 * normal flow: no coordinate, configuration or port changes. No animation
 * claims a live owner. A cancellation does not claim the tool never ran. */
export default function RunNodeStatus({ projection, isDark, children }) {
  const { t } = useTranslation();
  if (!projection) return children;
  const style = Object.prototype.hasOwnProperty.call(STYLES, projection.state) ? STYLES[projection.state] : ["question_mark", "#86868b"];
  const [icon, color] = style;
  const label = run_status_caption(projection, t);
  return (
    <div style={{ position: "relative", display: "inline-block", verticalAlign: "top", borderRadius: 12,
      outline: `2px solid ${color}`, outlineOffset: 3, opacity: projection.state === "cancelled" ? 0.65 : 1 }}>
      {children}
      <span data-testid={`run-node-state-${projection.node_id}`} data-run-state={projection.state}
        aria-label={label} title={`${label}${projection.reason ? ` · ${projection.reason}` : ""}`}
        style={{ position: "absolute", top: -18, right: 0, display: "flex", alignItems: "center", gap: 4,
          maxWidth: 240, padding: "2px 5px", borderRadius: 5, fontSize: 10, lineHeight: 1.2,
          color: isDark ? "#f0f0f3" : "#24242a", background: "var(--pupu-surface)", pointerEvents: "none" }}>
        <Icon src={icon} color={color} style={{ width: 12, height: 12, flexShrink: 0 }} />
        <span>{label}</span>
      </span>
    </div>
  );
}
