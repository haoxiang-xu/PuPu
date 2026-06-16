import React, { useState, useRef, useCallback } from "react";

import {
  clamp,
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
} from "./color_utils";

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/* soft pastel hue ring: a saturated conic, whitened toward the inner edge */
const HUE_SOFT =
  "radial-gradient(circle at center, #fff 30%, rgba(255,255,255,0.5) 44%, rgba(255,255,255,0) 60%), " +
  "conic-gradient(from 0deg, #ff6b6b, #ffd166, #8ce99a, #66d9e8, #74a0ff, #d68aff, #ff6b6b)";

const D = 212;
const C = 106;
const RING_OUT = 106;
const RING_IN = 70;
const CORE_R = 60; // leaves an 10px white moat between ring and core
const RING_MID = (RING_OUT + RING_IN) / 2;

const CopyIcon = ({ color }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const SoftRingColorPicker = ({ value, set_value, default_value = "#F2B5B5" }) => {
  const initRgb = hexToRgb(value || default_value) || { r: 242, g: 181, b: 181 };
  const [hsv, setHsv] = useState(() => rgbToHsv(initRgb.r, initRgb.g, initRgb.b));
  const [a, setA] = useState(100);
  const [hexDraft, setHexDraft] = useState(null);
  const [copied, setCopied] = useState(false);

  const wrapRef = useRef(null);
  const coreRef = useRef(null);

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(rgb);

  const notify = useCallback(
    (h, s, v) => set_value && set_value(rgbToHex(hsvToRgb(h, s, v))),
    [set_value]
  );

  /* ── hue ring drag ───────────────────────────────────────────────────── */
  const onRingDown = useCallback(
    (e) => {
      const r = wrapRef.current.getBoundingClientRect();
      const cx = r.left + C;
      const cy = r.top + C;
      const set = (ev) => {
        const dx = ev.clientX - cx;
        const dy = ev.clientY - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CORE_R) return; // inside core → ignore (core handles it)
        let ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        ang = (ang + 360) % 360;
        setHsv((p) => {
          notify(Math.round(ang), p.s, p.v);
          return { ...p, h: Math.round(ang) };
        });
      };
      const d0 = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (d0 < CORE_R) return;
      e.preventDefault();
      set(e);
      const up = () => {
        window.removeEventListener("pointermove", set);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", set);
      window.addEventListener("pointerup", up);
    },
    [notify]
  );

  /* ── core SV drag (circular cartesian) ───────────────────────────────── */
  const onCoreDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
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
        window.removeEventListener("pointermove", upd);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", upd);
      window.addEventListener("pointerup", up);
    },
    [notify]
  );

  const commitHex = useCallback(
    (t) => {
      const r = hexToRgb(t);
      if (r) {
        setHsv(rgbToHsv(r.r, r.g, r.b));
        notify(...Object.values(rgbToHsv(r.r, r.g, r.b)));
      }
    },
    [notify]
  );

  const copyHex = useCallback(() => {
    try {
      navigator.clipboard.writeText(hex);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1100);
    } catch (_) {}
  }, [hex]);

  /* ── light palette (the reference is a bright white card) ─────────────── */
  const card = "#FFFFFF";
  const ink = "#1C1C1E";
  const sub = "rgba(0,0,0,0.45)";
  const well = "#F2F2F4";

  const rad = ((hsv.h - 90) * Math.PI) / 180;
  const huePos = {
    x: C + RING_MID * Math.cos(rad),
    y: C + RING_MID * Math.sin(rad),
  };

  const hexShown = hexDraft != null ? hexDraft : hex.replace("#", "").toLowerCase();

  const pill = {
    height: 40,
    borderRadius: 12,
    background: well,
    display: "flex",
    alignItems: "center",
    fontFamily: "Jost, sans-serif",
    fontSize: 15,
    color: ink,
  };

  return (
    <div
      style={{
        width: 260,
        boxSizing: "border-box",
        padding: 24,
        borderRadius: 24,
        background: card,
        boxShadow:
          "0 18px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)",
        fontFamily: "Jost, sans-serif",
        userSelect: "none",
      }}
    >
      {/* ring + core */}
      <div
        ref={wrapRef}
        onPointerDown={onRingDown}
        style={{ position: "relative", width: D, height: D, margin: "0 auto" }}
      >
        <svg width={D} height={D} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <defs>
            <mask id="soft-hue-mask">
              <circle cx={C} cy={C} r={RING_OUT} fill="#fff" />
              <circle cx={C} cy={C} r={RING_IN} fill="#000" />
            </mask>
          </defs>
          <g mask="url(#soft-hue-mask)">
            <foreignObject x={0} y={0} width={D} height={D}>
              <div style={{ width: D, height: D, background: HUE_SOFT }} />
            </foreignObject>
          </g>
        </svg>

        {/* core SV */}
        <div
          ref={coreRef}
          onPointerDown={onCoreDown}
          style={{
            position: "absolute",
            top: C - CORE_R,
            left: C - CORE_R,
            width: CORE_R * 2,
            height: CORE_R * 2,
            borderRadius: "50%",
            cursor: "crosshair",
            background: `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))`,
            boxShadow:
              "inset 0 0 0 0.5px rgba(0,0,0,0.06), 0 2px 10px rgba(0,0,0,0.12)",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: `${hsv.s}%`,
              top: `${100 - hsv.v}%`,
              width: 16,
              height: 16,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              background: hex,
              border: "3px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              pointerEvents: "none",
            }}
          />
        </div>

        {/* hue thumb */}
        <span
          style={{
            position: "absolute",
            left: huePos.x,
            top: huePos.y,
            width: 20,
            height: 20,
            borderRadius: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff",
            boxShadow:
              "0 2px 6px rgba(0,0,0,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.06)",
            pointerEvents: "none",
            transition: `left 0.05s ${EASE}, top 0.05s ${EASE}`,
          }}
        />
      </div>

      {/* read-out: Hex + copy + alpha% */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 13, color: sub, marginBottom: 8, marginLeft: 2 }}>Hex</div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ ...pill, flex: 1, paddingLeft: 14, paddingRight: 6 }}>
            <span style={{ color: sub, marginRight: 1 }}>#</span>
            <input
              value={hexShown}
              onChange={(e) => setHexDraft(e.target.value)}
              onBlur={() => {
                commitHex(hexDraft || "");
                setHexDraft(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitHex(hexDraft || "");
                  setHexDraft(null);
                  e.currentTarget.blur();
                }
              }}
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                fontFamily: "Jost, sans-serif",
                fontSize: 15,
                color: ink,
                letterSpacing: "0.02em",
              }}
            />
            <button
              onClick={copyHex}
              title="Copy hex"
              style={{
                width: 30,
                height: 30,
                border: "none",
                borderRadius: 8,
                background: copied ? "rgba(101,196,103,0.18)" : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: `background 0.18s ${EASE}`,
              }}
            >
              <CopyIcon color={copied ? "#3da247" : sub} />
            </button>
          </div>

          <div style={{ ...pill, width: 82, justifyContent: "center", paddingRight: 4 }}>
            <input
              value={a}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                setA(isNaN(n) ? 0 : clamp(n, 0, 100));
              }}
              style={{
                width: 34,
                border: "none",
                outline: "none",
                background: "transparent",
                textAlign: "right",
                fontFamily: "Jost, sans-serif",
                fontSize: 15,
                color: ink,
              }}
            />
            <span style={{ color: sub, marginLeft: 2 }}>%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { SoftRingColorPicker as default, SoftRingColorPicker };
