import React, { useState, useRef, useEffect } from "react";
import { DEFAULT_PORTS } from "./utils";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Flow Editor Node                                                       */
/*                                                                         */
/*  Renders a single draggable node with configurable ports on all four    */
/*  sides. Ports support connection-drawing via mousedown / mouseup.       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PORT_SIZE = 10;
const PORT_HALF = PORT_SIZE / 2;

const DOT_COLORS = {
  in: "#8a5cf6",
  out: "#f6a341",
  attach: "#5a5dd6",
};

/* ── Port sub-component with React-managed hover state ──── */
const Port = React.memo(function Port({
  port,
  side,
  index,
  total,
  theme,
  node_id,
  is_connected,
  interactive,
  on_port_mouse_down,
}) {
  const [port_hovered, set_port_hovered] = useState(false);
  const fraction = (index + 1) / (total + 1);
  const shape = theme.portShape;
  const is_bar = shape === "bar";
  const is_puzzle = shape === "puzzle";
  const kind = port.kind;

  const pos_style = { position: "absolute" };
  let base_transform = "";

  let port_w;
  let port_h;
  let offset;
  if (is_bar) {
    const long = is_connected ? 22 : 16;
    const short = 3;
    if (side === "top" || side === "bottom") {
      port_w = long;
      port_h = short;
    } else {
      port_w = short;
      port_h = long;
    }
    offset = -1.5;
  } else if (is_puzzle) {
    port_w = 8;
    port_h = 8;
    offset = -4;
  } else {
    port_w = PORT_SIZE;
    port_h = PORT_SIZE;
    offset = -PORT_HALF;
  }

  switch (side) {
    case "top":
      pos_style.left = `${fraction * 100}%`;
      pos_style.top = offset;
      base_transform = "translateX(-50%)";
      break;
    case "bottom":
      pos_style.left = `${fraction * 100}%`;
      pos_style.bottom = offset;
      base_transform = "translateX(-50%)";
      break;
    case "left":
      pos_style.top = `${fraction * 100}%`;
      pos_style.left = offset;
      base_transform = "translateY(-50%)";
      break;
    case "right":
      pos_style.top = `${fraction * 100}%`;
      pos_style.right = offset;
      base_transform = "translateY(-50%)";
      break;
    default:
      break;
  }

  const show_port = interactive || is_connected || port_hovered;
  const highlighted = port_hovered || is_connected;
  const puzzle_color = DOT_COLORS[kind] || theme.portHoverColor;
  const bg = is_puzzle
    ? highlighted
      ? puzzle_color
      : theme.portColor
    : highlighted
      ? theme.portHoverColor
      : theme.portColor;
  const opacity = is_connected && !interactive && !port_hovered ? 0.65 : show_port ? 1 : 0;

  let transform = base_transform;
  let box_shadow = "none";
  if (port_hovered && !is_bar) {
    transform = `${base_transform} scale(1.6)`;
    box_shadow = is_puzzle
      ? `0 0 0 5px ${puzzle_color}33`
      : `0 0 8px ${theme.portHoverColor}`;
  }

  const hit_pad = 10;

  return (
    <div
      data-port-id={port.id}
      data-port-side={side}
      data-port-kind={kind || ""}
      data-node-id={node_id}
      style={{
        ...pos_style,
        width: port_w,
        height: port_h,
        borderRadius: is_bar ? 999 : "50%",
        backgroundColor: bg,
        transform,
        boxShadow: box_shadow,
        cursor: "crosshair",
        zIndex: 10,
        opacity,
        pointerEvents: show_port ? "auto" : "none",
        transition:
          "transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.18s ease, width 0.15s ease, height 0.15s ease",
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        on_port_mouse_down(node_id, port.id, side, e);
      }}
      onMouseEnter={() => set_port_hovered(true)}
      onMouseLeave={() => set_port_hovered(false)}
    >
      {/* Invisible hit expander — forwards port identity for elementFromPoint hit-testing */}
      <div
        data-port-id={port.id}
        data-port-side={side}
        data-port-kind={kind || ""}
        data-node-id={node_id}
        style={{
          position: "absolute",
          inset: -hit_pad,
          pointerEvents: show_port ? "auto" : "none",
          background: "transparent",
        }}
      />
    </div>
  );
});

const FlowEditorNode = React.memo(function FlowEditorNode({
  node,
  theme,
  selected,
  render_node,
  on_node_mouse_down,
  on_port_mouse_down,
  register_element,
  register_dimensions,
  connected_port_ids,
  is_connecting,
}) {
  const node_ref = useRef(null);
  const [hovered, setHovered] = useState(false);
  const ports = node.ports || DEFAULT_PORTS;

  /* ── Register DOM element ref with parent ────────────────── */
  useEffect(() => {
    if (node_ref.current) register_element(node.id, node_ref.current);
    return () => register_element(node.id, null);
  }, [node.id, register_element]);

  /* ── Track dimensions via ResizeObserver ─────────────────── */
  useEffect(() => {
    const el = node_ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      register_dimensions(node.id, {
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [node.id, register_dimensions]);

  /* ── Group ports by side ─────────────────────────────────── */
  const ports_by_side = {};
  ports.forEach((p) => {
    if (!ports_by_side[p.side]) ports_by_side[p.side] = [];
    ports_by_side[p.side].push(p);
  });

  const interactive = hovered || is_connecting || selected;

  /* ── Node wrapper style ──────────────────────────────────── */
  const node_style = {
    position: "absolute",
    left: node.x,
    top: node.y,
    minWidth: 80,
    minHeight: 40,
    backgroundColor: theme.nodeBackground,
    border: "none",
    borderRadius: 12,
    boxShadow: selected
      ? `0 0 0 2px ${theme.nodeSelectedBorder}, ${theme.nodeShadowHover || theme.nodeShadow}`
      : hovered
        ? theme.nodeShadowHover || theme.nodeShadow
        : theme.nodeShadow,
    cursor: "grab",
    userSelect: "none",
    WebkitUserSelect: "none",
    willChange: "left, top",
    transition: "box-shadow 0.2s ease",
  };

  return (
    <div
      ref={node_ref}
      data-flow-node-id={node.id}
      style={node_style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        if (e.target.dataset && e.target.dataset.portId) return;
        e.stopPropagation();
        on_node_mouse_down(node.id, e);
      }}
    >
      {/* ── Ports ── */}
      {Object.entries(ports_by_side).map(([side, side_ports]) =>
        side_ports.map((port, idx) => (
          <Port
            key={port.id}
            port={port}
            side={side}
            index={idx}
            total={side_ports.length}
            theme={theme}
            node_id={node.id}
            is_connected={
              !!(connected_port_ids && connected_port_ids.has(port.id))
            }
            interactive={interactive}
            on_port_mouse_down={on_port_mouse_down}
          />
        )),
      )}

      {/* ── User content ── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        {render_node ? (
          render_node(node)
        ) : (
          <div
            style={{
              padding: "12px 16px",
              color: theme.fontColor,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontSize: 14,
            }}
          >
            {node.label || node.id}
          </div>
        )}
      </div>
    </div>
  );
});

export { FlowEditorNode as default, FlowEditorNode };
