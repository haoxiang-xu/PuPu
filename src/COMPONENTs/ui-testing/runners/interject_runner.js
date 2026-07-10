import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { toast } from "../../../SERVICEs/toast";
import TraceChain from "../../chat-bubble/trace_chain";
import ChatInput from "../../chat-input/chat_input";
import TestControls from "../test_controls";

/**
 * InterjectRunner — UI test bench for the run-in interject surface.
 *
 * Mounts the REAL TraceChain (fed with mock interject frames) above the REAL
 * ChatInput (slash command menu, steer attach section, hint pill, send/stop button trio),
 * with a control bar to flip every interject state — so the whole surface can
 * be eyeballed without driving a live streaming run.
 */

/* frame helper — matches the {seq, ts, type, payload} shape TraceChain reads */
const f = ({ seq, type, payload = {} }) => ({
  seq,
  ts: seq * 800,
  run_id: "interject-preview",
  stage: "runtime_event",
  type,
  payload,
});

const BASE_FRAMES = [
  f({ seq: 1, type: "stream_started" }),
  f({
    seq: 2,
    type: "reasoning",
    payload: { reasoning: "先梳理三家 CI 的定价档位,再按预算过滤可用方案。" },
  }),
  f({
    seq: 3,
    type: "tool_call",
    payload: {
      call_id: "c1",
      tool_name: "web_search",
      tool_display_name: "web_search",
      arguments: { query: "CircleCI pricing 2026" },
    },
  }),
  f({
    seq: 4,
    type: "tool_result",
    payload: { call_id: "c1", tool_name: "web_search", result: { hits: 6 } },
  }),
];

const FYI_FRAME = f({
  seq: 5,
  type: "fyi_injected",
  payload: {
    count: 1,
    messages: [
      { message_id: "m1", origin: "user", text: "预算每月不超过 $200,记得算进去" },
    ],
  },
});

const SIDE_FRAME = f({
  seq: 6,
  type: "side_answer",
  payload: {
    question: "你现在查到哪了?",
    answer:
      "已完成 GitHub Actions 和 CircleCI 的定价梳理,正在抓 Buildkite,预计还需两三步。",
  },
});

const CLARIFY_OPTIONS = [
  { label: "加进当前任务", value: "fyi" },
  { label: "做完再研究", value: "steer" },
  { label: "只是问一嘴", value: "btw" },
];

const STEER_SAMPLES = [
  "做完后把结论整理成一页 markdown",
  "顺便估一下迁移工作量",
  "再把 Jenkins 也补进对比",
  "最后给一个一句话推荐",
];

let steerSeq = 0;
const makeSteerItem = (text) => ({
  id: `steer-${(steerSeq += 1)}`,
  text,
  status: "queued",
});

/* mock model catalog — mirrors the shape api.unchain.getModelCatalog()
   normalizes to (see EMPTY_MODEL_CATALOG in SERVICEs/api.shared.js), so
   useChatInputModels/build_model_options read it exactly like the real
   chat page's live catalog. Only `.providers.{ollama,openai,anthropic}`
   (arrays of model-name strings) are actually consumed downstream. */
const MOCK_MODEL_CATALOG = {
  activeModel: "ollama:llama3.1:8b",
  activeCapabilities: { text: true, image: true },
  modelCapabilities: {},
  providers: {
    ollama: ["llama3.1:8b", "qwen2.5:7b"],
    openai: ["gpt-4.1-mini", "gpt-4o"],
    anthropic: ["claude-sonnet-4-5", "claude-haiku-4-5"],
  },
  embeddingProviders: { openai: [] },
};

