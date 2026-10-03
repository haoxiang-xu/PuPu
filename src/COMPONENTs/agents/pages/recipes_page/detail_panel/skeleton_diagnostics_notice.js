import React from "react";
import {
  diagnostics_for_node,
  unplaced_diagnostics,
} from "../skeleton_diagnostics";

/* The problems in this node's draft that no row could show.
 *
 * A diagnostic whose path points at a binding row is shown on that row. What is
 * left over — a problem with the node itself, or a path shape this build does
 * not recognise — would otherwise vanish, and a panel showing nothing reads as
 * a draft with nothing wrong. An incomplete draft is allowed to be saved, so
 * these are stated rather than treated as failures. */

export default function SkeletonDiagnosticsNotice({
  document,
  diagnostics,
  nodeId,
  isDark,
}) {
  const mine = diagnostics_for_node(diagnostics, document, nodeId);
  const leftover = unplaced_diagnostics(mine, document);
  if (leftover.length === 0) return null;

  return (
    <div
      data-testid="skeleton-diagnostics-notice"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 10px",
        borderRadius: 7,
        background: isDark ? "rgba(120,90,20,0.22)" : "rgba(255,244,214,0.9)",
        border: isDark
          ? "1px solid rgba(220,180,80,0.28)"
          : "1px solid rgba(190,150,40,0.25)",
      }}
    >
      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 }}>
        Saved, with {leftover.length === 1 ? "a problem" : "problems"} to finish
      </span>
      {leftover.map((item, i) => (
        <span
          key={i}
          data-testid={`skeleton-diagnostic-${i}`}
          style={{ fontSize: 10.5, lineHeight: 1.45 }}
        >
          {item.message}
        </span>
      ))}
    </div>
  );
}
