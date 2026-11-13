import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_PORT_ANCHOR } from "./node_metrics";

export default function EndNode({ node, isDark }) {
  const { t } = useTranslation();
  return (
    <div style={{ width: 130 }}>
      <PuzzleShape tabs={[]} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="target"
            tile={{ background: "#d23f37" }}
            title={node_display_title(node, t("agents.nodes.end"))}
            subtitle={t("agents.nodes.exit")}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
