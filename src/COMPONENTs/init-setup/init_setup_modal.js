import { useContext, useState, useEffect, useRef, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import { markSetupComplete } from "./init_setup_storage";

import WelcomingStep from "./steps/welcoming";
import SelectProvidersStep from "./steps/select_providers";
import ConfigureProvidersStep from "./steps/configure_providers";
import WorkspaceStep from "./steps/workspace";
import CompletionStep from "./steps/completion";

/* ── Step indices ────────────────────────────────────────────────────────────── */
const STEP_WELCOME = 0;
const STEP_SELECT = 1;
const STEP_CONFIGURE = 2;
const STEP_WORKSPACE = 3;
const STEP_DONE = 4;

const SETUP_STEPS = [
  { label: "Welcome", idx: STEP_WELCOME, isStart: true },
  { label: "Providers", idx: STEP_SELECT },
  { label: "Configure", idx: STEP_CONFIGURE },
  { label: "Workspace", idx: STEP_WORKSPACE },
  { label: "All Set", idx: STEP_DONE, isEnd: true },
];

/* ── Inline timeline with expandable step content ───────────────────────────── */
const SetupFlow = ({
  currentStep,
  onStepClick,
  isDark,
  contentVisible,
  renderContent,
}) => {
  const teal = "rgba(10,186,181,1)";
  const tealDim = "rgba(10,186,181,0.70)";
  const lineDone = tealDim;
  const linePending = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
  const dotPending = isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)";
  const labelActive = isDark ? "rgba(255,255,255,0.92)" : "rgba(0,0,0,0.88)";
  const labelDone = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)";
  const labelPending = isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.22)";

  const TRACK_W = 22;
  const DOT_R = 4;
  const PRESET_R = 5;
  const SPIN_R = 7;
  const TITLE_H = 18;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {SETUP_STEPS.map(({ label, idx, isStart, isEnd }, i) => {
        const isDone = idx < currentStep;
        const isActive = idx === currentStep;
        const isLast = i === SETUP_STEPS.length - 1;

        const dotR = isStart || isEnd ? PRESET_R : isActive ? SPIN_R : DOT_R;
        const topLineH = Math.max(0, TITLE_H / 2 - dotR);

        const prevIsDone = i > 0 && SETUP_STEPS[i - 1].idx < currentStep;
        const prevIsActive = i > 0 && SETUP_STEPS[i - 1].idx === currentStep;

        const topLineColor =
          i === 0
            ? "transparent"
            : prevIsDone
              ? lineDone
              : prevIsActive
                ? "rgba(10,186,181,0.30)"
                : linePending;

        const bottomLineColor = isLast
          ? "transparent"
          : isDone
            ? lineDone
            : isActive
              ? "rgba(10,186,181,0.30)"
              : linePending;

        const labelColor = isDone
          ? labelDone
          : isActive
            ? labelActive
            : labelPending;
        const canClick = isDone;

        return (
          <div
            key={idx}
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
            }}
          >
            {/* ── track column ── */}
            <div
              style={{ width: TRACK_W, flexShrink: 0, position: "relative" }}
            >
              {i !== 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 1,
                    height: Math.max(0, topLineH - 3),
                    background: topLineColor,
                    transition: "background 0.3s",
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  top: topLineH,
                  left: "50%",
                  transform: "translateX(-50%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isActive && !isEnd ? (
                  <ArcSpinner
                    size={SPIN_R * 2}
                    stroke_width={1.8}
                    color={teal}
                  />
                ) : isDone ? (
                  <Icon
                    src="check"
                    color={teal}
                    style={{
                      width: dotR * 2 + 2,
                      height: dotR * 2 + 2,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: dotR * 2,
                      height: dotR * 2,
                      borderRadius: "50%",
                      background: isActive ? teal : "transparent",
                      border: isActive ? "none" : `1px solid ${dotPending}`,
                      boxShadow:
                        (isStart || isEnd) && isActive
                          ? `0 0 0 3px rgba(10,186,181,0.14)`
                          : "none",
                      transition: "background 0.25s, box-shadow 0.25s",
                      boxSizing: "border-box",
                    }}
                  />
                )}
              </div>
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    top: topLineH + dotR * 2 + 3,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 1,
                    bottom: 0,
                    background: bottomLineColor,
                    transition: "background 0.3s",
                  }}
                />
              )}
            </div>

            {/* ── label + content column ── */}
            <div
              style={{
                transition: "all 0.3s",
                flex: 1,
                minWidth: 0,
                paddingLeft: 14,
                paddingRight:
                  isActive && idx === STEP_SELECT ? 0 : TRACK_W + 14,
                paddingTop: topLineH,
                paddingBottom: isLast ? 2 : 10,
              }}
            >
              {/* label row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  height: TITLE_H,
                }}
              >
                <span
                  onClick={canClick ? () => onStepClick(idx) : undefined}
                  style={{
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 500,
                    fontFamily: "NunitoSans, sans-serif",
                    color: labelColor,
                    lineHeight: `${TITLE_H}px`,
                    cursor: canClick ? "pointer" : "default",
                    userSelect: "none",
                    transition: "color 0.2s, opacity 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (canClick) e.currentTarget.style.opacity = "0.6";
                  }}
                  onMouseLeave={(e) => {
                    if (canClick) e.currentTarget.style.opacity = "1";
                  }}
                >
                  {label}
                </span>
              </div>

              {/* expanded content for the active step */}
              {isActive && (
                <div
                  style={{
                    paddingTop: 18,
                    paddingBottom: 18,
                    opacity: contentVisible ? 1 : 0,
                    transform: contentVisible
                      ? "translateY(0)"
                      : "translateY(5px)",
                    transition: "opacity 0.18s ease, transform 0.18s ease",
                  }}
                >
                  {renderContent(idx)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Main component ──────────────────────────────────────────────────────────── */
const InitSetupModal = ({ open, onClose }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [step, setStep] = useState(STEP_WELCOME);
  const [selectedProviders, setSelectedProviders] = useState([]);
  const [providerSubStep, setProviderSubStep] = useState(0);
  const [contentVisible, setContentVisible] = useState(true);
  const transitionTimer = useRef(null);

  const goToStep = useCallback(
    (nextStep) => {
      if (nextStep === step) return;
      setContentVisible(false);
      clearTimeout(transitionTimer.current);
      transitionTimer.current = setTimeout(() => {
        setStep(nextStep);
        setContentVisible(true);
      }, 160);
    },
    [step],
  );

  useEffect(() => () => clearTimeout(transitionTimer.current), []);

  useEffect(() => {
    if (open) {
      setStep(STEP_WELCOME);
      setSelectedProviders([]);
      setProviderSubStep(0);
      setContentVisible(true);
    }
  }, [open]);

  const textColor = isDark ? "#ffffff" : "#222222";
  const skipColor = isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.22)";
  const skipHoverColor = isDark ? "rgba(255,255,255,0.48)" : "rgba(0,0,0,0.42)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";

  const handleFinish = () => {
    markSetupComplete();
    onClose();
  };

  const renderContent = (idx) => {
    switch (idx) {
      case STEP_WELCOME:
        return <WelcomingStep onNext={() => goToStep(STEP_SELECT)} />;
      case STEP_SELECT:
        return (
          <SelectProvidersStep
            selectedProviders={selectedProviders}
            setSelectedProviders={setSelectedProviders}
            onNext={() => {
              setProviderSubStep(0);
              goToStep(
                selectedProviders.length > 0 ? STEP_CONFIGURE : STEP_WORKSPACE,
              );
            }}
          />
        );
      case STEP_CONFIGURE:
        return (
          <ConfigureProvidersStep
            selectedProviders={selectedProviders}
            providerSubStep={providerSubStep}
            setProviderSubStep={setProviderSubStep}
            onNext={() => goToStep(STEP_WORKSPACE)}
          />
        );
      case STEP_WORKSPACE:
        return <WorkspaceStep onNext={() => goToStep(STEP_DONE)} />;
      case STEP_DONE:
        return (
          <CompletionStep
            selectedProviders={selectedProviders}
            onFinish={handleFinish}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      open={open}
      onClose={undefined}
      style={{
        width: 480,
        height: "85vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: textColor,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── header ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px 14px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            fontFamily: "NunitoSans, sans-serif",
            color: textColor,
            opacity: 0.3,
          }}
        >
          Setup
        </span>
        {step < STEP_DONE && (
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 11,
              fontFamily: "NunitoSans, sans-serif",
              color: skipColor,
              outline: "none",
              transition: "color 0.12s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = skipHoverColor)}
            onMouseLeave={(e) => (e.currentTarget.style.color = skipColor)}
          >
            Skip for now
          </button>
        )}
      </div>

      {/* ── timeline body ── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "20px 28px 24px",
        }}
      >
        <SetupFlow
          currentStep={step}
          onStepClick={goToStep}
          isDark={isDark}
          contentVisible={contentVisible}
          renderContent={renderContent}
        />
      </div>
    </Modal>
  );
};

export default InitSetupModal;
