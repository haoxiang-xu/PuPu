import React from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function EndNode({ isDark }) {
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
                background: "linear-gradient(135deg, #e06a9a, #b64a78)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon
                src="stop_mini_filled"
                color="#fff"
                style={{ width: 18, height: 18 }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? "#f0f0f3" : "#1d1d22",
                }}
              >
                End
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: isDark ? "#a8a8b0" : "#6b6b73",
                  marginTop: 2,
                }}
              >
                exit
              </div>
            </div>
          </div>
        </div>
      </PuzzleShape>
    </div>
  );
}
