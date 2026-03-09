import { useCallback, useContext, useEffect, useMemo, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { Scatter } from "../../BUILTIN_COMPONENTs/scatter";
import Tooltip from "../../BUILTIN_COMPONENTs/tooltip/tooltip";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* { Services } -------------------------------------------------------------------------------------------------------------- */
import { createMisoApi } from "../../SERVICEs/api.miso";
/* { Services } -------------------------------------------------------------------------------------------------------------- */

/* { Input components } ------------------------------------------------------------------------------------------------------- */
import { Select } from "../../BUILTIN_COMPONENTs/select/select";
import { Slider } from "../../BUILTIN_COMPONENTs/input/slider";
import Button from "../../BUILTIN_COMPONENTs/input/button";
/* { Input components } ------------------------------------------------------------------------------------------------------- */

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

    for (const key of [
      "content",
      "conversation",
      "messages",
      "summary",
      "thinking",
    ]) {
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
      return text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    }
  }

  return [];
};

/* Seeded PRNG (mulberry32) for reproducible jitter offsets */
const make_rng = (seed) => {
  let s = (seed ^ 0xdeadbeef) >>> 0 || 1;
  return () => {
    s = Math.imul(s + 0x6d2b79f5, (s + 0x6d2b79f5) | 0) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s) >>> 0;
    t = ((t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  VarianceBar                                                            */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function VarianceBar({ variance, isDark, x_pc = 0, y_pc = 1 }) {
  const vx = variance[x_pc] || 0;
  const vy = variance[y_pc] || 0;
  const pct1 = (vx * 100).toFixed(1);
  const pct2 = (vy * 100).toFixed(1);
  const total = vx + vy;
  const fill1 = vx / Math.max(total, 0.01);
  const fill2 = vy / Math.max(total, 0.01);

  const bg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
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
          { label: `PC${x_pc + 1}`, pct: pct1 },
          { label: `PC${y_pc + 1}`, pct: pct2 },
        ].map(({ label, pct }, _i) => (
          <span
            key={_i}
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
  const card_bg = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.025)";
  const card_border = isDark
    ? "1px solid rgba(255,255,255,0.06)"
    : "1px solid rgba(0,0,0,0.06)";

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
            const isUser = line.startsWith("user:");
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
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || (isDark ? "#fff" : "#111");
  const fontFamily = theme?.font?.fontFamily || "Jost";

  const [status, setStatus] = useState("idle"); // "idle" | "loading" | "ready" | "empty" | "error"
  const [points, setPoints] = useState([]);
  const [variance, setVariance] = useState([0, 0, 0, 0, 0]);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  /* ── Scatter controls ── */
  const [x_pc, set_x_pc] = useState(0); // 0 = PC1, 1 = PC2 …
  const [y_pc, set_y_pc] = useState(1);
  const [jitter, set_jitter] = useState(0); // 0–10 integer steps
  const [jitter_seed, set_jitter_seed] = useState(42);

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
        setVariance([0, 0, 0, 0, 0]);
        setSelectedPoint(null);
        setErrorMsg("");
      }

      misoApi
        .getMemoryProjection(sessionId)
        .then((data) => {
          if (cancelled) return;
          const pts = Array.isArray(data?.points) ? data.points : [];
          if (pts.length === 0) {
            setStatus("empty");
            return;
          }

          setPoints(pts);
          const raw_var = Array.isArray(data.variance) ? data.variance : [];
          setVariance([0, 1, 2, 3, 4].map((i) => raw_var[i] ?? 0));
          setStatus("ready");
          setSelectedPoint((current) => {
            if (!current) {
              return null;
            }
            return (
              pts.find((item) => String(item?.id) === String(current?.id)) ||
              current
            );
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

  /* ── Theme tokens ── */
  const meta_color = isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)";

  const on_point_click = useCallback((pt) => {
    setSelectedPoint(pt);
  }, []);

  /* Custom tooltip renderer for the scatter points using the mini UI Tooltip bubble */
  const tooltipTextColor = isDark ? "#111" : "#fff";
  const tooltipMetaColor = isDark
    ? "rgba(0,0,0,0.40)"
    : "rgba(255,255,255,0.50)";
  const renderScatterTooltip = useCallback(
    ({ point }) => {
      const lines = extractConversationLines(point);
      const preview =
        lines.length > 0 ? lines.slice(0, 3).join("\n") : "No content";
      const turnRange =
        point.turn_start_index != null || point.turn_end_index != null
          ? `#${point.turn_start_index ?? "?"} → #${point.turn_end_index ?? "?"}`
          : null;

      return (
        <Tooltip
          open={true}
          position="top"
          show_arrow={true}
          style={{
            width: "min(360px, 72vw)",
            minWidth: 240,
            maxWidth: "min(440px, 84vw)",
          }}
          tooltip_component={
            <div>
              {turnRange && (
                <div
                  style={{
                    fontSize: 10,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    color: tooltipMetaColor,
                    marginBottom: 4,
                  }}
                >
                  {turnRange}
                </div>
              )}
              <div
                style={{
                  fontSize: 12,
                  fontFamily,
                  color: tooltipTextColor,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {preview}
              </div>
              {point.group && (
                <div
                  style={{
                    marginTop: 5,
                    fontSize: 10,
                    fontFamily: "Menlo, Monaco, Consolas, monospace",
                    color: tooltipMetaColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.3px",
                  }}
                >
                  {point.group}
                </div>
              )}
            </div>
          }
        >
          <div style={{ width: 1, height: 1 }} />
        </Tooltip>
      );
    },
    [tooltipMetaColor, tooltipTextColor, fontFamily],
  );

  /* Remap points to selected PC axes, with optional jitter */
  const display_points = useMemo(() => {
    if (!points.length) return [];
    const kx = `pc${x_pc + 1}`;
    const ky = `pc${y_pc + 1}`;
    let jitter_scale = 0;
    if (jitter > 0) {
      const xs = points.map((p) => p[kx] ?? p.x ?? 0);
      const ys = points.map((p) => p[ky] ?? p.y ?? 0);
      const xr = Math.max(...xs) - Math.min(...xs);
      const yr = Math.max(...ys) - Math.min(...ys);
      jitter_scale = Math.max(xr, yr, 1e-6) * (jitter / 10) * 0.08;
    }
    const rng = make_rng(jitter_seed);
    return points.map((p) => ({
      ...p,
      x:
        (p[kx] ?? p.x ?? 0) +
        (jitter > 0 ? (rng() - 0.5) * 2 * jitter_scale : 0),
      y:
        (p[ky] ?? p.y ?? 0) +
        (jitter > 0 ? (rng() - 0.5) * 2 * jitter_scale : 0),
    }));
  }, [points, x_pc, y_pc, jitter, jitter_seed]);

  /* ── Theme tokens (cont.) ── */

  /* PC selector options — only show PCs with non-zero explained variance */
  const n_pcs = variance.filter((v) => v > 0).length || 2;
  const pc_options = Array.from({ length: n_pcs }, (_, i) => ({
    value: String(i),
    label: `PC${i + 1} (${((variance[i] || 0) * 100).toFixed(0)}%)`,
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 860,
        maxWidth: "92vw",
        height: 560,
        maxHeight: "88vh",
        display: "flex",
        flexDirection: "column",
        padding: 0,
        overflow: "hidden",
      }}
    >
      {/* Close — aligned with Settings/Tools modal */}
      <Button
        prefix_icon="close"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 2,
          content: {
            prefixIconWrap: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            },
            icon: { width: 14, height: 14 },
          },
        }}
      />

      {/* ━━ Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          padding: "20px 24px 0",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "NunitoSans, sans-serif",
            color,
            userSelect: "none",
            WebkitUserSelect: "none",
            paddingRight: 36,
          }}
        >
          Memory
        </div>
        {chatTitle && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: meta_color,
              marginTop: 2,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {chatTitle}
          </div>
        )}
      </div>

      {/* ━━ Body — two-column layout ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "row",
          overflow: "hidden",
        }}
      >
        {/* ── Left: scatter plot ── */}
        <div
          style={{
            flex: "1 1 0",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Scatter canvas */}
          <div
            style={{
              position: "relative",
              flex: 1,
              minHeight: 0,
              margin: "16px 0 0 24px",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {(status === "loading" || status === "idle") && (
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
                  WebkitUserSelect: "none",
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
                  WebkitUserSelect: "none",
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
                  color: isDark
                    ? "rgba(255,100,100,0.7)"
                    : "rgba(180,40,40,0.7)",
                  userSelect: "none",
                  WebkitUserSelect: "none",
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
                  points={display_points}
                  color_by="group"
                  point_size={10}
                  show_legend={true}
                  on_point_click={on_point_click}
                  render_tooltip={renderScatterTooltip}
                />
                {(variance[x_pc] > 0 || variance[y_pc] > 0) && (
                  <VarianceBar
                    variance={variance}
                    isDark={isDark}
                    x_pc={x_pc}
                    y_pc={y_pc}
                  />
                )}
              </>
            )}
          </div>

          {/* Controls bar (below scatter) */}
          {status === "ready" && (
            <div
              style={{
                padding: "10px 0px 16px 24px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <Select
                options={pc_options}
                value={String(x_pc)}
                set_value={(v) => set_x_pc(Number(v))}
                filterable={false}
                filter_mode="panel"
                style={{
                  fontSize: 12,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: "Menlo, Monaco, Consolas, monospace",
                  color: meta_color,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexShrink: 0,
                }}
              >
                vs
              </span>
              <Select
                options={pc_options}
                value={String(y_pc)}
                set_value={(v) => set_y_pc(Number(v))}
                filterable={false}
                filter_mode="panel"
                style={{
                  fontSize: 12,
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                }}
              />

              <div style={{ flex: 1 }} />

              <span
                style={{
                  fontSize: 11,
                  fontFamily,
                  color: meta_color,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  flexShrink: 0,
                  marginRight: 12,
                }}
              >
                Jitter
              </span>
              <Slider
                value={jitter}
                set_value={set_jitter}
                min={0}
                max={10}
                step={1}
                show_tooltip={true}
                label_format={(v) => (v === 0 ? "off" : String(v))}
                style={{ width: 200 }}
              />
              <div
                style={{
                  width: 32,
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                {jitter > 0 && (
                  <Button
                    prefix_icon="update"
                    onClick={() => set_jitter_seed((s) => (s + 1) % 10000)}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 4,
                      borderRadius: 6,
                      opacity: 0.5,
                      content: {
                        icon: { width: 14, height: 14 },
                      },
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: detail panel ── */}
        {status !== "empty" && (
          <div
            style={{
              width: 300,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Detail header */}
            <div
              style={{
                padding: "16px 20px 10px",
                flexShrink: 0,
                fontSize: 11,
                fontFamily: "Menlo, Monaco, Consolas, monospace",
                color: meta_color,
                textTransform: "uppercase",
                letterSpacing: "0.8px",
                userSelect: "none",
                WebkitUserSelect: "none",
              }}
            >
              Chunk Detail
            </div>

            {/* Detail content */}
            <div
              className="scrollable"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                padding: "0 20px 20px",
              }}
            >
              {status === "ready" && selectedPoint ? (
                <SelectedCard
                  point={selectedPoint}
                  isDark={isDark}
                  fontFamily={fontFamily}
                  color={color}
                />
              ) : status === "ready" ? (
                <div
                  style={{
                    fontSize: 13,
                    fontFamily,
                    color: meta_color,
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    paddingTop: 8,
                    lineHeight: 1.6,
                  }}
                >
                  Click a point on the scatter plot to inspect that memory chunk.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export { MemoryInspectModal as default, MemoryInspectModal };
