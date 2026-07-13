import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
  useMemo,
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

const formatTooltipValue = (value, step, tooltip_format) => {
  if (tooltip_format) {
    return tooltip_format(value);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "";
  }

  const stepText = `${step}`;
  if (stepText.includes(".")) {
    const precision = Math.min(stepText.split(".")[1].length, 6);
    return numeric.toFixed(precision);
  }

  return `${Math.round(numeric)}`;
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
  const { theme } = useContext(ConfigContext);
  const hasPrefix = prefix_icon || prefix_label;
  const hasPostfix = postfix_icon || postfix_label;
  if (!hasPrefix && !hasPostfix) return null;

  const baseStyle = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: fontSize ?? 12,
    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
  const tipText = formatTooltipValue(currentValue, step, tooltip_format);
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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

  const makeTipText = (v) => formatTooltipValue(v, step, tooltip_format);

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
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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


/* ━━━ ported from mini_ui: formatValue + gradient helpers + GradientSlider ━━━ */
const formatValue = (v, step = 1) => {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(step) && step >= 1) return String(Math.round(v));
  const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))));
  return v.toFixed(decimals);
};


/** Parse a hex color (#RGB or #RRGGBB) → {r,g,b} 0-255 */
const hexToRgb = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

/** Parse "rgb(r,g,b)" or "rgba(r,g,b,a)" → {r,g,b} */
const parseRgbString = (s) => {
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: +m[1], g: +m[2], b: +m[3] };
};

/** Parse a single CSS color token → {r,g,b} */
const parseColorToken = (c) => {
  const t = c.trim();
  if (t.startsWith("#")) return hexToRgb(t);
  if (t.startsWith("rgb")) return parseRgbString(t);
  /* named colors fallback — create a temporary element */
  const el = document.createElement("div");
  el.style.color = t;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  return parseRgbString(computed);
};

/**
 * Parse either:
 *  - A CSS gradient string "linear-gradient(to right, #f00 0%, #0f0 50%, #00f 100%)"
 *  - An array of stops [{color, position?}] where position is 0-1
 *  Returns: [{r,g,b, pos: 0-1}] sorted by pos
 */
const parseGradientStops = (gradient) => {
  if (Array.isArray(gradient)) {
    return gradient.map((s, i, arr) => ({
      ...parseColorToken(s.color),
      pos:
        s.position !== undefined
          ? s.position
          : arr.length > 1
            ? i / (arr.length - 1)
            : 0,
    }));
  }
  if (typeof gradient !== "string") return [{ r: 0, g: 0, b: 0, pos: 0 }];

  /* Strip the function wrapper — keep only the color-stop list */
  const inner = gradient.replace(/^[^(]+\(\s*/, "").replace(/\s*\)$/, "");

  /* Remove direction keywords (to right, 90deg, etc.) — everything before the first color */
  const colorPart = inner.replace(
    /^(to\s+\w+(\s+\w+)?|[\d.]+deg|[\d.]+turn|[\d.]+rad)\s*,\s*/i,
    "",
  );

  /* Split on commas that separate stops (not commas inside rgb()) */
  const rawStops = [];
  let depth = 0;
  let current = "";
  for (const ch of colorPart) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      rawStops.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) rawStops.push(current.trim());

  const parsed = rawStops.map((raw) => {
    /* e.g. "#ff0 17%" or "rgb(255,0,0) 50%" or "red" */
    const pctMatch = raw.match(/([\d.]+)%\s*$/);
    const pos = pctMatch ? parseFloat(pctMatch[1]) / 100 : undefined;
    const colorStr = pctMatch
      ? raw.slice(0, pctMatch.index).trim()
      : raw.trim();
    return { ...parseColorToken(colorStr), pos };
  });

  /* Fill in missing positions (CSS auto-spacing) */
  if (parsed.length > 0) {
    if (parsed[0].pos === undefined) parsed[0].pos = 0;
    if (parsed[parsed.length - 1].pos === undefined)
      parsed[parsed.length - 1].pos = 1;
    for (let i = 1; i < parsed.length - 1; i++) {
      if (parsed[i].pos !== undefined) continue;
      /* find next defined */
      let next = i + 1;
      while (next < parsed.length && parsed[next].pos === undefined) next++;
      const prevPos = parsed[i - 1].pos;
      const nextPos = parsed[next].pos;
      const span = next - (i - 1);
      for (let j = i; j < next; j++) {
        parsed[j].pos = prevPos + ((nextPos - prevPos) * (j - (i - 1))) / span;
      }
    }
  }

  return parsed;
};

