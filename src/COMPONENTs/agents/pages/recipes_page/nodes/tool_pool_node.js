import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import NodeHeader, { NodeBody } from "./node_header";

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
        <NodeBody>
          <NodeHeader
            src="toolkit_pool"
            tile={{ background: "#ea7547" }}
            title={native ? node_display_title(node, t("agents.nodes.toolkit_pool")) : t("agents.nodes.toolkit_pool")}
            subtitle={native && !Array.isArray(list) ? t("agents.nodes.tool_settings_incomplete") : count === 1
              ? t("agents.nodes.toolkit_count_one", { count })
              : t("agents.nodes.toolkit_count_other", { count })}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
