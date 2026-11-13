import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { PORT_ANCHOR_EDGE_INSET } from "../../../../../BUILTIN_COMPONENTs/flow_editor/utils";
import useNodeSizeMotion from "./use_node_size_motion";

/* Render a puzzle-piece shape: body with optional radial cutouts + round tabs.
 * Goo filter lives in FlowEditor (PuzzleDefs). This component renders
 * the visual; ports are positioned by FlowEditorNode separately.
 *
 * Every node's size change goes through here (`useNodeSizeMotion`): the
 * frame's height is sprung from the old natural height to the new one, and
 * the body, shadow, tabs, the FlowEditor wrapper, its ports and its edges all
 * read that one animated height. While it moves, a px-placed tab stays at
 * least PORT_ANCHOR_EDGE_INSET inside the body's bottom — the same clamp the
 * editor puts on the port dot and the edge end — so a new outlet's bump rides
 * the growing edge down to its row instead of floating below the body. */

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

/* A tab is a side name ("right", "top"…), placed at the shared port line, or
   `{ side, y }` with its own distance from the top in px — for a node with
   several outlets on one side (If/Else, Switch), one bump per outlet. */
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
  const { frameRef, contentRef, moving } = useNodeSizeMotion();
  const cfg = useContext(ConfigContext);
  const isDark =
    isDarkOverride !== undefined
      ? isDarkOverride
      : cfg?.onThemeMode === "dark_mode";

  const body_bg = `var(--pupu-surface, ${isDark ? "#1f1f1f" : "#ffffff"})`;
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
        {tabs.map((tab, index) => {
          const side = tab && typeof tab === "object" ? tab.side : tab;
          const tab_y = tab && typeof tab === "object" && Number.isFinite(tab.y) ? `${tab.y}px` : side_y;
          const clamped = moving && tab_y.endsWith("px");
          const g = TAB_GEOM[side];
          if (!g) return null;
          const pos = {};
          if (side === "right") {
            pos.right = g.offset;
            pos.top = clamped ? `min(${tab_y}, calc(100% - ${PORT_ANCHOR_EDGE_INSET}px))` : tab_y;
          } else if (side === "left") {
            pos.left = g.offset;
            pos.top = clamped ? `min(${tab_y}, calc(100% - ${PORT_ANCHOR_EDGE_INSET}px))` : tab_y;
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
              data-tab-y={tab_y}
              data-tab-clamped={clamped && (side === "left" || side === "right") ? "true" : undefined}
              key={`${side}:${tab_y}:${index}`}
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
      {/* The frame's height is the node's height (set by the motion hook, in
          px, never by React); the content inside keeps its natural height.
          While growing, the content's new bottom is clipped at the frame's —
          only the bottom: tabs, popovers and focus rings stay free sideways. */}
      <div
        ref={frameRef}
        data-puzzle-frame=""
        style={{
          position: "relative",
          zIndex: 2,
          clipPath: moving ? "inset(-64px -64px 0 -64px)" : undefined,
        }}
      >
        {/* Its own formatting context, so its height includes its children's
            margins — the frame is pinned to exactly this. */}
        <div ref={contentRef} data-puzzle-content="" style={{ display: "flow-root" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
