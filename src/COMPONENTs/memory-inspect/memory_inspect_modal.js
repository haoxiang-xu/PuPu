import { useCallback, useContext, useEffect, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { Scatter } from "../../BUILTIN_COMPONENTs/scatter";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Services } -------------------------------------------------------------------------------------------------------------- */
import { createMisoApi } from "../../SERVICEs/api.miso";
/* { Services } -------------------------------------------------------------------------------------------------------------- */

const misoApi = createMisoApi();

const renderConversationText = (value, depth = 0) => {
  if (depth >= 8 || value == null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => renderConversationText(entry, depth + 1))
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  if (typeof value === "object") {
    const role =
      typeof value.role === "string" && value.role.trim()
        ? value.role.trim().toLowerCase()
        : "";
    if (role) {
      const contentText = renderConversationText(value.content, depth + 1);
      if (contentText) {
        return `${role}: ${contentText}`;
      }
    }

    if (typeof value.text === "string" && value.text.trim()) {
      return value.text.trim();
    }

    for (const key of ["content", "conversation", "messages", "summary", "thinking"]) {
      const nested = renderConversationText(value[key], depth + 1);
      if (nested) {
        return nested;
      }
    }

    try {
      return JSON.stringify(value);
    } catch (_error) {
      return "";
    }
  }

  return String(value).trim();
};

