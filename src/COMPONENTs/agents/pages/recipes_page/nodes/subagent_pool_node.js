import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { entry_reference } from "../subagent_eligibility";
import {
  can_drill,
  drill_unavailable_reason,
  reference_exists,
} from "../subagent_drill";

/* The pool shows its entries rather than a count, because an entry is what the
 * user opens: double-clicking a referenced Agent drills into that Agent's own
 * graph. A reference whose Agent is gone is marked here instead of failing only
 * at the moment someone tries to open it. */

const MAX_ROWS = 5;

export default function SubagentPoolNode({
  node,
  isDark,
  recipes,
  onDrillIn,
}) {
  const entries = node.subagents || [];
  const shown = entries.slice(0, MAX_ROWS);
  const overflow = entries.length - shown.length;

  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const missingColor = isDark ? "rgba(255,120,120,0.92)" : "rgba(176,32,32,0.92)";

  return (
    <div style={{ width: 210 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="shapes" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                }}
              >
                Subagent Pool
              </div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2 }}>
                {entries.length} {entries.length === 1 ? "subagent" : "subagents"}
              </div>
            </div>
          </div>

          {shown.length > 0 && (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              {shown.map((entry, i) => {
                const { name, source } = entry_reference(entry);
                const present = reference_exists(entry, recipes);
                const openable = can_drill(entry) && present;
                const title = present
                  ? drill_unavailable_reason(entry) ||
                    `Double-click to open ${name}`
                  : `${name} is no longer in the Agent library`;
                return (
                  <div
                    key={i}
                    data-testid={`pool-node-row-${i}`}
                    title={title}
                    onDoubleClick={
                      typeof onDrillIn === "function"
                        ? (e) => {
                            e.stopPropagation();
                            /* Even a row that cannot be opened answers, so the
                               page can say why. An inert row reads as the app
                               being broken. */
                            onDrillIn(entry);
                          }
                        : undefined
                    }
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 6,
                      fontSize: 10.5,
                      lineHeight: 1.5,
                      cursor: openable ? "pointer" : "default",
                      opacity: present ? 1 : 0.75,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "ui-monospace, Menlo, monospace",
                        color: present
                          ? isDark
                            ? "#e6e6ea"
                            : "#2c2c32"
                          : missingColor,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {name}
                    </span>
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9.5,
                        color: present ? muted : missingColor,
                        flexShrink: 0,
                      }}
                    >
                      {present ? source : "missing"}
                    </span>
                  </div>
                );
              })}
              {overflow > 0 && (
                <div style={{ fontSize: 9.5, color: muted, marginTop: 1 }}>
                  +{overflow} more
                </div>
              )}
            </div>
          )}
        </div>
      </PuzzleShape>
    </div>
  );
}
