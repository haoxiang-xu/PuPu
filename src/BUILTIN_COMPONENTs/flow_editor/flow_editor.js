import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useContext,
} from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Internal components } --------------------------------------------------------------------------------------------------- */
import { FlowEditorNode } from "./node";
/* { Internal components } --------------------------------------------------------------------------------------------------- */

/* { Utilities } ------------------------------------------------------------------------------------------------------------- */
import {
  calculate_bezier_path,
  get_port_position,
  get_bezier_midpoint,
  opposite_side,
} from "./utils";
/* { Utilities } ------------------------------------------------------------------------------------------------------------- */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Flow Editor                                                            */
/*                                                                         */
/*  A minimal, Figma-like node canvas with:                                */
/*    • Infinite pan  (left-drag background / middle-click / Space)        */
/*    • Zoom to cursor  (scroll wheel)                                     */
/*    • Silky-smooth node dragging  (direct DOM during drag)               */
/*    • Ports on all four sides with drag-to-connect                       */
/*    • Smart bézier edge routing                                          */
/*    • Edge midpoint "+" button to insert nodes                           */
/*    • Figma-style snap alignment guides                                  */
/*    • User-defined node content via `render_node`                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SNAP_THRESHOLD = 5;

const DEFAULT_THEME = {
  canvasBackground: "#f5f5f5",
  gridColor: "rgba(0, 0, 0, 0.05)",
  nodeBackground: "#ffffff",
  nodeBorder: "rgba(0, 0, 0, 0.12)",
  nodeShadow: "0 1px 8px rgba(0, 0, 0, 0.08)",
  nodeShadowHover: "0 4px 20px rgba(0, 0, 0, 0.13)",
  nodeSelectedBorder: "#2563eb",
  portColor: "#C8C8C8",
  portHoverColor: "#2563eb",
  edgeColor: "rgba(0, 0, 0, 0.18)",
  edgeActiveColor: "#2563eb",
  edgeWidth: 2,
  fontColor: "rgba(0, 0, 0, 0.8)",
  edgeAddBtnBg: "#ffffff",
  edgeAddBtnBorder: "rgba(0, 0, 0, 0.12)",
  edgeAddBtnColor: "rgba(0, 0, 0, 0.35)",
  edgeAddBtnHoverColor: "#2563eb",
  edgeAddBtnShadow: "drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))",
  snapGuideColor: "rgba(37, 99, 235, 0.45)",
};

/* ═══════════════════════════════════════════════════════════════════════ */
/*  Component                                                             */
/* ═══════════════════════════════════════════════════════════════════════ */

