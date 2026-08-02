import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactDOM from "react-dom";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { subscribe } from "../../SERVICEs/toast_bus";
import { Z } from "../layer/z_layers";
import Icon from "../icon/icon";
import Button from "../input/button";
import ArcSpinner from "../spinner/arc_spinner";

const POSITIONS = [
  "top",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const DEFAULT_POSITION = "top";
const DEFAULT_DURATION = 4000;
const MAX_VISIBLE = 3;
const DEDUPE_WINDOW_MS = 2000;

/* stacked-pile animation (ported from mini_ui toast_viewport) */
const ANIM_MS = 260;
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const PEEK = 12; /* collapsed: how far each card behind peeks out */
const GAP = 10; /* expanded: gap between cards */
const SCALE_STEP = 0.05; /* collapsed: scale-down per depth */
const FALLBACK_H = 56; /* height fallback before measurement */

const VARIANT_ICON = {
  success: "check",
  error: "error",
  warning: "warning",
  info: "information",
  default: "circle",
};

const POS_STYLE = {
  top: {
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    alignItems: "center",
  },
  "top-left": { top: 16, left: 16, alignItems: "flex-start" },
  "top-right": { top: 16, right: 16, alignItems: "flex-end" },
  "bottom-left": { bottom: 16, left: 16, alignItems: "flex-start" },
  "bottom-right": { bottom: 16, right: 16, alignItems: "flex-end" },
};

const isTopPosition = (position) =>
  typeof position === "string" && position.indexOf("top") === 0;

const normalizeVariant = (event) => event.variant || event.type || "default";

const normalizePosition = (event) => {
  if (POSITIONS.indexOf(event.position) >= 0) return event.position;
  return DEFAULT_POSITION;
};

const resolveDuration = (variant, event) => {
  if (event.duration != null) return event.duration;
  if (variant === "error" || variant === "loading") return Infinity;
  if (event.action) return Infinity;
  return DEFAULT_DURATION;
};

const hexToRgb = (color) => {
  const value = String(color || "").trim();
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  if (!full) return null;
  return [
    parseInt(full[1].slice(0, 2), 16),
    parseInt(full[1].slice(2, 4), 16),
    parseInt(full[1].slice(4, 6), 16),
  ].join(",");
};

const withAlpha = (color, alpha) => {
  const rgb = hexToRgb(color);
  return rgb ? `rgba(${rgb}, ${alpha})` : color;
};

const getStatusStyle = (variant, theme, isDark) => {
  const semantic = theme?.semantic || {};
  const text = theme?.color || semantic.text || (isDark ? "#f4f4f5" : "#1f2937");
  const muted =
    semantic.textMuted || (isDark ? "rgba(244,244,245,0.68)" : "rgba(31,41,55,0.62)");
  const surface =
    theme?.foregroundColor || semantic.surface || (isDark ? "#171717" : "#ffffff");
  const border = semantic.border || (isDark ? "#333333" : "#e5e7eb");

  const colors = {
    success: semantic.success || "#2f9e44",
    error: semantic.danger || "#d64545",
    warning: "#d97706",
    info: semantic.accent || theme?.highlightColor || "#2563eb",
    loading: semantic.accent || theme?.highlightColor || "#2563eb",
    default: muted,
  };
  const accent = colors[variant] || colors.default;

  return {
    text,
    muted,
    accent,
    surface,
    border,
    soft: withAlpha(accent, isDark ? 0.2 : 0.12),
    shadow: isDark
      ? "0 16px 42px rgba(0,0,0,0.34)"
      : "0 16px 42px rgba(15,23,42,0.16)",
  };
};

const StatusGlyph = ({ variant, status }) => {
  if (variant === "loading") {
    return <ArcSpinner size={14} stroke_width={2} color={status.accent} />;
  }
  const icon = VARIANT_ICON[variant] || VARIANT_ICON.default;
  return (
    <span style={{ width: 12, height: 12, display: "flex" }}>
      <Icon
        src={icon}
        color={status.accent}
        style={{ width: 12, height: 12 }}
      />
    </span>
  );
};

const ToastCard = ({ item, onDismiss }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [hovered, setHovered] = useState(false);
  const [entered, setEntered] = useState(false);
  const variant = item.variant || item.type || "default";
  const status = getStatusStyle(variant, theme, isDark);
  const assertive = variant === "error" || variant === "warning";

  useEffect(() => {
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setEntered(true)),
    );
    return () => cancelAnimationFrame(raf);
  }, []);

  const shown = entered && !item.leaving;
  const enterY = isTopPosition(item.position) ? -14 : 14;

  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        pointerEvents: "auto",
        position: "relative",
        boxSizing: "border-box",
        width: 316,
        maxWidth: "calc(100vw - 32px)",
        display: "flex",
        gap: 9,
        alignItems: "flex-start",
        padding: "9px 11px",
        borderRadius: 10,
        /* alpha low enough that the backdrop blur actually reads as frosted */
        background: withAlpha(status.surface, isDark ? 0.72 : 0.62),
        border: `1px solid ${withAlpha(status.border, isDark ? 0.9 : 0.82)}`,
        boxShadow: status.shadow,
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        color: status.text,
        fontFamily: theme?.font?.fontFamily || "inherit",
        opacity: shown ? 1 : 0,
        transform: shown
          ? "translateY(0) scale(1)"
          : `translateY(${enterY}px) scale(0.97)`,
        transition: `opacity ${ANIM_MS}ms ${EASE}, transform ${ANIM_MS}ms ${EASE}`,
      }}
    >
      <span
        style={{
          flex: "none",
          width: 20,
          height: 20,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: status.soft,
        }}
      >
        <StatusGlyph variant={variant} status={status} />
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 标题行与图标盒/关闭按钮同为 20px 高的行:三者在 alignItems:flex-start 下
            中心对齐到同一水平线。18.2px 的单行文字(lineHeight 1.4)在 20px 带内居中,
            否则 flex-start 会让偏矮的标题行比 20px 的图标/关闭盒略高 ~1-2px。 */}
        <div
          style={{
            minHeight: 20,
            display: "flex",
            alignItems: "center",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {item.title || item.message}
        </div>
        {item.description ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              marginTop: 2,
              color: status.muted,
            }}
          >
            {item.description}
          </div>
        ) : null}
        {item.action ? (
          <button
            onClick={() => {
              item.action.onClick && item.action.onClick();
              onDismiss(item.id);
            }}
            style={{
              marginTop: 6,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: status.accent,
              padding: "4px 0",
              fontFamily: "inherit",
            }}
          >
            {item.action.label}
          </button>
        ) : null}
      </div>

      {hovered || item.duration === Infinity ? (
        <Button
          ariaLabel="Dismiss"
          prefix_icon="close"
          onClick={() => onDismiss(item.id)}
          style={{
            root: {
              flex: "none",
              width: 20,
              height: 20,
              minWidth: 20,
              paddingVertical: 0,
              paddingHorizontal: 0,
              iconOnlyPaddingVertical: 0,
              iconOnlyPaddingHorizontal: 0,
              borderRadius: 5,
              color: status.muted,
              fontFamily: "inherit",
            },
            background: {
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              activeBackgroundColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.10)",
            },
            content: {
              icon: { width: 13, height: 13 },
            },
            state: {
              hover: {
                root: { color: status.text },
              },
            },
          }}
        />
      ) : null}
    </div>
  );
};

