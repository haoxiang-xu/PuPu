import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { safe_text } from "../document_values";
import { hook_pin, hooks_list } from "../hooks_pool_config";
import { cached_workflow_version, useWorkflowVersions } from "../workflow_versions";

/* A Hooks Pool on the canvas (#357): an attach node, like the other pools,
 * listing its hooks in the order they run within this pool — by (order, id),
 * the runtime's own sort — and `+N more` past the first few. A stored entry
 * the runtime refuses is drawn as such rather than hidden. Nothing here
 * edits; the panel does. */

const MAX_ROWS = 4;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export default function HooksPoolNode({ node, isDark }) {
  const list = hooks_list(node);
  const entries = Array.isArray(list) ? list : [];
  useWorkflowVersions(entries.map((entry) => hook_pin(entry)).filter(Boolean));
  const sorted = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const oa = record(a.entry) && Number.isSafeInteger(a.entry.order) ? a.entry.order : Infinity;
      const ob = record(b.entry) && Number.isSafeInteger(b.entry.order) ? b.entry.order : Infinity;
      if (oa !== ob) return oa - ob;
      /* A stored id that is not text sorts as no id: `String()` of an object
         whose toString is not a function throws, and the store keeps such a
         draft (R-HP-01). Nothing is changed; the panel shows it as stored. */
      const ia = record(a.entry) && typeof a.entry.id === "string" ? a.entry.id : "";
      const ib = record(b.entry) && typeof b.entry.id === "string" ? b.entry.id : "";
      return ia < ib ? -1 : ia > ib ? 1 : a.index - b.index;
    });
  const shown = sorted.slice(0, MAX_ROWS);
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const subtitle = !Array.isArray(list) ? "Hook settings unreadable" : entries.length === 0 ? "No hooks yet" : `${entries.length} hook${entries.length === 1 ? "" : "s"}`;

  return (
    <div data-testid={`hooks-pool-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg, #e0759a, #b94a74)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon src="anchor" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: text }}>Hooks Pool</div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2 }}>{subtitle}</div>
            </div>
          </div>
          {shown.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column", gap: 2 }}>
              {shown.map(({ entry, index }) => {
                if (!record(entry)) {
                  return <div key={index} data-testid={`hooks-pool-node-${node.id}-row-${index}`} style={{ fontSize: 10.5, color: "#d23f37" }}>an unreadable entry</div>;
                }
                const pin = hook_pin(entry);
                const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
                const when = entry.event === "before_tool_call" ? "before" : entry.event === "after_tool_call" ? "after" : "?";
                const tool = entry.tool_name === null ? "every tool" : typeof entry.tool_name === "string" && entry.tool_name ? entry.tool_name : "?";
                return (
                  <div key={index} data-testid={`hooks-pool-node-${node.id}-row-${index}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: text, minWidth: 0 }}>
                    <span style={{ fontSize: 9.5, padding: "0 4px", borderRadius: 4, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", color: muted, flexShrink: 0 }}>{when}</span>
                    <span style={{ fontFamily: "ui-monospace, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe_text(tool)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {version ? `${safe_text(version.document.name || pin.workflow_id)} · rev ${version.ordinal}` : pin ? safe_text(pin.workflow_id) : "no Workflow"}
                    </span>
                  </div>
                );
              })}
              {sorted.length > shown.length && <div style={{ fontSize: 10.5, color: muted }}>+{sorted.length - shown.length} more</div>}
            </div>
          )}
        </div>
      </PuzzleShape>
    </div>
  );
}
