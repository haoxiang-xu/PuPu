import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import NodeHeader, { NodeBody } from "./node_header";
import { safe_text } from "../document_values";
import { NODE_PORT_ANCHOR } from "./node_metrics";

/* A Code node on the canvas (#357): a plain header node like the other
 * steps — its icon, its name and the language it runs. The code itself is
 * not shown here; the panel is where it is read and written. One way in on
 * the left, one way out on the right. */

const WIDTH = 230;

export default function CodeNode({ node, isDark }) {
  const { t } = useTranslation();
  return (
    <div data-testid={`code-node-${node.id}`} style={{ width: WIDTH }}>
      <PuzzleShape tabs={["right"]} cutouts={["left"]} anchor={NODE_PORT_ANCHOR} isDark={isDark}>
        <NodeBody>
          {/* The shared header: its centre line is NODE_PORT_ANCHOR from the
              node's top, where the ports anchor. */}
          <NodeHeader
            src="code"
            tile={{ background: "#5b6475" }}
            title={node_display_title(node, safe_text(node.id))}
            titleStyle={{ fontFamily: "ui-monospace, Menlo, monospace" }}
            subtitle={t("agents.nodes.code.python")}
          />
        </NodeBody>
      </PuzzleShape>
    </div>
  );
}