const Pile = ({ position, items, onDismiss, onHoverChange }) => {
  const top = isTopPosition(position);
  const ordered = [...items].reverse(); /* newest first (front = index 0) */
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = Math.max(0, ordered.length - visible.length);

  const [expanded, setExpanded] = useState(false);
  const wrapRefs = useRef({});
  const [heights, setHeights] = useState({});

  const idKey = visible.map((item) => item.id).join(",");
  useLayoutEffect(() => {
    const next = {};
    visible.forEach((item) => {
      const el = wrapRefs.current[item.id];
      if (el) next[item.id] = el.offsetHeight;
    });
    setHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const heightOf = (item) => heights[item.id] || FALLBACK_H;
  const dir = top ? 1 : -1;
  const count = visible.length;

  const expandedOffset = (index) => {
    let sum = 0;
    for (let k = 0; k < index; k += 1) sum += heightOf(visible[k]) + GAP;
    return sum;
  };

  const frontH = count ? heightOf(visible[0]) : 0;
  const collapsedTotal = frontH + Math.max(0, count - 1) * PEEK;
  const expandedTotal = count
    ? visible.reduce((sum, item) => sum + heightOf(item), 0) +
      (count - 1) * GAP
    : 0;
  const pileHeight = expanded ? expandedTotal : collapsedTotal;
  const anchorEdge = top ? { top: 0 } : { bottom: 0 };

  return (
    <div
      data-testid={`toast-pile-${position}`}
      onMouseEnter={() => {
        setExpanded(true);
        onHoverChange(true);
      }}
      onMouseLeave={() => {
        setExpanded(false);
        onHoverChange(false);
      }}
      style={{
        position: "fixed",
        zIndex: Z.TOAST,
        display: "flex",
        flexDirection: top ? "column" : "column-reverse",
        /* the whole pile (incl. the gaps between expanded cards) must be ONE
           contiguous hit region — otherwise hovering a gap fires mouseLeave
           and the pile flickers collapse<->expand. Keep it "auto". */
        pointerEvents: "auto",
        /* the top pile overlaps the window drag region — opt out like the
           side-menu buttons do, or part of the card swallows no clicks */
        WebkitAppRegion: "no-drag",
        ...POS_STYLE[position],
      }}
    >
      <div
        style={{
          position: "relative",
          width: 316,
          maxWidth: "calc(100vw - 32px)",
          height: pileHeight,
          transition: `height ${ANIM_MS}ms ${EASE}`,
        }}
      >
        {visible.map((item, index) => {
          const y = expanded
            ? dir * expandedOffset(index)
            : dir * index * PEEK;
          const scale = expanded ? 1 : 1 - index * SCALE_STEP;
          return (
            <div
              key={item.id}
              data-toast-slot=""
              ref={(el) => {
                if (el) wrapRefs.current[item.id] = el;
                else delete wrapRefs.current[item.id];
              }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                ...anchorEdge,
                zIndex: 100 - index,
                pointerEvents: "auto",
                transformOrigin: top ? "top center" : "bottom center",
                transform: `translateY(${y}px) scale(${scale})`,
                /* depth cards keep full opacity: dimming reads as noise and an
                   opacity <1 wrapper would also isolate the card's backdrop blur */
                opacity: 1,
                transition: `transform ${ANIM_MS}ms ${EASE}`,
              }}
            >
              <ToastCard item={item} onDismiss={onDismiss} />
            </div>
          );
        })}
      </div>
      {overflow > 0 ? (
        <div
          style={{
            pointerEvents: "auto",
            fontSize: 11.5,
            opacity: 0.62,
            textAlign: "center",
            padding: "4px 0 0",
          }}
        >
          +{overflow} more
        </div>
      ) : null}
    </div>
  );
};

export default function ToastHost() {
  const [items, setItems] = useState([]);
  /* id -> { timer, expiresAt, remaining, exit } */
  const timersRef = useRef(new Map());
  const pausedRef = useRef(false);
  const apiRef = useRef({});

  useEffect(() => {
    const timers = timersRef.current;

    const clearTimer = (id) => {
      const entry = timers.get(id);
      if (entry?.timer) clearTimeout(entry.timer);
      timers.delete(id);
    };

    const finalizeRemove = (id) => {
      clearTimer(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    };

    /* two-phase removal: mark leaving (exit animation), then unmount */
    const startLeaving = (id) => {
      clearTimer(id);
      setItems((prev) =>
        prev.map((item) =>
          item.id === id && !item.leaving
            ? { ...item, leaving: true }
            : item,
        ),
      );
      const timer = setTimeout(() => finalizeRemove(id), ANIM_MS);
      timers.set(id, { timer, expiresAt: null, remaining: null, exit: true });
    };

    const scheduleDismiss = (item) => {
      clearTimer(item.id);
      if (item.duration == null || item.duration === Infinity) return;
      if (pausedRef.current) {
        /* pile is hovered — hold the full duration until resume */
        timers.set(item.id, {
          timer: null,
          expiresAt: null,
          remaining: item.duration,
          exit: false,
        });
        return;
      }
      const timer = setTimeout(() => startLeaving(item.id), item.duration);
      timers.set(item.id, {
        timer,
        expiresAt: Date.now() + item.duration,
        remaining: null,
        exit: false,
      });
    };

    /* hover pause: freeze remaining time, exit animations keep running */
    const pauseAll = () => {
      pausedRef.current = true;
      const now = Date.now();
      for (const [id, entry] of timers) {
        if (entry.exit || entry.expiresAt == null) continue;
        clearTimeout(entry.timer);
        timers.set(id, {
          timer: null,
          expiresAt: null,
          remaining: Math.max(0, entry.expiresAt - now),
          exit: false,
        });
      }
    };

    const resumeAll = () => {
      pausedRef.current = false;
      for (const [id, entry] of timers) {
        if (entry.exit || entry.remaining == null) continue;
        const timer = setTimeout(() => startLeaving(id), entry.remaining);
        timers.set(id, {
          timer,
          expiresAt: Date.now() + entry.remaining,
          remaining: null,
          exit: false,
        });
      }
    };

    apiRef.current = { startLeaving, pauseAll, resumeAll };

    const normalizeEvent = (event) => {
      const variant = normalizeVariant(event);
      const position = normalizePosition(event);
      return {
        ...event,
        type: variant,
        variant,
        position,
        duration: resolveDuration(variant, event),
        title: event.title || event.message || "",
        message: event.message || event.title || "",
        dedupeKey:
          event.dedupeKey || `${variant}:${event.message || event.title || ""}`,
        createdAt: Date.now(),
      };
    };

    const showItem = (event) => {
      const nextItem = normalizeEvent(event);
      let scheduled = nextItem;
      let victimId = null;
      setItems((prev) => {
        const now = Date.now();
        const existingIndex = prev.findIndex(
          (item) =>
            !item.leaving &&
            item.dedupeKey === nextItem.dedupeKey &&
            now - item.createdAt < DEDUPE_WINDOW_MS,
        );
        let next;
        if (existingIndex >= 0) {
          next = [...prev];
          scheduled = {
            ...next[existingIndex],
            ...nextItem,
            id: next[existingIndex].id,
            createdAt: next[existingIndex].createdAt,
          };
          next[existingIndex] = scheduled;
        } else {
          next = [...prev, nextItem];
        }

        const samePosition = next.filter(
          (item) => item.position === nextItem.position && !item.leaving,
        );
        if (samePosition.length > MAX_VISIBLE) {
          const victim = samePosition.find(
            (item) => !item.important && item.id !== scheduled.id,
          );
          if (victim) victimId = victim.id;
        }
        return next;
      });
      if (victimId) startLeaving(victimId);
      scheduleDismiss(scheduled);
    };

    const updateItem = (event) => {
      let scheduled = null;
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== event.id || item.leaving) return item;
          const variant = event.variant || event.type || item.variant;
          const next = {
            ...item,
            ...event,
            type: variant,
            variant,
            position: normalizePosition({ ...item, ...event }),
            title: event.title || event.message || item.title,
            message: event.message || event.title || item.message,
            duration: resolveDuration(variant, { ...item, ...event }),
          };
          scheduled = next;
          return next;
        }),
      );
      if (scheduled) scheduleDismiss(scheduled);
    };

    const unsubscribe = subscribe((event) => {
      if (event.kind === "dismiss") {
        startLeaving(event.id);
      } else if (event.kind === "update") {
        updateItem(event);
      } else if (event.kind === "show") {
        showItem(event);
      }
    });

    return () => {
      unsubscribe();
      for (const entry of timers.values()) {
        if (entry?.timer) clearTimeout(entry.timer);
      }
      timers.clear();
    };
  }, []);

  if (items.length === 0 || typeof document === "undefined") return null;

  const byPosition = {};
  POSITIONS.forEach((position) => {
    byPosition[position] = [];
  });
  items.forEach((item) => {
    const position =
      POSITIONS.indexOf(item.position) >= 0 ? item.position : DEFAULT_POSITION;
    byPosition[position].push(item);
  });

  return ReactDOM.createPortal(
    <>
      {POSITIONS.map((position) =>
        byPosition[position].length ? (
          <Pile
            key={position}
            position={position}
            items={byPosition[position]}
            onDismiss={(id) => apiRef.current.startLeaving?.(id)}
            onHoverChange={(hovering) =>
              hovering
                ? apiRef.current.pauseAll?.()
                : apiRef.current.resumeAll?.()
            }
          />
        ) : null,
      )}
    </>,
    document.body,
  );
}
