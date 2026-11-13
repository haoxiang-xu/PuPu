import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function ToolPoolNode({ node, isDark, native = false, toolkits }) {
  const { t } = useTranslation();
  /* Only a list has a length, and this one is drawn: `{"length": …}` reached
     the line below as the count itself, which is the same fault as a label
     that is not text. A Skeleton node carries neither key — its toolkits live
     in `config` — so it draws none. */
  const list = native ? toolkits : node.toolkits || node.tools;
  const count = Array.isArray(list) ? list.length : 0;
  return (
    <div style={{ width: 180 }}>
      <PuzzleShape tabs={[]} cutouts={["top", "bottom"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #f6a341, #ea7547)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="toolkit_pool" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  ...(native ? { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } : {}),
                  color: "var(--pupu-text)",
                }}
              >
                {native ? node_display_title(node, t("agents.nodes.toolkit_pool")) : t("agents.nodes.toolkit_pool")}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--pupu-text-muted)",
                  marginTop: 2,
                }}
              >
                {native && !Array.isArray(list) ? t("agents.nodes.tool_settings_incomplete") : count === 1
                  ? t("agents.nodes.toolkit_count_one", { count })
                  : t("agents.nodes.toolkit_count_other", { count })}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
