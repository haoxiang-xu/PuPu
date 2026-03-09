import { useEffect, useRef, useState } from "react";
import { readWorkspaces } from "../../settings/runtime";

const WorkspacePickerPopover = ({
  selected,
  onChange,
  onClose,
  anchorEl,
  isDark,
  onOpenWorkspaceModal,
}) => {
  const [workspaces, setWorkspaces] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const checkColor = "rgba(10,186,181,1)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? workspaces.filter((ws) => {
        const name = (ws.name || "").toLowerCase();
        const path = (ws.path || "").toLowerCase();
        return name.includes(query) || path.includes(query);
      })
    : workspaces;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        zIndex: 99,
        background: bg,
        borderRadius: 12,
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.5)"
          : "0 8px 32px rgba(0,0,0,0.12)",
        minWidth: 240,
        maxWidth: 320,
        overflow: "hidden",
        opacity: isReady ? 1 : 0,
        transform: isReady ? "scale(1)" : "scale(0.96)",
        transformOrigin: "bottom left",
        transition: "opacity 120ms ease, transform 120ms ease",
        willChange: "transform, opacity",
      }}
    >
      {/* Search input */}
      <div style={{ padding: "8px 10px 4px" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workspaces..."
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 10px",
            fontSize: 12,
            fontFamily: "Jost, sans-serif",
            color: textColor,
            background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
            border: "none",
            borderRadius: 8,
            outline: "none",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>

      {/* List */}
      {workspaces.length === 0 ? (
        <div
          style={{
            padding: "8px 14px 12px",
            fontSize: 12,
            color: mutedColor,
            fontFamily: "Jost, sans-serif",
          }}
        >
          No workspaces configured.
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "8px 14px 12px",
            fontSize: 12,
            color: mutedColor,
            fontFamily: "Jost, sans-serif",
          }}
        >
          No matching workspaces.
        </div>
      ) : (
        <div style={{ maxHeight: 240, overflowY: "auto", padding: "2px 0" }}>
          {filtered.map((ws) => {
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
                    borderRadius: 4,
                    border: checked
                      ? `2px solid ${checkColor}`
                      : `2px solid ${isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"}`,
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
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: textColor,
                      fontFamily: "Jost, sans-serif",
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
              fontFamily: "Jost, sans-serif",
            }}
          >
            clear all
          </button>
        </div>
      )}

      {/* Add Workspace footer — always visible */}
      <div
        style={{
          borderTop: `1px solid ${border}`,
          padding: "6px 14px",
        }}
      >
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            if (onOpenWorkspaceModal) {
              onOpenWorkspaceModal();
              onClose();
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            padding: "3px 0",
            opacity: 0.55,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <path
              d="M7 2.5V11.5M2.5 7H11.5"
              stroke={textColor}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 12,
              fontFamily: "Jost, sans-serif",
              color: textColor,
              fontWeight: 500,
            }}
          >
            Add Workspace
          </span>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePickerPopover;
