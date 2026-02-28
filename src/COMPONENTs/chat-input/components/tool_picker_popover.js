import { useEffect, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import { BASE_TOOLKIT_IDS } from "../constants";
import { filter_toolkits } from "../utils/filter_toolkits";

const ToolPickerPopover = ({
  selected,
  onChange,
  onClose,
  anchorEl,
  isDark,
}) => {
  const [toolkits, setToolkits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    api.miso
      .getToolkitCatalog()
      .then(({ toolkits: list = [] }) => {
        setToolkits(filter_toolkits(list, BASE_TOOLKIT_IDS));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target) &&
        anchorEl &&
        !anchorEl.contains(e.target)
      ) {
        onClose();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [anchorEl, onClose]);

  const toggle = (className) => {
    onChange(
      selected.includes(className)
        ? selected.filter((c) => c !== className)
        : [...selected, className],
    );
  };

  const bg = isDark ? "rgb(28,28,28)" : "rgb(255,255,255)";
  const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const checkColor = "rgba(10,186,181,1)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        zIndex: 99,
        background: bg,
        borderRadius: 10,
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.45)"
          : "0 8px 32px rgba(0,0,0,0.12)",
        minWidth: 260,
        maxWidth: 340,
        overflow: "hidden",
        padding: "6px 0",
        opacity: isReady ? 1 : 0,
        transform: isReady ? "scale(1)" : "scale(0.95)",
        transformOrigin: "bottom left",
        transition: "opacity 120ms ease, transform 120ms ease",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          padding: "6px 14px 8px",
          fontSize: 10,
          letterSpacing: "0.9px",
          textTransform: "uppercase",
          color: mutedColor,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        Toolkits
      </div>

      {loading ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: mutedColor }}>
          Loading…
        </div>
      ) : toolkits.length === 0 ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: mutedColor }}>
          No toolkits available
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {toolkits.map((tk) => {
            const checked = selected.includes(tk.class_name);
            return (
              <div
                key={tk.class_name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(tk.class_name);
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "7px 14px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = hoverBg)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: checked
                      ? `2px solid ${checkColor}`
                      : `2px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)"}`,
                    background: checked ? checkColor : "transparent",
                    flexShrink: 0,
                    marginTop: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.12s",
                    boxSizing: "border-box",
                  }}
                >
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1.5 4L3.5 6L6.5 2"
                        stroke="white"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: textColor,
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {tk.class_name}
                  </div>
                  {tk.tools && tk.tools.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 3,
                      }}
                    >
                      {tk.tools.slice(0, 5).map((t) => (
                        <span
                          key={t.name}
                          style={{
                            fontSize: 9.5,
                            color: mutedColor,
                            fontFamily: "Menlo, Monaco, Consolas, monospace",
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {tk.tools.length > 5 && (
                        <span style={{ fontSize: 9.5, color: mutedColor }}>
                          +{tk.tools.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${border}`,
            padding: "6px 14px",
          }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onChange([]);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 11,
              color: mutedColor,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
            }}
          >
            clear all
          </button>
        </div>
      )}
    </div>
  );
};

export default ToolPickerPopover;
