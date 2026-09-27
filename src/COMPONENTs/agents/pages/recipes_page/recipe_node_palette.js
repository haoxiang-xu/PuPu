import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { Z } from "../../../../BUILTIN_COMPONENTs/layer/z_layers";
import {
  NODE_GROUPS,
  NODE_GROUP_LABELS,
  excluded_nodes,
  search_nodes,
} from "./recipe_node_catalog";
import { is_flow_step_type } from "./recipe_graph_edits";

/* The surface `Add node…` opens.
 *
 * Eleven node types will not fit inline — grouped, the Add section alone is
 * about 400px, most of the canvas in this modal, and it opens upward from a
 * right-click near the bottom. A palette keeps the menu at a glance, gives each
 * node a line saying what it is for, and is the same surface double-clicking
 * the canvas will use. It is also where the graph-kind rule stays legible: a
 * Workflow graph simply has a shorter list, and an empty search says why rather
 * than leaving a gap to notice. */

const PALETTE_W = 320;
const MAX_H = 360;

export default function RecipeNodePalette({
  visible,
  x,
  y,
  graphKind = "agent",
  /* True when the pick will be wired into the flow (insert after a node,
   * insert into a connection): only nodes with an in and an out port apply. */
  flowOnly = false,
  onPick,
  onClose,
  isDark,
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  const results = useMemo(() => {
    if (!visible) return [];
    const entries = search_nodes(query, graphKind);
    return flowOnly ? entries.filter((e) => is_flow_step_type(e.type)) : entries;
  }, [visible, query, graphKind, flowOnly]);
  const excluded = useMemo(
    () => (visible ? excluded_nodes(graphKind) : []),
    [visible, graphKind],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setActive(0);
      return;
    }
    inputRef.current?.focus();
  }, [visible]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        /* Stop before the Modal's window listener: Escape closes the palette,
         * not the whole Agents modal underneath it. */
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!results.length) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((i) => (i + step + results.length) % results.length);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const entry = results[active];
        if (entry) onPick?.(entry.type);
      }
    };
    const onMouseDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [visible, results, active, onPick, onClose]);

  if (!visible) return null;

  const text = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)";
  const muted = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";
  const hair = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const hover = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  const left = Math.min(x, window.innerWidth - PALETTE_W - 8);
  const top = Math.min(y, window.innerHeight - MAX_H - 8);

  const grouped = NODE_GROUPS.map((group) => ({
    group,
    entries: results.filter((entry) => entry.group === group),
  })).filter((g) => g.entries.length > 0);

  let index = -1;

  return createPortal(
    <div
      ref={panelRef}
      data-testid="recipe-node-palette"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        width: PALETTE_W,
        maxHeight: MAX_H,
        zIndex: Z.POPOVER,
        display: "flex",
        flexDirection: "column",
        backgroundColor: isDark
          ? "color-mix(in srgb, var(--pupu-surface, rgb(30, 30, 30)) 85%, transparent)"
          : "color-mix(in srgb, var(--pupu-surface, rgb(255, 255, 255)) 90%, transparent)",
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        border: `1px solid ${hair}`,
        borderRadius: 10,
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)"
          : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        overflow: "hidden",
        color: text,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: `1px solid ${hair}`,
          flexShrink: 0,
        }}
      >
        <Icon src="search" color={muted} style={{ width: 13, height: 13, flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes"
          aria-label="Search nodes"
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            color: text,
            fontSize: 12.5,
            fontFamily: "inherit",
          }}
        />
      </div>

      <div style={{ overflowY: "auto", padding: 4, flex: 1 }}>
        {grouped.length === 0 ? (
          <div style={{ padding: "14px 12px", fontSize: 11.5, lineHeight: 1.5, color: muted }}>
            {flowOnly ? (
              <>
                {query.trim()
                  ? `No node matches “${query}”. `
                  : ""}
                Only steps with an input and an output can be wired into the
                flow — attachments hang off a node instead.
              </>
            ) : excluded.length > 0 ? (
              <>
                No node matches “{query}”. This is a {graphKind} graph, so{" "}
                {excluded.map((e) => e.label).join(", ")}{" "}
                {excluded.length === 1 ? "is" : "are"} not offered here.
              </>
            ) : (
              <>No node matches “{query}”.</>
            )}
          </div>
        ) : (
          grouped.map(({ group, entries }) => (
            <div key={group}>
              <div
                style={{
                  padding: "7px 10px 3px",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: muted,
                }}
              >
                {NODE_GROUP_LABELS[group] || group}
              </div>
              {entries.map((entry) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={entry.type}
                    role="button"
                    tabIndex={-1}
                    data-testid={`palette-entry-${entry.type}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => onPick?.(entry.type)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      padding: "6px 10px",
                      borderRadius: 6,
                      cursor: "pointer",
                      backgroundColor: i === active ? hover : "transparent",
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        flexShrink: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(0,0,0,0.05)",
                      }}
                    >
                      <Icon src={entry.icon} color={text} style={{ width: 12, height: 12 }} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5 }}>{entry.label}</div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderTop: `1px solid ${hair}`,
          fontSize: 10.5,
          color: muted,
          flexShrink: 0,
        }}
      >
        <span>{flowOnly ? "Wired in where you right-clicked" : "Added where you right-clicked"}</span>
        <Icon
          src="corner_down_left"
          color={muted}
          style={{ width: 12, height: 12, marginLeft: "auto", flexShrink: 0 }}
        />
      </div>
    </div>,
    document.body,
  );
}
