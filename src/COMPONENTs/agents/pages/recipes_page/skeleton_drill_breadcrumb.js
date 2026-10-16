import React from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";

/* `Reviewer › Subagent Pool › Summarizer`.
 *
 * Only the graphs left behind are navigable. The pool crumb names where the
 * step happened rather than a place to go, and the last crumb is the graph on
 * screen — clicking it would do nothing, and a control that does nothing reads
 * as a control that is broken. */

const CRUMB = { display: "flex", alignItems: "center", gap: 4 };

export default function SkeletonDrillBreadcrumb({
  crumbs,
  isDark,
  onNavigate,
  caption,
  note,
}) {
  const list = Array.isArray(crumbs) ? crumbs : [];
  if (list.length === 0) return null;
  return (
    <div
      data-testid="skeleton-drill-breadcrumb"
      style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}
    >
      <div
        data-testid="skeleton-drill-crumbs"
        style={{ ...CRUMB, flexWrap: "wrap", fontSize: 11.5 }}
      >
        {list.map((crumb, index) => (
          <span key={index} style={CRUMB}>
            {index > 0 && (
              <span aria-hidden="true" style={{ opacity: 0.4, fontSize: 10 }}>
                ›
              </span>
            )}
            {crumb.navigable ? (
              <Button
                label={crumb.label}
                ariaLabel={`Back to ${crumb.label}`}
                onClick={() => onNavigate(crumb.depth)}
                style={{
                  fontSize: 11.5,
                  paddingVertical: 2,
                  paddingHorizontal: 6,
                  borderRadius: 5,
                  color: isDark ? "#c9c9d1" : "#55555d",
                }}
              />
            ) : (
              <span
                style={{
                  padding: "2px 6px",
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                  opacity: index === list.length - 1 ? 1 : 0.55,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {crumb.label}
              </span>
            )}
          </span>
        ))}
      </div>
      {caption && (
        <span
          data-testid="skeleton-drill-save-target"
          style={{ fontSize: 10.5, color: "#86868b", lineHeight: 1.45 }}
        >
          {caption}
        </span>
      )}
      {/* An empty diagnostics area would otherwise read as "nothing is wrong"
          here, and it is not what it means: measured on the real store, the
          draft check answers the same `[]` for an embedded child with no End
          as for a healthy one. */}
      {note && (
        <span
          data-testid="skeleton-drill-unchecked"
          style={{ fontSize: 10.5, color: "#86868b", lineHeight: 1.45 }}
        >
          {note}
        </span>
      )}
    </div>
  );
}
