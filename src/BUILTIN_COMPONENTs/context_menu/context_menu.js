import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../icon/icon";
import SlidingHighlight from "../class/sliding_highlight";

/**
 * ContextMenu — right-click menu. Original compact geometry (radius 8,
 * 4px inset, 28px rows at radius 6), with the palette family's frosted
 * surface (translucent themed color + blur) and entrance animation (panel
 * scales in from the pointer corner, rows cascade briefly).
 */

const MENU_W = 200;
const ROW_H = 28;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function ContextMenu({ visible, x, y, items, onClose, isDark }) {
  const ref = useRef(null);
  const rowRefs = useRef([]);
  const [hoverIndex, setHoverIndex] = useState(-1);

  /* double-rAF latch so the entrance animates on mount */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!visible) {
      setEntered(false);
      setHoverIndex(-1);
      return undefined;
    }
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onMouseDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
    : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuH = items.length * 32;
  const left = Math.min(x, screenW - MENU_W - 8);
  const top = Math.min(y, screenH - menuH - 8);
  /* grow away from the pointer: origin follows which corner we open from */
  const originX = left < x ? "right" : "left";
  const originY = top < y ? "bottom" : "top";

  return createPortal(
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        backgroundColor: isDark
          ? "color-mix(in srgb, var(--pupu-surface, rgb(30, 30, 30)) 85%, transparent)"
          : "color-mix(in srgb, var(--pupu-surface, rgb(255, 255, 255)) 90%, transparent)",
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        border,
        borderRadius: 8,
        boxShadow: shadow,
        padding: 4,
        minWidth: MENU_W,
        userSelect: "none",
        opacity: entered ? 1 : 0,
        transform: entered ? "none" : "scale(0.96)",
        transformOrigin: `${originY} ${originX}`,
        transition: `opacity 140ms ease, transform 180ms ${EASE_OUT}`,
      }}
      onMouseLeave={() => setHoverIndex(-1)}
    >
      {/* one hover pill gliding between rows (red over danger rows) */}
      <SlidingHighlight
        refs={rowRefs}
        index={hoverIndex}
        color={
          items[hoverIndex]?.danger
            ? isDark
              ? "rgba(220,50,50,0.15)"
              : "rgba(220,50,50,0.08)"
            : isDark
              ? "rgba(255,255,255,0.07)"
              : "rgba(0,0,0,0.05)"
        }
        borderRadius={6}
        measureKey={items.length}
      />
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                margin: "4px 0",
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
              }}
            />
          );
        }
        return (
          <MenuRow
            key={`item-${i}`}
            item={item}
            isDark={isDark}
            onClose={onClose}
            entered={entered}
            delayMs={30 + i * 22}
            refCallback={(el) => {
              rowRefs.current[i] = el;
            }}
            onHover={() => {
              if (!item.disabled) setHoverIndex(i);
            }}
          />
        );
      })}
    </div>,
    document.body,
  );
}

function MenuRow({ item, isDark, onClose, entered, delayMs, refCallback, onHover }) {
  const textColor = item.danger
    ? isDark
      ? "rgba(255,100,100,0.9)"
      : "rgba(180,30,30,0.9)"
    : isDark
      ? "rgba(255,255,255,0.85)"
      : "rgba(0,0,0,0.80)";

  return (
    <div
      ref={refCallback}
      onMouseEnter={onHover}
      onClick={() => {
        if (item.disabled) return;
        item.onClick?.();
        onClose();
      }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: ROW_H,
        padding: "0 10px",
        borderRadius: 6,
        color: textColor,
        fontSize: 13,
        cursor: item.disabled ? "not-allowed" : "pointer",
        opacity: item.disabled ? 0.5 : entered ? 1 : 0,
        transform: entered ? "translateY(0)" : "translateY(-6px)",
        transition: `transform 160ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, opacity 150ms linear ${delayMs}ms`,
      }}
    >
      {item.prefix_icon && (
        <Icon
          src={item.prefix_icon}
          color={textColor}
          style={{
            position: "relative",
            zIndex: 1,
            width: 12,
            height: 12,
            opacity: 0.6,
          }}
        />
      )}
      {item.icon && (
        <Icon
          src={item.icon}
          color={textColor}
          style={{ position: "relative", zIndex: 1, width: 14, height: 14 }}
        />
      )}
      <span style={{ position: "relative", zIndex: 1, flex: 1 }}>
        {item.label}
      </span>
    </div>
  );
}
