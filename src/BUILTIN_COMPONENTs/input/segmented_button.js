import React, {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Icon from "../icon/icon";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ============================================================================================================================ */
/*  SegmentedButtonCell — individual button with hover & press-in effect                                                        */
/* ============================================================================================================================ */

const SegmentedButtonCell = forwardRef(
  (
    {
      item,
      isSelected,
      isDisabled,
      isDark,
      colors,
      indicatorRadius,
      fontSize,
      btnPadding,
      button_style,
      onSelect,
    },
    ref,
  ) => {
    const [hovered, setHovered] = useState(false);
    const [pressed, setPressed] = useState(false);

    const hoverBg = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)";
    const activeBg = isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.18)";
    const showBg = hovered || pressed;

    return (
      <div
        ref={ref}
        onClick={isDisabled ? undefined : () => onSelect(item.value)}
        onMouseEnter={() => !isDisabled && setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setPressed(false);
        }}
        onMouseDown={() => !isDisabled && setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          padding: btnPadding,
          fontSize,
          fontFamily: "Jost, sans-serif",
          fontWeight: 500,
          color: isDisabled
            ? isDark
              ? "rgba(255,255,255,0.25)"
              : "rgba(0,0,0,0.25)"
            : colors.color,
          cursor: isDisabled ? "not-allowed" : "pointer",
          borderRadius: indicatorRadius,
          whiteSpace: "nowrap",
          overflow: "hidden",
          transition: "color 0.2s ease, opacity 0.2s ease",
          opacity: isSelected ? 1 : 0.6,
          ...button_style,
        }}
      >
        {/* hover / press-in bg */}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: pressed ? 2 : 0,
            borderRadius: pressed
              ? Math.max(indicatorRadius - 1, 2)
              : indicatorRadius,
            backgroundColor: pressed ? activeBg : hoverBg,
            transform: showBg ? "scale(1)" : "scale(0.5, 0)",
            opacity: showBg ? 1 : 0,
            transition: showBg
              ? "transform 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.0), opacity 0.18s ease, inset 0.12s cubic-bezier(0.32, 1, 0.32, 1), border-radius 0.12s ease"
              : "transform 0.2s cubic-bezier(0.4, 0, 1, 1), opacity 0.15s ease, inset 0.2s ease, border-radius 0.2s ease",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        {item.icon && (
          <span
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
            }}
          >
            <Icon
              src={item.icon}
              style={{
                width: Math.round(fontSize * 1.15),
                height: Math.round(fontSize * 1.15),
              }}
            />
          </span>
        )}
        {item.label && (
          <span style={{ position: "relative", zIndex: 1 }}>{item.label}</span>
        )}
      </div>
    );
  },
);

/* ============================================================================================================================ */
/*  SegmentedButton — horizontal toggle button group with a sliding raised indicator                                            */
/* ============================================================================================================================ */

