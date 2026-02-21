import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSprings, animated, to as interpolate } from "react-spring";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ============================================================================================================================ */
/*  Carousel — modern card-flow component with spring physics                                                                   */
/* ============================================================================================================================ */

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const Carousel = ({
  children,
  items = [],
  render_item,
  active_index: controlled_index,
  on_change = () => {},
  card_width = 280,
  card_height = 360,
  card_gap = 24,
  visible_count = 5,
  max_rotate_y = 8,
  overlap = 0.5,
  disabled = false,
  style,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  /* ---- State ---- */
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex =
    controlled_index !== undefined ? controlled_index : internalIndex;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const count = items.length || 0;

  /* ---- Refs for stable spring computation ---- */
  const cardWidthRef = useRef(card_width);
  const cardGapRef = useRef(card_gap);
  const maxRotateRef = useRef(max_rotate_y);
  const overlapRef = useRef(overlap);
  cardWidthRef.current = card_width;
  cardGapRef.current = card_gap;
  maxRotateRef.current = max_rotate_y;
  overlapRef.current = overlap;

  const setActiveIndex = useCallback(
    (idx) => {
      if (count <= 0) return;
      const clamped = clamp(idx, 0, count - 1);
      if (controlled_index === undefined) setInternalIndex(clamped);
      on_change(clamped);
    },
    [controlled_index, count, on_change],
  );

  const containerRef = useRef(null);

  /* ---- Spring computation (stable — reads refs only) ---- */
  const getSpringProps = useCallback((i, idx) => {
    const diff = i - idx;

    const visibleWidth =
      cardWidthRef.current * (1 - clamp(overlapRef.current, 0, 1));
    const x = diff * (visibleWidth + cardGapRef.current);
    const absOffset = Math.abs(diff);
    const scale = 1 - Math.min(absOffset, 3) * 0.12;
    const mr = maxRotateRef.current;
    const rotateY = clamp(-diff * mr, -mr, mr);
    const opacity = absOffset > 3 ? 0 : 1;

    return { x, scale, rotateY, opacity };
  }, []);

  const springConfig = useMemo(
    () => ({ tension: 170, friction: 26, clamp: false, precision: 0.01 }),
    [],
  );

  const [springs, api] = useSprings(
    count,
    (i) => ({
      ...getSpringProps(i, activeIndex),
      config: springConfig,
    }),
    [count],
  );

  /* Keep index valid when item count changes */
  useEffect(() => {
    if (count <= 0) return;
    const clamped = clamp(activeIndex, 0, count - 1);
    if (clamped !== activeIndex) {
      if (controlled_index === undefined) setInternalIndex(clamped);
      on_change(clamped);
    }
  }, [count, activeIndex, controlled_index, on_change]);

  /* ---- Animate on index / layout changes ---- */
  useEffect(() => {
    api.start((i) => ({
      ...getSpringProps(i, activeIndex),
      config: springConfig,
    }));
  }, [
    activeIndex,
    card_width,
    card_gap,
    max_rotate_y,
    overlap,
    api,
    getSpringProps,
    springConfig,
  ]);

  /* Theme switch can recreate spring controllers; re-apply active index after that tick */
  useEffect(() => {
    if (count <= 0) return;
    const raf = requestAnimationFrame(() => {
      const idx = activeIndexRef.current;
      api.start((i) => ({
        ...getSpringProps(i, idx),
        immediate: true,
        config: springConfig,
      }));
    });
    return () => cancelAnimationFrame(raf);
  }, [onThemeMode, count, api, getSpringProps, springConfig]);

  /* ---- Click to navigate ---- */
  const handleCardClick = useCallback(
    (idx) => {
      if (disabled) return;
      if (idx !== activeIndex) {
        setActiveIndex(idx);
      }
    },
    [disabled, activeIndex, setActiveIndex],
  );

  /* ---- Keyboard ---- */
  const handleKeyDown = useCallback(
    (e) => {
      if (disabled) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex(activeIndex + 1);
      }
    },
    [disabled, activeIndex, setActiveIndex],
  );

  /* ---- Resolved styles ---- */
  const resolved = useMemo(() => {
    const carouselTheme = theme?.carousel;
    const bg =
      style?.backgroundColor ??
      carouselTheme?.backgroundColor ??
      (isDark ? "rgba(30, 30, 30, 1)" : "rgba(255, 255, 255, 1)");
    const color =
      style?.color ??
      carouselTheme?.color ??
      theme?.color ??
      (isDark ? "#CCC" : "#222");
    const borderRadius =
      style?.borderRadius ?? carouselTheme?.borderRadius ?? 14;
    const fontFamily = theme?.font?.fontFamily ?? "Jost";
    const shadow =
      style?.boxShadow ??
      carouselTheme?.boxShadow ??
      (isDark
        ? "0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3)"
        : "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)");
    const border =
      style?.border ??
      carouselTheme?.border ??
      (isDark
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(0,0,0,0.06)");

    return {
      bg,
      color,
      borderRadius,
      fontFamily,
      shadow,
      border,
    };
  }, [isDark, theme, style]);

  /* ---- Dots ---- */
  const renderDots = () => {
    if (count <= 1) return null;
    const maxDots = 7;
    const start = Math.max(0, activeIndex - Math.floor(maxDots / 2));
    const end = Math.min(count, start + maxDots);
    const adjustedStart = Math.max(0, end - maxDots);

    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "center",
          marginTop: 24,
        }}
      >
        {Array.from({ length: end - adjustedStart }, (_, i) => {
          const idx = adjustedStart + i;
          return (
            <button
              key={idx}
              aria-label={`Go to slide ${idx + 1}`}
              onClick={() => !disabled && setActiveIndex(idx)}
              style={{
                width: idx === activeIndex ? 20 : 8,
                height: 8,
                borderRadius: 4,
                border: "none",
                cursor: disabled ? "default" : "pointer",
                padding: 0,
                backgroundColor:
                  idx === activeIndex
                    ? resolved.color
                    : isDark
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.12)",
                opacity: disabled ? 0.4 : idx === activeIndex ? 0.7 : 0.35,
                transition:
                  "width 0.3s cubic-bezier(0.4,0,0.2,1), background-color 0.2s ease, opacity 0.2s ease",
              }}
            />
          );
        })}
      </div>
    );
  };

  if (count === 0) return null;

  return (
    <div
      ref={containerRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Carousel"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        width: "100%",
        overflow: "hidden",
        outline: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.2s ease",
        ...style?.container,
      }}
    >
      {/* Card track */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: card_height + 48,
        }}
      >
        {springs.map((springStyle, i) => {
          const isActive = i === activeIndex;
          return (
            <animated.div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${count}`}
              aria-hidden={springStyle.opacity.to((o) =>
                o < 0.05 ? "true" : "false",
              )}
              onClick={() => handleCardClick(i)}
              style={{
                position: "absolute",
                width: card_width,
                height: card_height,
                borderRadius: resolved.borderRadius,
                backgroundColor: resolved.bg,
                border: resolved.border,
                boxShadow: resolved.shadow,
                overflow: "hidden",
                cursor: disabled ? "default" : isActive ? "default" : "pointer",
                transform: interpolate(
                  [springStyle.x, springStyle.scale, springStyle.rotateY],
                  (x, s, r) =>
                    `translateX(${x}px) scale(${s}) rotateY(${r}deg)`,
                ),
                opacity: springStyle.opacity,
                /* zIndex derived from animated x — closer to center = higher z */
                zIndex: springStyle.x.to((x) => {
                  const visibleW = card_width * (1 - clamp(overlap, 0, 1));
                  const maxSpread = visibleW + card_gap;
                  const normalized = Math.abs(x) / Math.max(maxSpread, 1);
                  return Math.round(100 - normalized * 10);
                }),
                willChange: "transform, opacity",
                pointerEvents: springStyle.opacity.to((o) =>
                  o < 0.05 ? "none" : "auto",
                ),
              }}
            >
              {render_item ? (
                render_item({ item: items[i], index: i, is_active: isActive })
              ) : children ? (
                typeof children === "function" ? (
                  children({ item: items[i], index: i, is_active: isActive })
                ) : (
                  children
                )
              ) : (
                <DefaultCard
                  item={items[i]}
                  is_active={isActive}
                  resolved={resolved}
                  card_height={card_height}
                />
              )}
            </animated.div>
          );
        })}
      </div>

      {/* Navigation arrows */}
      {count > 1 && !disabled && (
        <>
          <button
            aria-label="Previous slide"
            onClick={() => setActiveIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            style={{
              position: "absolute",
              top: "50%",
              left: 12,
              transform: "translateY(-50%)",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)",
              color: resolved.color,
              fontSize: 18,
              cursor: activeIndex === 0 ? "default" : "pointer",
              opacity: activeIndex === 0 ? 0.2 : 0.6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s ease, background-color 0.2s ease",
              zIndex: 200,
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (activeIndex !== 0)
                e.currentTarget.style.backgroundColor = isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(0,0,0,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3L5 8L10 13" />
            </svg>
          </button>
          <button
            aria-label="Next slide"
            onClick={() => setActiveIndex(activeIndex + 1)}
            disabled={activeIndex === count - 1}
            style={{
              position: "absolute",
              top: "50%",
              right: 12,
              transform: "translateY(-50%)",
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "none",
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)",
              color: resolved.color,
              fontSize: 18,
              cursor: activeIndex === count - 1 ? "default" : "pointer",
              opacity: activeIndex === count - 1 ? 0.2 : 0.6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "opacity 0.2s ease, background-color 0.2s ease",
              zIndex: 200,
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (activeIndex !== count - 1)
                e.currentTarget.style.backgroundColor = isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(0,0,0,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.05)";
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3L11 8L6 13" />
            </svg>
          </button>
        </>
      )}

      {/* Dots */}
      {renderDots()}
    </div>
  );
};

/* ---- DefaultCard — used when no render_item / children provided ---- */
const DefaultCard = ({ item, is_active, resolved, card_height }) => {
  const hasImage = item?.image;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: resolved.color,
        fontFamily: resolved.fontFamily,
      }}
    >
      {hasImage && (
        <div
          style={{
            width: "100%",
            height: card_height * 0.6,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <img
            src={item.image}
            alt={item.title || ""}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              filter: is_active ? "none" : "brightness(0.85)",
              transition: "filter 0.3s ease",
            }}
          />
        </div>
      )}
      <div
        style={{
          flex: 1,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {item?.title && (
          <span
            style={{
              fontSize: 18,
              fontWeight: 600,
              lineHeight: 1.3,
              opacity: is_active ? 1 : 0.7,
              transition: "opacity 0.3s ease",
            }}
          >
            {item.title}
          </span>
        )}
        {item?.description && (
          <span
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              opacity: is_active ? 0.6 : 0.35,
              transition: "opacity 0.3s ease",
            }}
          >
            {item.description}
          </span>
        )}
      </div>
    </div>
  );
};

export default Carousel;
