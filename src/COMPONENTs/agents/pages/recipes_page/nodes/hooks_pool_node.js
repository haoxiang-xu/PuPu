import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import { node_caption } from "./node_caption";
import NodeHeader, { NodeBody } from "./node_header";
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

export default function HooksPoolNode({ node, isDark, rename }) {
  const { t } = useTranslation();
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
  const muted = "var(--pupu-text-muted)";
  const text = "var(--pupu-text)";
  const title = node_display_title(node, t("agents.nodes.hooks_pool"));
  const summary = !Array.isArray(list) ? t("agents.nodes.hook_settings_unreadable") : entries.length === 0 ? t("agents.nodes.no_hooks") : entries.length === 1
    ? t("agents.nodes.hook_count_one", { count: entries.length })
    : t("agents.nodes.hook_count_other", { count: entries.length });

  return (
    <div data-testid={`hooks-pool-node-${node.id}`} style={{ width: 210 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="anchor"
            tile={{ background: "#b94a74" }}
            title={title}
            subtitle={node_caption({ type: "hooks_pool", title, summary }, t)}
            rename={rename}
          />
          {shown.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid var(--pupu-border-subtle)", display: "flex", flexDirection: "column", gap: 2 }}>
              {shown.map(({ entry, index }) => {
                if (!record(entry)) {
                  return <div key={index} data-testid={`hooks-pool-node-${node.id}-row-${index}`} style={{ fontSize: 10.5, color: "var(--pupu-danger)" }}>{t("agents.nodes.unreadable_entry")}</div>;
                }
                const pin = hook_pin(entry);
                const version = pin ? cached_workflow_version(pin.workflow_id, pin.revision_id) : null;
                const when = entry.event === "before_tool_call" ? t("agents.nodes.before") : entry.event === "after_tool_call" ? t("agents.nodes.after") : "?";
                const tool = entry.tool_name === null ? t("agents.nodes.every_tool") : typeof entry.tool_name === "string" && entry.tool_name ? entry.tool_name : "?";
                return (
                  <div key={index} data-testid={`hooks-pool-node-${node.id}-row-${index}`} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: text, minWidth: 0 }}>
                    <span style={{ fontSize: 9.5, padding: "0 4px", borderRadius: 4, background: "var(--pupu-overlay-hover)", color: muted, flexShrink: 0 }}>{when}</span>
                    <span style={{ fontFamily: "ui-monospace, Menlo, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{safe_text(tool)}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {version ? t("agents.nodes.hook_workflow_revision", { name: safe_text(version.document.name || pin.workflow_id), revision: version.ordinal }) : pin ? safe_text(pin.workflow_id) : t("agents.nodes.no_workflow")}
                    </span>
                  </div>
                );
              })}
              {sorted.length > shown.length && <div style={{ fontSize: 10.5, color: muted }}>{t("agents.nodes.more", { count: sorted.length - shown.length })}</div>}
            </div>
          )}
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
