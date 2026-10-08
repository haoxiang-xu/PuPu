import React from "react";
import {
  diagnostic_location_label,
  route_diagnostics,
} from "../skeleton_diagnostics";

/* The problems that no row could show.
 *
 * Two notices, because they answer different questions. The first is about the
 * node being edited and belongs beside its rows. The second is everything else
 * in the graph — another node, an edge, the document, or a path shape this
 * build does not recognise — and it exists because the alternative was that
 * those disappeared: the panel filtered by the selected node first, so a
 * `["document","nodes"]` path matched nothing and was never seen again.
 *
 * Neither is a failure. An incomplete draft is allowed to be saved, so these
 * say what is left to finish rather than what went wrong. */

const BOX = (isDark) => ({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "8px 10px",
  borderRadius: 7,
  background: isDark ? "rgba(120,90,20,0.22)" : "rgba(255,244,214,0.9)",
  border: isDark
    ? "1px solid rgba(220,180,80,0.28)"
    : "1px solid rgba(190,150,40,0.25)",
});

const TITLE = { fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3 };
const LINE = { fontSize: 10.5, lineHeight: 1.45 };

export function SkeletonNodeDiagnostics({ diagnostics, isDark }) {
  const list = diagnostics || [];
  if (list.length === 0) return null;
  return (
    <div data-testid="skeleton-diagnostics-notice" style={BOX(isDark)}>
      <span style={TITLE}>
        Saved, with {list.length === 1 ? "a problem" : "problems"} to finish
      </span>
      {list.map((item, i) => (
        <span key={i} data-testid={`skeleton-diagnostic-${i}`} style={LINE}>
          {item.message}
        </span>
      ))}
    </div>
  );
}

export function SkeletonElsewhereDiagnostics({ diagnostics, document, isDark }) {
  const list = diagnostics || [];
  if (list.length === 0) return null;
  return (
    <div data-testid="skeleton-elsewhere-notice" style={BOX(isDark)}>
      <span style={TITLE}>
        Elsewhere in this graph
        {list.length > 1 ? ` · ${list.length}` : ""}
      </span>
      {list.map((item, i) => (
        <span key={i} data-testid={`skeleton-elsewhere-${i}`} style={LINE}>
          <span style={{ opacity: 0.7 }}>
            {diagnostic_location_label(item, document)} —{" "}
          </span>
          {item.message}
        </span>
      ))}
    </div>
  );
}

/* Both notices, routed in one place.
 *
 * `rowCounts` says how many rows the caller actually renders; a path may claim
 * a row only when that row exists. Without it nothing can claim a row, so
 * every node-level path lands in the first notice — the safe direction, since
 * the failure this guards against is a problem being shown nowhere. */
export default function SkeletonDiagnostics({
  document,
  diagnostics,
  nodeId,
  rowCounts,
  isDark,
}) {
  const routed = route_diagnostics(diagnostics, document, {
    node_id: nodeId,
    row_counts: rowCounts,
  });
  return (
    <>
      <SkeletonNodeDiagnostics diagnostics={routed.node} isDark={isDark} />
      <SkeletonElsewhereDiagnostics
        diagnostics={routed.elsewhere}
        document={document}
        isDark={isDark}
      />
    </>
  );
}
