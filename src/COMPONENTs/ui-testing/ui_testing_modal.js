import { useContext, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import TraceChainRunner from "./runners/trace_chain_runner";

/* ── test component registry ── */
const COMPONENTS = [
  { key: "trace_chain", label: "TraceChain", runner: TraceChainRunner },
];

/* ═══════════════════════════════════════════════════════════════════════
   UITestingModal
   ═══════════════════════════════════════════════════════════════════════ */
const UITestingModal = ({ open, onClose }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [selectedKey, setSelectedKey] = useState(COMPONENTS[0].key);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const selected =
    COMPONENTS.find((c) => c.key === selectedKey) || COMPONENTS[0];
  const RunnerComponent = selected.runner;

  if (!open) return null;

  /* ── glassmorphism tokens (same as memory inspect modal) ── */
  const overlay_bg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlay_border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlay_backdrop = "blur(16px) saturate(1.4)";
  const overlay_shadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 920,
        maxWidth: "92vw",
        height: 600,
        maxHeight: "88vh",
        padding: 0,
        overflow: "hidden",
        position: "relative",
        background: isDark ? "rgb(18,18,18)" : "rgb(240,240,240)",
      }}
    >
      {/* ── close button (matches memory inspect modal exactly) ── */}
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
          zIndex: 4,
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

      {/* ── full-bleed content (TraceChain runner) ── */}
      <div
        onClick={() => {
          if (sidebarOpen) setSidebarOpen(false);
        }}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      >
        <RunnerComponent />
      </div>

      {/* ── left slide-in panel (glassmorphism) ── */}
      <div
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          bottom: 6,
          width: 200,
          zIndex: 3,
          borderRadius: 7,
          background: overlay_bg,
          border: overlay_border,
          backdropFilter: overlay_backdrop,
          WebkitBackdropFilter: overlay_backdrop,
          boxShadow: overlay_shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          opacity: sidebarOpen ? 1 : 0,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-12px)",
          transition:
            "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: sidebarOpen ? "auto" : "none",
        }}
      >
        {/* header with close button at top-left (same position as open toggle) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px 8px 10px",
          }}
        >
          <Button
            prefix_icon="side_menu_close"
            onClick={() => setSidebarOpen(false)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRadius: 6,
              opacity: 0.45,
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
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: isDark
                ? "rgba(255,255,255,0.22)"
                : "rgba(0,0,0,0.22)",
              userSelect: "none",
            }}
          >
            Components
          </span>
        </div>

        {/* items */}
        <div
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "0 8px 8px",
          }}
        >
          {COMPONENTS.map((comp) => {
            const isActive = comp.key === selectedKey;
            return (
              <div
                key={comp.key}
                onClick={() => setSelectedKey(comp.key)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: isActive ? 500 : 400,
                  color: isActive
                    ? isDark
                      ? "rgba(255,255,255,0.85)"
                      : "rgba(0,0,0,0.75)"
                    : isDark
                      ? "rgba(255,255,255,0.5)"
                      : "rgba(0,0,0,0.45)",
                  background: isActive
                    ? isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.05)"
                    : "transparent",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.03)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    e.currentTarget.style.background = "transparent";
                }}
              >
                {comp.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── sidebar toggle (top-left, same position as sidebar close) ── */}
      {!sidebarOpen && (
        <Button
          prefix_icon="side_menu_left"
          onClick={() => setSidebarOpen(true)}
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            paddingVertical: 6,
            paddingHorizontal: 6,
            borderRadius: 6,
            opacity: 0.45,
            zIndex: 4,
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
      )}
    </Modal>
  );
};

export default UITestingModal;
