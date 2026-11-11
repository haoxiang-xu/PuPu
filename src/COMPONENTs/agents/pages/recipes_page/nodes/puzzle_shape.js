import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";

/* Render a puzzle-piece shape: body with optional radial cutouts + round tabs.
 * Goo filter lives in FlowEditor (PuzzleDefs). This component renders
 * the visual; ports are positioned by FlowEditorNode separately. */

const TAB_GEOM = {
  right: { size: 22, offset: -9, transform: "translateY(-50%)" },
  left: { size: 22, offset: -9, transform: "translateY(-50%)" },
  top: { size: 18, offset: -7, transform: "translateX(-50%)" },
  bottom: { size: 18, offset: -7, transform: "translateX(-50%)" },
};

/* `y` is where a left/right cutout centres: "50%" by default, or the
   node's port anchor in px so the notch sits under the in port. */
const CUTOUT_GEOM = {
  left: (y) => `radial-gradient(circle 12px at 0%   ${y},  transparent 98%, black 99%)`,
  right: (y) => `radial-gradient(circle 12px at 100% ${y},  transparent 98%, black 99%)`,
  top: () => "radial-gradient(circle 10px at 50% 0%,    transparent 98%, black 99%)",
  bottom: () => "radial-gradient(circle 10px at 50% 100%,  transparent 98%, black 99%)",
};

export default function PuzzleShape({
  tabs = [],
  cutouts = [],
  children,
  isDark: isDarkOverride,
  /* Pixel distance from the node's top to its in/out ports. A node that
     anchors its ports (FlowEditor `port.anchor`) passes the same value so the
     left notch and right bump sit on the ports instead of the node's middle. */
  anchor,
}) {
  const cfg = useContext(ConfigContext);
  const isDark =
    isDarkOverride !== undefined
      ? isDarkOverride
      : cfg?.onThemeMode === "dark_mode";

  const body_bg = isDark ? "#1f1f1f" : "#ffffff";
  const shadow = isDark
    ? "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5)) drop-shadow(0 4px 12px rgba(0,0,0,0.45))"
    : "drop-shadow(0 1px 1.5px rgba(15,18,38,0.08)) drop-shadow(0 4px 12px rgba(15,18,38,0.08))";

  const side_y = Number.isFinite(anchor) ? `${anchor}px` : "50%";
  const cutouts_value = cutouts.length
    ? cutouts
        .map((c) => (CUTOUT_GEOM[c] ? CUTOUT_GEOM[c](side_y) : null))
        .filter(Boolean)
        .join(", ")
    : "none";

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        data-puzzle-shape=""
        style={{
          position: "absolute",
          inset: 0,
          filter: `url(#flow-editor-goo) ${shadow}`,
        }}
      >
        <div
          data-puzzle-body=""
          data-side-y={side_y}
          style={{
            position: "absolute",
            inset: 0,
            background: body_bg,
            borderRadius: 16,
            WebkitMaskImage: cutouts_value,
            maskImage: cutouts_value,
            WebkitMaskComposite: "source-in",
            maskComposite: "intersect",
          }}
        />
        {tabs.map((side) => {
          const g = TAB_GEOM[side];
          if (!g) return null;
          const pos = {};
          if (side === "right") {
            pos.right = g.offset;
            pos.top = side_y;
          } else if (side === "left") {
            pos.left = g.offset;
            pos.top = side_y;
          } else if (side === "top") {
            pos.top = g.offset;
            pos.left = "50%";
          } else if (side === "bottom") {
            pos.bottom = g.offset;
            pos.left = "50%";
          }
          return (
            <div
              data-puzzle-tab=""
              data-tab-side={side}
              key={side}
              style={{
                position: "absolute",
                ...pos,
                width: g.size,
                height: g.size,
                borderRadius: "50%",
                background: body_bg,
                transform: g.transform,
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}
