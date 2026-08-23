import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { getRuntimePlatform } from "../side-menu/side_menu_utils";
import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";
import { TestDockContext } from "./test_dock_context";
import ControlDock from "./control_dock";
import { loadPrefs, savePrefs } from "./ui_testing_prefs";
import TraceChainRunner from "./runners/trace_chain_runner";
import CodeDiffInteractRunner from "./runners/code_diff_runner";
import ArtifactSummaryRunner from "./runners/artifact_summary_runner";
import ToastRunner from "./runners/toast_runner";
import InterjectRunner from "./runners/interject_runner";
import TurnMutationHoldRunner from "./runners/turn_mutation_hold_runner";

/* ── test component registry ── */
const COMPONENTS = [
  { key: "interject", label: "Interject", runner: InterjectRunner },
  {
    key: "turn_mutation_hold",
    label: "Turn Mutation Hold",
    runner: TurnMutationHoldRunner,
  },
  { key: "trace_chain", label: "TraceChain", runner: TraceChainRunner },
  {
    key: "code_diff_interact",
    label: "CodeDiffInteract",
    runner: CodeDiffInteractRunner,
  },
  {
    key: "artifact_summary",
    label: "ArtifactSummary",
    runner: ArtifactSummaryRunner,
  },
  { key: "toast", label: "Toast", runner: ToastRunner },
];

const NAV_WIDTH = 200;
const RUNNER_LEFT = 212; // nav left 6 + width 200 + 6 gap

const iconBtnStyle = (extra) => ({
  position: "absolute",
  paddingVertical: 6,
  paddingHorizontal: 6,
  borderRadius: 6,
  opacity: 0.45,
  zIndex: 6,
  WebkitAppRegion: "no-drag",
  content: {
    prefixIconWrap: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 0,
    },
    icon: { width: 14, height: 14 },
  },
  ...extra,
});

/* ═══════════════════════════════════════════════════════════════════════
   UITestingModal
   ═══════════════════════════════════════════════════════════════════════ */
