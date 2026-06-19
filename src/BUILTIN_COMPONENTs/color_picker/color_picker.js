import React, {
  useState,
  useRef,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { createPortal } from "react-dom";

/* { Contexts } -------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
import Input from "../input/input";
import Button from "../input/button";
import { GradientSlider } from "../input/slider";
import SegmentedButton from "../input/segmented_button";
/* { Utils } ----------------------------------------------------------------- */
import {
  clamp,
  hsvToRgb,
  rgbToHsv,
  rgbToHsl,
  hslToRgb,
  rgbToHex,
  hexToRgb,
  rgbaString,
} from "./color_utils";

/* ── shared motion (one curve, 0.18s, whole component) ──────────────────── */
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const T = `0.18s ${EASE}`;

const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 16.6667%, #00ff00 33.3333%, #00ffff 50%, #0000ff 66.6667%, #ff00ff 83.3333%, #ff0000 100%)";

/* trigger swatch checker */
const CHECKER_TRIGGER =
  "repeating-conic-gradient(rgba(0,0,0,0.22) 0% 25%, transparent 0% 50%) 0 / 7px 7px";
/* alpha-track checker, low contrast */
const CHECKER_TRACK =
  "repeating-conic-gradient(#3a3a3a 0% 25%, #242424 0% 50%) 0 / 6px 6px";

const MONO = "Menlo, Monaco, Consolas, monospace";

const getClientPoint = (event) => ({
  x:
    Number.isFinite(event.clientX)
      ? event.clientX
      : Number.isFinite(event.nativeEvent?.clientX)
        ? event.nativeEvent.clientX
        : Number.isFinite(event.pageX)
          ? event.pageX
          : Number.isFinite(event.nativeEvent?.pageX)
            ? event.nativeEvent.pageX
            : 0,
  y:
    Number.isFinite(event.clientY)
      ? event.clientY
      : Number.isFinite(event.nativeEvent?.clientY)
        ? event.nativeEvent.clientY
        : Number.isFinite(event.pageY)
          ? event.pageY
          : Number.isFinite(event.nativeEvent?.pageY)
            ? event.nativeEvent.pageY
            : 0,
});

const parseNumber = (value, fallback = 0) => {
  const n = Number(String(value || "").replace("%", "").trim());
  return Number.isFinite(n) ? n : fallback;
};

const normalizeHexText = (value) => {
  const raw = String(value || "").trim();
  return raw.startsWith("#") ? raw : `#${raw}`;
};

const withoutKey = (source, key) => {
  const next = { ...source };
  delete next[key];
  return next;
};

const PANEL_WIDTH = 320;
const PANEL_PAD = 12;
const PANEL_BORDER_WIDTH = 1;
const CONTROL_ROW_VERTICAL_PAD = 9;
const CONTROL_ROW_MIN_HEIGHT = 32;
const FINAL_SWATCH_SIZE = 30;
const PANEL_BOTTOM_PAD =
  PANEL_PAD -
  CONTROL_ROW_VERTICAL_PAD -
  (CONTROL_ROW_MIN_HEIGHT - FINAL_SWATCH_SIZE) / 2;
const SV_WIDTH = PANEL_WIDTH - PANEL_PAD * 2 - PANEL_BORDER_WIDTH * 2;
const SV_HEIGHT = 196;
const POPOVER_GAP = 8;
const POPOVER_VIEWPORT_MARGIN = 8;

const getViewportSize = () => {
  if (typeof window === "undefined") {
    return { width: 0, height: 0 };
  }
  return {
    width: window.innerWidth || document.documentElement?.clientWidth || 0,
    height: window.innerHeight || document.documentElement?.clientHeight || 0,
  };
};

const clampToViewport = (value, size, viewportSize) => {
  const min = POPOVER_VIEWPORT_MARGIN;
  const max = Math.max(min, viewportSize - size - POPOVER_VIEWPORT_MARGIN);
  return Math.min(max, Math.max(min, value));
};

const resolvePopoverPosition = (triggerRect, panelRect) => {
  const viewport = getViewportSize();
  const panelWidth = panelRect?.width || PANEL_WIDTH;
  const panelHeight = panelRect?.height || 0;
  const left = clampToViewport(triggerRect.left, panelWidth, viewport.width);

  let top = triggerRect.bottom + POPOVER_GAP;
  if (panelHeight > 0) {
    const roomBelow =
      viewport.height - triggerRect.bottom - POPOVER_GAP - POPOVER_VIEWPORT_MARGIN;
    const roomAbove = triggerRect.top - POPOVER_GAP - POPOVER_VIEWPORT_MARGIN;
    if (roomBelow < panelHeight && roomAbove > roomBelow) {
      top = triggerRect.top - POPOVER_GAP - panelHeight;
    }
    top = clampToViewport(top, panelHeight, viewport.height);
  }

  return { left, top };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ControlRow — CONTROLS-style labeled hairline row                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const ControlRow = ({ label, first, hairline, muted, children }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: `${CONTROL_ROW_VERTICAL_PAD}px 0`,
      minHeight: CONTROL_ROW_MIN_HEIGHT,
      borderTop: first ? "none" : `1px solid ${hairline}`,
    }}
  >
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11,
        letterSpacing: "0.5px",
        color: muted,
        flex: "0 0 56px",
      }}
    >
      {label}
    </span>
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 10,
      }}
    >
      {children}
    </div>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ColorPickerPanel                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const ColorPickerPanel = ({
  value,
  set_value,
  default_value = "#3D76C9",
  default_format = "HSL",
  on_preview,
  on_commit,
  content_ref,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const initRgb = hexToRgb(value || default_value) || { r: 61, g: 118, b: 201 };
  const [hsv, setHsv] = useState(() => rgbToHsv(initRgb.r, initRgb.g, initRgb.b));
  const [a, setA] = useState(100);
  const [format, setFormat] = useState(default_format);
  const [fieldDrafts, setFieldDrafts] = useState({});
  const [dragging, setDragging] = useState(false);

  const svRef = useRef(null);

  const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(rgb);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const pickerTheme = theme?.colorPicker || {};
  const selectDropdownTheme = theme?.select?.dropdown || {};

  useEffect(() => {
    if (set_value) set_value(hex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const applyRgb = useCallback((r, g, b) => setHsv(rgbToHsv(r, g, b)), []);
  const emitPreview = on_preview || set_value;

  const updateFromSV = useCallback((clientX, clientY) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = clamp((clientX - r.left) / (r.width || SV_WIDTH), 0, 1) * 100;
    const v = (1 - clamp((clientY - r.top) / (r.height || SV_HEIGHT), 0, 1)) * 100;
    setHsv((prev) => ({ ...prev, s: Math.round(s), v: Math.round(v) }));
  }, []);

  const onSVDown = useCallback(
    (e) => {
      if (e.type === "mousedown" && typeof window !== "undefined" && window.PointerEvent) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setDragging(true);
      const start = getClientPoint(e);
      updateFromSV(start.x, start.y);
      const move = (ev) => {
        const point = getClientPoint(ev);
        updateFromSV(point.x, point.y);
      };
      const up = () => {
        setDragging(false);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [updateFromSV],
  );

  const resolveFieldRgb = useCallback(
    (field, text) => {
      const raw = String(text || "").trim();

      if (format === "HEX") {
        return hexToRgb(raw);
      }

      if (format === "RGB") {
        const nextRgb = { ...rgb };
        nextRgb[field.key] = Math.round(clamp(parseNumber(raw, nextRgb[field.key]), 0, 255));
        return nextRgb;
      }

      const nextHsl = { ...hsl };
      if (field.key === "h") {
        nextHsl.h = Math.round(clamp(parseNumber(raw, nextHsl.h), 0, 360));
      } else if (field.key === "s") {
        nextHsl.s = Math.round(clamp(parseNumber(raw, nextHsl.s), 0, 100));
      } else if (field.key === "l") {
        nextHsl.l = Math.round(clamp(parseNumber(raw, nextHsl.l), 0, 100));
      }
      return hslToRgb(nextHsl.h, nextHsl.s, nextHsl.l);
    },
    [format, hsl, rgb],
  );

  const previewValueField = useCallback(
    (field, text) => {
      const nextRgb = resolveFieldRgb(field, text);
      if (nextRgb && emitPreview) {
        emitPreview(format === "HEX" ? normalizeHexText(text) : rgbToHex(nextRgb));
      }
    },
    [emitPreview, format, resolveFieldRgb],
  );

  const commitValueField = useCallback(
    (field, text) => {
      const nextRgb = resolveFieldRgb(field, text);
      if (nextRgb) {
        applyRgb(nextRgb.r, nextRgb.g, nextRgb.b);
        if (on_commit) {
          on_commit(format === "HEX" ? normalizeHexText(text) : rgbToHex(nextRgb));
        }
      }
      setFieldDrafts((prev) => withoutKey(prev, field.key));
    },
    [applyRgb, format, on_commit, resolveFieldRgb],
  );

  const pickScreen = useCallback(async () => {
    if (typeof window === "undefined" || !window.EyeDropper) return;
    try {
      const ed = new window.EyeDropper();
      const { sRGBHex } = await ed.open();
      const r = hexToRgb(sRGBHex);
      if (r) applyRgb(r.r, r.g, r.b);
    } catch (_) {
      /* cancelled */
    }
  }, [applyRgb]);

  const C = {
    panel: isDark
      ? theme?.backgroundColor ?? pickerTheme.backgroundColor ?? "#0A0A0A"
      : selectDropdownTheme.backgroundColor ?? pickerTheme.backgroundColor ?? "#FFFFFF",
    popupRadius: selectDropdownTheme.borderRadius ?? 10,
    popupShadow:
      selectDropdownTheme.boxShadow ??
      (isDark
        ? "0 14px 24px rgba(0, 0, 0, 0.45)"
        : "0 12px 20px rgba(0, 0, 0, 0.12)"),
    hairline: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)",
    rowLine: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    text: theme?.color || (isDark ? "#D6D6D6" : "#222222"),
    muted: isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.50)",
    value: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.72)",
    field: isDark ? "#232323" : "#F1F1F1",
    line: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)",
    panelBorder: isDark ? "1px solid rgba(255,255,255,0.12)" : "none",
    accent: "#2F6BFF",
    eyeHoverBg: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
    thumbBorder: "#FFFFFF",
  };

  const alphaGradient = `linear-gradient(to right, ${rgbaString(rgb, 0)}, ${rgbaString(rgb, 1)}), ${CHECKER_TRACK}`;
  const alphaThumbBackground = `linear-gradient(${rgbaString(rgb, a / 100)}, ${rgbaString(rgb, a / 100)}), ${CHECKER_TRACK}`;
  const svPoint = {
    x: (hsv.s / 100) * 100,
    y: (1 - hsv.v / 100) * 100,
  };

  const valueFields =
    format === "HEX"
      ? [{ key: "hex", value: value || hex, width: 132 }]
      : format === "RGB"
        ? [
            { key: "r", value: `${rgb.r}`, width: 44 },
            { key: "g", value: `${rgb.g}`, width: 44 },
            { key: "b", value: `${rgb.b}`, width: 44 },
          ]
        : [
            { key: "h", value: `${hsl.h}`, width: 44 },
            { key: "s", value: `${hsl.s}`, width: 44 },
            { key: "l", value: `${hsl.l}`, width: 44 },
          ];

  const renderValueField = (field) => {
    const current = fieldDrafts[field.key] ?? field.value;
    return (
      <div
        key={field.key}
        data-testid={`color-picker-value-${field.key}`}
        style={{ width: field.width, flex: "0 0 auto" }}
      >
        <Input
          value={current}
          set_value={(next) => {
            setFieldDrafts((prev) => ({ ...prev, [field.key]: next }));
            previewValueField(field, next);
          }}
          on_blur={() => {
            commitValueField(field, current);
          }}
          on_key_down={(e) => {
            if (e.key === "Enter") {
              commitValueField(field, current);
              e.currentTarget.blur();
            }
          }}
          placeholder=""
          style={{
            width: "100%",
            boxSizing: "border-box",
            height: 30,
            padding: "0 8px",
            borderRadius: 4,
            color: C.value,
            fontFamily: MONO,
            fontSize: 12,
            letterSpacing: "0.5px",
            textAlign: field.key === "hex" ? "left" : "center",
            transition: `box-shadow ${T}`,
          }}
        />
      </div>
    );
  };

  return (
    <div
      data-testid="color-picker-panel"
      style={{
        width: PANEL_WIDTH,
        boxSizing: "border-box",
        padding: `${PANEL_PAD}px ${PANEL_PAD}px ${PANEL_BOTTOM_PAD}px`,
        border: C.panelBorder,
        borderRadius: C.popupRadius,
        backgroundColor: C.panel,
        boxShadow: C.popupShadow,
        fontFamily: "Jost, sans-serif",
        userSelect: "none",
        overflow: "visible",
      }}
    >
      <div ref={content_ref} data-testid="color-picker-panel-content">
        <div
          ref={svRef}
          data-testid="color-picker-sv"
          onPointerDown={onSVDown}
          onMouseDown={onSVDown}
          style={{
            position: "relative",
            width: "100%",
            height: SV_HEIGHT,
            boxSizing: "border-box",
            cursor: "crosshair",
            overflow: "visible",
            borderRadius: 2,
            border: "none",
            boxShadow: `0 0 0 1px ${C.hairline}`,
            background: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%), linear-gradient(to right, #ffffff 0%, hsl(${hsv.h}, 100%, 50%) 100%)`,
          }}
        >
          <span
            data-testid="color-picker-sv-thumb"
            data-x={((hsv.s / 100) * SV_WIDTH).toFixed(4)}
            data-y={((1 - hsv.v / 100) * SV_HEIGHT).toFixed(4)}
            style={{
              position: "absolute",
              left: `${svPoint.x}%`,
              top: `${svPoint.y}%`,
              width: dragging ? 17 : 15,
              height: dragging ? 17 : 15,
              borderRadius: "50%",
              transform: "translate(-50%, -50%)",
              background: hex,
              border: `2.5px solid ${C.thumbBorder}`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.42), 0 2px 8px rgba(0,0,0,0.42)",
              transition: dragging ? "none" : `width ${T}, height ${T}`,
              pointerEvents: "none",
            }}
          />
        </div>

        <div style={{ padding: "12px 0 0" }}>
          <ControlRow label="HUE" first hairline={C.rowLine} muted={C.muted}>
            <div data-testid="color-picker-hue" style={{ flex: 1, minWidth: 0 }}>
              <GradientSlider
                value={hsv.h}
                set_value={(h) => setHsv((prev) => ({ ...prev, h: Math.round(h) }))}
                min={0}
                max={360}
                gradient={HUE_GRADIENT}
                show_tooltip={false}
                style={{
                  gradientThumbBackground: `hsl(${hsv.h}, 100%, 50%)`,
                  gradientThumbBorderColor: C.thumbBorder,
                  gradientTrackBorderColor: C.hairline,
                  gradientTrackBorderWidth: 2,
                }}
              />
            </div>
            <span
              style={{ fontFamily: MONO, fontSize: 11, color: C.value, minWidth: 26, textAlign: "right" }}
            >
              {hsv.h}
            </span>
          </ControlRow>

          <ControlRow label="ALPHA" hairline={C.rowLine} muted={C.muted}>
            <div data-testid="color-picker-alpha" style={{ flex: 1, minWidth: 0 }}>
              <GradientSlider
                value={a}
                set_value={(next) => setA(Math.round(next))}
                min={0}
                max={100}
                gradient={alphaGradient}
                show_tooltip={false}
                style={{
                  gradientThumbBackground: alphaThumbBackground,
                  gradientThumbBorderColor: C.thumbBorder,
                  gradientTrackBorderColor: C.hairline,
                  gradientTrackBorderWidth: 2,
                }}
              />
            </div>
            <span
              style={{ fontFamily: MONO, fontSize: 11, color: C.value, minWidth: 26, textAlign: "right" }}
            >
              {a}
            </span>
          </ControlRow>

          <ControlRow label="FORMAT" hairline={C.rowLine} muted={C.muted}>
            <SegmentedButton
              options={[
                { label: "HEX", value: "HEX" },
                { label: "RGB", value: "RGB" },
                { label: "HSL", value: "HSL" },
              ]}
              value={format}
              on_change={(next) => {
                setFormat(next);
                setFieldDrafts({});
              }}
              style={{ fontSize: 12, padding: 2 }}
              button_style={{ padding: "4px 10px" }}
            />
          </ControlRow>

          <ControlRow label={format} hairline={C.rowLine} muted={C.muted}>
            <div style={{ display: "flex", gap: 6, minWidth: 0 }}>
              {valueFields.map(renderValueField)}
            </div>
            <Button
              onClick={pickScreen}
              title="Pick color from screen"
              ariaLabel="Pick color from screen"
              prefix_icon="eyedropper"
              style={{
                root: {
                  width: 30,
                  height: 30,
                  flex: "0 0 auto",
                  borderRadius: 5,
                  paddingVertical: 0,
                  paddingHorizontal: 0,
                  iconOnlyPaddingVertical: 0,
                  iconOnlyPaddingHorizontal: 0,
                  color: C.muted,
                },
                background: {
                  hoverBackgroundColor: C.eyeHoverBg,
                  activeBackgroundColor: C.eyeHoverBg,
                },
                content: {
                  icon: { width: 18, height: 18 },
                },
              }}
            />
            <span
              data-testid="color-picker-final-swatch"
              aria-hidden
              style={{
                width: FINAL_SWATCH_SIZE,
                height: FINAL_SWATCH_SIZE,
                flex: "0 0 auto",
                borderRadius: 5,
                background: `linear-gradient(${hex}, ${hex}), ${CHECKER_TRIGGER}`,
                boxShadow: `inset 0 0 0 1px ${C.line}`,
              }}
            />
          </ControlRow>
        </div>
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ColorPicker — trigger (= live preview) + popover panel                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const ColorPicker = ({
  value,
  set_value,
  default_value = "#3D76C9",
  default_open = false,
  label,
  onPreview,
  onCommit,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(default_value);
  const hex = (isControlled ? value : internal) || "#000000";
  const [open, setOpen] = useState(default_open);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const panelContentRef = useRef(null);
  const [popoverPosition, setPopoverPosition] = useState(null);

  const handlePreview = useCallback(
    (h) => {
      if (!isControlled) setInternal(h);
      if (set_value) set_value(h);
      if (onPreview) onPreview(h);
    },
    [isControlled, onPreview, set_value],
  );

  const handleCommit = useCallback(
    (h) => {
      if (!isControlled) setInternal(h);
      if (onCommit) onCommit(h);
    },
    [isControlled, onCommit],
  );

  const stopPickerEvent = useCallback((event) => {
    event.stopPropagation();
  }, []);

  const blockPickerEvent = useCallback((event) => {
    event.preventDefault();
    stopPickerEvent(event);
  }, [stopPickerEvent]);

  const closeFromBlocker = useCallback(
    (event) => {
      blockPickerEvent(event);
      setOpen(false);
    },
    [blockPickerEvent],
  );

  const closeFromPopoverChrome = useCallback(
    (event) => {
      if (panelContentRef.current?.contains(event.target)) return;
      blockPickerEvent(event);
      setOpen(false);
    },
    [blockPickerEvent],
  );

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setPopoverPosition(
      resolvePopoverPosition(
        trigger.getBoundingClientRect(),
        popoverRef.current?.getBoundingClientRect(),
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || typeof window === "undefined") {
      setPopoverPosition(null);
      return undefined;
    }

    updatePopoverPosition();
    const frame = window.requestAnimationFrame(updatePopoverPosition);
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [open, updatePopoverPosition]);

  const pickerTheme = theme?.colorPicker || {};
  const text = theme?.color || (isDark ? "#D6D6D6" : "#222222");
  const defaultPanelFormat = onPreview || onCommit ? "HEX" : "HSL";

  const popover =
    open && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              aria-hidden
              data-testid="color-picker-event-blocker"
              onPointerDown={stopPickerEvent}
              onPointerMove={stopPickerEvent}
              onPointerUp={stopPickerEvent}
              onMouseDown={stopPickerEvent}
              onMouseMove={stopPickerEvent}
              onMouseUp={stopPickerEvent}
              onTouchStart={stopPickerEvent}
              onTouchMove={blockPickerEvent}
              onTouchEnd={stopPickerEvent}
              onWheel={blockPickerEvent}
              onContextMenu={closeFromBlocker}
              onClick={closeFromBlocker}
              style={{
                position: "fixed",
                inset: 0,
                width: "100%",
                height: "100%",
                zIndex: 9999,
                background: "transparent",
              }}
            />
            <div
              ref={popoverRef}
              data-testid="color-picker-popover"
              onPointerDown={closeFromPopoverChrome}
              onMouseDown={closeFromPopoverChrome}
              style={{
                position: "fixed",
                top: popoverPosition?.top ?? 0,
                left: popoverPosition?.left ?? 0,
                zIndex: 10000,
                visibility: popoverPosition ? "visible" : "hidden",
              }}
            >
              <ColorPickerPanel
                value={hex}
                set_value={handlePreview}
                default_value={default_value}
                default_format={defaultPanelFormat}
                on_preview={handlePreview}
                on_commit={handleCommit}
                content_ref={panelContentRef}
              />
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <span
        ref={triggerRef}
        data-testid="color-picker-trigger-anchor"
        style={{ display: "inline-flex" }}
      >
        <Button
          ariaLabel={label || "Open color picker"}
          onClick={() => setOpen((o) => !o)}
          style={{
            root: {
              height: 36,
              paddingVertical: 0,
              paddingHorizontal: 10,
              borderRadius: pickerTheme.swatchBorderRadius ?? 8,
              fontFamily: "Jost, sans-serif",
              color: text,
              gap: 8,
            },
            background: {
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              activeBackgroundColor: isDark
                ? "rgba(255,255,255,0.10)"
                : "rgba(0,0,0,0.08)",
            },
            content: {
              children: {
                display: "flex",
                alignItems: "center",
                gap: 8,
              },
            },
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 6,
              background: `linear-gradient(${hex}, ${hex}), ${CHECKER_TRIGGER}`,
              boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.3)",
            }}
          />
          <span style={{ fontSize: 13, color: text, letterSpacing: "0.4px" }}>
            {hex}
          </span>
        </Button>
      </span>

      {popover}
    </div>
  );
};

export { ColorPicker as default, ColorPicker, ColorPickerPanel };
