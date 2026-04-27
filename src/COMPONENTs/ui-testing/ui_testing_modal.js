import { useContext, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import TraceChainRunner from "./runners/trace_chain_runner";
import CodeDiffInteractRunner from "./runners/code_diff_runner";

/* ── test component registry ── */
const COMPONENTS = [
  { key: "trace_chain", label: "TraceChain", runner: TraceChainRunner },
  {
    key: "code_diff_interact",
    label: "CodeDiffInteract",
    runner: CodeDiffInteractRunner,
  },
];

/* ═══════════════════════════════════════════════════════════════════════
   UITestingModal
   ═══════════════════════════════════════════════════════════════════════ */
const UITestingModal = ({ open, onClose }) => {
  useModalLifecycle("ui-testing-modal", open);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [selectedKey, setSelectedKey] = useState(COMPONENTS[0].key);
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
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      >
        <RunnerComponent />
      </div>

      {/* ── left panel (glassmorphism) — always visible ── */}
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
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 14px 8px 14px",
          }}
        >
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

    </Modal>
  );
};

export default UITestingModal;
