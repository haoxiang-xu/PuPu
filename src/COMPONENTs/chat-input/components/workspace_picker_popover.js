import { useEffect, useRef, useState } from "react";
import { readWorkspaces } from "../../settings/runtime";

const WorkspacePickerPopover = ({
  selected,
  onChange,
  onClose,
  anchorEl,
  isDark,
}) => {
  const [workspaces, setWorkspaces] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    setWorkspaces(readWorkspaces());
    const raf = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(raf);
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

  const toggle = (id) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
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
        minWidth: 220,
        maxWidth: 320,
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
        Workspaces
      </div>

      {workspaces.length === 0 ? (
        <div style={{ padding: "4px 14px 10px", fontSize: 12, color: mutedColor }}>
          No workspaces configured.{" "}
          <span style={{ opacity: 0.7 }}>Add them in Settings → Runtime.</span>
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {workspaces.map((ws) => {
            const checked = selected.includes(ws.id);
            const displayName =
              typeof ws.name === "string" && ws.name.trim()
                ? ws.name.trim()
                : typeof ws.path === "string" && ws.path.trim()
                  ? ws.path.trim()
                  : ws.id;
            const displayPath =
              typeof ws.name === "string" &&
              ws.name.trim() &&
              typeof ws.path === "string" &&
              ws.path.trim()
                ? ws.path.trim()
                : null;
            return (
              <div
                key={ws.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(ws.id);
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
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName}
                  </div>
                  {displayPath && (
                    <div
                      style={{
                        fontSize: 10,
                        color: mutedColor,
                        fontFamily: "Menlo, Monaco, Consolas, monospace",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {displayPath}
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

export default WorkspacePickerPopover;
