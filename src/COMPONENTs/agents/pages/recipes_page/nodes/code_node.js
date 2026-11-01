import React, { useEffect, useRef, useState } from "react";
import PuzzleShape from "./puzzle_shape";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Tooltip from "../../../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import Code from "../../../../../BUILTIN_COMPONENTs/code/code";
import { safe_text } from "../document_values";
import { code_settings, code_source_text } from "../code_config";
import { CODE_PORT_ANCHOR } from "../skeleton_node_catalog";

/* A Code node on the canvas (#357): recognise it, do not read it.
 *
 * Shape C of the design canvas ("Chosen: C, with an expand button"): the
 * header, then the first three lines of the code and a `+N lines` count, at a
 * FIXED height so editing never moves the graph, clipped on the right rather
 * than wrapped. An expand button sits in the block's top-right corner and
 * appears on node hover; hovering the button opens a read-only viewer through
 * the Tooltip popover engine — never a modal, never the node growing in place
 * — and the viewer hands editing back to the panel.
 *
 * The engine is asked for hover alone. A click pins the viewer, Escape and a
 * press elsewhere close it, and those are kept here: the engine in controlled
 * mode does not report a hover once click is also enabled, which left the
 * viewer opening only on click in the packaged App (#357 run 41273700851).
 * Escape is taken only while the viewer is open, and stops there, because the
 * Agents modal also closes on Escape and the viewer is the layer on top.
 *
 * Two rules the hover has to get right. A node drag starts with the pointer
 * on the node, so a press anywhere on it closes the viewer and keeps it shut
 * until the button is released, or panning a graph flashes code panels. And
 * below half zoom nothing in the block is readable and a 10px target is not
 * hoverable, so block and button go away and the node falls back to its
 * header; the canvas says what the zoom is.
 *
 * The code itself comes from one reader, `code_source_text`. Text written in
 * the panel is kept by the host and handed to the session with the graph
 * (#357 G1), so the block and the viewer show it exactly as stored. A
 * workspace file is read by the run when it gets there, so for one the node
 * shows the path instead; and host-kept text that is not on hand is said to
 * be missing, never drawn as an empty program. */

export const CODE_PREVIEW_LINES = 3;
export const CODE_LOW_ZOOM = 0.5;
const WIDTH = 230;
const LINE_HEIGHT = 15;
/* Three lines, the count row, and the block's padding: the same height
   whether the code has one line or a thousand. */
const BLOCK_HEIGHT = LINE_HEIGHT * (CODE_PREVIEW_LINES + 1) + 12;

export function code_preview(text) {
  const lines = typeof text === "string" ? text.replace(/\r\n?/g, "\n").split("\n") : [];
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return {
    lines: lines.slice(0, CODE_PREVIEW_LINES),
    more: Math.max(0, lines.length - CODE_PREVIEW_LINES),
    total: lines.length,
  };
}

function Viewer({ node, text, total, isDark, onEdit }) {
  return (
    <div
      data-testid={`code-node-${node.id}-viewer`}
      data-code-viewer={node.id}
      style={{
        width: 440,
        maxHeight: 360,
        display: "flex",
        flexDirection: "column",
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--pupu-surface)",
        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)" }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: isDark ? "#e6e6e6" : "#222", fontFamily: "ui-monospace, Menlo, monospace" }}>{safe_text(node.id)}</span>
        <span style={{ fontSize: 10.5, color: "var(--pupu-text-muted)" }}>Read-only · {total} line{total === 1 ? "" : "s"} · Esc to close</span>
        <span style={{ marginLeft: "auto" }}>
          <Button
            label="Edit in panel"
            onClick={onEdit}
            style={{ fontSize: 10.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, color: "var(--pupu-accent)" }}
          />
        </span>
      </div>
      <div className="scrollable" style={{ overflow: "auto", minHeight: 0 }}>
        <Code code={text} language="python" showCopy={false} style={{ margin: 0, fontSize: 11 }} />
      </div>
    </div>
  );
}

