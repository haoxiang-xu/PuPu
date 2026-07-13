import React, { useState, useEffect, useContext, useCallback } from "react";

/* { Contexts } -------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Components } ------------------------------------------------------------ */
import { GradientSlider } from "../input/slider";
import Icon from "../icon/icon";
/* { Utils } ----------------------------------------------------------------- */
import {
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  hexToRgb,
} from "./color_utils";

/* ============================================================================================================================ */
/*  NordicColorPicker — the shipped "Nordic Rail" panel (locked in the Design Lab, approved by the CEO)                          */
/*                                                                                                                            */
/*  A continuous strip of curated, low-chroma swatches; selecting one pulls it into a lifted, filter-popped card while the    */
/*  rest of the rail de-saturates and dims (the "Filter Pull" spotlight). A quiet oversized HEX/RGB readout sits on top; a    */
/*  caption row owns the colour's name +                                                                                     */
/*  index; CUSTOM discloses three glass H/S/L rails for off-palette colours. Palette / tokens / readout / custom-tracks are    */
/*  ported in here so this built-in never reaches up into PAGEs/. Colour maths from color_utils; the precise rails reuse       */
/*  input/slider's GradientSlider.                                                                                             */
/*  Controlled + uncontrolled: seeds from value || default_value, and re-syncs when a controlled value changes externally.     */
/* ============================================================================================================================ */

const JOST = "Jost, sans-serif";
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 16.6667%, #00ff00 33.3333%, #00ffff 50%, #0000ff 66.6667%, #ff00ff 83.3333%, #ff0000 100%)";

const REST_H = 44;
const SEL_H = 62;
const pad2 = (n) => String(n).padStart(2, "0");

/* ── a curated, deliberately low-chroma Nordic palette, ordered by colour       */
/*    temperature so the rail reads as one calm flow (collision-free at ±2) ───── */
const NORDIC_PALETTE = [
  { hex: "#E8E3D9", name: "Bone" },
  { hex: "#D9CFBE", name: "Oat" },
  { hex: "#C8AB9B", name: "Clay" },
  { hex: "#B17A66", name: "Terracotta" },
  { hex: "#BFA06B", name: "Ochre" },
  { hex: "#9FAB94", name: "Sage" },
  { hex: "#7E968B", name: "Eucalyptus" },
  { hex: "#5E807E", name: "Teal" },
  { hex: "#6E89A6", name: "Fjord" },
  { hex: "#4F6175", name: "Slate" },
  { hex: "#7A6B79", name: "Heather" },
  { hex: "#3A3D42", name: "Charcoal" },
];

/* ── tokens — paper & ink, both modes ──────────────────────────────────────── */
const getNordicTokens = (theme, isDark) => ({
  /* paper, not pure white · graphite, not pure black */
  panelBg:
    theme?.colorPicker?.backgroundColor || (isDark ? "#17181A" : "#FFFFFF"),
  hairline: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)",
  mainText: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.84)",
  muted: isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.48)",
  faint: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.30)",
  /* very soft, low matte shadow — restraint, no glow */
  panelShadow: isDark
    ? "0 16px 50px rgba(0,0,0,0.55)"
    : "0 16px 42px rgba(0,0,0,0.08)",
});

const paletteMatchForRgb = (rgb) =>
  NORDIC_PALETTE.find((p) => {
    const c = hexToRgb(p.hex);
    return (
      !!c &&
      Math.abs(c.r - rgb.r) <= 2 &&
      Math.abs(c.g - rgb.g) <= 2 &&
      Math.abs(c.b - rgb.b) <= 2
    );
  }) || null;

