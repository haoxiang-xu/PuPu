import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import { node_caption } from "./node_caption";
import NodeHeader, { NodeBody } from "./node_header";
import { NODE_PORT_ANCHOR } from "./node_metrics";

export default function EndNode({ node, isDark, rename }) {
  const { t } = useTranslation();
  const title = node_display_title(node, t("agents.nodes.end"));
  return (
    <div style={{ width: 130 }}>
      <PuzzleShape tabs={[]} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <NodeBody>
          <NodeHeader
            src="target"
            tile={{ background: "#d23f37" }}
            title={title}
            subtitle={node_caption({ type: "end", title, summary: t("agents.nodes.exit") }, t)}
            rename={rename}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