const SegmentedButton = ({
  options = [], // string[] | { label, value, icon?, disabled? }[]
  value, // controlled selected value
  default_value, // uncontrolled default
  on_change, // (value) => void
  disabled = false,
  style,
  button_style, // extra style applied to each button cell
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputTheme = theme?.input;

  /* ── normalise options ─────────────────────────────── */
  const items = useMemo(
    () =>
      options.map((o) => (typeof o === "string" ? { label: o, value: o } : o)),
    [options],
  );

  /* ── controlled / uncontrolled ─────────────────────── */
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(
    () => default_value ?? items[0]?.value,
  );
  const selected = isControlled ? value : internal;

  const select = useCallback(
    (val) => {
      if (!isControlled) setInternal(val);
      if (on_change) on_change(val);
    },
    [isControlled, on_change],
  );

  /* ── refs for measuring button positions ───────────── */
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const initialised = useRef(false);

  const measureIndicator = useCallback(() => {
    const container = containerRef.current;
    if (!container) return false;

    const selectedIdx = items.findIndex((o) => o.value === selected);
    const btn = buttonRefs.current[selectedIdx];
    if (!btn) return false;

    const cRect = container.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    setIndicator({
      left: bRect.left - cRect.left,
      width: bRect.width,
    });
    return true;
  }, [items, selected]);

  /* measure before paint on mount + value/options change */
  useLayoutEffect(() => {
    const measured = measureIndicator();
    /* Turn on transition after first measurement */
    if (measured && !initialised.current) {
      requestAnimationFrame(() => {
        initialised.current = true;
      });
    }
  }, [measureIndicator]);

  /* keep indicator aligned when selected button/container changes size */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const selectedIdx = items.findIndex((o) => o.value === selected);
    const btn = buttonRefs.current[selectedIdx];
    if (!btn) return undefined;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureIndicator();
      });
      observer.observe(container);
      observer.observe(btn);
      return () => observer.disconnect();
    }

    const onResize = () => {
      measureIndicator();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [items, measureIndicator, selected]);

  /* fonts may finish loading after first paint and change text width */
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      !document.fonts.ready
    ) {
      return undefined;
    }

    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) {
        measureIndicator();
      }
    });

    const onFontsDone = () => {
      measureIndicator();
    };
    if (document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", onFontsDone);
      return () => {
        cancelled = true;
        document.fonts.removeEventListener("loadingdone", onFontsDone);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [measureIndicator]);

  /* ── sizing — derived from style overrides ─────────── */
  const fontSize = style?.fontSize ?? 14;
  const outerPad = style?.padding ?? 3;
  const gap = style?.gap ?? 3;
  const borderRadius = style?.borderRadius ?? inputTheme?.borderRadius ?? 7;
  const indicatorRadius = Math.max(borderRadius - 2, 2);
  const btnPadding = button_style?.padding ?? "6px 14px";

  /* ── colours ───────────────────────────────────────── */
  const colors = useMemo(() => {
    const bg = inputTheme?.backgroundColor ?? (isDark ? "#2B2B2B" : "#E8E8E8");
    const shadow = inputTheme?.boxShadow ?? "inset 0 2px 3px rgba(0,0,0,0.08)";
    const color = theme?.color ?? (isDark ? "#ddd" : "#222");
    const indicatorBg = isDark
      ? "rgba(255,255,255,0.12)"
      : "rgba(255,255,255,0.92)";
    const indicatorShadow = isDark
      ? "0 2px 6px rgba(0,0,0,0.35), 0 0.5px 1px rgba(0,0,0,0.2)"
      : "0 2px 6px rgba(0,0,0,0.10), 0 0.5px 1px rgba(0,0,0,0.06)";
    return { bg, shadow, color, indicatorBg, indicatorShadow };
  }, [isDark, theme, inputTheme]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap,
        padding: outerPad,
        borderRadius,
        backgroundColor: colors.bg,
        boxShadow: colors.shadow,
        userSelect: "none",
        WebkitUserSelect: "none",
        ...style,
      }}
    >
      {/* ── sliding indicator ────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: outerPad,
          left: indicator.left,
          width: indicator.width,
          height: `calc(100% - ${outerPad * 2}px)`,
          borderRadius: indicatorRadius,
          backgroundColor: colors.indicatorBg,
          boxShadow: colors.indicatorShadow,
          transition: initialised.current
            ? "left 0.3s cubic-bezier(0.32, 1, 0.32, 1), width 0.3s cubic-bezier(0.32, 1, 0.32, 1)"
            : "none",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* ── buttons ──────────────────────────────────── */}
      {items.map((item, i) => {
        const isSelected = item.value === selected;
        const isDisabled = disabled || item.disabled;

        return (
          <SegmentedButtonCell
            key={item.value}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            item={item}
            isSelected={isSelected}
            isDisabled={isDisabled}
            isDark={isDark}
            colors={colors}
            indicatorRadius={indicatorRadius}
            fontSize={fontSize}
            btnPadding={btnPadding}
            button_style={button_style}
            onSelect={select}
          />
        );
      })}
    </div>
  );
};

export { SegmentedButton as default, SegmentedButton };
