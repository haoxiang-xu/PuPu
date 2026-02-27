import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ============================================================================================================================ */
/*  Card — vanilla-tilt style 3D hover card                                                                                     */
/* ============================================================================================================================ */
const Card = ({
  children,
  title,
  width = 320,
  height = "auto",
  max_tilt = 12,
  perspective = 800,
  scale = 1.02,
  speed = 400,
  border_radius = 7,
  style,
  title_style,
  body_style,
  disabled = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const cardRef = useRef(null);
  const rafRef = useRef(null);
  const [isHovering, setIsHovering] = useState(false);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, mx: 0.5, my: 0.5 });

  const isDark = onThemeMode === "dark_mode";

  const colors = useMemo(() => {
    const bg =
      style?.backgroundColor ??
      (isDark ? "rgba(30, 30, 30, 0.95)" : "rgba(255, 255, 255, 0.95)");
    const color = style?.color ?? theme?.color ?? (isDark ? "#CCC" : "#222");
    const border = isDark
      ? "1px solid rgba(255, 255, 255, 0.08)"
      : "1px solid rgba(0, 0, 0, 0.06)";
    const shadow = isDark
      ? "0 4px 24px rgba(0, 0, 0, 0.5), 0 1px 3px rgba(0, 0, 0, 0.3)"
      : "0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.06)";
    const shadowHover = isDark
      ? "0 16px 48px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)"
      : "0 16px 48px rgba(0, 0, 0, 0.12), 0 4px 12px rgba(0, 0, 0, 0.08)";
    const titleColor =
      title_style?.color ??
      (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)");
    return { bg, color, border, shadow, shadowHover, titleColor };
  }, [isDark, theme, style, title_style]);

  const updateTilt = useCallback(
    (clientX, clientY) => {
      const el = cardRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      const mx = (clientX - rect.left) / rect.width;
      const my = (clientY - rect.top) / rect.height;
      const ry = max_tilt * (mx - 0.5) * 2;
      const rx = -max_tilt * (my - 0.5) * 2;
      setTilt({ rx, ry, mx, my });
    },
    [max_tilt, disabled],
  );

  const handleMouseEnter = useCallback(() => {
    if (disabled) return;
    setIsHovering(true);
  }, [disabled]);

  const handleMouseMove = useCallback(
    (e) => {
      if (disabled) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        updateTilt(e.clientX, e.clientY);
      });
    },
    [disabled, updateTilt],
  );

  const handleMouseLeave = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsHovering(false);
    setTilt({ rx: 0, ry: 0, mx: 0.5, my: 0.5 });
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const transitionValue = isHovering
    ? `transform ${speed * 0.4}ms cubic-bezier(0.03, 0.98, 0.52, 0.99), box-shadow ${speed}ms ease`
    : `transform ${speed}ms cubic-bezier(0.03, 0.98, 0.52, 0.99), box-shadow ${speed}ms ease`;

  const cardTransform = isHovering
    ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale3d(${scale}, ${scale}, ${scale})`
    : `rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;

  return (
    <div
      style={{
        perspective: `${perspective}px`,
        width,
        height,
      }}
    >
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: "relative",
          boxSizing: "border-box",
          width: "100%",
          height: "100%",
          borderRadius: border_radius,
          backgroundColor: colors.bg,
          border: colors.border,
          color: colors.color,
          boxShadow: isHovering ? colors.shadowHover : colors.shadow,
          transform: cardTransform,
          transformStyle: "preserve-3d",
          transition: transitionValue,
          willChange: "transform, box-shadow",
          cursor: disabled ? "default" : "default",
          ...style,
          /* overrides that must not be overwritten by style */
          transformOrigin: "center center",
        }}
      >
        {/* Content */}
        <div
          style={{
            position: "relative",
            zIndex: 0,
            transformStyle: "preserve-3d",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          {title !== undefined && title !== null && (
            <div
              style={{
                padding: "14px 18px 0 18px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: theme?.font?.fontFamily ?? "Jost",
                color: colors.titleColor,
                letterSpacing: "0.02em",
                textTransform: "uppercase",
                userSelect: "none",
                ...title_style,
              }}
            >
              {title}
            </div>
          )}
          <div
            style={{
              flex: 1,
              padding: 18,
              transformStyle: "preserve-3d",
              ...body_style,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Helper: float a child on z-axis for parallax depth */
Card.Layer = ({ children, depth = 20, style: layerStyle }) => (
  <div
    style={{
      transformStyle: "preserve-3d",
      transform: `translateZ(${depth}px)`,
      ...layerStyle,
    }}
  >
    {children}
  </div>
);

export default Card;
