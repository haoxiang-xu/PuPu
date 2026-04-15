import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Utilities } ------------------------------------------------------------------------------------------------------------- */
import {
  normalize_points,
  build_color_buffer,
  build_group_legend,
  world_to_screen,
  screen_to_world,
  find_nearest,
} from "./utils";
/* { Utilities } ------------------------------------------------------------------------------------------------------------- */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Shaders                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const VERTEX_SHADER = /* glsl */ `
  attribute float aSize;
  attribute vec3  aColor;

  varying vec3  vColor;
  varying float vAlpha;

  uniform float uOpacity;
  uniform float uProgress;   /* 0 → 1 entrance animation */

  void main() {
    vColor = aColor;
    vAlpha = uOpacity * uProgress;

    gl_PointSize  = aSize * 1.8 * uProgress;
    gl_Position   = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;

  void main() {
    vec2  coord = (gl_PointCoord - 0.5) * 1.8;
    float dist  = length(coord);

    /* sharp core + soft glow halo */
    float core  = 1.0 - smoothstep(0.18, 0.25, dist);
    float glow  = exp(-dist * dist * 12.0) * 0.35;
    float alpha = (core + glow) * vAlpha;

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Default theme                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DEFAULT_THEME = {
  canvasBackground: "#f5f5f5",
  gridColor: "rgba(0,0,0,0.045)",
  pointOpacity: 0.88,
  pointHoverScale: 1.5,
  clusterColors: [
    "#2563eb",
    "#22c55e",
    "#f59e0b",
    "#ec4899",
    "#8b5cf6",
    "#06b6d4",
    "#f97316",
  ],
  tooltipBackground: "rgba(255,255,255,0.97)",
  tooltipBorder: "1px solid rgba(0,0,0,0.07)",
  tooltipShadow: "0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
  tooltipColor: "#222222",
  tooltipMetaColor: "rgba(0,0,0,0.42)",
  labelColor: "rgba(0,0,0,0.5)",
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Constants                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BASE_FRUSTUM = 1.4; /* half-height of the initial camera view */
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 12;
const ENTRANCE_MS = 650;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Component                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function Scatter({
  points = [],
  color_by = "group",
  point_size = 9,
  show_legend = true,
  on_point_click,
  on_point_hover,
  render_tooltip,
  style,
}) {
  const { theme: config_theme } = useContext(ConfigContext);

  /* ── Theme ────────────────────────────────────────────────────────── */
  const theme = useMemo(
    () => ({ ...DEFAULT_THEME, ...(config_theme?.scatter || {}) }),
    [config_theme],
  );

  /* ── Normalized points ────────────────────────────────────────────── */
  const norm_points = useMemo(() => normalize_points(points), [points]);

  /* ── Color buffer + legend ────────────────────────────────────────── */
  const color_buf = useMemo(
    () => build_color_buffer(norm_points, color_by, theme.clusterColors),
    [norm_points, color_by, theme.clusterColors],
  );

  const legend = useMemo(
    () => build_group_legend(norm_points, color_by, theme.clusterColors),
    [norm_points, color_by, theme.clusterColors],
  );

  /* ── State ────────────────────────────────────────────────────────── */
  const [hovered_idx, set_hovered_idx] = useState(-1);
  const hovered_idx_ref = useRef(-1); /* always-current mirror */
  const [, set_selected_id] = useState(null);
  const [tooltip, set_tooltip] = useState(null); /* { x, y, point } */

  /* ── Refs ─────────────────────────────────────────────────────────── */
  const canvas_ref = useRef(null);
  const wrapper_ref = useRef(null);

  /* Three.js objects */
  const renderer_ref = useRef(null);
  const scene_ref = useRef(null);
  const camera_ref = useRef(null);
  const points_ref = useRef(null); /* THREE.Points mesh */
  const geo_ref = useRef(null);
  const mat_ref = useRef(null);

  /* per-frame mutable state stored in refs to avoid re-renders */
  const zoom_ref = useRef(1); /* logical zoom level */
  const pan_ref = useRef(null); /* active pan gesture */
  const raf_ref = useRef(null);
  const sizes_ref = useRef(null); /* Float32Array — per-point sizes */
  const norm_ref = useRef(norm_points);

  useEffect(() => {
    norm_ref.current = norm_points;
  }, [norm_points]);
  useEffect(() => {
    hovered_idx_ref.current = hovered_idx;
  }, [hovered_idx]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Three.js initialization                                            */
  /* ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const canvas = canvas_ref.current;
    const wrapper = wrapper_ref.current;
    if (!canvas || !wrapper) return;

    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    const aspect = w / h;

    /* ── Renderer ── */
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    renderer_ref.current = renderer;

    /* ── Scene ── */
    const scene = new THREE.Scene();
    scene_ref.current = scene;

    /* ── Camera (orthographic, 2D) ── */
    const fh = BASE_FRUSTUM;
    const fw = fh * aspect;
    const camera = new THREE.OrthographicCamera(-fw, fw, fh, -fh, -10, 10);
    camera.position.set(0, 0, 1);
    camera_ref.current = camera;

    /* ── Geometry ── */
    const geo = new THREE.BufferGeometry();
    const n = norm_points.length;

    const pos = new Float32Array(n * 3);
    const colors = new Float32Array(color_buf);
    const sizes = new Float32Array(n).fill(point_size);

    for (let i = 0; i < n; i++) {
      pos[i * 3] = norm_points[i].nx;
      pos[i * 3 + 1] = norm_points[i].ny;
      pos[i * 3 + 2] = 0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    geo_ref.current = geo;
    sizes_ref.current = sizes;

    /* ── Material ── */
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uOpacity: { value: theme.pointOpacity },
        uProgress: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
    });
    mat_ref.current = mat;

    /* ── Points mesh ── */
    const mesh = new THREE.Points(geo, mat);
    scene.add(mesh);
    points_ref.current = mesh;

    /* ── Render loop ── */
    let running = true;
    const tick = () => {
      if (!running) return;
      raf_ref.current = requestAnimationFrame(tick);
      renderer.render(scene, camera);
    };
    tick();

    /* ── Entrance animation ── */
    const t_start = performance.now();
    const animate_entrance = () => {
      const elapsed = performance.now() - t_start;
      const progress = Math.min(1, elapsed / ENTRANCE_MS);
      /* ease-out cubic */
      const eased = 1 - Math.pow(1 - progress, 3);
      mat.uniforms.uProgress.value = eased;
      if (progress < 1) requestAnimationFrame(animate_entrance);
    };
    requestAnimationFrame(animate_entrance);

    /* ── Cleanup ── */
    return () => {
      running = false;
      cancelAnimationFrame(raf_ref.current);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer_ref.current = null;
      scene_ref.current = null;
      camera_ref.current = null;
      points_ref.current = null;
      geo_ref.current = null;
      mat_ref.current = null;
      sizes_ref.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Sync colors + sizes when data changes (after initial mount)        */
  /* ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const geo = geo_ref.current;
    if (!geo) return;

    const n = norm_points.length;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = norm_points[i].nx;
      pos[i * 3 + 1] = norm_points[i].ny;
      pos[i * 3 + 2] = 0;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

    const colors = new Float32Array(color_buf);
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const sizes = new Float32Array(n).fill(point_size);
    sizes_ref.current = sizes;
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  }, [norm_points, color_buf, point_size]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Resize observer                                                    */
  /* ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const wrapper = wrapper_ref.current;
    if (!wrapper) return;

    const ro = new ResizeObserver(() => {
      const renderer = renderer_ref.current;
      const camera = camera_ref.current;
      if (!renderer || !camera) return;

      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      if (w === 0 || h === 0) return;

      renderer.setSize(w, h);

      /* recalculate frustum preserving zoom */
      const z = zoom_ref.current;
      const fh = BASE_FRUSTUM / z;
      const fw = fh * (w / h);
      camera.left = -fw;
      camera.right = fw;
      camera.top = fh;
      camera.bottom = -fh;
      camera.updateProjectionMatrix();
    });

    ro.observe(wrapper);
    return () => ro.disconnect();
  }, []);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Camera frustum helpers                                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  const apply_zoom = useCallback((next_zoom, pivot_sx, pivot_sy) => {
    const camera = camera_ref.current;
    const wrapper = wrapper_ref.current;
    if (!camera || !wrapper) return;

    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    /* world position under cursor before zoom */
    const rect = { width: w, height: h };
    const before = screen_to_world(pivot_sx, pivot_sy, camera, rect);

    /* new frustum */
    const fh = BASE_FRUSTUM / next_zoom;
    const fw = fh * (w / h);
    camera.left = -fw;
    camera.right = fw;
    camera.top = fh;
    camera.bottom = -fh;
    camera.updateProjectionMatrix();

    /* world position under cursor after zoom (without adjustment) */
    const after = screen_to_world(pivot_sx, pivot_sy, camera, rect);

    /* shift camera so the pivot world point stays under cursor */
    camera.position.x += before.x - after.x;
    camera.position.y += before.y - after.y;
    camera.updateProjectionMatrix();

    zoom_ref.current = next_zoom;
  }, []);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Wheel — zoom to cursor                                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const canvas = canvas_ref.current;
    if (!canvas) return;

    const on_wheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.93 : 1 / 0.93;
      const next = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, zoom_ref.current * factor),
      );
      const rect = canvas.getBoundingClientRect();
      apply_zoom(next, e.clientX - rect.left, e.clientY - rect.top);
    };

    canvas.addEventListener("wheel", on_wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", on_wheel);
  }, [apply_zoom]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Pan                                                                */
  /* ═══════════════════════════════════════════════════════════════════ */

  const handle_mouse_down = useCallback((e) => {
    /* middle mouse or left click on canvas background */
    if (e.button !== 0 && e.button !== 1) return;
    const camera = camera_ref.current;
    if (!camera) return;

    pan_ref.current = {
      start_mx: e.clientX,
      start_my: e.clientY,
      start_cx: camera.position.x,
      start_cy: camera.position.y,
      moved: false,
    };
    e.currentTarget.style.cursor = "grabbing";
  }, []);

  useEffect(() => {
    const on_move = (e) => {
      const p = pan_ref.current;
      if (!p) return;
      const camera = camera_ref.current;
      const wrapper = wrapper_ref.current;
      if (!camera || !wrapper) return;

      const dx_px = e.clientX - p.start_mx;
      const dy_px = e.clientY - p.start_my;

      if (Math.abs(dx_px) > 2 || Math.abs(dy_px) > 2) p.moved = true;

      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      const fw = camera.right - camera.left;
      const fh = camera.top - camera.bottom;

      camera.position.x = p.start_cx - (dx_px / w) * fw;
      camera.position.y = p.start_cy + (dy_px / h) * fh;
    };

    const on_up = (e) => {
      if (!pan_ref.current) return;
      const was_click = !pan_ref.current.moved;
      pan_ref.current = null;
      if (canvas_ref.current) canvas_ref.current.style.cursor = "grab";

      if (was_click) {
        /* click: select hovered point — read ref so value is always current */
        const hi = hovered_idx_ref.current;
        if (hi >= 0 && norm_ref.current[hi]) {
          const pt = norm_ref.current[hi];
          set_selected_id((prev) => (prev === pt.id ? null : pt.id));
          on_point_click?.(pt);
        } else {
          set_selected_id(null);
          on_point_click?.(null);
        }
      }
    };

    window.addEventListener("mousemove", on_move);
    window.addEventListener("mouseup", on_up);
    return () => {
      window.removeEventListener("mousemove", on_move);
      window.removeEventListener("mouseup", on_up);
    };
  }, [on_point_click]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Hover detection                                                    */
  /* ═══════════════════════════════════════════════════════════════════ */

  const handle_mouse_move = useCallback(
    (e) => {
      /* skip hover updates while panning */
      if (pan_ref.current?.moved) return;

      const camera = camera_ref.current;
      const canvas = canvas_ref.current;
      const wrapper = wrapper_ref.current;
      const sizes = sizes_ref.current;
      const geo = geo_ref.current;
      if (!camera || !canvas || !wrapper || !sizes || !geo) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const canvas_rect = {
        width: wrapper.clientWidth,
        height: wrapper.clientHeight,
      };

      const world = screen_to_world(sx, sy, camera, canvas_rect);

      /* hit radius in world units: 1.5× point radius projected to world space */
      const fw = camera.right - camera.left;
      const world_per_px = fw / wrapper.clientWidth;
      const hit_radius = point_size * 1.6 * world_per_px;

      const idx = find_nearest(norm_ref.current, world.x, world.y, hit_radius);

      if (idx !== hovered_idx) {
        /* reset old */
        if (hovered_idx >= 0 && sizes[hovered_idx] !== undefined) {
          sizes[hovered_idx] = point_size;
        }
        /* enlarge new */
        if (idx >= 0 && sizes[idx] !== undefined) {
          sizes[idx] = point_size * theme.pointHoverScale;
        }
        if (sizes_ref.current) {
          geo.attributes.aSize.needsUpdate = true;
        }

        set_hovered_idx(idx);
        on_point_hover?.(idx >= 0 ? norm_ref.current[idx] : null);

        if (idx >= 0) {
          const pt = norm_ref.current[idx];
          const sp = world_to_screen(pt.nx, pt.ny, camera, canvas_rect);
          set_tooltip({ x: sp.x, y: sp.y, point: pt });
        } else {
          set_tooltip(null);
        }
      }
    },
    [hovered_idx, point_size, theme.pointHoverScale, on_point_hover],
  );

  const handle_mouse_leave = useCallback(() => {
    const sizes = sizes_ref.current;
    const geo = geo_ref.current;
    if (hovered_idx >= 0 && sizes && geo) {
      sizes[hovered_idx] = point_size;
      geo.attributes.aSize.needsUpdate = true;
    }
    set_hovered_idx(-1);
    set_tooltip(null);
    on_point_hover?.(null);
  }, [hovered_idx, point_size, on_point_hover]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Sync material opacity when theme changes                           */
  /* ═══════════════════════════════════════════════════════════════════ */

  useEffect(() => {
    const mat = mat_ref.current;
    if (mat) mat.uniforms.uOpacity.value = theme.pointOpacity;
  }, [theme.pointOpacity]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Grid lines (SVG overlay, theme-aware)                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Render                                                             */
  /* ═══════════════════════════════════════════════════════════════════ */

  return (
    <div
      ref={wrapper_ref}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: theme.canvasBackground,
        transition: "background-color 0.3s ease",
        ...style,
      }}
    >
      {/* ── Background dot grid (CSS) ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${theme.gridColor} 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
          pointerEvents: "none",
        }}
      />

      {/* ── WebGL canvas ── */}
      <canvas
        ref={canvas_ref}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          cursor: "grab",
          touchAction: "none",
        }}
        onMouseDown={handle_mouse_down}
        onMouseMove={handle_mouse_move}
        onMouseLeave={handle_mouse_leave}
      />

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, calc(-100% - 14px))",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {typeof render_tooltip === "function" ? (
            render_tooltip({
              point: tooltip.point,
              x: tooltip.x,
              y: tooltip.y,
              theme,
            })
          ) : (
            <>
              <div
                style={{
                  backgroundColor: theme.tooltipBackground,
                  border: theme.tooltipBorder,
                  boxShadow: theme.tooltipShadow,
                  borderRadius: 9,
                  padding: "9px 13px",
                  maxWidth: 240,
                  minWidth: 120,
                }}
              >
                {tooltip.point.label && (
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: config_theme?.font?.fontFamily || "Jost, sans-serif",
                      fontWeight: 500,
                      color: theme.tooltipColor,
                      marginBottom: tooltip.point.content ? 4 : 0,
                      lineHeight: 1.4,
                    }}
                  >
                    {tooltip.point.label}
                  </div>
                )}
                {tooltip.point.content && (
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: config_theme?.font?.fontFamily || "Jost, sans-serif",
                      color: theme.tooltipMetaColor,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {tooltip.point.content}
                  </div>
                )}
                {tooltip.point.group && (
                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        backgroundColor:
                          theme.clusterColors[
                            legend.findIndex(
                              (l) => l.label === tooltip.point.group,
                            ) % theme.clusterColors.length
                          ] || theme.clusterColors[0],
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: config_theme?.font?.fontFamily || "Jost, sans-serif",
                        color: theme.tooltipMetaColor,
                        letterSpacing: "0.3px",
                        textTransform: "uppercase",
                      }}
                    >
                      {tooltip.point.group}
                    </span>
                  </div>
                )}
              </div>
              {/* arrow */}
              <div
                style={{
                  position: "absolute",
                  bottom: -6,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop: `6px solid ${theme.tooltipBackground}`,
                  filter: `drop-shadow(0 2px 3px rgba(0,0,0,0.08))`,
                }}
              />
            </>
          )}
        </div>
      )}

      {/* ── Legend ── */}
      {show_legend && legend.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 14,
            display: "flex",
            flexDirection: "column",
            gap: 5,
            pointerEvents: "none",
          }}
        >
          {legend.map(({ label, color }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: color,
                  boxShadow: `0 0 5px ${color}88`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: config_theme?.font?.fontFamily || "Jost, sans-serif",
                  color: theme.labelColor,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  letterSpacing: "0.2px",
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Point count ── */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          right: 14,
          fontSize: 11,
          fontFamily: "Menlo, Monaco, Consolas, monospace",
          color: theme.labelColor,
          pointerEvents: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        {norm_points.length} points
      </div>
    </div>
  );
}

export { Scatter as default, Scatter };
