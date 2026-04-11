import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const TRACK_PADDING = 3;
const BUTTON_HEIGHT = 28;
const CONTROL_HEIGHT = BUTTON_HEIGHT + TRACK_PADDING * 2;

const SegmentedControl = ({ sections, selected, onChange, isDark }) => {
  const { theme } = useContext(ConfigContext);
  const containerRef = useRef(null);
  const buttonRefs = useRef({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const initialised = useRef(false);

  const measureIndicator = useCallback(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current[selected];
    if (!container || !activeButton) return false;

    const containerRect = container.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setIndicator({
      left: buttonRect.left - containerRect.left,
      width: buttonRect.width,
    });
    return true;
  }, [selected]);

  useLayoutEffect(() => {
    const measured = measureIndicator();
    if (measured && !initialised.current) {
      requestAnimationFrame(() => {
        initialised.current = true;
      });
    }
  }, [measureIndicator]);

  useEffect(() => {
    const container = containerRef.current;
    const activeButton = buttonRefs.current[selected];
    if (!container || !activeButton) return undefined;

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        measureIndicator();
      });
      observer.observe(container);
      observer.observe(activeButton);
      return () => observer.disconnect();
    }

    const handleResize = () => {
      measureIndicator();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [measureIndicator, selected]);

  useEffect(() => {
    if (
      typeof document === "undefined" ||
      !document.fonts ||
      !document.fonts.ready
    ) {
      return undefined;
    }

    let cancelled = false;
    const handleFontsReady = () => {
      if (!cancelled) {
        measureIndicator();
      }
    };

    document.fonts.ready.then(handleFontsReady);

    if (document.fonts.addEventListener) {
      document.fonts.addEventListener("loadingdone", handleFontsReady);
      return () => {
        cancelled = true;
        document.fonts.removeEventListener("loadingdone", handleFontsReady);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [measureIndicator]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        height: CONTROL_HEIGHT,
        boxSizing: "border-box",
        padding: TRACK_PADDING,
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: TRACK_PADDING,
          left: indicator.left,
          width: indicator.width,
          height: BUTTON_HEIGHT,
          borderRadius: 7,
          background: isDark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.92)",
          boxShadow: isDark
            ? "0 1px 4px rgba(0,0,0,0.45)"
            : "0 1px 4px rgba(0,0,0,0.10)",
          transition: initialised.current
            ? "left 0.28s cubic-bezier(0.32, 1, 0.32, 1), width 0.28s cubic-bezier(0.32, 1, 0.32, 1)"
            : "none",
          pointerEvents: "none",
        }}
      />

      {sections.map((s) => {
        const isActive = s.key === selected;
        return (
          <button
            key={s.key}
            ref={(node) => {
              buttonRefs.current[s.key] = node;
            }}
            onClick={() => onChange(s.key)}
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              height: BUTTON_HEIGHT,
              boxSizing: "border-box",
              padding: "0 13px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1,
              letterSpacing: "0.1px",
              color: isActive
                ? isDark
                  ? "#fff"
                  : "#111"
                : isDark
                  ? "rgba(255,255,255,0.42)"
                  : "rgba(0,0,0,0.42)",
              background: "transparent",
              boxShadow: "none",
              transition: "color 0.15s ease",
              outline: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Icon
              src={s.icon}
              style={{ width: 13, height: 13, flexShrink: 0 }}
              color={
                isActive
                  ? isDark
                    ? "#fff"
                    : "#111"
                  : isDark
                    ? "rgba(255,255,255,0.38)"
                    : "rgba(0,0,0,0.38)"
              }
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
