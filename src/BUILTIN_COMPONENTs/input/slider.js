import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Shared helpers                                                                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const snapToStep = (v, min, max, step) => {
  const s = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, parseFloat(s.toFixed(10))));
};

const snapToMarks = (v, marks) => {
  if (!marks || marks.length === 0) return v;
  let closest = marks[0];
  let dist = Math.abs(v - marks[0]);
  for (let i = 1; i < marks.length; i++) {
    const d = Math.abs(v - marks[i]);
    if (d < dist) {
      dist = d;
      closest = marks[i];
    }
  }
  return closest;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Label row (prefix / postfix icon + text)                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const LabelRow = ({
  prefix_icon,
  prefix_label,
  postfix_icon,
  postfix_label,
  color,
  fontSize,
}) => {
  const hasPrefix = prefix_icon || prefix_label;
  const hasPostfix = postfix_icon || postfix_label;
  if (!hasPrefix && !hasPostfix) return null;

  const baseStyle = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: fontSize ?? 12,
    fontFamily: "Jost, -apple-system, sans-serif",
    fontWeight: 500,
    color,
    opacity: 0.55,
    userSelect: "none",
    WebkitUserSelect: "none",
    whiteSpace: "nowrap",
    lineHeight: 1,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 4,
      }}
    >
      <div style={baseStyle}>
        {prefix_icon && (
          <Icon
            src={prefix_icon}
            style={{ width: fontSize ?? 12, height: fontSize ?? 12 }}
          />
        )}
        {prefix_label && <span>{prefix_label}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <div style={baseStyle}>
        {postfix_label && <span>{postfix_label}</span>}
        {postfix_icon && (
          <Icon
            src={postfix_icon}
            style={{ width: fontSize ?? 12, height: fontSize ?? 12 }}
          />
        )}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Single-thumb Slider                                                                                                         */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const Slider = ({
  style,
  value,
  set_value,
  default_value,
  min = 0,
  max = 100,
  step = 1,
  marks,
  show_tooltip = true,
  tooltip_format,
  label_format,
  prefix_icon,
  prefix_label,
  postfix_icon,
  postfix_label,
  disabled = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const containerRef = useRef(null);

  /* ── uncontrolled fallback ─────────────────────────── */
  const [internalValue, setInternalValue] = useState(
    value !== undefined
      ? value
      : default_value !== undefined
        ? default_value
        : min,
  );
  const currentValue = value !== undefined ? value : internalValue;

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  const doSnap = useCallback(
    (v) => {
      if (marks && marks.length > 0) return snapToMarks(v, marks);
      return snapToStep(v, min, max, step);
    },
    [min, max, step, marks],
  );

  const handleChange = useCallback(
    (v) => {
      const s = doSnap(v);
      if (set_value) set_value(s);
      else setInternalValue(s);
    },
    [set_value, doSnap],
  );

  /* ── interaction state ─────────────────────────────── */
  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  /* ── style tokens ──────────────────────────────────── */
  const sliderTheme = theme?.slider || {};
  const W = style?.width ?? sliderTheme.width ?? 300;
  const H = style?.height ?? sliderTheme.height ?? 32;
  const trackThickness =
    style?.trackThickness ?? sliderTheme.trackThickness ?? 2;
  const thumbSize = style?.thumbSize ?? sliderTheme.thumbSize ?? 12;
  const gapWidth = style?.gapWidth ?? sliderTheme.gapWidth ?? 36;
  const activeColor =
    style?.activeColor ??
    sliderTheme.activeColor ??
    (isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.55)");
  const inactiveColor =
    style?.inactiveColor ??
    sliderTheme.inactiveColor ??
    (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)");
  const thumbColor = style?.thumbColor ?? sliderTheme.thumbColor ?? activeColor;
  const labelColor =
    style?.labelColor ??
    sliderTheme.labelColor ??
    (isDark ? "#CCCCCC" : "#222222");

  /* ── position math ─────────────────────────────────── */
  const pct = max === min ? 0 : ((currentValue - min) / (max - min)) * 100;
  const thumbLeftPx = (pct / 100) * W;

  const centerLabel = label_format
    ? label_format(currentValue)
    : `${Math.round(pct)}%`;

  /* ── pointer → value ───────────────────────────────── */
  const getValueFromX = useCallback(
    (clientX) => {
      if (!containerRef.current) return min;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return min + ratio * (max - min);
    },
    [min, max],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      e.preventDefault();
      setIsDragging(true);
      setIsPressed(true);
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      if (cx !== undefined) handleChange(getValueFromX(cx));
    },
    [disabled, handleChange, getValueFromX],
  );

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      if (cx !== undefined) handleChange(getValueFromX(cx));
    };
    const onUp = () => {
      setIsDragging(false);
      setIsPressed(false);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [isDragging, handleChange, getValueFromX]);

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      let v = currentValue;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowUp":
          v += step;
          e.preventDefault();
          break;
        case "ArrowLeft":
        case "ArrowDown":
          v -= step;
          e.preventDefault();
          break;
        case "Home":
          v = min;
          e.preventDefault();
          break;
        case "End":
          v = max;
          e.preventDefault();
          break;
        default:
          return;
      }
      handleChange(v);
    },
    [disabled, currentValue, step, min, max, handleChange],
  );

  /* ── tooltip ───────────────────────────────────────── */
  const tipVisible = show_tooltip && (isDragging || isHovering);
  const tipText = tooltip_format
    ? tooltip_format(currentValue)
    : Math.round(currentValue);
  const tipBg =
    theme?.tooltip?.backgroundColor ??
    (isDark ? "rgba(200,200,200,0.96)" : "rgba(20,20,20,0.92)");
  const tipColor = theme?.tooltip?.color ?? (isDark ? "#111" : "#FFF");
  const tipShadow = theme?.tooltip?.boxShadow ?? "0 4px 12px rgba(0,0,0,0.15)";

  /* ── transitions ───────────────────────────────────── */
  const thumbVisible = isHovering || isDragging;
  const thumbScale = !thumbVisible ? 0 : isPressed ? 1.35 : 1;
  const slideT = isDragging
    ? "none"
    : "left 0.18s cubic-bezier(0.4, 0, 0.2, 1), width 0.18s cubic-bezier(0.4, 0, 0.2, 1)";

  const halfGap = gapWidth / 2;
  const leftEnd = Math.max(0, Math.min(thumbLeftPx - halfGap, W));
  const rightStart = Math.max(0, Math.min(thumbLeftPx + halfGap, W));

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      <LabelRow
        prefix_icon={prefix_icon}
        prefix_label={prefix_label}
        postfix_icon={postfix_icon}
        postfix_label={postfix_label}
        color={labelColor}
        fontSize={style?.fontSize}
      />
      <div
        ref={containerRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentValue}
        tabIndex={disabled ? -1 : 0}
        style={{
          position: "relative",
          width: W,
          height: H,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          outline: "none",
        }}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onKeyDown={onKeyDown}
      >
        {/* Left track (active) */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: Math.max(0, leftEnd),
            height: trackThickness,
            borderRadius: trackThickness / 2,
            backgroundColor: activeColor,
            transform: "translateY(-50%)",
            transition: slideT,
            pointerEvents: "none",
          }}
        />

        {/* Centre value label */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: thumbLeftPx,
            transform: `translate(-50%, -50%) scale(${thumbVisible ? 0.7 : 1})`,
            transition: isDragging
              ? "opacity 0.15s ease, transform 0.15s ease"
              : "left 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease, transform 0.15s ease",
            pointerEvents: "none",
            fontSize: style?.fontSize ?? 11,
            fontFamily: "Jost, -apple-system, sans-serif",
            fontWeight: 500,
            color: labelColor,
            opacity: thumbVisible ? 0 : 0.65,
            whiteSpace: "nowrap",
            lineHeight: 1,
            letterSpacing: "0.5px",
          }}
        >
          {centerLabel}
        </div>

        {/* Right track (inactive) */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: rightStart,
            width: Math.max(0, W - rightStart),
            height: trackThickness,
            borderRadius: trackThickness / 2,
            backgroundColor: inactiveColor,
            transform: "translateY(-50%)",
            transition: slideT,
            pointerEvents: "none",
          }}
        />

        {/* Snap marks */}
        {marks &&
          marks.map((m) => {
            if (m === currentValue) return null;
            const mPct = max === min ? 0 : ((m - min) / (max - min)) * 100;
            const mPx = (mPct / 100) * W;
            return (
              <div
                key={m}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: mPx,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  backgroundColor:
                    m <= currentValue ? activeColor : inactiveColor,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  opacity: 0.7,
                }}
              />
            );
          })}

        {/* Thumb */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: thumbLeftPx,
            width: thumbSize,
            height: thumbSize,
            borderRadius: "50%",
            backgroundColor: thumbColor,
            transform: `translate(-50%, -50%) scale(${thumbScale})`,
            opacity: thumbVisible ? 1 : 0,
            transition: isDragging
              ? "opacity 0.15s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : `left 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)`,
            pointerEvents: "none",
          }}
        />

        {/* Floating tooltip above thumb */}
        {show_tooltip && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: thumbLeftPx,
              transform: `translateX(-50%) scale(${tipVisible ? 1 : 0.7})`,
              transformOrigin: "center bottom",
              opacity: tipVisible ? 1 : 0,
              marginBottom: 6,
              transition: isDragging
                ? "opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)"
                : `left 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)`,
              pointerEvents: "none",
              backgroundColor: tipBg,
              color: tipColor,
              boxShadow: tipShadow,
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 11,
              fontFamily: "Jost, -apple-system, sans-serif",
              fontWeight: 500,
              whiteSpace: "nowrap",
              lineHeight: "16px",
            }}
          >
            {tipText}
          </div>
        )}
      </div>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  RangeSlider – dual-thumb variant                                                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const RangeSlider = ({
  style,
  value,
  set_value,
  default_value,
  min = 0,
  max = 100,
  step = 1,
  marks,
  show_tooltip = true,
  tooltip_format,
  label_format,
  prefix_icon,
  prefix_label,
  postfix_icon,
  postfix_label,
  disabled = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const containerRef = useRef(null);

  /* ── uncontrolled fallback ─────────────────────────── */
  const initLow =
    value !== undefined
      ? value[0]
      : default_value !== undefined
        ? default_value[0]
        : min;
  const initHigh =
    value !== undefined
      ? value[1]
      : default_value !== undefined
        ? default_value[1]
        : max;

  const [internalLow, setInternalLow] = useState(initLow);
  const [internalHigh, setInternalHigh] = useState(initHigh);

  const currentLow = value !== undefined ? value[0] : internalLow;
  const currentHigh = value !== undefined ? value[1] : internalHigh;

  useEffect(() => {
    if (value !== undefined) {
      setInternalLow(value[0]);
      setInternalHigh(value[1]);
    }
  }, [value]);

  const doSnap = useCallback(
    (v) => {
      if (marks && marks.length > 0) return snapToMarks(v, marks);
      return snapToStep(v, min, max, step);
    },
    [min, max, step, marks],
  );

  /* ── interaction state ─────────────────────────────── */
  const [activeThumb, setActiveThumb] = useState(null); // "low" | "high" | null
  const [isHovering, setIsHovering] = useState(false);
  const [pressedThumb, setPressedThumb] = useState(null);

  const handleChange = useCallback(
    (low, high) => {
      const sLow = doSnap(Math.min(low, high));
      const sHigh = doSnap(Math.max(low, high));
      if (set_value) set_value([sLow, sHigh]);
      else {
        setInternalLow(sLow);
        setInternalHigh(sHigh);
      }
    },
    [set_value, doSnap],
  );

  /* ── style tokens ──────────────────────────────────── */
  const sliderTheme = theme?.slider || {};
  const W = style?.width ?? sliderTheme.width ?? 300;
  const H = style?.height ?? sliderTheme.height ?? 32;
  const trackThickness =
    style?.trackThickness ?? sliderTheme.trackThickness ?? 2;
  const thumbSize = style?.thumbSize ?? sliderTheme.thumbSize ?? 12;
  const gapWidth = style?.gapWidth ?? sliderTheme.gapWidth ?? 36;
  const activeColor =
    style?.activeColor ??
    sliderTheme.activeColor ??
    (isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.55)");
  const inactiveColor =
    style?.inactiveColor ??
    sliderTheme.inactiveColor ??
    (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)");
  const thumbColor = style?.thumbColor ?? sliderTheme.thumbColor ?? activeColor;
  const labelColor =
    style?.labelColor ??
    sliderTheme.labelColor ??
    (isDark ? "#CCCCCC" : "#222222");

  /* ── position math ─────────────────────────────────── */
  const lowPct = max === min ? 0 : ((currentLow - min) / (max - min)) * 100;
  const highPct = max === min ? 0 : ((currentHigh - min) / (max - min)) * 100;
  const lowPx = (lowPct / 100) * W;
  const highPx = (highPct / 100) * W;
  const lowLabel = label_format
    ? label_format(currentLow, currentHigh, "low")
    : `${Math.round(lowPct)}%`;
  const highLabel = label_format
    ? label_format(currentLow, currentHigh, "high")
    : `${Math.round(highPct)}%`;

  /* ── pointer → value ───────────────────────────────── */
  const getValueFromX = useCallback(
    (clientX) => {
      if (!containerRef.current) return min;
      const rect = containerRef.current.getBoundingClientRect();
      const ratio = Math.min(
        1,
        Math.max(0, (clientX - rect.left) / rect.width),
      );
      return min + ratio * (max - min);
    },
    [min, max],
  );

  const onPointerDown = useCallback(
    (e) => {
      if (disabled) return;
      e.preventDefault();
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      if (cx === undefined) return;
      const v = getValueFromX(cx);
      const distLow = Math.abs(v - currentLow);
      const distHigh = Math.abs(v - currentHigh);
      const which = distLow <= distHigh ? "low" : "high";
      setActiveThumb(which);
      setPressedThumb(which);
      if (which === "low") {
        handleChange(v, currentHigh);
      } else {
        handleChange(currentLow, v);
      }
    },
    [disabled, getValueFromX, currentLow, currentHigh, handleChange],
  );

  useEffect(() => {
    if (!activeThumb) return;
    const onMove = (e) => {
      const cx = e.clientX ?? e.touches?.[0]?.clientX;
      if (cx === undefined) return;
      const v = getValueFromX(cx);
      if (activeThumb === "low") {
        handleChange(v, currentHigh);
      } else {
        handleChange(currentLow, v);
      }
    };
    const onUp = () => {
      setActiveThumb(null);
      setPressedThumb(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [activeThumb, getValueFromX, currentLow, currentHigh, handleChange]);

  const onKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      const delta =
        e.key === "ArrowRight" || e.key === "ArrowUp"
          ? step
          : e.key === "ArrowLeft" || e.key === "ArrowDown"
            ? -step
            : 0;
      if (delta === 0) return;
      e.preventDefault();
      handleChange(currentLow + delta, currentHigh);
    },
    [disabled, step, currentLow, currentHigh, handleChange],
  );

  /* ── tooltip ───────────────────────────────────────── */
  const tipBg =
    theme?.tooltip?.backgroundColor ??
    (isDark ? "rgba(200,200,200,0.96)" : "rgba(20,20,20,0.92)");
  const tipColor = theme?.tooltip?.color ?? (isDark ? "#111" : "#FFF");
  const tipShadow = theme?.tooltip?.boxShadow ?? "0 4px 12px rgba(0,0,0,0.15)";

  const makeTipText = (v) =>
    tooltip_format ? tooltip_format(v) : Math.round(v);

  /* ── transitions ───────────────────────────────────── */
  const thumbVisible = isHovering || !!activeThumb;
  const slideT = activeThumb
    ? "none"
    : "left 0.18s cubic-bezier(0.4, 0, 0.2, 1), width 0.18s cubic-bezier(0.4, 0, 0.2, 1)";

  /* ── track geometry (each thumb gets its own gap) ─── */
  const halfGap = gapWidth / 2;
  const lowGapLeft = Math.max(0, Math.min(lowPx - halfGap, W));
  const lowGapRight = Math.max(0, Math.min(lowPx + halfGap, W));
  const highGapLeft = Math.max(0, Math.min(highPx - halfGap, W));
  const highGapRight = Math.max(0, Math.min(highPx + halfGap, W));

  /* Helper to render a thumb */
  const renderThumb = (px, which) => {
    const isThisPressed = pressedThumb === which;
    const scale = !thumbVisible ? 0 : isThisPressed ? 1.35 : 1;
    const isDrag = activeThumb === which;
    const tipVis = show_tooltip && thumbVisible;
    return (
      <React.Fragment key={which}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: px,
            width: thumbSize,
            height: thumbSize,
            borderRadius: "50%",
            backgroundColor: thumbColor,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity: thumbVisible ? 1 : 0,
            transition: isDrag
              ? "opacity 0.15s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)"
              : `left 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)`,
            pointerEvents: "none",
            zIndex: isDrag ? 2 : 1,
          }}
        />
        {show_tooltip && (
          <div
            style={{
              position: "absolute",
              bottom: "100%",
              left: px,
              transform: `translateX(-50%) scale(${tipVis ? 1 : 0.7})`,
              transformOrigin: "center bottom",
              opacity: tipVis ? 1 : 0,
              marginBottom: 6,
              transition: isDrag
                ? "opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)"
                : `left 0.18s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)`,
              pointerEvents: "none",
              backgroundColor: tipBg,
              color: tipColor,
              boxShadow: tipShadow,
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 11,
              fontFamily: "Jost, -apple-system, sans-serif",
              fontWeight: 500,
              whiteSpace: "nowrap",
              lineHeight: "16px",
              zIndex: isDrag ? 2 : 1,
            }}
          >
            {makeTipText(which === "low" ? currentLow : currentHigh)}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <div style={{ display: "inline-flex", flexDirection: "column" }}>
      <LabelRow
        prefix_icon={prefix_icon}
        prefix_label={prefix_label}
        postfix_icon={postfix_icon}
        postfix_label={postfix_label}
        color={labelColor}
        fontSize={style?.fontSize}
      />
      <div
        ref={containerRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={currentLow}
        tabIndex={disabled ? -1 : 0}
        style={{
          position: "relative",
          width: W,
          height: H,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          outline: "none",
        }}
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onKeyDown={onKeyDown}
      >
        {/* Left inactive track (before low thumb gap) */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: Math.max(0, lowGapLeft),
            height: trackThickness,
            borderRadius: trackThickness / 2,
            backgroundColor: inactiveColor,
            transform: "translateY(-50%)",
            transition: slideT,
            pointerEvents: "none",
          }}
        />

        {/* Low thumb centre label */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: lowPx,
            transform: `translate(-50%, -50%) scale(${thumbVisible ? 0.7 : 1})`,
            transition: activeThumb
              ? "opacity 0.15s ease, transform 0.15s ease"
              : "left 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease, transform 0.15s ease",
            pointerEvents: "none",
            fontSize: style?.fontSize ?? 11,
            fontFamily: "Jost, -apple-system, sans-serif",
            fontWeight: 500,
            color: labelColor,
            opacity: thumbVisible ? 0 : 0.65,
            whiteSpace: "nowrap",
            lineHeight: 1,
            letterSpacing: "0.5px",
          }}
        >
          {lowLabel}
        </div>

        {/* Active track between thumbs */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: lowGapRight,
            width: Math.max(0, highGapLeft - lowGapRight),
            height: trackThickness,
            borderRadius: trackThickness / 2,
            backgroundColor: activeColor,
            transform: "translateY(-50%)",
            transition: slideT,
            pointerEvents: "none",
          }}
        />

        {/* High thumb centre label */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: highPx,
            transform: `translate(-50%, -50%) scale(${thumbVisible ? 0.7 : 1})`,
            transition: activeThumb
              ? "opacity 0.15s ease, transform 0.15s ease"
              : "left 0.18s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease, transform 0.15s ease",
            pointerEvents: "none",
            fontSize: style?.fontSize ?? 11,
            fontFamily: "Jost, -apple-system, sans-serif",
            fontWeight: 500,
            color: labelColor,
            opacity: thumbVisible ? 0 : 0.65,
            whiteSpace: "nowrap",
            lineHeight: 1,
            letterSpacing: "0.5px",
          }}
        >
          {highLabel}
        </div>

        {/* Right inactive track (after high thumb gap) */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: highGapRight,
            width: Math.max(0, W - highGapRight),
            height: trackThickness,
            borderRadius: trackThickness / 2,
            backgroundColor: inactiveColor,
            transform: "translateY(-50%)",
            transition: slideT,
            pointerEvents: "none",
          }}
        />

        {/* Snap marks */}
        {marks &&
          marks.map((m) => {
            if (m === currentLow || m === currentHigh) return null;
            const mPct = max === min ? 0 : ((m - min) / (max - min)) * 100;
            const mPx = (mPct / 100) * W;
            const inRange = m >= currentLow && m <= currentHigh;
            return (
              <div
                key={m}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: mPx,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  backgroundColor: inRange ? activeColor : inactiveColor,
                  transform: "translate(-50%, -50%)",
                  pointerEvents: "none",
                  opacity: 0.7,
                }}
              />
            );
          })}

        {/* Thumbs */}
        {renderThumb(lowPx, "low")}
        {renderThumb(highPx, "high")}
      </div>
    </div>
  );
};

export { Slider as default, Slider, RangeSlider };
