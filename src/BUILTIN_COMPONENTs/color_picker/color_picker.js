import { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";

export const normalizeHex = (input) => {
  let v = String(input || "").trim().toLowerCase();
  if (!v.startsWith("#")) v = `#${v}`;
  const short = /^#([0-9a-f]{3})$/.exec(v);
  if (short) {
    const [, s] = short;
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`;
  }
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  return null;
};

/**
 * Opens the native OS color picker imperatively so no hidden
 * <input type="color"> sits in the DOM and interferes with
 * getByDisplayValue queries in tests.
 */
const openNativeColorPicker = (currentHex, onPreview, onCommit) => {
  const el = document.createElement("input");
  el.type = "color";
  el.value = currentHex || "#000000";
  el.style.position = "fixed";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  const remove = () => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  };
  el.addEventListener("input", (e) => onPreview(e.target.value));
  el.addEventListener("change", (e) => {
    onCommit(e.target.value);
    remove();
  });
  el.click();
};

const ColorPicker = ({ label, value, onChange, onPreview, onCommit }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const wrapRef = useRef(null);

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const emitPreview = (raw) => {
    setDraft(raw);
    const hex = normalizeHex(raw);
    if (hex) {
      (onPreview || onChange || (() => {}))(hex);
    }
  };

  const emitCommit = (raw) => {
    setDraft(raw);
    const hex = normalizeHex(raw);
    if (hex && onCommit) {
      onCommit(hex);
    }
  };

  const handleSwatchClick = () => {
    const validHex = normalizeHex(draft) || "#000000";
    openNativeColorPicker(validHex, emitPreview, emitCommit);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderRadius: 7,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
          cursor: "pointer",
          color: isDark ? "#fff" : "#222",
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            backgroundColor: value,
            border: `1px solid ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`,
          }}
        />
        <span>{value}</span>
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 8,
            borderRadius: 10,
            backgroundColor: isDark ? "#1e1e1e" : "#ffffff",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
            boxShadow: isDark
              ? "0 14px 24px rgba(0,0,0,0.45)"
              : "0 12px 20px rgba(0,0,0,0.12)",
          }}
        >
          {/* Color swatch — clicking opens the native OS color picker imperatively
              so no persistent <input type="color"> sits in the DOM */}
          <div
            onClick={handleSwatchClick}
            style={{
              width: 32,
              height: 32,
              borderRadius: 4,
              backgroundColor: normalizeHex(draft) || "#000000",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`,
              cursor: "pointer",
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={draft}
            onChange={(e) => emitPreview(e.target.value)}
            onBlur={(e) => emitCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                emitCommit(e.currentTarget.value);
                setOpen(false);
              }
            }}
            style={{
              width: 90,
              fontSize: 13,
              fontFamily: "Menlo, monospace",
              padding: "4px 6px",
              borderRadius: 6,
              border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
              backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#f5f5f5",
              color: isDark ? "#fff" : "#222",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default ColorPicker;