/* ── NordicReadout — swatch + quiet oversized HEX + rgb ────────────────────── */
const NordicReadout = ({ hex, rgb, tokens }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
    <span
      data-testid="color-picker-final-swatch"
      aria-hidden
      style={{
        width: 34,
        height: 34,
        borderRadius: 7,
        flex: "0 0 auto",
        background: hex,
        boxShadow: `inset 0 0 0 1px ${tokens.hairline}`,
      }}
    />
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span
        style={{
          fontFamily: JOST,
          fontSize: 21,
          letterSpacing: "1.5px",
          color: tokens.mainText,
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        {hex}
      </span>
      <span
        style={{
          fontFamily: JOST,
          fontSize: 10.5,
          letterSpacing: "0.5px",
          color: tokens.muted,
          marginTop: 4,
        }}
      >
        {`RGB ${rgb.r} · ${rgb.g} · ${rgb.b}`}
      </span>
    </div>
  </div>
);

/* ── NordicCustomTracks — the collapsed-by-default precise H/S/L rails ──────── */
const NordicCustomTracks = ({ hsl, hex, onChange, tokens }) => {
  const tracks = [
    {
      key: "H",
      value: hsl.h,
      max: 360,
      gradient: HUE_GRADIENT,
      set: (n) => onChange(Math.round(n), hsl.s, hsl.l),
    },
    {
      key: "S",
      value: hsl.s,
      max: 100,
      gradient: `linear-gradient(to right, ${rgbToHex(
        hslToRgb(hsl.h, 0, hsl.l),
      )}, ${rgbToHex(hslToRgb(hsl.h, 100, hsl.l))})`,
      set: (n) => onChange(hsl.h, Math.round(n), hsl.l),
    },
    {
      key: "L",
      value: hsl.l,
      max: 100,
      gradient: `linear-gradient(to right, #000, ${rgbToHex(
        hslToRgb(hsl.h, hsl.s, 50),
      )}, #fff)`,
      set: (n) => onChange(hsl.h, hsl.s, Math.round(n)),
    },
  ];
  return (
    <div
      data-testid="nordic-custom-tracks"
      style={{ display: "flex", flexDirection: "column", gap: 13 }}
    >
      {tracks.map((tr) => (
        <div key={tr.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: JOST,
              fontSize: 10.5,
              letterSpacing: "0.5px",
              color: tokens.muted,
              flex: "0 0 14px",
            }}
          >
            {tr.key}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <GradientSlider
              material="glass"
              value={tr.value}
              set_value={tr.set}
              min={0}
              max={tr.max}
              gradient={tr.gradient}
              show_tooltip={false}
              style={{
                gradientThumbBackground: hex,
                gradientThumbBorderColor: "#FFFFFF",
                gradientTrackBorderColor: tokens.hairline,
                gradientTrackBorderWidth: 2,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: JOST,
              fontSize: 10.5,
              color: tokens.muted,
              minWidth: 28,
              textAlign: "right",
            }}
          >
            {Math.round(tr.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ── NordicColorPickerPanel — the standalone shipped panel surface ─────────── */
const NordicColorPickerPanel = ({
  value,
  set_value,
  default_value = "#3D76C9",
  content_ref,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const t = getNordicTokens(theme, isDark);
  const pickerTheme = theme?.colorPicker || {};
  /* opaque panel surface, resolved the same way the rectangular / halo panels do,
   * so the popover never shows through (colorPicker.backgroundColor can be alpha). */
  const panelBg = isDark
    ? theme?.backgroundColor ?? pickerTheme.backgroundColor ?? "#17181A"
    : theme?.select?.dropdown?.backgroundColor ??
      pickerTheme.backgroundColor ??
      "#FFFFFF";

  const initRgb = hexToRgb(value || default_value) || { r: 61, g: 118, b: 201 };
  /* HSL is the authoritative state so the H/S/L rails stay where the user drags
   * them. Deriving hue from RGB instead would wrap 360°→0° at the red seam (both
   * ends of the hue ring are red) and drop hue entirely at the S/L extremes. */
  const [hsl, setHsl] = useState(() =>
    rgbToHsl(initRgb.r, initRgb.g, initRgb.b),
  );
  const [selectedPaletteHex, setSelectedPaletteHex] = useState(
    () => paletteMatchForRgb(initRgb)?.hex || null,
  );
  const [custom, setCustom] = useState(false);

  const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
  const hex = rgbToHex(rgb);

  /* re-sync when a controlled value changes externally (not just on mount) */
  useEffect(() => {
    if (value === undefined) return;
    const next = hexToRgb(value);
    if (!next) return;
    const cur = hslToRgb(hsl.h, hsl.s, hsl.l);
    if (cur.r === next.r && cur.g === next.g && cur.b === next.b) return;
    setHsl(rgbToHsl(next.r, next.g, next.b));
    setSelectedPaletteHex(paletteMatchForRgb(next)?.hex || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const notify = useCallback(
    (next) => set_value && set_value(rgbToHex(hslToRgb(next.h, next.s, next.l))),
    [set_value],
  );
  const pickHex = useCallback(
    (chip) => {
      const cr = hexToRgb(chip);
      if (!cr) return;
      const next = rgbToHsl(cr.r, cr.g, cr.b);
      setSelectedPaletteHex(chip);
      setHsl(next);
      notify(next);
    },
    [notify],
  );
  const applyHsl = useCallback(
    (h, s, l) => {
      const next = { h, s, l };
      setSelectedPaletteHex(null);
      setHsl(next);
      notify(next);
    },
    [notify],
  );

  const total = NORDIC_PALETTE.length;
  const selIdx = NORDIC_PALETTE.findIndex((p) => p.hex === selectedPaletteHex);
  const anySel = selIdx >= 0;
  const selected = anySel ? NORDIC_PALETTE[selIdx] : null;

  return (
    <div
      ref={content_ref}
      data-testid="color-picker-panel"
      style={{
        width: 300,
        boxSizing: "border-box",
        padding: 20,
        borderRadius: 7,
        border: `1px solid ${t.hairline}`,
        backgroundColor: panelBg,
        boxShadow: t.panelShadow,
        fontFamily: JOST,
        userSelect: "none",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <NordicReadout hex={hex} rgb={rgb} tokens={t} />

      {/* the rail — continuous touching swatches */}
      <div
        data-testid="nordic-rail"
        style={{
          display: "flex",
          alignItems: "flex-end",
          height: SEL_H,
          gap: 0,
          marginTop: 2,
          borderRadius: "5px 5px 0px 0px",
        }}
      >
        {NORDIC_PALETTE.map((p, i) => {
          const sel = p.hex === selectedPaletteHex;
          const first = i === 0;
          const last = i === total - 1;
          const dist = anySel ? Math.abs(i - selIdx) : 0;
          return (
            <button
              key={p.hex}
              type="button"
              aria-label={p.name}
              data-testid={`nordic-swatch-${i}`}
              onClick={() => pickHex(p.hex)}
              style={{
                position: "relative",
                appearance: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                flex: 1,
                height: sel ? SEL_H : REST_H,
                background: p.hex,
                zIndex: sel ? 1 : 0,
                /* one radius across the rail, top corners only — the bottom is
                 * cut flat so every card sits on the flex-end baseline */
                borderRadius: sel
                  ? "5px 5px 0px 0px"
                  : `${first ? 5 : 0}px ${last ? 5 : 0}px 0px 0px`,
                /* Filter Pull — the picked card pops on saturation + brightness
                 * while the rest of the rail de-saturates and dims, no stroke */
                filter: sel
                  ? isDark
                    ? "saturate(1.08) brightness(1.08)"
                    : "saturate(1.08) brightness(1.05)"
                  : anySel
                  ? isDark
                    ? "saturate(0.50) brightness(0.80)"
                    : "saturate(0.55) brightness(0.94)"
                  : "none",
                boxShadow: sel
                  ? isDark
                    ? "0 9px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.18)"
                    : "0 6px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)"
                  : "none",
                transition: sel
                  ? `filter 0.16s ${EASE}, height 0.24s ${EASE}, box-shadow 0.24s ${EASE}`
                  : `filter 0.30s ${EASE}`,
                transitionDelay:
                  !sel && anySel ? `${Math.min(dist * 16, 90)}ms` : "0ms",
              }}
            />
          );
        })}
      </div>

      {/* caption keeps the collapsed panel height stable; off-palette colours
       * leave the row empty so "Custom" remains owned by the disclosure below. */}
      <div
        data-testid="nordic-selected-caption"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          height: 16,
          lineHeight: "16px",
          overflow: "hidden",
        }}
      >
        {selected && (
          <>
            <span
              style={{
                fontFamily: JOST,
                fontSize: 13,
                letterSpacing: "0.2px",
                color: t.mainText,
                lineHeight: "16px",
              }}
            >
              {selected.name}
            </span>
            <span
              style={{
                fontFamily: JOST,
                fontSize: 10.5,
                letterSpacing: "0.5px",
                color: t.faint,
                textTransform: "uppercase",
                lineHeight: "16px",
              }}
            >
              {`${pad2(selIdx + 1)} / ${total}`}
            </span>
          </>
        )}
      </div>

      <div style={{ height: 1, background: t.hairline }} />
      <button
        type="button"
        data-testid="nordic-custom-toggle"
        onClick={() => setCustom((c) => !c)}
        style={{
          appearance: "none",
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: JOST,
          fontSize: 11,
          letterSpacing: "0.6px",
          color: t.muted,
        }}
      >
        <span>CUSTOM</span>
        <Icon
          src="arrow_down"
          color={t.faint}
          style={{
            width: 12,
            height: 12,
            transition: `transform 0.2s ${EASE}`,
            transform: custom ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      {custom && (
        <NordicCustomTracks hsl={hsl} hex={hex} onChange={applyHsl} tokens={t} />
      )}
    </div>
  );
};

export { NordicColorPickerPanel };
