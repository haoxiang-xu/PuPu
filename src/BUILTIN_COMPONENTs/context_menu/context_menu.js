import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "../icon/icon";
import { ConfigContext } from "../../CONTAINERs/config/context";

export default function ContextMenu({ visible, x, y, items, onClose, isDark }) {
  const { theme: _theme } = useContext(ConfigContext);
  const ref = useRef(null);

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

  const bg = isDark ? "#1e1e1e" : "#ffffff";
  const border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
    : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)";

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const menuW = 200;
  const menuH = items.length * 32;
  const left = Math.min(x, screenW - menuW - 8);
  const top = Math.min(y, screenH - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        backgroundColor: bg,
        border,
        borderRadius: 8,
        boxShadow: shadow,
        padding: 4,
        minWidth: menuW,
        userSelect: "none",
      }}
    >
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
          />
        );
      })}
    </div>,
    document.body,
  );
}

function MenuRow({ item, isDark, onClose }) {
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
      ? "rgba(255,255,255,0.07)"
      : "rgba(0,0,0,0.05)";

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
        height: 28,
        padding: "0 10px",
        borderRadius: 6,
        color: textColor,
        fontSize: 13,
        cursor: item.disabled ? "not-allowed" : "pointer",
        opacity: item.disabled ? 0.5 : 1,
        backgroundColor: hover && !item.disabled ? hoverBg : "transparent",
      }}
    >
      {item.icon && (
        <Icon src={item.icon} color={textColor} style={{ width: 14, height: 14 }} />
      )}
      <span style={{ flex: 1 }}>{item.label}</span>
    </div>
  );
}