function FlowEditor({
  style,
  nodes = [],
  edges = [],
  on_nodes_change,
  on_edges_change,
  on_connect,
  on_edge_add_node,
  on_select,
  render_node,
  grid_size = 20,
  min_zoom = 0.1,
  max_zoom = 3,
  ...props
}) {
  const { theme: config_theme } = useContext(ConfigContext);

  /* ── Theme (merge defaults + user theme) ────────────────── */
  const theme = useMemo(
    () => ({ ...DEFAULT_THEME, ...(config_theme?.flow_editor || {}) }),
    [config_theme],
  );

  /* ── React state ────────────────────────────────────────── */
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [selected_node_ids, setSelectedNodeIds] = useState([]);
  const [selected_edge_id, setSelectedEdgeId] = useState(null);
  const [is_connecting, setIsConnecting] = useState(false);
  const [dims_version, set_dims_version] = useState(0);
  const [snap_guides, setSnapGuides] = useState([]);
  const [hovered_edge_id, setHoveredEdgeId] = useState(null);

  /* ── Refs ────────────────────────────────────────────────── */
  const canvas_ref = useRef(null);
  const viewport_div_ref = useRef(null);
  const temp_edge_ref = useRef(null);
  const node_elements_ref = useRef({});
  const node_dimensions_ref = useRef({});
  const edge_elements_ref = useRef({});

  const nodes_ref = useRef(nodes);
  const edges_ref = useRef(edges);
  const viewport_ref = useRef(viewport);
  const selected_ref = useRef(selected_node_ids);
  const selected_edge_ref = useRef(selected_edge_id);

  const drag_ref = useRef(null);
  const pan_ref = useRef(null);
  const connecting_ref = useRef(null);
  const space_ref = useRef(false);
  const zoom_raf_ref = useRef(null);

  /* ── Keep refs in sync ──────────────────────────────────── */
  useEffect(() => {
    nodes_ref.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edges_ref.current = edges;
  }, [edges]);
  useEffect(() => {
    viewport_ref.current = viewport;
  }, [viewport]);
  useEffect(() => {
    selected_ref.current = selected_node_ids;
  }, [selected_node_ids]);
  useEffect(() => {
    selected_edge_ref.current = selected_edge_id;
  }, [selected_edge_id]);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Registration helpers                                      */
  /* ═══════════════════════════════════════════════════════════ */

  const register_element = useCallback((id, el) => {
    if (el) node_elements_ref.current[id] = el;
    else delete node_elements_ref.current[id];
  }, []);

  const register_dimensions = useCallback((id, dims) => {
    const prev = node_dimensions_ref.current[id];
    node_dimensions_ref.current[id] = dims;
    if (!prev || prev.width !== dims.width || prev.height !== dims.height) {
      set_dims_version((v) => v + 1);
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Snap alignment  (Figma-style)                             */
  /*                                                            */
  /*  Compares dragged node's 6 anchor values (top, centerY,   */
  /*  bottom, left, centerX, right) against the same anchors   */
  /*  of every other node. Snaps within SNAP_THRESHOLD and     */
  /*  renders dashed guide lines.                               */
  /* ═══════════════════════════════════════════════════════════ */

  const compute_snap = useCallback((drag_id, raw_x, raw_y) => {
    const dims = node_dimensions_ref.current;
    const dd = dims[drag_id] || { width: 120, height: 60 };
    const others = nodes_ref.current.filter((n) => n.id !== drag_id);

    let snapped_x = raw_x;
    let snapped_y = raw_y;
    let best_dx = SNAP_THRESHOLD + 1;
    let best_dy = SNAP_THRESHOLD + 1;
    const guides = [];

    const d_anchors_x = [raw_x, raw_x + dd.width / 2, raw_x + dd.width];
    const d_anchors_y = [raw_y, raw_y + dd.height / 2, raw_y + dd.height];

    for (const other of others) {
      const od = dims[other.id] || { width: 120, height: 60 };
      const o_anchors_x = [other.x, other.x + od.width / 2, other.x + od.width];
      const o_anchors_y = [
        other.y,
        other.y + od.height / 2,
        other.y + od.height,
      ];

      for (let di = 0; di < 3; di++) {
        for (let oi = 0; oi < 3; oi++) {
          const dist_x = Math.abs(d_anchors_x[di] - o_anchors_x[oi]);
          if (dist_x < best_dx) {
            best_dx = dist_x;
            snapped_x =
              o_anchors_x[oi] -
              (di === 0 ? 0 : di === 1 ? dd.width / 2 : dd.width);
          }
          const dist_y = Math.abs(d_anchors_y[di] - o_anchors_y[oi]);
          if (dist_y < best_dy) {
            best_dy = dist_y;
            snapped_y =
              o_anchors_y[oi] -
              (di === 0 ? 0 : di === 1 ? dd.height / 2 : dd.height);
          }
        }
      }
    }

    if (best_dx > SNAP_THRESHOLD) snapped_x = raw_x;
    if (best_dy > SNAP_THRESHOLD) snapped_y = raw_y;

    /* Build guide lines */
    if (best_dx <= SNAP_THRESHOLD) {
      const s_anchors = [
        snapped_x,
        snapped_x + dd.width / 2,
        snapped_x + dd.width,
      ];
      for (const other of others) {
        const od = dims[other.id] || { width: 120, height: 60 };
        const o_ax = [other.x, other.x + od.width / 2, other.x + od.width];
        for (const sv of s_anchors) {
          for (const ov of o_ax) {
            if (Math.abs(sv - ov) <= 0.5) {
              guides.push({
                axis: "x",
                pos: ov,
                from: Math.min(snapped_y, other.y) - 20,
                to: Math.max(snapped_y + dd.height, other.y + od.height) + 20,
              });
            }
          }
        }
      }
    }
    if (best_dy <= SNAP_THRESHOLD) {
      const s_anchors = [
        snapped_y,
        snapped_y + dd.height / 2,
        snapped_y + dd.height,
      ];
      for (const other of others) {
        const od = dims[other.id] || { width: 120, height: 60 };
        const o_ay = [other.y, other.y + od.height / 2, other.y + od.height];
        for (const sv of s_anchors) {
          for (const ov of o_ay) {
            if (Math.abs(sv - ov) <= 0.5) {
              guides.push({
                axis: "y",
                pos: ov,
                from: Math.min(snapped_x, other.x) - 20,
                to: Math.max(snapped_x + dd.width, other.x + od.width) + 20,
              });
            }
          }
        }
      }
    }

    return { x: snapped_x, y: snapped_y, guides };
  }, []);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Edge helpers                                              */
  /* ═══════════════════════════════════════════════════════════ */

  const update_edges_for_node = useCallback((node_id, new_x, new_y) => {
    edges_ref.current.forEach((edge) => {
      if (edge.source_node_id !== node_id && edge.target_node_id !== node_id)
        return;
      const path_el = edge_elements_ref.current[edge.id];
      if (!path_el) return;

      const source_node = nodes_ref.current.find(
        (n) => n.id === edge.source_node_id,
      );
      const target_node = nodes_ref.current.find(
        (n) => n.id === edge.target_node_id,
      );
      if (!source_node || !target_node) return;

      const adj_source =
        edge.source_node_id === node_id
          ? { ...source_node, x: new_x, y: new_y }
          : source_node;
      const adj_target =
        edge.target_node_id === node_id
          ? { ...target_node, x: new_x, y: new_y }
          : target_node;

      const sp = get_port_position(
        adj_source,
        edge.source_port_id,
        node_dimensions_ref.current,
      );
      const tp = get_port_position(
        adj_target,
        edge.target_port_id,
        node_dimensions_ref.current,
      );
      if (sp && tp) path_el.setAttribute("d", calculate_bezier_path(sp, tp));
    });
  }, []);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Node drag                                                 */
  /* ═══════════════════════════════════════════════════════════ */

  const handle_node_mouse_down = useCallback(
    (node_id, e) => {
      const node = nodes_ref.current.find((n) => n.id === node_id);
      if (!node) return;
      setSelectedNodeIds([node_id]);
      setSelectedEdgeId(null);
      on_select?.(node_id);
      drag_ref.current = {
        node_id,
        start_mx: e.clientX,
        start_my: e.clientY,
        start_nx: node.x,
        start_ny: node.y,
        current_x: node.x,
        current_y: node.y,
      };
      const el = node_elements_ref.current[node_id];
      if (el) el.style.cursor = "grabbing";
    },
    [on_select],
  );

  /* ═══════════════════════════════════════════════════════════ */
  /*  Port connection drawing                                   */
  /* ═══════════════════════════════════════════════════════════ */

  const handle_port_mouse_down = useCallback((node_id, port_id, side, e) => {
    const node = nodes_ref.current.find((n) => n.id === node_id);
    if (!node) return;
    connecting_ref.current = {
      source_node_id: node_id,
      source_port_id: port_id,
      source_side: side,
    };
    setIsConnecting(true);
    requestAnimationFrame(() => {
      if (temp_edge_ref.current) {
        const sp = get_port_position(
          node,
          port_id,
          node_dimensions_ref.current,
        );
        if (sp) {
          const rect = canvas_ref.current.getBoundingClientRect();
          const vp = viewport_ref.current;
          const mx = (e.clientX - rect.left - vp.x) / vp.zoom;
          const my = (e.clientY - rect.top - vp.y) / vp.zoom;
          temp_edge_ref.current.setAttribute(
            "d",
            calculate_bezier_path(sp, {
              x: mx,
              y: my,
              side: opposite_side(side),
            }),
          );
        }
      }
    });
  }, []);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Canvas mousedown  (left-drag bg → pan)                    */
  /* ═══════════════════════════════════════════════════════════ */

  const handle_canvas_mouse_down = useCallback((e) => {
    const tag = e.target.tagName;
    const is_canvas_bg =
      e.target === canvas_ref.current ||
      e.target === viewport_div_ref.current ||
      tag === "svg";

    if (!is_canvas_bg) return;

    if (e.button === 1 || e.button === 0) {
      e.preventDefault();
      pan_ref.current = {
        start_mx: e.clientX,
        start_my: e.clientY,
        start_vx: viewport_ref.current.x,
        start_vy: viewport_ref.current.y,
        is_click: true,
      };
      if (canvas_ref.current) canvas_ref.current.style.cursor = "grabbing";
      return;
    }
  }, []);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Zoom                                                      */
  /* ═══════════════════════════════════════════════════════════ */

  const handle_wheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = canvas_ref.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.96 : 1.04;
      const vp = viewport_ref.current;
      const new_zoom = Math.max(min_zoom, Math.min(max_zoom, vp.zoom * factor));
      const sc = new_zoom / vp.zoom;
      const new_x = mx - (mx - vp.x) * sc;
      const new_y = my - (my - vp.y) * sc;
      viewport_ref.current = { x: new_x, y: new_y, zoom: new_zoom };
      if (viewport_div_ref.current) {
        viewport_div_ref.current.style.transform = `translate(${new_x}px, ${new_y}px) scale(${new_zoom})`;
      }
      const gs = grid_size * new_zoom;
      const dot = Math.max(0.5, new_zoom * 0.75);
      const c = canvas_ref.current;
      c.style.backgroundSize = `${gs}px ${gs}px`;
      c.style.backgroundPosition = `${new_x % gs}px ${new_y % gs}px`;
      c.style.backgroundImage = `radial-gradient(circle, ${theme.gridColor} ${dot}px, transparent ${dot}px)`;
      cancelAnimationFrame(zoom_raf_ref.current);
      zoom_raf_ref.current = requestAnimationFrame(() => {
        setViewport({ ...viewport_ref.current });
      });
    },
    [theme.gridColor, grid_size, min_zoom, max_zoom],
  );

  /* ═══════════════════════════════════════════════════════════ */
  /*  Global mousemove / mouseup                                */
  /* ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    const handle_move = (e) => {
      /* ── Pan ── */
      if (pan_ref.current) {
        const p = pan_ref.current;
        p.is_click = false;
        const nx = p.start_vx + (e.clientX - p.start_mx);
        const ny = p.start_vy + (e.clientY - p.start_my);
        viewport_ref.current.x = nx;
        viewport_ref.current.y = ny;
        if (viewport_div_ref.current) {
          viewport_div_ref.current.style.transform = `translate(${nx}px, ${ny}px) scale(${viewport_ref.current.zoom})`;
        }
        const gs = grid_size * viewport_ref.current.zoom;
        if (canvas_ref.current) {
          canvas_ref.current.style.backgroundPosition = `${nx % gs}px ${ny % gs}px`;
        }
        return;
      }

      /* ── Node drag ── */
      if (drag_ref.current) {
        const d = drag_ref.current;
        const zoom = viewport_ref.current.zoom;
        const raw_x = d.start_nx + (e.clientX - d.start_mx) / zoom;
        const raw_y = d.start_ny + (e.clientY - d.start_my) / zoom;
        const snap = compute_snap(d.node_id, raw_x, raw_y);
        d.current_x = snap.x;
        d.current_y = snap.y;
        const el = node_elements_ref.current[d.node_id];
        if (el) {
          el.style.left = `${snap.x}px`;
          el.style.top = `${snap.y}px`;
        }
        update_edges_for_node(d.node_id, snap.x, snap.y);
        setSnapGuides(snap.guides);
        return;
      }

      /* ── Connection drawing ── */
      if (connecting_ref.current && temp_edge_ref.current) {
        const conn = connecting_ref.current;
        const rect = canvas_ref.current.getBoundingClientRect();
        const vp = viewport_ref.current;
        const mx = (e.clientX - rect.left - vp.x) / vp.zoom;
        const my = (e.clientY - rect.top - vp.y) / vp.zoom;
        const sn = nodes_ref.current.find((n) => n.id === conn.source_node_id);
        if (!sn) return;
        const sp = get_port_position(
          sn,
          conn.source_port_id,
          node_dimensions_ref.current,
        );
        if (!sp) return;
        temp_edge_ref.current.setAttribute(
          "d",
          calculate_bezier_path(sp, {
            x: mx,
            y: my,
            side: opposite_side(conn.source_side),
          }),
        );
      }
    };

    const handle_up = (e) => {
      /* ── Pan end ── */
      if (pan_ref.current) {
        const was_click = pan_ref.current.is_click;
        pan_ref.current = null;
        setViewport({ ...viewport_ref.current });
        if (canvas_ref.current) {
          canvas_ref.current.style.cursor = space_ref.current ? "grab" : "";
        }
        if (was_click) {
          setSelectedNodeIds([]);
          setSelectedEdgeId(null);
          on_select?.(null);
        }
        return;
      }

      /* ── Drag end ── */
      if (drag_ref.current) {
        const d = drag_ref.current;
        const el = node_elements_ref.current[d.node_id];
        if (el) el.style.cursor = "grab";
        if (on_nodes_change) {
          on_nodes_change(
            nodes_ref.current.map((n) =>
              n.id === d.node_id ? { ...n, x: d.current_x, y: d.current_y } : n,
            ),
          );
        }
        drag_ref.current = null;
        setSnapGuides([]);
        return;
      }

      /* ── Connection end ── */
      if (connecting_ref.current) {
        const conn = connecting_ref.current;
        const target = document.elementFromPoint(e.clientX, e.clientY);
        const port_id = target?.dataset?.portId;
        const node_id = target?.dataset?.nodeId;
        if (
          port_id &&
          node_id &&
          !(conn.source_node_id === node_id && conn.source_port_id === port_id)
        ) {
          on_connect?.({
            source_node_id: conn.source_node_id,
            source_port_id: conn.source_port_id,
            target_node_id: node_id,
            target_port_id: port_id,
          });
        }
        connecting_ref.current = null;
        setIsConnecting(false);
      }
    };

    window.addEventListener("mousemove", handle_move);
    window.addEventListener("mouseup", handle_up);
    return () => {
      window.removeEventListener("mousemove", handle_move);
      window.removeEventListener("mouseup", handle_up);
    };
  }, [
    grid_size,
    on_nodes_change,
    on_connect,
    on_select,
    update_edges_for_node,
    compute_snap,
  ]);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Keyboard                                                  */
  /* ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    const down = (e) => {
      if (e.code === "Space" && !e.repeat) {
        space_ref.current = true;
        if (canvas_ref.current && !drag_ref.current)
          canvas_ref.current.style.cursor = "grab";
      }
      if (e.code === "Backspace" || e.code === "Delete") {
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (selected_edge_ref.current) {
          on_edges_change?.(
            edges_ref.current.filter(
              (edge) => edge.id !== selected_edge_ref.current,
            ),
          );
          setSelectedEdgeId(null);
          return;
        }
        if (selected_ref.current.length > 0) {
          const ids = selected_ref.current;
          on_nodes_change?.(
            nodes_ref.current.filter((n) => !ids.includes(n.id)),
          );
          on_edges_change?.(
            edges_ref.current.filter(
              (edge) =>
                !ids.includes(edge.source_node_id) &&
                !ids.includes(edge.target_node_id),
            ),
          );
          setSelectedNodeIds([]);
        }
      }
    };
    const up = (e) => {
      if (e.code === "Space") {
        space_ref.current = false;
        if (canvas_ref.current) canvas_ref.current.style.cursor = "";
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [on_nodes_change, on_edges_change]);

  useEffect(() => {
    const el = canvas_ref.current;
    if (!el) return;
    el.addEventListener("wheel", handle_wheel, { passive: false });
    return () => el.removeEventListener("wheel", handle_wheel);
  }, [handle_wheel]);

  /* ═══════════════════════════════════════════════════════════ */
  /*  Render                                                    */
  /* ═══════════════════════════════════════════════════════════ */

  const grid_bg_size = grid_size * viewport.zoom;
  const dot_size = Math.max(0.5, viewport.zoom * 0.75);

  const canvas_style = useMemo(
    () => ({
      position: "relative",
      width: "100%",
      height: "100%",
      overflow: "hidden",
      borderRadius: 12,
      backgroundColor: theme.canvasBackground,
      backgroundImage: `radial-gradient(circle, ${theme.gridColor} ${dot_size}px, transparent ${dot_size}px)`,
      backgroundSize: `${grid_bg_size}px ${grid_bg_size}px`,
      backgroundPosition: `${viewport.x % grid_bg_size}px ${viewport.y % grid_bg_size}px`,
      cursor: "default",
      ...style,
    }),
    [theme, viewport, grid_bg_size, dot_size, style],
  );

  const viewport_transform_style = useMemo(
    () => ({
      position: "absolute",
      top: 0,
      left: 0,
      width: 0,
      height: 0,
      transformOrigin: "0 0",
      transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
      willChange: "transform",
    }),
    [viewport],
  );

  /* ── Compute edge paths + midpoints ─────────────────────── */
  const edge_paths = useMemo(() => {
    return edges.map((edge) => {
      const sn = nodes.find((n) => n.id === edge.source_node_id);
      const tn = nodes.find((n) => n.id === edge.target_node_id);
      if (!sn || !tn) return { ...edge, d: "", midpoint: null };
      const sp = get_port_position(
        sn,
        edge.source_port_id,
        node_dimensions_ref.current,
      );
      const tp = get_port_position(
        tn,
        edge.target_port_id,
        node_dimensions_ref.current,
      );
      if (!sp || !tp) return { ...edge, d: "", midpoint: null };
      const d = calculate_bezier_path(sp, tp);
      const midpoint = get_bezier_midpoint(sp, tp);
      return { ...edge, d, midpoint };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, nodes, dims_version]);

  const connected_ports_map = useMemo(() => {
    const map = {};
    edges.forEach((edge) => {
      if (!map[edge.source_node_id]) map[edge.source_node_id] = new Set();
      if (!map[edge.target_node_id]) map[edge.target_node_id] = new Set();
      map[edge.source_node_id].add(edge.source_port_id);
      map[edge.target_node_id].add(edge.target_port_id);
    });
    return map;
  }, [edges]);

  const EDGE_ADD_BTN_R = 10;

  return (
    <div
      ref={canvas_ref}
      style={canvas_style}
      onMouseDown={handle_canvas_mouse_down}
      onContextMenu={(e) => e.preventDefault()}
      {...props}
    >
      <div ref={viewport_div_ref} style={viewport_transform_style}>
        {/* ── SVG edge layer ── */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1,
            height: 1,
            overflow: "visible",
            zIndex: 0,
          }}
          shapeRendering="geometricPrecision"
        >
          {edge_paths.map((ep) => (
            <g
              key={ep.id}
              onMouseEnter={() => setHoveredEdgeId(ep.id)}
              onMouseLeave={() => setHoveredEdgeId(null)}
            >
              {/* Invisible wider hit-area */}
              <path
                d={ep.d}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(16, theme.edgeWidth + 14)}
                strokeLinecap="round"
                style={{ cursor: "pointer", pointerEvents: "stroke" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNodeIds([]);
                  setSelectedEdgeId(ep.id);
                }}
              />
              {/* Visible edge */}
              <path
                ref={(el) => {
                  if (el) edge_elements_ref.current[ep.id] = el;
                }}
                d={ep.d}
                fill="none"
                stroke={
                  selected_edge_id === ep.id
                    ? theme.edgeActiveColor
                    : theme.edgeColor
                }
                strokeWidth={
                  selected_edge_id === ep.id
                    ? theme.edgeWidth + 1
                    : theme.edgeWidth
                }
                strokeLinecap="round"
                style={{
                  pointerEvents: "none",
                  transition: "stroke 0.15s ease, stroke-width 0.15s ease",
                }}
              />
              {/* + button at midpoint */}
              {ep.midpoint && on_edge_add_node && (
                <g
                  style={{
                    cursor: "pointer",
                    opacity:
                      hovered_edge_id === ep.id || selected_edge_id === ep.id
                        ? 1
                        : 0,
                    filter:
                      theme.edgeAddBtnShadow ||
                      "drop-shadow(0 2px 6px rgba(0,0,0,0.15))",
                    transition: "opacity 0.18s ease",
                    pointerEvents:
                      hovered_edge_id === ep.id || selected_edge_id === ep.id
                        ? "auto"
                        : "none",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    on_edge_add_node(ep, ep.midpoint);
                  }}
                >
                  <circle
                    cx={ep.midpoint.x}
                    cy={ep.midpoint.y}
                    r={EDGE_ADD_BTN_R}
                    fill={theme.edgeAddBtnBg}
                    stroke="none"
                  />
                  <line
                    x1={ep.midpoint.x - 4}
                    y1={ep.midpoint.y}
                    x2={ep.midpoint.x + 4}
                    y2={ep.midpoint.y}
                    stroke={theme.edgeAddBtnColor}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                  <line
                    x1={ep.midpoint.x}
                    y1={ep.midpoint.y - 4}
                    x2={ep.midpoint.x}
                    y2={ep.midpoint.y + 4}
                    stroke={theme.edgeAddBtnColor}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                  />
                </g>
              )}
            </g>
          ))}

          {/* Snap guide lines */}
          {snap_guides.map((g, i) =>
            g.axis === "x" ? (
              <line
                key={`sg-${i}`}
                x1={g.pos}
                y1={g.from}
                x2={g.pos}
                y2={g.to}
                stroke={theme.snapGuideColor}
                strokeWidth={1}
                strokeDasharray="4 3"
                style={{ pointerEvents: "none" }}
              />
            ) : (
              <line
                key={`sg-${i}`}
                x1={g.from}
                y1={g.pos}
                x2={g.to}
                y2={g.pos}
                stroke={theme.snapGuideColor}
                strokeWidth={1}
                strokeDasharray="4 3"
                style={{ pointerEvents: "none" }}
              />
            ),
          )}

          {/* Temporary connection line */}
          {is_connecting && (
            <path
              ref={temp_edge_ref}
              d=""
              fill="none"
              stroke={theme.edgeActiveColor}
              strokeWidth={theme.edgeWidth}
              strokeDasharray="8 4"
              strokeLinecap="round"
              opacity={0.65}
            />
          )}
        </svg>

        {/* ── Node layer ── */}
        {nodes.map((node) => (
          <FlowEditorNode
            key={node.id}
            node={node}
            theme={theme}
            selected={selected_node_ids.includes(node.id)}
            render_node={render_node}
            on_node_mouse_down={handle_node_mouse_down}
            on_port_mouse_down={handle_port_mouse_down}
            register_element={register_element}
            register_dimensions={register_dimensions}
            connected_port_ids={connected_ports_map[node.id]}
            is_connecting={is_connecting}
          />
        ))}
      </div>
    </div>
  );
}

export { FlowEditor as default, FlowEditor };
