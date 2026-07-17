import { useEffect, useRef } from "react";
import useReducedMotion from "../../mini_react/use_reduced_motion";

const COLS = 32;
const ROWS = 16;
const INFLUENCE_RADIUS = 150;
const MAX_PUSH = 10;
const BASE_ALPHA = 0.30;
const BOOST_ALPHA = 0.45;
const DOT_RADIUS = 1.4;

/**
 * DotMatrix (ported from mini_ui's HeroCanvas)
 *
 * Interactive dot-matrix canvas overlay: a grid of dots that push away from
 * the mouse and ease back to their resting position. Purely decorative
 * (aria-hidden), disabled entirely under prefers-reduced-motion.
 *
 * Props:
 *  - particleColor {string} rgba(...) string — parsed for its r/g/b, alpha
 *    is computed per-dot based on distance to the cursor.
 */
const DotMatrix = ({ particleColor = "rgba(0,0,0,0.10)" }) => {
  const canvasRef = useRef(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const host = canvas.parentElement;
    if (!host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    let pts = [];
    const mouse = { x: -10000, y: -10000 };
    let raf = 0;

    const resize = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (!w || !h) return;
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }
      if (pts.length !== COLS * ROWS) {
        pts = [];
        for (let i = 0; i < COLS; i++) {
          for (let j = 0; j < ROWS; j++) {
            const ox = (i + 0.5) * w / COLS;
            const oy = (j + 0.5) * h / ROWS;
            pts.push({ x: ox, y: oy, ox, oy });
          }
        }
      } else {
        let k = 0;
        for (let i = 0; i < COLS; i++) {
          for (let j = 0; j < ROWS; j++) {
            pts[k].ox = (i + 0.5) * w / COLS;
            pts[k].oy = (j + 0.5) * h / ROWS;
            k++;
          }
        }
      }
    };

    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => { mouse.x = -10000; mouse.y = -10000; };

    const colorMatch = particleColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    const cr = colorMatch ? +colorMatch[1] : 0;
    const cg = colorMatch ? +colorMatch[2] : 0;
    const cb = colorMatch ? +colorMatch[3] : 0;

    const render = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      ctx.clearRect(0, 0, w, h);
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k];
        const dx = mouse.x - p.ox;
        const dy = mouse.y - p.oy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < INFLUENCE_RADIUS && d > 0) {
          const f = (1 - d / INFLUENCE_RADIUS) * MAX_PUSH;
          const tx = p.ox + (dx / d) * f;
          const ty = p.oy + (dy / d) * f;
          p.x += (tx - p.x) * 0.14;
          p.y += (ty - p.y) * 0.14;
        } else {
          p.x += (p.ox - p.x) * 0.08;
          p.y += (p.oy - p.y) * 0.08;
        }
        const alpha = d < 180 ? BASE_ALPHA + (1 - d / 180) * BOOST_ALPHA : BASE_ALPHA;
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, DOT_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = window.requestAnimationFrame(render);
    };

    resize();
    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(resize);
    });
    ro.observe(host);
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    raf = window.requestAnimationFrame(render);

    return () => {
      ro.disconnect();
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
      window.cancelAnimationFrame(raf);
    };
  }, [reduced, particleColor]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute", inset: 0, zIndex: 0,
        opacity: reduced ? 0 : 1, pointerEvents: "none",
      }}
    />
  );
};

export default DotMatrix;