export default function CodeNode({ node, isDark, lowZoom = false, onOpenNode, sources }) {
  const code = code_settings(node);
  const profile = code && typeof code.environment_profile_id === "string" && code.environment_profile_id ? code.environment_profile_id : null;
  const source = code_source_text(node, sources);
  const preview = source.available ? code_preview(source.text) : null;
  const muted = isDark ? "#a8a8b0" : "#6b6b73";
  const text = isDark ? "#f0f0f3" : "#1d1d22";
  const [hovered, setHovered] = useState(false);
  /* Two reasons to show it: the pointer is on the button or the viewer, or a
     click pinned it there. */
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  /* Closed by Escape or a press while the pointer is still on the button: the
     engine goes on reporting that hover, so it is not taken again until the
     pointer has left the button. */
  const [dismissed, setDismissed] = useState(false);
  const close = () => {
    setHoverOpen(false);
    setPinned(false);
  };
  /* A press on the node starts a drag; the viewer closes and stays closed
     until the button is released anywhere. */
  const [suppressed, setSuppressed] = useState(false);
  useEffect(() => {
    if (!suppressed) return undefined;
    const release = () => setSuppressed(false);
    window.addEventListener("mouseup", release);
    return () => window.removeEventListener("mouseup", release);
  }, [suppressed]);

  const showBlock = Boolean(preview) && !lowZoom;
  const viewerOpen = (hoverOpen || pinned) && !suppressed && showBlock;

  const expandRef = useRef(null);
  useEffect(() => {
    if (!viewerOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setHoverOpen(false);
      setPinned(false);
      setDismissed(true);
      event.preventDefault();
      event.stopPropagation();
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [viewerOpen]);
  useEffect(() => {
    if (!pinned) return undefined;
    /* Capture, as the engine does for its own click mode: a press anywhere
       but the button or the viewer unpins it. */
    const onPress = (event) => {
      const target = event.target;
      if (expandRef.current && expandRef.current.contains(target)) return;
      if (target && target.closest && target.closest(`[data-code-viewer="${node.id}"]`)) return;
      setPinned(false);
    };
    window.document.addEventListener("mousedown", onPress, true);
    return () => window.document.removeEventListener("mousedown", onPress, true);
  }, [pinned, node.id]);

  return (
    <div
      data-testid={`code-node-${node.id}`}
      data-viewer-open={viewerOpen ? "true" : "false"}
      style={{ width: WIDTH }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDownCapture={(event) => {
        if (event.target.closest && event.target.closest("[data-code-expand]")) return;
        setSuppressed(true);
        setDismissed(true);
        close();
      }}
    >
      <PuzzleShape tabs={["right"]} cutouts={["left"]} isDark={isDark}>
        <div style={{ padding: "13px 16px 12px" }}>
          {/* The header is CODE_PORT_ANCHOR tall to its centre line: 13px of
              padding above a 28px glyph. The ports anchor there. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 2 * (CODE_PORT_ANCHOR - 13) }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 9,
                background: "linear-gradient(135deg, #949cad, #5b6475)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon src="code" color="#fff" style={{ width: 16, height: 16 }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, Menlo, monospace" }}>
                {safe_text(node.id)}
              </div>
              <div style={{ fontSize: 10.5, color: muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {profile ? `Code · ${safe_text(profile)}` : "Code · choose a runtime"}
              </div>
            </div>
          </div>

          {showBlock && (
            <div
              data-testid={`code-node-${node.id}-block`}
              style={{
                position: "relative",
                marginTop: 8,
                height: BLOCK_HEIGHT,
                boxSizing: "border-box",
                padding: "6px 8px",
                borderRadius: 6,
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 10.5,
                lineHeight: `${LINE_HEIGHT}px`,
                color: text,
                overflow: "hidden",
                whiteSpace: "pre",
              }}
            >
              {preview.lines.map((line, index) => (
                <div key={index} style={{ overflow: "hidden", whiteSpace: "pre", textOverflow: "clip" }}>{line === "" ? " " : line}</div>
              ))}
              <div style={{ color: muted }}>{preview.more > 0 ? `+${preview.more} line${preview.more === 1 ? "" : "s"}` : `${preview.total} line${preview.total === 1 ? "" : "s"}`}</div>
              <span
                ref={expandRef}
                data-code-expand="true"
                data-testid={`code-node-${node.id}-expand`}
                style={{ position: "absolute", top: 4, right: 4, opacity: hovered || viewerOpen ? 1 : 0, transition: "opacity 0.15s ease", pointerEvents: hovered || viewerOpen ? "auto" : "none" }}
                onMouseDown={(event) => event.stopPropagation()}
                onMouseLeave={() => setDismissed(false)}
              >
                <Tooltip
                  layer="popover"
                  trigger={["hover"]}
                  open={viewerOpen}
                  /* While a press is held the engine's hover still reports,
                     and is ignored: the viewer stays shut until the button is
                     released and the pointer comes back. */
                  on_open_change={(next) => {
                    if (next && (suppressed || dismissed)) return;
                    setHoverOpen(Boolean(next));
                  }}
                  open_delay={80}
                  close_delay={80}
                  position="right"
                  align="start"
                  offset={8}
                  show_arrow={false}
                  style={{ padding: 0, backgroundColor: "transparent", boxShadow: "none" }}
                  tooltip_component={
                    <Viewer
                      node={node}
                      text={source.text}
                      total={preview.total}
                      isDark={isDark}
                      onEdit={() => {
                        close();
                        if (typeof onOpenNode === "function") onOpenNode(node.id);
                      }}
                    />
                  }
                >
                  <Button
                    prefix_icon="fullscreen"
                    ariaLabel={`View the code of ${node.id}`}
                    onClick={() => {
                      if (suppressed) return;
                      setPinned((was) => !was);
                    }}
                    style={{ paddingVertical: 2, paddingHorizontal: 2, borderRadius: 4, content: { icon: { width: 11, height: 11 } } }}
                  />
                </Tooltip>
              </span>
            </div>
          )}

          {!showBlock && !lowZoom && (
            <div
              data-testid={`code-node-${node.id}-source`}
              style={{ marginTop: 8, paddingTop: 6, borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`, fontSize: 10.5, color: muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {source.managed ? (
                <span data-testid={`code-node-${node.id}-text-missing`}>Code text not loaded · reopen this Agent</span>
              ) : source.path ? (
                <>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: text }}>{safe_text(source.path)}</span>
                  {" · read when the run gets here"}
                </>
              ) : (
                "No source file yet"
              )}
            </div>
          )}
        </div>
      </PuzzleShape>
    </div>
  );
}
