import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../icon/icon";

/**
 * ContextMenu — right-click menu in the command-palette family language:
 * translucent blur(20px) surface, radius 22 with an 8px inset, 28px rows at
 * radius 14 (concentric), row-level hover highlight, and a quick staggered
 * row entrance. Danger rows stay red.
 */

const PANEL_RADIUS = 22;
const PANEL_PAD = 8;
const ROW_H = 28;
const ROW_RADIUS = 14;
const MENU_W = 200;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function ContextMenu({ visible, x, y, items, onClose, isDark }) {
  const ref = useRef(null);

  /* double-rAF latch so the entrance animates on mount */
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    if (!visible) {
      setEntered(false);
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

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuH =
    items.reduce(
      (h, item) => h + (item.type === "separator" ? 9 : ROW_H + 1),
      0,
    ) +
    PANEL_PAD * 2;
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
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: MENU_W,
        padding: PANEL_PAD,
        backgroundColor: isDark
          ? "rgba(28,28,28,0.85)"
          : "rgba(252,252,252,0.9)",
        border: isDark
          ? "1px solid rgba(255,255,255,0.10)"
          : "1px solid rgba(0,0,0,0.09)",
        borderRadius: PANEL_RADIUS,
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        boxShadow: isDark
          ? "0 10px 34px rgba(0,0,0,0.5)"
          : "0 10px 34px rgba(0,0,0,0.12)",
        userSelect: "none",
        opacity: entered ? 1 : 0,
        transform: entered ? "none" : "scale(0.96)",
        transformOrigin: `${originY} ${originX}`,
        transition: `opacity 140ms ease, transform 180ms ${EASE_OUT}`,
      }}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                margin: "4px 6px",
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
          />
        );
      })}
    </div>,
    document.body,
  );
}

function MenuRow({ item, isDark, onClose, entered, delayMs }) {
  const [hover, setHover] = useState(false);

  const textColor = item.danger
    ? isDark
      ? "rgba(255,100,100,0.9)"
      : "rgba(180,30,30,0.9)"
    : isDark
      ? "rgba(255,255,255,0.85)"
      : "rgba(0,0,0,0.80)";
  const hoverBg = item.danger
    ? isDark
      ? "rgba(220,50,50,0.15)"
      : "rgba(220,50,50,0.08)"
    : isDark
      ? "rgba(255,255,255,0.10)"
      : "rgba(0,0,0,0.06)";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (item.disabled) return;
        item.onClick?.();
        onClose();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        height: ROW_H,
        padding: "0 8px",
        borderRadius: ROW_RADIUS,
        color: textColor,
        fontSize: 13,
        cursor: item.disabled ? "not-allowed" : "pointer",
        opacity: item.disabled ? 0.5 : entered ? 1 : 0,
        backgroundColor: hover && !item.disabled ? hoverBg : "transparent",
        transform: entered ? "translateY(0)" : "translateY(-6px)",
        transition: `transform 160ms cubic-bezier(0.22,1,0.36,1) ${delayMs}ms, opacity 150ms linear ${delayMs}ms, background-color 0.13s ease`,
      }}
    >
      {item.prefix_icon && (
        <Icon
          src={item.prefix_icon}
          color={textColor}
          style={{ width: 12, height: 12, opacity: 0.6 }}
        />
      )}
      {item.icon && (
        <Icon src={item.icon} color={textColor} style={{ width: 14, height: 14 }} />
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
    </div>
  );
}
