import React, { useEffect, useRef, useState } from "react";
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

/* The title, as an in-place field while the node is being renamed: the same
   typeface, size, weight and line box as the title it replaces, no border and
   no fill (the caret marks it), so nothing on the node moves. The node keeps
   its width; a long name scrolls inside the field.

   It keeps every key and pointer gesture to itself — the canvas's Delete,
   Space-pan, undo and F2, the page's Escape, the node's drag and the canvas's
   double-click never see one. Enter or leaving the field commits, Escape
   cancels. A refused name stays in the field with the reason under it. */
function TitleField({ initial, style, problem, onCommit, onCancel }) {
  const [value, setValue] = useState(initial);
  const ref = useRef(null);
  /* Set once the field has answered (committed or cancelled), so the blur
     that follows its own unmount is not a second commit. */
  const settled = useRef(false);
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    input.select();
  }, []);
  const commit = (options) => {
    if (settled.current) return;
    settled.current = true;
    const result = onCommit(value, initial, options);
    if (result && result.ok === false) settled.current = false;
  };
  const keep = (event) => event.stopPropagation();
  return (
    <>
      <input
        ref={ref}
        data-node-title-field=""
        aria-label={initial}
        value={value}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit({ refocus: true });
          } else if (event.key === "Escape") {
            event.preventDefault();
            settled.current = true;
            onCancel({ refocus: true });
          }
        }}
        onKeyUp={keep}
        onBlur={() => commit({ refocus: false })}
        onMouseDown={keep}
        onClick={keep}
        onDoubleClick={keep}
        onContextMenu={keep}
        style={{
          ...style,
          display: "block",
          width: "100%",
          height: NODE_TITLE_LINE,
          boxSizing: "border-box",
          margin: 0,
          padding: 0,
          border: "none",
          outline: "none",
          background: "transparent",
          font: "inherit",
          fontSize: NODE_TITLE_SIZE,
          fontWeight: 600,
          lineHeight: `${NODE_TITLE_LINE}px`,
          fontFamily: style.fontFamily || "inherit",
          color: "var(--pupu-text)",
          cursor: "text",
          userSelect: "text",
          WebkitUserSelect: "text",
        }}
      />
      {problem ? (
        <div
          role="alert"
          data-node-title-problem=""
          style={{
            /* In the body's bottom padding, out of the flow: the node keeps
               its height (and so never plays its size motion). */
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            marginTop: 1,
            fontSize: NODE_SUBTITLE_SIZE,
            lineHeight: "13px",
            color: "var(--pupu-danger)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {problem}
        </div>
      ) : null}
    </>
  );
}

/* The header every node type shares: a 28px icon tile, a title and a
   subtitle, each on one line, in a block of fixed height so the title sits at
   the same y on every node. `src` is the tile's glyph and `tile` its colour
   (`{ background }`);
   `titleStyle` changes only the title's typeface.

   The title is the author's name for the node; the subtitle is our name for
   its type and what it holds (`node_caption`). `rename`, given only by a
   canvas that may rename this node, makes the title editable in place:
   double-click it (or the canvas's Rename) and it becomes a field. */
export default function NodeHeader({
  src,
  tile,
  title,
  titleStyle,
  subtitle,
  subtitleProps,
  testid,
  rename,
}) {
  const editing = !!(rename && rename.editing);
  const title_style = {
    fontSize: NODE_TITLE_SIZE,
    fontWeight: 600,
    lineHeight: `${NODE_TITLE_LINE}px`,
    color: "var(--pupu-text)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ...titleStyle,
  };
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
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {editing ? (
          <TitleField
            initial={typeof title === "string" ? title : ""}
            style={titleStyle || {}}
            problem={rename.problem}
            onCommit={rename.commit}
            onCancel={rename.cancel}
          />
        ) : (
          <div
            data-node-title=""
            style={title_style}
            onDoubleClick={rename && rename.enabled ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              rename.begin();
            } : undefined}
          >
            {title}
          </div>
        )}
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