const UITestingModal = ({ open, onClose }) => {
  useModalLifecycle("ui-testing-modal", open);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const isDarwin = getRuntimePlatform() === "darwin";

  const [initialPrefs] = useState(() => loadPrefs());
  const [selectedKey, setSelectedKey] = useState(COMPONENTS[0].key);
  const [navCollapsed, setNavCollapsed] = useState(initialPrefs.navCollapsed);
  const [fullscreen, setFullscreen] = useState(initialPrefs.fullscreen);
  const [dockPos, setDockPos] = useState(initialPrefs.dockPos);
  const [appFullscreen, setAppFullscreen] = useState(false);

  /* dock wiring */
  const [dockEl, setDockEl] = useState(null);
  const [dockControlCount, setDockControlCount] = useState(0);
  const registerControls = useCallback((on) => {
    setDockControlCount((n) => Math.max(0, n + (on ? 1 : -1)));
  }, []);
  const dockCtx = useMemo(
    () => ({ dockEl, registerControls }),
    [dockEl, registerControls],
  );
  const hasControls = dockControlCount > 0;

  /* persist layout prefs (debounced) */
  useEffect(() => {
    const t = setTimeout(
      () => savePrefs({ dockPos, navCollapsed, fullscreen }),
      300,
    );
    return () => clearTimeout(t);
  }, [dockPos, navCollapsed, fullscreen]);

  /* macOS traffic-light clearance when the modal is fullscreen */
  useEffect(() => {
    if (!windowStateBridge.isListenerAvailable()) return undefined;
    const cleanup = windowStateBridge.onWindowStateChange(({ isMaximized }) => {
      setAppFullscreen(Boolean(isMaximized));
    });
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const selected =
    COMPONENTS.find((c) => c.key === selectedKey) || COMPONENTS[0];
  const RunnerComponent = selected.runner;

  if (!open) return null;

  const trafficLightPad = fullscreen && isDarwin && !appFullscreen;
  const headerTopPad = trafficLightPad ? 28 : 0;
  const expandTop = trafficLightPad ? 42 : 14;

  /* ── glass tokens (memory-inspect / recipes_page parity) ── */
  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";
  const overlayShadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)";
  const overlayPanel = {
    position: "absolute",
    zIndex: 3,
    borderRadius: 10,
    backgroundColor: overlayBg,
    border: overlayBorder,
    backdropFilter: overlayBackdrop,
    WebkitBackdropFilter: overlayBackdrop,
    boxShadow: overlayShadow,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const accentTint = isDark ? "rgba(96,116,246,0.18)" : "rgba(74,91,216,0.12)";
  const accentBorder = "1px solid rgba(74,91,216,0.45)";
  const dotColor = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.055)";
  const canvasFallback = isDark ? "#1a1a1a" : "#fafafb";

  return (
    <TestDockContext.Provider value={dockCtx}>
      <Modal
        open={open}
        onClose={onClose}
        fullscreen={fullscreen}
        style={{
          width: 920,
          maxWidth: "92vw",
          height: 600,
          maxHeight: "88vh",
          padding: 0,
          overflow: "hidden",
          position: "relative",
          backgroundColor: `var(--pupu-background, ${canvasFallback})`,
        }}
      >
        {/* fullscreen toggle */}
        <Button
          prefix_icon={fullscreen ? "fullscreen_exit" : "fullscreen"}
          onClick={() => setFullscreen((f) => !f)}
          style={iconBtnStyle({ top: 12, right: 44 })}
        />
        {/* close */}
        <Button
          prefix_icon="close"
          onClick={onClose}
          style={iconBtnStyle({ top: 12, right: 12 })}
        />

        {/* ── canvas layer (dot grid) + reactive-offset runner host ── */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: `var(--pupu-background, ${canvasFallback})`,
            backgroundImage: `radial-gradient(${dotColor} 1.15px, transparent 1.15px)`,
            backgroundSize: "20px 20px",
            backgroundPosition: "-1px -1px",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: navCollapsed ? 0 : RUNNER_LEFT,
              transition: "left 0.3s cubic-bezier(0.32,1,0.32,1)",
            }}
          >
            <RunnerComponent />
          </div>
        </div>

        {/* ── left nav (collapsible glass) ── */}
        <div
          style={{
            ...overlayPanel,
            top: 6,
            left: 6,
            bottom: 6,
            width: NAV_WIDTH,
            opacity: navCollapsed ? 0 : 1,
            transform: navCollapsed ? "translateX(-12px)" : "translateX(0)",
            transition:
              "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
            pointerEvents: navCollapsed ? "none" : "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: `${14 + headerTopPad}px 8px 8px 14px`,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.32)",
                userSelect: "none",
              }}
            >
              Components
            </span>
            <Button
              prefix_icon="side_menu_left"
              ariaLabel="Collapse components"
              onClick={() => setNavCollapsed(true)}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 4,
                borderRadius: 5,
                opacity: 0.5,
                content: {
                  prefixIconWrap: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    lineHeight: 0,
                  },
                  icon: { width: 13, height: 13 },
                },
              }}
            />
          </div>

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
                        ? "rgba(255,255,255,0.9)"
                        : "rgba(0,0,0,0.82)"
                      : isDark
                        ? "rgba(255,255,255,0.5)"
                        : "rgba(0,0,0,0.45)",
                    background: isActive ? accentTint : "transparent",
                    border: isActive ? accentBorder : "1px solid transparent",
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

        {/* ── expand button (only when collapsed) ── */}
        {navCollapsed && (
          <Button
            prefix_icon="side_menu_right"
            ariaLabel="Expand components"
            onClick={() => setNavCollapsed(false)}
            style={iconBtnStyle({
              top: expandTop,
              left: 14,
              right: undefined,
              zIndex: 4,
              opacity: 0.55,
            })}
          />
        )}

        {/* ── draggable control dock ── */}
        <ControlDock
          isDark={isDark}
          pos={dockPos}
          onPosChange={setDockPos}
          onContainerReady={setDockEl}
          hidden={!hasControls}
          reclampKey={`${fullscreen}:${navCollapsed}:${selectedKey}:${hasControls}`}
        />
      </Modal>
    </TestDockContext.Provider>
  );
};

export default UITestingModal;