const extractConversationLines = (point) => {
  if (!point || typeof point !== "object") {
    return [];
  }

  for (const key of [
    "conversation",
    "messages",
    "text",
    "content",
    "summary",
  ]) {
    const text = renderConversationText(point[key]);
    if (text) {
      return text.split("\n").map((line) => line.trim()).filter(Boolean);
    }
  }

  return [];
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  VarianceBar                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function VarianceBar({ variance, isDark }) {
  const pct1 = (variance[0] * 100).toFixed(1);
  const pct2 = (variance[1] * 100).toFixed(1);
  const total = variance[0] + variance[1];
  const fill1 = variance[0] / Math.max(total, 0.01);
  const fill2 = variance[1] / Math.max(total, 0.01);

  const bg   = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const col1 = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";
  const col2 = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
  const text = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <div
      style={{
        position: "absolute",
        top: 14,
        right: 14,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        pointerEvents: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {[
          { label: "PC1", pct: pct1 },
          { label: "PC2", pct: pct2 },
        ].map(({ label, pct }) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
              color: text,
            }}
          >
            {label} {pct}%
          </span>
        ))}
      </div>
      <div
        style={{
          width: 120,
          height: 4,
          borderRadius: 2,
          backgroundColor: bg,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${fill1 * 100}%`,
            height: "100%",
            backgroundColor: col1,
            transition: "width 0.4s cubic-bezier(0.32,1,0.32,1)",
          }}
        />
        <div
          style={{
            width: `${fill2 * 100}%`,
            height: "100%",
            backgroundColor: col2,
            transition: "width 0.4s cubic-bezier(0.32,1,0.32,1)",
          }}
        />
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SelectedCard                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function SelectedCard({ point, isDark, fontFamily, color }) {
  const meta_color = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const card_bg    = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)";
  const card_border = isDark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)";

  /* Extract clean user + assistant turns from the stored text */
  const lines = extractConversationLines(point);

  return (
    <div
      style={{
        backgroundColor: card_bg,
        border: card_border,
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 80,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            color: meta_color,
          }}
        >
          #{point.turn_start_index ?? "?"} → #{point.turn_end_index ?? "?"}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontFamily,
          color,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {lines.length === 0 ? (
          <div style={{ color: meta_color }}>
            No conversation text stored for this memory chunk.
          </div>
        ) : (
          lines.map((line, i) => {
            const isUser      = line.startsWith("user:");
            const isAssistant = line.startsWith("assistant:");
            const label = isUser ? "user" : isAssistant ? "assistant" : null;
            const content = label ? line.slice(label.length + 1).trim() : line;
            return (
              <div key={i} style={{ marginBottom: 4 }}>
                {label && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                      color: meta_color,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      marginRight: 6,
                    }}
                  >
                    {label}
                  </span>
                )}
                {content}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  MemoryInspectModal                                                     */
/*                                                                         */
/*  Props:                                                                 */
/*    open      — boolean                                                  */
/*    onClose   — () => void                                               */
/*    sessionId — string  (chat session ID, e.g. "chat-1772850432671-...")*/
/*    chatTitle — string  (optional, for the header)                      */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const MemoryInspectModal = ({ open, onClose, sessionId, chatTitle }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark      = onThemeMode === "dark_mode";
  const color       = theme?.color || (isDark ? "#fff" : "#111");
  const fontFamily  = theme?.font?.fontFamily || "Jost";

  const [status,        setStatus]        = useState("idle");   // "idle" | "loading" | "ready" | "empty" | "error"
  const [points,        setPoints]        = useState([]);
  const [variance,      setVariance]      = useState([0, 0]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [errorMsg,      setErrorMsg]      = useState("");

  /* Fetch projection whenever the modal opens with a new sessionId */
  useEffect(() => {
    if (!open || !sessionId) {
      return;
    }

    let cancelled = false;
    const loadProjection = ({ silent = false } = {}) => {
      if (!silent) {
        setStatus("loading");
        setPoints([]);
        setVariance([0, 0]);
        setSelectedPoint(null);
        setErrorMsg("");
      }

      misoApi.getMemoryProjection(sessionId)
        .then((data) => {
          if (cancelled) return;
          const pts = Array.isArray(data?.points) ? data.points : [];
          if (pts.length === 0) {
            setStatus("empty");
            return;
          }

          setPoints(pts);
          setVariance(Array.isArray(data.variance) ? data.variance : [0, 0]);
          setStatus("ready");
          setSelectedPoint((current) => {
            if (!current) {
              return null;
            }
            return pts.find((item) => String(item?.id) === String(current?.id)) || current;
          });
        })
        .catch((err) => {
          if (cancelled) return;
          if (!silent) {
            setErrorMsg(err?.message || "Failed to load memory projection");
            setStatus("error");
          }
        });
    };

    loadProjection({ silent: false });
    const refreshTimer = window.setInterval(() => {
      loadProjection({ silent: true });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [open, sessionId]);

  const on_point_click = useCallback((pt) => {
    setSelectedPoint(pt);
  }, []);

  /* ── Theme tokens ── */
  const meta_color  = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 760,
        maxWidth: "92vw",
        maxHeight: "88vh",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        padding: 0,
        overflow: "hidden",
        borderRadius: 14,
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "18px 22px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 3,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 17,
            fontFamily,
            fontWeight: 500,
            color,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          Memory
        </span>
        {chatTitle && (
          <span
            style={{
              fontSize: 12,
              fontFamily,
              color: meta_color,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {chatTitle}
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "0 22px 22px",
          overflow: "hidden",
        }}
      >
        {/* Scatter canvas */}
        <div
          style={{
            position: "relative",
            flex: "0 0 380px",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {status === "loading" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontFamily,
                color: meta_color,
                userSelect: "none",
              }}
            >
              Loading…
            </div>
          )}

          {status === "empty" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontFamily,
                color: meta_color,
                userSelect: "none",
              }}
            >
              No memory vectors found for this chat.
            </div>
          )}

          {status === "error" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontFamily,
                color: isDark ? "rgba(255,100,100,0.7)" : "rgba(180,40,40,0.7)",
                userSelect: "none",
                padding: "0 24px",
                textAlign: "center",
              }}
            >
              {errorMsg}
            </div>
          )}

          {status === "ready" && (
            <>
              <Scatter
                points={points}
                color_by="index"
                point_size={10}
                show_legend={false}
                on_point_click={on_point_click}
              />
              {variance[0] > 0 && (
                <VarianceBar variance={variance} isDark={isDark} />
              )}
            </>
          )}
        </div>

        {/* Selected point detail */}
        {status === "ready" && (
          <div style={{ flex: "1 1 0", minHeight: 0, overflow: "auto" }}>
            {selectedPoint ? (
              <SelectedCard
                point={selectedPoint}
                isDark={isDark}
                fontFamily={fontFamily}
                color={color}
              />
            ) : (
              <div
                style={{
                  fontSize: 12,
                  fontFamily,
                  color,
                  opacity: 0.28,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  paddingTop: 4,
                }}
              >
                Click a point to inspect the memory chunk
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export { MemoryInspectModal as default, MemoryInspectModal };
