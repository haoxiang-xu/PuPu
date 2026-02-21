import React, { useState, useRef, useEffect, useCallback } from "react";
import { DEFAULT_PORTS } from "./utils";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Flow Editor Node                                                       */
/*                                                                         */
/*  Renders a single draggable node with configurable ports on all four    */
/*  sides. Ports support connection-drawing via mousedown / mouseup.       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PORT_SIZE = 10;
const PORT_HALF = PORT_SIZE / 2;

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

  /* ── Port hover handlers ─────────────────────────────────── */
  const handle_port_enter = useCallback(
    (e, base_transform) => {
      const el = e.currentTarget;
      el.style.backgroundColor = theme.portHoverColor;
      el.style.boxShadow = `0 0 8px ${theme.portHoverColor}`;
      el.style.transform = (base_transform || "") + " scale(1.6)";
    },
    [theme.portHoverColor],
  );

  const handle_port_leave = useCallback(
    (e, base_transform) => {
      const el = e.currentTarget;
      el.style.backgroundColor = theme.portColor;
      el.style.boxShadow = "none";
      el.style.transform = base_transform || "";
    },
    [theme.portColor],
  );

  /* ── Render a single port circle ─────────────────────────── */
  const render_port = (port, side, index, total) => {
    const fraction = (index + 1) / (total + 1);
    const pos_style = { position: "absolute" };
    let base_transform = "";

    switch (side) {
      case "top":
        pos_style.left = `${fraction * 100}%`;
        pos_style.top = -PORT_HALF;
        base_transform = "translateX(-50%)";
        break;
      case "bottom":
        pos_style.left = `${fraction * 100}%`;
        pos_style.bottom = -PORT_HALF;
        base_transform = "translateX(-50%)";
        break;
      case "left":
        pos_style.top = `${fraction * 100}%`;
        pos_style.left = -PORT_HALF;
        base_transform = "translateY(-50%)";
        break;
      case "right":
        pos_style.top = `${fraction * 100}%`;
        pos_style.right = -PORT_HALF;
        base_transform = "translateY(-50%)";
        break;
      default:
        break;
    }

    const show_port = hovered || is_connecting || selected;

    return (
      <div
        key={port.id}
        data-port-id={port.id}
        data-port-side={side}
        data-node-id={node.id}
        style={{
          ...pos_style,
          width: PORT_SIZE,
          height: PORT_SIZE,
          borderRadius: "50%",
          backgroundColor: theme.portColor,
          transform: base_transform,
          cursor: "crosshair",
          zIndex: 10,
          opacity: show_port ? 1 : 0,
          pointerEvents: show_port ? "auto" : "none",
          transition:
            "transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, opacity 0.18s ease",
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          on_port_mouse_down(node.id, port.id, side, e);
        }}
        onMouseEnter={(e) => handle_port_enter(e, base_transform)}
        onMouseLeave={(e) => handle_port_leave(e, base_transform)}
      />
    );
  };

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
        side_ports.map((port, idx) =>
          render_port(port, side, idx, side_ports.length),
        ),
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
              fontFamily: "Jost, sans-serif",
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
