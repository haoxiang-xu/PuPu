import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Slider } from "../../../BUILTIN_COMPONENTs/input/slider";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import TraceChain from "../../chat-bubble/trace_chain";
import TRACE_CHAIN_SCENARIOS from "../scenarios/trace_chain_scenarios";
import { createRuntimeEventStore } from "../../../SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../../SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../../SERVICEs/runtime_events/trace_chain_adapter";

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
  const isRuntimeEventScenario = Array.isArray(scenario.events);
  const scenarioItems = useMemo(
    () => (isRuntimeEventScenario ? scenario.events : scenario.frames || []),
    [isRuntimeEventScenario, scenario],
  );

  /* ── playback state ── */
  const [frames, setFrames] = useState([]);
  const [runtimeEvents, setRuntimeEvents] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(600);
  const [confirmationStates, setConfirmationStates] = useState({});
  const [waitingForConfirmation, setWaitingForConfirmation] = useState(false);
  const nextFrameIdx = useRef(0);
  const allItems = useRef(scenarioItems);

  const runtimeTraceProps = useMemo(() => {
    if (!isRuntimeEventScenario) {
      return null;
    }
    const runtimeEventStore = createRuntimeEventStore();
    runtimeEventStore.appendMany(runtimeEvents);
    const activityTree = reduceActivityTree(null, runtimeEventStore.getSnapshot());
    return adaptActivityTreeToTraceChain(activityTree);
  }, [isRuntimeEventScenario, runtimeEvents]);

  const traceFrames = isRuntimeEventScenario
    ? runtimeTraceProps?.frames || []
    : frames;
  const traceStatus = isRuntimeEventScenario
    ? runtimeTraceProps?.status
    : undefined;
  const traceToolConfirmationStates = isRuntimeEventScenario
    ? {
        ...(runtimeTraceProps?.toolConfirmationUiStateById || {}),
        ...confirmationStates,
      }
    : confirmationStates;

  /* ── derived ── */
  const isDone =
    !waitingForConfirmation &&
    nextFrameIdx.current >= allItems.current.length &&
    traceFrames.some((f) => f.type === "done");
  const status = isDone
    ? "done"
    : traceStatus && traceStatus !== "done"
      ? traceStatus
      : playing || traceFrames.length > 0
      ? "streaming"
      : "done";

  /* ── reset on scenario change ── */
  useEffect(() => {
    setFrames([]);
    setRuntimeEvents([]);
    setPlaying(false);
    setConfirmationStates({});
    setWaitingForConfirmation(false);
    nextFrameIdx.current = 0;
    allItems.current = scenarioItems;
  }, [scenario, scenarioItems]);

  /* ── timer ── */
  useEffect(() => {
    if (!playing || waitingForConfirmation) return;
    if (nextFrameIdx.current >= allItems.current.length) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const item = allItems.current[nextFrameIdx.current];
      nextFrameIdx.current += 1;
      if (isRuntimeEventScenario) {
        setRuntimeEvents((prev) => [...prev, item]);
      } else {
        setFrames((prev) => [...prev, item]);
      }

      if (
        !isRuntimeEventScenario &&
        scenario.waitForConfirmation &&
        item.type === "tool_call" &&
        item.payload?.confirmation_id === scenario.waitForConfirmation
      ) {
        setWaitingForConfirmation(true);
        setPlaying(false);
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [
    playing,
    frames.length,
    speed,
    scenario,
    waitingForConfirmation,
    isRuntimeEventScenario,
  ]);

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
        const followUp = isRuntimeEventScenario
          ? approved
            ? scenario.onApproveEvents || []
            : scenario.onDenyEvents || []
          : approved
            ? scenario.onApproveFrames || []
            : scenario.onDenyFrames || [];
        if (followUp.length > 0) {
          allItems.current = [...allItems.current, ...followUp];
        }
        setWaitingForConfirmation(false);
        setPlaying(true);
      }, 400);
    },
    [isRuntimeEventScenario, scenario],
  );

  /* ── controls ── */
  const handleReset = () => {
    setFrames([]);
    setRuntimeEvents([]);
    setPlaying(false);
    setConfirmationStates({});
    setWaitingForConfirmation(false);
    nextFrameIdx.current = 0;
    allItems.current = scenarioItems;
  };

  const handlePlayPause = () => {
    if (isDone) {
      handleReset();
      setTimeout(() => setPlaying(true), 50);
    } else {
      setPlaying((p) => !p);
    }
  };

  const isHiddenProgressItem = (item) =>
    isRuntimeEventScenario
      ? item?.type === "session.started" || item?.type === "run.completed"
      : item?.type === "stream_started" || item?.type === "done";
  const playedItems = isRuntimeEventScenario ? runtimeEvents : frames;
  const displayedCount = playedItems.filter(
    (item) => !isHiddenProgressItem(item),
  ).length;
  const totalCount = allItems.current.filter(
    (item) => !isHiddenProgressItem(item),
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
        {traceFrames.length > 0 ? (
          <div style={{ padding: "64px 32px 120px 232px" }}>
            <TraceChain
              frames={traceFrames}
              status={status}
              onToolConfirmationDecision={handleConfirmationDecision}
              toolConfirmationUiStateById={traceToolConfirmationStates}
              subagentFrames={
                isRuntimeEventScenario
                  ? runtimeTraceProps?.subagentFrames
                  : scenario.subagentFrames
              }
              subagentMetaByRunId={
                isRuntimeEventScenario
                  ? runtimeTraceProps?.subagentMetaByRunId
                  : scenario.subagentMetaByRunId
              }
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
          padding: "6px 10px 6px 6px",
          maxWidth: "calc(100% - 264px)",
          borderRadius: 12,
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
              borderRadius: 7,
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
            borderRadius: 7,
          }}
        />

        {/* reset */}
        <Button
          label="Reset"
          onClick={handleReset}
          disabled={traceFrames.length === 0}
          style={{
            fontSize: 11,
            paddingVertical: 4,
            paddingHorizontal: 10,
            borderRadius: 7,
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
        <span style={mono}>
          {displayedCount}/{totalCount}
          {waitingForConfirmation ? " input" : ""}
        </span>
      </div>
    </div>
  );
};

export default TraceChainRunner;
