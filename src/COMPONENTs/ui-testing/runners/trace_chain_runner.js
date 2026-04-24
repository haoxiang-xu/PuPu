import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Slider } from "../../../BUILTIN_COMPONENTs/input/slider";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import TraceChain from "../../chat-bubble/trace_chain";
import TRACE_CHAIN_SCENARIOS from "../scenarios/trace_chain_scenarios";

/* ── scenario options for Select ── */
const SCENARIO_OPTIONS = TRACE_CHAIN_SCENARIOS.map((s, i) => ({
  value: String(i),
  label: s.name,
}));

/* ═══════════════════════════════════════════════════════════════════════
   TraceChainRunner
   ═══════════════════════════════════════════════════════════════════════ */
const TraceChainRunner = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  /* ── scenario selection ── */
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const scenario = TRACE_CHAIN_SCENARIOS[scenarioIdx];

  /* ── playback state ── */
  const [frames, setFrames] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [confirmationStates, setConfirmationStates] = useState({});
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const nextFrameIdx = useRef(0);
  const allFrames = useRef(scenario.frames);

  /* ── derived ── */
  const isDone =
    !waitingForConfirmation &&
    nextFrameIdx.current >= allFrames.current.length &&
    frames.some((f) => f.type === "done");
  const status = isDone
    ? "done"
    : playing || frames.length > 0
      ? "streaming"
      : "done";

  /* ── reset on scenario change ── */
  useEffect(() => {
    setFrames([]);
    setPlaying(false);
    setConfirmationStates({});
    setWaitingForConfirmation(false);
    nextFrameIdx.current = 0;
    allFrames.current = scenario.frames;
  }, [scenario]);

  /* ── timer ── */
  useEffect(() => {
    if (!playing || waitingForConfirmation) return;
    if (nextFrameIdx.current >= allFrames.current.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const frame = allFrames.current[nextFrameIdx.current];
      nextFrameIdx.current += 1;
      setFrames((prev) => [...prev, frame]);

      if (
        scenario.waitForConfirmation &&
        frame.type === "tool_call" &&
        frame.payload?.confirmation_id === scenario.waitForConfirmation
      ) {
        setWaitingForConfirmation(true);
        setPlaying(false);
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [playing, frames.length, speed, scenario, waitingForConfirmation]);

  /* ── confirmation handler ── */
  const handleConfirmationDecision = useCallback(
    (decision) => {
      const { confirmationId, approved, userResponse } = decision;
      setConfirmationStates((prev) => ({
        ...prev,
        [confirmationId]: {
          status: "submitted",
          resolved: true,
          decision: approved ? "approved" : "denied",
          userResponse,
        },
      }));
      setTimeout(() => {
        const followUp = approved
          ? scenario.onApproveFrames || []
          : scenario.onDenyFrames || [];
        if (followUp.length > 0) {
          allFrames.current = [...allFrames.current, ...followUp];
        }
        setWaitingForConfirmation(false);
        setPlaying(true);
      }, 400);
    },
    [scenario],
  );

  /* ── controls ── */
  const handleReset = () => {
    setFrames([]);
    setPlaying(false);
    setConfirmationStates({});
    setWaitingForConfirmation(false);
    nextFrameIdx.current = 0;
    allFrames.current = scenario.frames;
  };

  const handlePlayPause = () => {
    if (isDone) {
      handleReset();
      setTimeout(() => setPlaying(true), 50);
    } else {
      setPlaying((p) => !p);
    }
  };

  const displayedCount = frames.filter(
    (f) => f.type !== "stream_started" && f.type !== "done",
  ).length;
  const totalCount = allFrames.current.filter(
    (f) => f.type !== "stream_started" && f.type !== "done",
  ).length;

  /* ── glassmorphism tokens ── */
  const overlay_bg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlay_border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlay_backdrop = "blur(16px) saturate(1.4)";
  const overlay_shadow = isDark
    ? "0 4px 24px rgba(0,0,0,0.4)"
    : "0 4px 24px rgba(0,0,0,0.08)";

  const mono = {
    fontSize: 10,
    fontFamily: "Menlo, Monaco, Consolas, monospace",
    color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
    userSelect: "none",
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* ── scrollable content (scrollbar flush right, content padded) ── */}
      <div
        className="scrollable"
        data-sb-edge="16"
        data-sb-wall="2"
        style={{
          position: "absolute",
          inset: 0,
          paddingTop: 16,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {frames.length > 0 ? (
          <div style={{ padding: "64px 32px 120px 232px" }}>
            <TraceChain
              frames={frames}
              status={status}
              onToolConfirmationDecision={handleConfirmationDecision}
              toolConfirmationUiStateById={confirmationStates}
              subagentFrames={scenario.subagentFrames}
              subagentMetaByRunId={scenario.subagentMetaByRunId}
              bubbleOwnsFinalMessage={false}
            />
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 232,
              right: 32,
              bottom: 70,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              ...mono,
              fontSize: 13,
              color: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)",
              pointerEvents: "none",
            }}
          >
            Press Play to start
          </div>
        )}
      </div>

      {/* ── bottom control bar (glassmorphism, centered within content area) ── */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: "calc(50% + 100px)",
          transform: "translateX(-50%)",
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 16px",
          maxWidth: "calc(100% - 264px)",
          borderRadius: 10,
          background: overlay_bg,
          border: overlay_border,
          backdropFilter: overlay_backdrop,
          WebkitBackdropFilter: overlay_backdrop,
          boxShadow: overlay_shadow,
          pointerEvents: "auto",
        }}
      >
        {/* scenario selector */}
        <div style={{ width: 160 }}>
          <Select
            options={SCENARIO_OPTIONS}
            value={String(scenarioIdx)}
            set_value={(val) => setScenarioIdx(Number(val))}
            filterable={false}
            style={{
              fontSize: 12,
              height: 18,
              borderRadius: 5,
            }}
          />
        </div>

        {/* divider */}
        <div
          style={{
            width: 1,
            height: 16,
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            flexShrink: 0,
          }}
        />

        {/* play/pause */}
        <Button
          label={isDone ? "Replay" : playing ? "Pause" : "Play"}
          onClick={handlePlayPause}
          style={{
            fontSize: 11,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 5,
          }}
        />

        {/* reset */}
        <Button
          label="Reset"
          onClick={handleReset}
          disabled={frames.length === 0}
          style={{
            fontSize: 11,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 5,
          }}
        />

        {/* divider */}
        <div
          style={{
            width: 1,
            height: 16,
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            flexShrink: 0,
          }}
        />

        {/* speed */}
        <span style={{ ...mono, flexShrink: 0, marginRight: 6 }}>Speed</span>
        <Slider
          value={speed}
          set_value={setSpeed}
          min={100}
          max={2000}
          step={100}
          show_tooltip={true}
          label_format={(v) => `${(v / 1000).toFixed(1)}s`}
          style={{ width: 140, marginRight: 6 }}
        />

        {/* divider */}
        <div
          style={{
            width: 1,
            height: 16,
            background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
            flexShrink: 0,
          }}
        />

        {/* progress */}
        <span style={{ ...mono, paddingRight: 6 }}>
          {displayedCount}/{totalCount}
          {waitingForConfirmation ? " input" : ""}
        </span>
      </div>
    </div>
  );
};

export default TraceChainRunner;
