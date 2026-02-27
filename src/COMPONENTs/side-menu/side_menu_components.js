import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import Button from "../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";

export const RenameRow = ({
  node,
  value,
  onChange,
  onConfirm,
  onCancel,
  isDark,
}) => {
  const inputRef = useRef(null);
  const ICON_SIZE = 15; // Math.round(13 * 1.15)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: 30,
        paddingRight: 8,
        gap: 4,
        fontSize: 13,
        fontFamily: "Jost, sans-serif",
        color: isDark ? "#CCC" : "#222",
      }}
    >
      <span style={{ width: 18, height: 18, flexShrink: 0 }} />

      {node.prefix_icon && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            opacity: 0.7,
          }}
        >
          <Icon
            src={node.prefix_icon}
            style={{ width: ICON_SIZE, height: ICON_SIZE }}
          />
        </span>
      )}

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onConfirm();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={onCancel}
        style={{
          flex: 1,
          minWidth: 0,
          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
          border: "none",
          borderBottom: `1.5px solid ${
            isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)"
          }`,
          outline: "none",
          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
          fontSize: 13,
          fontFamily: "Jost, sans-serif",
          padding: "2px 4px",
          borderRadius: "3px 3px 0 0",
          lineHeight: 1.2,
        }}
      />

      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onConfirm();
        }}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
          padding: "2px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          borderRadius: 3,
        }}
      >
        <Icon src="check" style={{ width: 13, height: 13 }} />
      </button>
    </div>
  );
};

export const ContextMenu = ({ visible, x, y, items, onClose, isDark }) => {
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
  const menuW = 180;
  const menuH = items.length * 32;
  const left = Math.min(x, screenW - menuW - 8);
  const top = Math.min(y, screenH - menuH - 8);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top,
        left,
        zIndex: 99999,
        backgroundColor: bg,
        border,
        borderRadius: 8,
        boxShadow: shadow,
        padding: "4px",
        minWidth: menuW,
        userSelect: "none",
      }}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={i}
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
            key={i}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "Jost",
              color: textColor,
              borderRadius: 6,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hoverBg;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {item.icon && (
              <Icon
                src={item.icon}
                color={textColor}
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
            )}
            {item.label}
          </div>
        );
      })}
    </div>,
    document.body,
  );
};

export const ConfirmDeleteModal = ({
  open,
  onClose,
  onConfirm,
  label,
  isDark,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 360,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.15)"
          : "rgba(220,50,50,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
          fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
        />
      </svg>
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Delete "{label}"?
    </div>

    <div
      style={{
        fontSize: 13,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 24,
        lineHeight: 1.5,
      }}
    >
      This cannot be undone. All chats inside will also be removed.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Delete"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,50,50,0.40)"
            : "rgba(220,50,50,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,50,50,0.58)"
            : "rgba(220,50,50,0.22)",
          color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
        }}
      />
    </div>
  </Modal>
);