const Chip = ({ label, active, onClick, isDark }) => (
  <button
    onClick={onClick}
    style={{
      cursor: "pointer",
      fontSize: 11,
      padding: "5px 11px",
      borderRadius: 8,
      whiteSpace: "nowrap",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}`,
      background: active
        ? isDark
          ? "rgba(120,200,150,0.22)"
          : "rgba(40,150,80,0.14)"
        : isDark
          ? "rgba(255,255,255,0.05)"
          : "rgba(0,0,0,0.03)",
      color: isDark ? "rgba(255,255,255,0.86)" : "rgba(0,0,0,0.82)",
    }}
  >
    {label}
  </button>
);

const InterjectRunner = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [value, setValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);
  const [steerItems, setSteerItems] = useState([]);
  const [showFyi, setShowFyi] = useState(true);
  const [showSide, setShowSide] = useState(true);
  const [clarifyStatus, setClarifyStatus] = useState("off");

  /* composer chrome (attach panel) — bench-local state/stubs mirroring
     chat.js's sharedChatInputProps; no real upload/screenshot capture. */
  const [selectedModelId, setSelectedModelId] = useState(
    MOCK_MODEL_CATALOG.activeModel,
  );
  const [selectedToolkits, setSelectedToolkits] = useState([]);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState([]);
  const [mockAttachments, setMockAttachments] = useState([]);

  const addMockAttachment = (prefix) =>
    setMockAttachments((prev) => [
      ...prev,
      { id: `${prefix}-${prev.length}-${Date.now()}`, name: `${prefix}-${prev.length + 1}` },
    ]);

  const handleAttachFile = () => {
    // eslint-disable-next-line no-console
    console.log("[InterjectRunner] attach file → stub, no real upload wired");
    addMockAttachment("mock-file");
  };

  const handleAttachScreenshot = () => {
    // eslint-disable-next-line no-console
    console.log(
      "[InterjectRunner] attach screenshot → stub, no real capture wired",
    );
    addMockAttachment("mock-screenshot");
  };

  const handleRemoveAttachment = (id) =>
    setMockAttachments((prev) => prev.filter((att) => att.id !== id));

  const frames = useMemo(() => {
    const fs = [...BASE_FRAMES];
    if (showFyi) fs.push(FYI_FRAME);
    if (showSide) fs.push(SIDE_FRAME);
    if (clarifyStatus !== "off") {
      fs.push(
        f({
          seq: 7,
          type: "clarify_request",
          payload: {
            question: "顺便看下 Jenkins",
            options: CLARIFY_OPTIONS,
            status: clarifyStatus,
          },
        }),
      );
    }
    return fs;
  }, [showFyi, showSide, clarifyStatus]);

  const interjectState = useMemo(
    () => ({ steerItems }),
    [steerItems],
  );

  const addSteer = () =>
    setSteerItems((prev) =>
      prev.length >= STEER_SAMPLES.length
        ? prev
        : [...prev, makeSteerItem(STEER_SAMPLES[prev.length])],
    );
  const relaySteer = () =>
    setSteerItems((prev) => prev.map((it) => ({ ...it, status: "relayed" })));
  const undoSteer = (id) =>
    setSteerItems((prev) => prev.filter((it) => it.id !== id));

  const chips = (
    <>
      <Chip
        label={isStreaming ? "流式中 ✓" : "非流式"}
        active={isStreaming}
        onClick={() => setIsStreaming((s) => !s)}
        isDark={isDark}
      />
      <Chip
        label="fyi toast"
        active={false}
        onClick={() =>
          toast.success("Queued — will be injected next step", {
            dedupeKey: "interject-fyi-queued",
          })
        }
        isDark={isDark}
      />
      <Chip label="+ steer" active={false} onClick={addSteer} isDark={isDark} />
      <Chip
        label="steer 接力"
        active={steerItems.some((it) => it.status === "relayed")}
        onClick={relaySteer}
        isDark={isDark}
      />
      <Chip
        label="清空 steer"
        active={false}
        onClick={() => setSteerItems([])}
        isDark={isDark}
      />
      <Chip
        label="trace: fyi 帧"
        active={showFyi}
        onClick={() => setShowFyi((v) => !v)}
        isDark={isDark}
      />
      <Chip
        label="trace: 旁路帧"
        active={showSide}
        onClick={() => setShowSide((v) => !v)}
        isDark={isDark}
      />
      <Chip
        label={`clarify: ${clarifyStatus}`}
        active={clarifyStatus !== "off"}
        onClick={() =>
          setClarifyStatus((s) =>
            s === "off" ? "pending" : s === "pending" ? "resolved_default" : "off",
          )
        }
        isDark={isDark}
      />
      <Chip
        label="输入框打 /"
        active={value.startsWith("/")}
        onClick={() => setValue("/")}
        isDark={isDark}
      />
    </>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* content column, pushed right past the side menu */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* trace chain (scrollable, takes remaining height) */}
        <div
          className="scrollable"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "40px 40px 16px 24px",
          }}
        >
          <TraceChain
            frames={frames}
            status={isStreaming ? "streaming" : "done"}
            messageId="interject-preview-msg"
            bubbleOwnsFinalMessage={false}
            onClarifyResolve={(v) => {
              setClarifyStatus("resolved_default");
              // eslint-disable-next-line no-console
              console.log("[InterjectRunner] clarify resolved →", v);
            }}
          />
        </div>

        {/* real chat input */}
        <div
          style={{
            flexShrink: 0,
            padding: "0 40px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ width: "min(760px, 100%)" }}>
            <ChatInput
              value={value}
              onChange={setValue}
              onSend={() => {
                // eslint-disable-next-line no-console
                console.log("[InterjectRunner] send/interject →", value);
                setValue("");
              }}
              onStop={() => setIsStreaming(false)}
              isStreaming={isStreaming}
              showAttachments={true}
              onAttachFile={handleAttachFile}
              onAttachScreenshot={handleAttachScreenshot}
              attachments={mockAttachments}
              onRemoveAttachment={handleRemoveAttachment}
              attachmentsEnabled={true}
              attachmentsDisabledReason=""
              modelCatalog={MOCK_MODEL_CATALOG}
              selectedModelId={selectedModelId}
              onSelectModel={setSelectedModelId}
              modelSelectDisabled={isStreaming}
              showModelSelector={true}
              showToolSelector={true}
              selectedToolkits={selectedToolkits}
              onToolkitsChange={setSelectedToolkits}
              showWorkspaceSelector={true}
              selectedWorkspaceIds={selectedWorkspaceIds}
              onWorkspaceIdsChange={setSelectedWorkspaceIds}
              interjectState={interjectState}
              onSteerUndo={undoSteer}
              placeholder="插一句话…(试试 / 唤起命令菜单)"
            />
          </div>
        </div>

        <TestControls>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {chips}
          </div>
        </TestControls>
      </div>
    </div>
  );
};

export default InterjectRunner;
