/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Scatter — utilities                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/* ── Hex / CSS color → [r, g, b]  (0..1 range) ──────────────────────── */

const _hex_re = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
const _hex3_re = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;

export function css_to_rgb(color) {
  let m = _hex_re.exec(color);
  if (m) {
    return [
      parseInt(m[1], 16) / 255,
      parseInt(m[2], 16) / 255,
      parseInt(m[3], 16) / 255,
    ];
  }
  m = _hex3_re.exec(color);
  if (m) {
    return [
      parseInt(m[1] + m[1], 16) / 255,
      parseInt(m[2] + m[2], 16) / 255,
      parseInt(m[3] + m[3], 16) / 255,
    ];
  }
  /* fallback: parse via canvas (handles rgb(), hsl(), named colors) */
  try {
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r / 255, g / 255, b / 255];
  } catch {
    return [0.5, 0.5, 0.5];
  }
}

/* ── Normalize point coordinates to [-1, 1] with padding ────────────── */

export function normalize_points(points, padding = 0.1) {
  if (!points || points.length === 0) return [];

  let min_x = Infinity, max_x = -Infinity;
  let min_y = Infinity, max_y = -Infinity;

  for (const p of points) {
    if (p.x < min_x) min_x = p.x;
    if (p.x > max_x) max_x = p.x;
    if (p.y < min_y) min_y = p.y;
    if (p.y > max_y) max_y = p.y;
  }

  const range_x = max_x - min_x || 1;
  const range_y = max_y - min_y || 1;
  const range = Math.max(range_x, range_y);
  const cx = (min_x + max_x) / 2;
  const cy = (min_y + max_y) / 2;
  const scale = (2 - padding * 2) / range;

  return points.map((p) => ({
    ...p,
    nx: (p.x - cx) * scale,
    ny: (p.y - cy) * scale,
  }));
}

/* ── Build color Float32Array for BufferGeometry ─────────────────────── */

export function build_color_buffer(points, color_by, palette) {
  const buf = new Float32Array(points.length * 3);
  const group_map = {};
  let group_idx = 0;

  for (let i = 0; i < points.length; i++) {
    let rgb;

    if (typeof color_by === "function") {
      rgb = color_by(points[i]);
    } else {
      /* color_by === "group" or any string key on the point */
      const key = points[i][color_by] ?? "default";
      if (group_map[key] === undefined) {
        group_map[key] = group_idx % palette.length;
        group_idx++;
      }
      rgb = css_to_rgb(palette[group_map[key]]);
    }

    buf[i * 3]     = rgb[0];
    buf[i * 3 + 1] = rgb[1];
    buf[i * 3 + 2] = rgb[2];
  }

  return buf;
}

/* ── Build group → color lookup (for legend) ─────────────────────────── */

export function build_group_legend(points, color_by, palette) {
  if (typeof color_by === "function") return [];
  const seen = new Map();
  let idx = 0;
  for (const p of points) {
    const key = p[color_by] ?? "default";
    if (!seen.has(key)) {
      seen.set(key, palette[idx % palette.length]);
      idx++;
    }
  }
  return Array.from(seen.entries()).map(([label, color]) => ({ label, color }));
}

/* ── World ↔ screen coordinate helpers ──────────────────────────────── */
/*                                                                        */
/*  OrthographicCamera frustum:                                           */
/*    camera.left / right / top / bottom  (world units)                  */
/*    camera.position.x / y               (world center)                 */
/*                                                                        */
/*  Screen coords: (0,0) = top-left of canvas                            */

export function world_to_screen(wx, wy, camera, canvas_rect) {
  const fw = camera.right - camera.left;
  const fh = camera.top - camera.bottom;

  const ndcx = (wx - camera.position.x - camera.left) / fw;
  const ndcy = (wy - camera.position.y - camera.bottom) / fh;

  return {
    x: ndcx * canvas_rect.width,
    y: (1 - ndcy) * canvas_rect.height,
  };
}

export function screen_to_world(sx, sy, camera, canvas_rect) {
  const fw = camera.right - camera.left;
  const fh = camera.top - camera.bottom;

  const ndcx = sx / canvas_rect.width;
  const ndcy = 1 - sy / canvas_rect.height;

  return {
    x: camera.left + ndcx * fw + camera.position.x,
    y: camera.bottom + ndcy * fh + camera.position.y,
  };
}

/* ── Find nearest point to world position ────────────────────────────── */

export function find_nearest(norm_points, wx, wy, hit_world_radius) {
  let best_idx = -1;
  let best_dist2 = hit_world_radius * hit_world_radius;

  for (let i = 0; i < norm_points.length; i++) {
    const dx = norm_points[i].nx - wx;
    const dy = norm_points[i].ny - wy;
    const d2 = dx * dx + dy * dy;
    if (d2 < best_dist2) {
      best_dist2 = d2;
      best_idx = i;
    }
  }

  return best_idx;
}
