import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { is_skeleton_node } from "../skeleton_document";
import { node_display_title } from "../node_display_labels";
import React from "react";
import { agentEnglishText, agentMessage, renderAgentMessage } from "../agents_i18n";
import PuzzleShape from "./puzzle_shape";
import { node_caption } from "./node_caption";
import NodeHeader, { NodeBody } from "./node_header";
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
function legacy_rows(entries, recipes, t = agentEnglishText) {
  return entries.map((entry) => {
    const { name, source } = entry_reference(entry, t);
    const present = reference_exists(entry, recipes);
    return {
      name,
      note: present ? source : t("agents.nodes.missing"),
      openable: can_drill(entry) && present,
      missing: !present,
      reason: present ? drill_unavailable_reason(entry, agentMessage) : null,
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
  rename,
}) {
  const { t } = useTranslation();
  const title = is_skeleton_node(node) ? node_display_title(node, t("agents.nodes.subagent_pool")) : t("agents.nodes.subagent_pool");
  const entries = node.subagents || [];
  const all = Array.isArray(rows) ? rows : legacy_rows(entries, recipes, t);
  const shown = all.slice(0, MAX_ROWS);
  const overflow = all.length - shown.length;
  const open = (row) => {
    /* Even a row that cannot be opened answers, so the page can say why. An
       inert row reads as the app being broken. */
    if (typeof onOpenRow === "function") return onOpenRow(row);
    if (typeof onDrillIn === "function") return onDrillIn(row.entry);
    return undefined;
  };

  const muted = "var(--pupu-text-muted)";
  const missingColor = "var(--pupu-danger)";

  return (
    <div style={{ width: 210 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="subagent_pool"
            tile={{ background: "#5a5dd6" }}
            title={title}
            subtitle={node_caption({ type: "subagent_pool", title, summary: all.length === 1
              ? t("agents.nodes.subagent_count_one", { count: all.length })
              : t("agents.nodes.subagent_count_other", { count: all.length }) }, t)}
            rename={rename}
          />

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
                  ? t("agents.nodes.open_subagent", { name })
                  : renderAgentMessage(row.reason, t) ||
                    (missing
                      ? t("agents.nodes.subagent_missing", { name })
                      : t("agents.nodes.subagent_unopenable", { name }));
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
                        color: present ? "var(--pupu-text)" : missingColor,
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
                      {renderAgentMessage(note, t)}
                    </span>
                  </div>
                );
              })}
              {overflow > 0 && (
                <div style={{ fontSize: 9.5, color: muted, marginTop: 1 }}>
                  {t("agents.nodes.more", { count: overflow })}
                </div>
              )}
            </div>
          )}
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
