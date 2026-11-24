import React, { useMemo } from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "../agents_i18n";
import { RunOutlineContext } from "./run_outline";

/* The design's eight states (Agent Detail Panel Shell, "Eight run states on
 * the node"), drawn on the node's own puzzle outline (design B3): a line that
 * carries urgency and a glyph that carries kind, so the pair survives a
 * colour-blind viewer and a zoomed-out canvas. Running is the theme colour
 * passing through the node from its in-port to its out-port, and has no
 * glyph. Done and absent states draw no line: succeeded only shows its check,
 * and skipped, cancelled and pending fade instead of colouring. Suspended is
 * a still dashed line, so it never reads as a wait owed by a person.
 * [glyph, colour, line (see run_outline), opacity, glyph shown] */
const STYLES = {
  pending: ["circle", "var(--pupu-text-muted)", null, 0.55, false],
  running: ["loader", "var(--pupu-accent)", "pass", 1, false],
  waiting: ["hand", "var(--pupu-warning)", "march", 1, true],
  waiting_approval: ["hand", "var(--pupu-warning)", "march", 1, true],
  suspended: ["pause", "var(--pupu-text-muted)", "dashed", 0.8, true],
  succeeded: ["check", "var(--pupu-success)", null, 1, true],
  failed: ["close", "var(--pupu-danger)", "solid", 1, true],
  skipped: ["subtract", "var(--pupu-text-muted)", null, 0.42, true],
  cancelled: ["forbid", "var(--pupu-text-muted)", null, 0.55, true],
  outcome_unknown: ["question_mark", "var(--pupu-warning)", "dotted", 1, true],
};
const UNKNOWN = ["question_mark", "var(--pupu-text-muted)", null, 1, true];
/* visually hidden, still the state's accessible name */
const SR_ONLY = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

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

/* Drawn on and around the node, outside its own layout: no coordinate,
 * configuration or port changes. The line itself is drawn by the node's
 * PuzzleShape, which knows its bumps and notches. The state's name is the
 * glyph's label and tooltip. A cancellation does not claim the tool never
 * ran. */
export default function RunNodeStatus({ projection, isDark, children }) {
  const { t } = useTranslation();
  const known = projection && Object.prototype.hasOwnProperty.call(STYLES, projection.state);
  const [icon, color, line, opacity, shown] = known ? STYLES[projection.state] : UNKNOWN;
  const outline = useMemo(() => (projection ? { state: projection.state, line, color } : null), [projection, line, color]);
  if (!projection) return children;
  const label = run_status_caption(projection, t);
  return (
    <div data-run-node-state={projection.state} data-run-line={line || undefined}
      style={{ position: "relative", display: "inline-block", verticalAlign: "top", opacity, transition: "opacity 0.3s ease" }}>
      <RunOutlineContext.Provider value={outline}>{children}</RunOutlineContext.Provider>
      <span data-testid={`run-node-state-${projection.node_id}`} data-run-state={projection.state} role="img"
        aria-label={label} title={`${label}${projection.reason ? ` · ${projection.reason}` : ""}`}
        style={shown ? { position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: 999, display: "flex",
          alignItems: "center", justifyContent: "center", background: "var(--pupu-surface)", pointerEvents: "none", zIndex: 3,
          boxShadow: `0 0 0 1px ${isDark ? "rgba(255,255,255,0.12)" : "rgba(15,18,38,0.1)"}, 0 2px 6px rgba(15,18,38,0.12)` } : SR_ONLY}>
        {shown && <Icon src={icon} color={color} style={{ width: 13, height: 13, flexShrink: 0 }} />}
      </span>
    </div>
  );
}
