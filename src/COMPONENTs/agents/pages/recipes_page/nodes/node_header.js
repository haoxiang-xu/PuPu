import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import {
  NODE_HEADER_GAP,
  NODE_HEADER_HEIGHT,
  NODE_ICON_GLYPH,
  NODE_ICON_RADIUS,
  NODE_ICON_SIZE,
  NODE_MIN_HEIGHT,
  NODE_PADDING_X,
  NODE_PADDING_Y,
  NODE_SUBTITLE_GAP,
  NODE_SUBTITLE_LINE,
  NODE_SUBTITLE_SIZE,
  NODE_TITLE_LINE,
  NODE_TITLE_SIZE,
} from "./node_metrics";

/* The padded body every node draws its content in: never shorter than
   NODE_MIN_HEIGHT, growing with whatever sits below the header. */
export function NodeBody({ children, style }) {
  return (
    <div
      style={{
        padding: `${NODE_PADDING_Y}px ${NODE_PADDING_X}px`,
        minHeight: NODE_MIN_HEIGHT,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* The header every node type shares: a 28px icon tile, a title and a
   subtitle, each on one line, in a block of fixed height so the title sits at
   the same y on every node. `src` is the tile's glyph and `tile` its colour
   (`{ background }`); `glyph` replaces the tile (an Agent's own avatar);
   `titleStyle` changes only the title's typeface. */
export default function NodeHeader({
  src,
  tile,
  glyph,
  title,
  titleStyle,
  subtitle,
  subtitleProps,
  testid,
}) {
  return (
    <div
      data-node-header=""
      data-testid={testid}
      style={{
        display: "flex",
        alignItems: "center",
        gap: NODE_HEADER_GAP,
        height: NODE_HEADER_HEIGHT,
      }}
    >
      {glyph || (
        <div
          style={{
            width: NODE_ICON_SIZE,
            height: NODE_ICON_SIZE,
            borderRadius: NODE_ICON_RADIUS,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            ...tile,
          }}
        >
          <Icon src={src} color="#fff" style={{ width: NODE_ICON_GLYPH, height: NODE_ICON_GLYPH }} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: NODE_TITLE_SIZE,
            fontWeight: 600,
            lineHeight: `${NODE_TITLE_LINE}px`,
            color: "var(--pupu-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            ...titleStyle,
          }}
        >
          {title}
        </div>
        <div
          {...subtitleProps}
          style={{
            fontSize: NODE_SUBTITLE_SIZE,
            lineHeight: `${NODE_SUBTITLE_LINE}px`,
            marginTop: NODE_SUBTITLE_GAP,
            color: "var(--pupu-text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}
