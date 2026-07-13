import React, {
  useState,
  useRef,
  useContext,
  useCallback,
} from "react";

import { ConfigContext } from "../../CONTAINERs/config/context";
import {
  clamp,
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
  rgbaString,
} from "./color_utils";

/* ── motion (Ive: 0.26s, geometric grow — never scale) ──────────────────── */
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const GROW = `0.26s ${EASE}`;

const HUE_CONIC =
  "conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
const CHECKER =
  "repeating-conic-gradient(rgba(0,0,0,0.22) 0% 25%, transparent 0% 50%) 0 / 8px 8px";

/* ── geometry (Rams: one modulus u=4, derived from the fixed outer edge) ──
   outer 120 fixed · ring 14 (rest) → 20 (hover) · gap 4 everywhere · core 84
   hover ripple: grown ring +6, every inner layer contracts 6 (量守恒) */
const R_OUT = 120;
const Ring = ({ id, gradient, outer, inner }) => (
  <svg
    width={240}
    height={240}
    style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
  >
    <defs>
      <mask id={id}>
        <circle cx={120} cy={120} r={outer} fill="#fff" style={{ transition: `r ${GROW}` }} />
        <circle cx={120} cy={120} r={inner} fill="#000" style={{ transition: `r ${GROW}` }} />
      </mask>
    </defs>
    <g mask={`url(#${id})`}>
      <foreignObject x={0} y={0} width={240} height={240}>
        <div style={{ width: 240, height: 240, background: gradient }} />
      </foreignObject>
    </g>
  </svg>
);

