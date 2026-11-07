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
 * user opens: double-clicking a subagent drills into its own graph. A
 * reference whose Agent is gone is marked here instead of failing only at the
 * moment someone tries to open it.
 *
 * It draws two models of pool, and the drawing is the same for both. A legacy
 * recipe node carries its entries on `node.subagents` and the recipe canvas
 * passes the library alongside, which is what tells a missing reference apart.
 * A Skeleton node carries them in `config`, and the Skeleton canvas resolves
 * them to `rows` before handing them over — the entry shapes are not the same,
 * so resolving them here would be two rules in one component. Given `rows`,
 * this draws exactly those. */

const MAX_ROWS = 5;

/* The legacy recipe shape, resolved the way it always was. */
function legacy_rows(entries, recipes) {
  return entries.map((entry) => {
    const { name, source } = entry_reference(entry);
    const present = reference_exists(entry, recipes);
    return {
      name,
      note: present ? source : "missing",
      openable: can_drill(entry) && present,
      missing: !present,
      reason: present ? drill_unavailable_reason(entry) : null,
      entry,
    };
  });
}

export default function SubagentPoolNode({
  node,
  isDark,
  recipes,
  onDrillIn,
  rows,
  onOpenRow,
}) {
  const entries = node.subagents || [];
  const all = Array.isArray(rows) ? rows : legacy_rows(entries, recipes);
  const shown = all.slice(0, MAX_ROWS);
  const overflow = all.length - shown.length;
  const open = (row) => {
    /* Even a row that cannot be opened answers, so the page can say why. An
       inert row reads as the app being broken. */
    if (typeof onOpenRow === "function") return onOpenRow(row);
    if (typeof onDrillIn === "function") return onDrillIn(row.entry);
    return undefined;
  };

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
              <Icon src="subagent_pool" color="#fff" style={{ width: 16, height: 16 }} />
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
                {all.length} {all.length === 1 ? "subagent" : "subagents"}
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
              {shown.map((row, i) => {
                const { name, note, openable, missing } = row;
                const present = !missing;
                const title = openable
                  ? `Double-click to open ${name}`
                  : row.reason ||
                    (missing
                      ? `${name} is no longer in the Agent library`
                      : `${name} cannot be opened`);
                return (
                  <div
                    key={row.key || i}
                    data-testid={`pool-node-row-${i}`}
                    title={title}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      open(row);
                    }}
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
                      {note}
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