const splitGradientStops = (colorPart) => {
  const rawStops = [];
  let depth = 0;
  let current = "";
  for (const ch of colorPart) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      rawStops.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) rawStops.push(current.trim());
  return rawStops;
};

const extractFirstGradientLayer = (gradient) => {
  if (typeof gradient !== "string") return { firstLayer: "", extras: "" };
  const start = gradient.indexOf("(");
  if (start < 0) return { firstLayer: gradient, extras: "" };
  let depth = 0;
  for (let i = start; i < gradient.length; i++) {
    const ch = gradient[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        return {
          firstLayer: gradient.slice(0, i + 1),
          extras: gradient.slice(i + 1).replace(/^\s*,\s*/, "").trim(),
        };
      }
    }
  }
  return { firstLayer: gradient, extras: "" };
};

const parseGradientStopTokens = (gradient) => {
  if (Array.isArray(gradient)) {
    return gradient.map((s, i, arr) => ({
      color: s.color,
      pos:
        s.position !== undefined
          ? s.position
          : arr.length > 1
            ? i / (arr.length - 1)
            : 0,
    }));
  }
  if (typeof gradient !== "string") return [{ color: "#888888", pos: 0 }];

  const { firstLayer, extras } = extractFirstGradientLayer(gradient);
  const inner = firstLayer.replace(/^[^(]+\(\s*/, "").replace(/\s*\)$/, "");
  const colorPart = inner.replace(
    /^(to\s+\w+(\s+\w+)?|[\d.]+deg|[\d.]+turn|[\d.]+rad)\s*,\s*/i,
    "",
  );

  const parsed = splitGradientStops(colorPart).map((raw) => {
    const pctMatch = raw.match(/([\d.]+)%\s*$/);
    const pos = pctMatch ? parseFloat(pctMatch[1]) / 100 : undefined;
    const color = pctMatch ? raw.slice(0, pctMatch.index).trim() : raw.trim();
    return { color, pos };
  });

  if (parsed.length > 0) {
    if (parsed[0].pos === undefined) parsed[0].pos = 0;
    if (parsed[parsed.length - 1].pos === undefined)
      parsed[parsed.length - 1].pos = 1;
    for (let i = 1; i < parsed.length - 1; i++) {
      if (parsed[i].pos !== undefined) continue;
      let next = i + 1;
      while (next < parsed.length && parsed[next].pos === undefined) next++;
      const prevPos = parsed[i - 1].pos;
      const nextPos = parsed[next].pos;
      const span = next - (i - 1);
      for (let j = i; j < next; j++) {
        parsed[j].pos = prevPos + ((nextPos - prevPos) * (j - (i - 1))) / span;
      }
    }
  }

  return {
    stops: parsed,
    extras,
  };
};

const pctString = (value) => `${(value * 100).toFixed(4)}%`;

const stopsToExtendedPillGradient = (gradient, startRatio, endRatio) => {
  const tokenResult = parseGradientStopTokens(gradient);
  const tokens = Array.isArray(tokenResult) ? tokenResult : tokenResult.stops;
  const extras = Array.isArray(tokenResult) ? "" : tokenResult.extras;
  if (!tokens || tokens.length === 0) {
    return "linear-gradient(to right, #888888, #888888)";
  }

  const first = tokens[0].color;
  const last = tokens[tokens.length - 1].color;
  const span = Math.max(0, endRatio - startRatio);
  const mapped = tokens.map(
    (s) => `${s.color} ${pctString(startRatio + s.pos * span)}`,
  );
  const colorLayer = `linear-gradient(to right, ${first} 0%, ${first} ${pctString(startRatio)}, ${mapped.join(", ")}, ${last} ${pctString(endRatio)}, ${last} 100%)`;
  return extras ? `${colorLayer}, ${extras}` : colorLayer;
};

/** Interpolate between parsed stops at a ratio 0-1 → "rgb(r,g,b)" */
const interpolateColor = (stops, ratio) => {
  if (!stops || stops.length === 0) return "rgb(128,128,128)";
  const t = Math.min(1, Math.max(0, ratio));
  if (stops.length === 1)
    return `rgb(${stops[0].r},${stops[0].g},${stops[0].b})`;
  /* find bracketing stops */
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const range = hi.pos - lo.pos || 1;
  const f = (t - lo.pos) / range;
  const r = Math.round(lo.r + (hi.r - lo.r) * f);
  const g = Math.round(lo.g + (hi.g - lo.g) * f);
  const b = Math.round(lo.b + (hi.b - lo.b) * f);
  return `rgb(${r},${g},${b})`;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/*  GradientSlider — line ↔ pill track with gradient & color-aware thumb                                                        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const GradientSlider = ({
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
  /* ── gradient-specific props ───────────────────────── */
  gradient = "linear-gradient(to right, #3b82f6, #8b5cf6, #ec4899)",
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
  const [isFocused, setIsFocused] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const isActivated = isHovering || isFocused || isDragging;

  /* ── gradient parsing (memoised) ───────────────────── */
  const stops = useMemo(() => parseGradientStops(gradient), [gradient]);
  /* ── responsive width measurement ──────────────────── */
  const [measuredW, setMeasuredW] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setMeasuredW(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── style tokens ──────────────────────────────────── */
  const sliderTheme = theme?.slider || {};
  const widthFallback =
    typeof style?.width === "number"
      ? style.width
      : (sliderTheme.width ?? 300);
  const W = measuredW || widthFallback;
  const H = style?.height ?? sliderTheme.height ?? 32;
  const trackThickness =
    style?.trackThickness ?? sliderTheme.trackThickness ?? 2;
  const labelColor =
    style?.labelColor ??
    sliderTheme.labelColor ??
    (isDark ? "#CCCCCC" : "#222222");

  /* gradient-specific tokens */
  const gradientTrackActiveHeight =
    style?.gradientTrackActiveHeight ??
    sliderTheme.gradientTrackActiveHeight ??
    24;
  const gradientThumbBorderWidth =
    style?.gradientThumbBorderWidth ??
    sliderTheme.gradientThumbBorderWidth ??
    2.5;
  const gradientThumbBorderColor =
    style?.gradientThumbBorderColor ??
    sliderTheme.gradientThumbBorderColor ??
    (isDark ? "#FFFFFF" : "#000000");
  const gradientThumbBackground = style?.gradientThumbBackground;
  const gradientTrackBorderColor =
    style?.gradientTrackBorderColor ??
    sliderTheme.gradientTrackBorderColor ??
    (isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)");
  const gradientTrackBorderWidth =
    style?.gradientTrackBorderWidth ??
    sliderTheme.gradientTrackBorderWidth ??
    2;

  /* ── animated dimensions ───────────────────────────── */
  /* Thumb: always visible — medium when inactive, larger when activated */
  const inactiveThumbSize =
    trackThickness + 12; /* e.g. 14px when track is 2px */
  const activeThumbSize = gradientTrackActiveHeight - 6;
  const currentThumbSize = isActivated ? activeThumbSize : inactiveThumbSize;
  const thumbScale = isPressed ? 1.1 : 1;

  /* Pill wraps the thumb with visible padding on all sides.
   * The thumb border (content-box) adds to its rendered size,
   * so pill must account for the full visual thumb diameter. */
  const pillPad = 4; /* px of visible pill around the thumb */
  const thumbVisualSize = activeThumbSize + gradientThumbBorderWidth * 2;
  const activePillH = thumbVisualSize + pillPad * 2;
  const currentTrackH = isActivated ? activePillH : trackThickness;
  const currentTrackR = currentTrackH / 2;

  /* ── position math ─────────────────────────────────── */
  const pct = max === min ? 0 : ((currentValue - min) / (max - min)) * 100;
  const ratio = pct / 100;
  const pillCap = Math.min(activePillH / 2, W / 2);
  const selectableStart = pillCap;
  const selectableEnd = Math.max(selectableStart, W - pillCap);
  const selectableW = Math.max(1, selectableEnd - selectableStart);
  const selectableStartRatio = W > 0 ? selectableStart / W : 0;
  const selectableEndRatio = W > 0 ? selectableEnd / W : 1;

  const thumbLeftPx = selectableStart + ratio * selectableW;
  const mappedGradientCSS = useMemo(
    () =>
      stopsToExtendedPillGradient(
        gradient,
        selectableStartRatio,
        selectableEndRatio,
      ),
    [gradient, selectableStartRatio, selectableEndRatio],
  );

  /* ── thumb color from gradient ─────────────────────── */
  const thumbColor = useMemo(
    () => interpolateColor(stops, ratio),
    [stops, ratio],
  );

  /* ── pointer → value ───────────────────────────────── */
  const getValueFromX = useCallback(
    (clientX) => {
      if (!containerRef.current) return min;
      const rect = containerRef.current.getBoundingClientRect();
      const localX = clientX - rect.left;
      const r = Math.min(
        1,
        Math.max(0, (localX - selectableStart) / selectableW),
      );
      return min + r * (max - min);
    },
    [min, max, selectableStart, selectableW],
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
    : formatValue(currentValue, step);
  const tipBg =
    theme?.tooltip?.backgroundColor ??
    (isDark ? "rgba(200,200,200,0.96)" : "rgba(20,20,20,0.92)");
  const tipColor = theme?.tooltip?.color ?? (isDark ? "#111" : "#FFF");

  /* transition curves */
  const DECEL = "cubic-bezier(0.32, 1, 0.32, 1)";
  const TRACK_T =
    `height 0.36s ${DECEL}, ` +
    `border-radius 0.36s ${DECEL}, ` +
    `box-shadow 0.36s ${DECEL}`;
  const trackDepthShadow = isActivated
    ? isDark
      ? "inset 0 1px 3px rgba(0,0,0,0.35)"
      : "inset 0 1px 3px rgba(0,0,0,0.12)"
    : null;
  const trackBoxShadow = [
    `0 0 0 ${gradientTrackBorderWidth}px ${gradientTrackBorderColor}`,
    trackDepthShadow,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width:
          typeof style?.width === "number" ? style.width : (style?.width ?? "100%"),
      }}
    >
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
        aria-label="Gradient slider"
        tabIndex={disabled ? -1 : 0}
        style={{
          position: "relative",
          width: "100%",
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
        onMouseEnter={() => !disabled && setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onFocus={() => !disabled && setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={onKeyDown}
      >
        {/* ─── Gradient track (always visible — thin line ↔ pill) ─── */}
        <div
          data-testid="gradient-slider-track"
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            width: W,
            height: currentTrackH,
            borderRadius: currentTrackR,
            overflow: "hidden",
            transform: "translateY(-50%)",
            transition: TRACK_T,
            pointerEvents: "none",
            boxShadow: trackBoxShadow,
          }}
        >
          {/* Gradient fill — always shown */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: mappedGradientCSS,
              borderRadius: "inherit",
            }}
          />
        </div>

        {/* ─── Snap marks ─── */}
        {marks &&
          marks.map((m) => {
            if (m === currentValue || m === min || m === max) return null;
            const mPct = max === min ? 0 : ((m - min) / (max - min)) * 100;
            const mPx = selectableStart + (mPct / 100) * selectableW;
            return (
              <div
                key={m}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: mPx,
                  width: isActivated ? 3 : 4,
                  height: isActivated ? 3 : 4,
                  borderRadius: "50%",
                  backgroundColor: gradientThumbBorderColor,
                  transform: "translate(-50%, -50%)",
                  transition:
                    "width 0.24s ease, height 0.24s ease, opacity 0.24s ease",
                  pointerEvents: "none",
                  opacity: 0.7,
                  zIndex: 3,
                  boxShadow: "0 0 2px rgba(0,0,0,0.3)",
                }}
              />
            );
          })}

        {/* ─── Thumb — always visible, bordered circle with gradient color ─── */}
        <div
          data-testid="gradient-slider-thumb"
          style={{
            position: "absolute",
            top: "50%",
            left: thumbLeftPx,
            width: currentThumbSize,
            height: currentThumbSize,
            borderRadius: "50%",
            background: gradientThumbBackground ?? thumbColor,
            border: `${gradientThumbBorderWidth}px solid ${gradientThumbBorderColor}`,
            boxShadow:
              "0 1px 4px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(0,0,0,0.08)",
            transform: `translate(-50%, -50%) scale(${thumbScale})`,
            transition: isDragging
              ? `transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), ` +
                `width 0.32s ${DECEL}, height 0.32s ${DECEL}, ` +
                `background-color 0.08s ease`
              : `left 0.18s cubic-bezier(0.4,0,0.2,1), ` +
                `transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), ` +
                `width 0.32s ${DECEL}, height 0.32s ${DECEL}, ` +
                `background-color 0.15s ease`,
            pointerEvents: "none",
            zIndex: 4,
          }}
        />

        {/* ─── Floating tooltip above thumb ─── */}
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
              padding: "3px 8px",
              borderRadius: 5,
              fontSize: 11,
              fontFamily: "Jost, -apple-system, sans-serif",
              fontWeight: 500,
              whiteSpace: "nowrap",
              lineHeight: "16px",
              zIndex: 5,
            }}
          >
            {tipText}
          </div>
        )}
      </div>
    </div>
  );
};


export { Slider as default, Slider, RangeSlider, GradientSlider };