const polarToXY = (angleDeg, radius) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: 120 + radius * Math.cos(rad), y: 120 + radius * Math.sin(rad) };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const RingColorPicker = ({ value, set_value, default_value = "#3D76C9", label }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode !== "light_mode";

  const initRgb = hexToRgb(value || default_value) || { r: 61, g: 118, b: 201 };
  const [hsv, setHsv] = useState(() => rgbToHsv(initRgb.r, initRgb.g, initRgb.b));
  const [a, setA] = useState(100);
  const [hover, setHover] = useState(null); // "hue" | "alpha" | null
  const [drag, setDrag] = useState(null); // "hue" | "alpha" | "core" | null

  const wrapRef = useRef(null);
  const coreRef = useRef(null);

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(rgb);

  const notify = useCallback(
    (h, s, v) => set_value && set_value(rgbToHex(hsvToRgb(h, s, v))),
    [set_value]
  );

  /* radii — hover drives the ripple; drag locks it (Iwasaki: no target drift) */
  const ha = hover === "alpha";
  const hh = hover === "hue";
  const alphaIn = ha ? 100 : 106; // alpha ring 14 → 20
  const hueOut = ha ? 96 : 102; // hue slides inward when alpha grows
  const hueIn = ha || hh ? 82 : 88; // hue 14 (rest/alpha-slide) → 20 (hue hover)
  const coreR = ha || hh ? 78 : 84; // core yields 6 on any ring hover
  const hueMid = (hueOut + hueIn) / 2;
  const alphaMid = (R_OUT + alphaIn) / 2;

  /* pointer → ring + angle */
  const ptInfo = useCallback((e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const dx = e.clientX - r.left - 120;
    const dy = e.clientY - r.top - 120;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    return { dist, ang: (ang + 360) % 360 };
  }, []);

  /* hit-test — Iwasaki: hit area WIDER than the visual ring (decoupled) */
  const ringAt = useCallback((dist) => {
    if (dist >= 102 && dist <= 130) return "alpha"; // visual 106–120
    if (dist >= 78 && dist < 102) return "hue"; // visual 88–102
    return null;
  }, []);

  const onWrapMove = useCallback(
    (e) => {
      if (drag) return; // drag freezes geometry — hover locked
      setHover(ringAt(ptInfo(e).dist));
    },
    [drag, ptInfo, ringAt]
  );

  const applyRing = useCallback(
    (target, ang) => {
      if (target === "hue") {
        const h = Math.round(ang);
        setHsv((p) => {
          notify(h, p.s, p.v);
          return { ...p, h };
        });
      } else if (target === "alpha") {
        setA(Math.round((ang / 360) * 100));
      }
    },
    [notify]
  );

  const onRingDown = useCallback(
    (e) => {
      const { dist, ang } = ptInfo(e);
      const target = ringAt(dist);
      if (!target) return;
      e.preventDefault();
      setDrag(target);
      setHover(target); // lock geometry on the grabbed ring, frozen for the drag
      applyRing(target, ang);
      const move = (ev) => applyRing(target, ptInfo(ev).ang);
      const up = () => {
        setDrag(null);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [ptInfo, ringAt, applyRing]
  );

  /* core = circular SV (cartesian x→S, y→V) */
  const onCoreDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag("core");
      const upd = (ev) => {
        const r = coreRef.current.getBoundingClientRect();
        const s = clamp((ev.clientX - r.left) / r.width, 0, 1) * 100;
        const v = (1 - clamp((ev.clientY - r.top) / r.height, 0, 1)) * 100;
        setHsv((p) => {
          notify(p.h, Math.round(s), Math.round(v));
          return { ...p, s: Math.round(s), v: Math.round(v) };
        });
      };
      upd(e);
      const up = () => {
        setDrag(null);
        window.removeEventListener("pointermove", upd);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", upd);
      window.addEventListener("pointerup", up);
    },
    [notify]
  );

  /* colors */
  const seam = isDark ? "#141414" : "#E4E4E4";
  const text = isDark ? "#D6D6D6" : "#222222";
  const sub = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
  const thumbBorder = isDark ? "#fff" : "#3A3A3A";

  const huePos = polarToXY(hsv.h, hueMid);
  const alphaPos = polarToXY((a / 100) * 360, alphaMid);
  const alphaConic = `conic-gradient(from 0deg, ${rgbaString(rgb, 0)}, ${rgbaString(rgb, 1)})`;

  /* read-out: 8-digit hex with alpha when not opaque (Rams) */
  const aByte = Math.round((a / 100) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  const hexOut = a < 100 ? `${hex}${aByte}` : hex;

  const RingThumb = ({ x, y, color, big, dragging }) => (
    <span
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: big ? 16 : 12,
        height: big ? 16 : 12,
        borderRadius: "50%",
        transform: "translate(-50%, -50%)",
        background: color,
        border: `${big ? 2.5 : 2}px solid ${thumbBorder}`,
        boxShadow: "0 0 0 0.5px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.4)",
        pointerEvents: "none",
        /* drag = 0-latency follow; only the grow animates */
        transition: dragging
          ? "none"
          : `left ${GROW}, top ${GROW}, width ${GROW}, height ${GROW}, border-width ${GROW}`,
        zIndex: 6,
      }}
    />
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {label && (
        <div style={{ fontSize: 12, color: sub, letterSpacing: "0.04em" }}>{label}</div>
      )}

      <div
        ref={wrapRef}
        onPointerDown={onRingDown}
        onMouseMove={onWrapMove}
        onMouseLeave={() => !drag && setHover(null)}
        style={{
          position: "relative",
          width: 240,
          height: 240,
          borderRadius: "50%",
          background: seam,
          boxShadow: isDark
            ? "0 8px 24px rgba(0,0,0,0.45)"
            : "0 8px 24px rgba(0,0,0,0.14)",
        }}
      >
        <Ring id="ring-alpha" gradient={alphaConic} outer={R_OUT} inner={alphaIn} />
        <Ring id="ring-hue" gradient={HUE_CONIC} outer={hueOut} inner={hueIn} />

        {/* circular SV core */}
        <div
          ref={coreRef}
          onPointerDown={onCoreDown}
          style={{
            position: "absolute",
            top: 120 - coreR,
            left: 120 - coreR,
            width: coreR * 2,
            height: coreR * 2,
            borderRadius: "50%",
            cursor: "crosshair",
            background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
            boxShadow:
              "inset 0 0 0 0.5px rgba(0,0,0,0.5), inset 0 1px 3px rgba(0,0,0,0.35)",
            transition: `width ${GROW}, height ${GROW}, top ${GROW}, left ${GROW}`,
            zIndex: 4,
          }}
        >
          <span
            style={{
              position: "absolute",
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
              width: 14,
              height: 14,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              background: hex,
              border: "2px solid #fff",
              boxShadow: "0 0 0 0.5px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.5)",
              pointerEvents: "none",
              transition: drag === "core" ? "none" : `left ${GROW}, top ${GROW}`,
            }}
          />
        </div>

        <RingThumb x={huePos.x} y={huePos.y} color={`hsl(${hsv.h},100%,50%)`} big={hover === "hue"} dragging={drag === "hue"} />
        <RingThumb x={alphaPos.x} y={alphaPos.y} color={hex} big={hover === "alpha"} dragging={drag === "alpha"} />
      </div>

      {/* read-out — swatch shows real alpha over a checker */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: `linear-gradient(${rgbaString(rgb, a / 100)}, ${rgbaString(rgb, a / 100)}), ${CHECKER}`,
            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.3)",
          }}
        />
        <span style={{ fontSize: 14, color: text, letterSpacing: "0.04em", fontFamily: "Jost, sans-serif" }}>
          {hexOut}
        </span>
      </div>
    </div>
  );
};

export { RingColorPicker as default, RingColorPicker };
