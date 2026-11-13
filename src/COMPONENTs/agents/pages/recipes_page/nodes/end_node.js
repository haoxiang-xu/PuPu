import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { node_display_title } from "../node_display_labels";
import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function EndNode({ node, isDark }) {
  const { t } = useTranslation();
  return (
    <div style={{ width: 130 }}>
      <PuzzleShape tabs={[]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "14px 18px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #f0635a, #d23f37)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                src="target"
                color="#fff"
                style={{ width: 16, height: 16 }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  color: "var(--pupu-text)",
                }}
              >
                {node_display_title(node, t("agents.nodes.end"))}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "var(--pupu-text-muted)",
                  marginTop: 2,
                }}
              >
                {t("agents.nodes.exit")}
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
