import { useContext, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ChatInput from "../../chat-input/chat_input";
import TestControls from "../test_controls";
import { toast } from "../../../SERVICEs/toast";
import { CONTEXT_V2_TURN_MUTATION_MESSAGES } from "../../../PAGEs/chat/hooks/context_v2_turn_mutation";

/**
 * TurnMutationHoldRunner — bench for the docked "Message change paused"
 * banner.
 *
 * Mounts the REAL ChatInput and drives its `turnMutationHold` prop, so the
 * exact production path runs: the enter/exit grid animation, the capsule
 * top-corner morph, the exit-retention window, and the Retry/Discard
 * buttons. Nothing here touches the real turn-mutation outbox — every hold
 * is a bench-local object with a fresh operationId.
 */

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

const RESTORED_DRAFT_TEXT =
  "这是被 Discard 恢复回输入框的草稿文本 — restore-your-text 语义演示。";

const Chip = ({ label, onClick, isDark, tone = "default" }) => (
  <button
    onClick={onClick}
    style={{
      appearance: "none",
      cursor: "pointer",
      font: "inherit",
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: "18px",
      padding: "5px 12px",
      borderRadius: 7,
      border: `1px solid ${
        isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"
      }`,
      background:
        tone === "accent"
          ? isDark
            ? "rgba(255,184,107,0.14)"
            : "rgba(160,94,0,0.1)"
          : isDark
            ? "rgba(255,255,255,0.06)"
            : "rgba(0,0,0,0.04)",
      color:
        tone === "accent"
          ? isDark
            ? "rgba(255,214,165,0.95)"
            : "#a05e00"
          : isDark
            ? "rgba(255,255,255,0.82)"
            : "rgba(0,0,0,0.72)",
      flex: "none",
    }}
  >
    {label}
  </button>
);

const TurnMutationHoldRunner = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [value, setValue] = useState("");
  const [hold, setHold] = useState(null);
  const [selectedModelId, setSelectedModelId] = useState(
    MOCK_MODEL_CATALOG.activeModel,
  );
  const [selectedToolkits, setSelectedToolkits] = useState([]);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState([]);
  const opSeqRef = useRef(0);
  const replayTimerRef = useRef(null);

  const makeHold = (canDiscard) => {
    opSeqRef.current += 1;
    return {
      operationId: `bench-hold-${opSeqRef.current}`,
      kind: "edit",
      canDiscard,
      message: CONTEXT_V2_TURN_MUTATION_MESSAGES.QUARANTINED,
    };
  };

  const showHold = (canDiscard) => setHold(makeHold(canDiscard));
  const hideHold = () => setHold(null);
  const replayEnter = (canDiscard) => {
    /* Exit fully (including the 300ms retention window) before re-entering,
       so one click demos the complete out-then-in cycle. */
    setHold(null);
    clearTimeout(replayTimerRef.current);
    replayTimerRef.current = setTimeout(() => setHold(makeHold(canDiscard)), 480);
  };

  const handleRetry = (operationId) => {
    toast.info(`Retry → ${operationId}（bench：保持 hold 以便反复观察)`);
  };

  const handleDiscard = (operationId) => {
    setHold(null);
    setValue(RESTORED_DRAFT_TEXT);
    toast.info(`Discard → ${operationId}（文本已恢复回输入框)`);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        minHeight: 420,
        paddingBottom: 8,
      }}
    >
      <ChatInput
        value={value}
        onChange={setValue}
        onSend={() => setValue("")}
        onStop={() => {}}
        isStreaming={false}
        showAttachments={true}
        onAttachFile={() => {}}
        onAttachScreenshot={() => {}}
        attachments={[]}
        onRemoveAttachment={() => {}}
        attachmentsEnabled={true}
        attachmentsDisabledReason=""
        modelCatalog={MOCK_MODEL_CATALOG}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        modelSelectDisabled={false}
        showModelSelector={true}
        showToolSelector={true}
        selectedToolkits={selectedToolkits}
        onToolkitsChange={setSelectedToolkits}
        showWorkspaceSelector={true}
        selectedWorkspaceIds={selectedWorkspaceIds}
        onWorkspaceIdsChange={setSelectedWorkspaceIds}
        placeholder="hold 出现时观察胶囊顶角与横幅的联动…"
        turnMutationHold={hold}
        onTurnMutationRetry={handleRetry}
        onTurnMutationDiscard={handleDiscard}
      />

      <TestControls>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <Chip
            label="Show hold"
            tone="accent"
            isDark={isDark}
            onClick={() => showHold(true)}
          />
          <Chip
            label="Show · no discard"
            isDark={isDark}
            onClick={() => showHold(false)}
          />
          <Chip label="Hide" isDark={isDark} onClick={hideHold} />
          <Chip
            label="Replay enter"
            isDark={isDark}
            onClick={() => replayEnter(true)}
          />
        </div>
      </TestControls>
    </div>
  );
};

export default TurnMutationHoldRunner;
