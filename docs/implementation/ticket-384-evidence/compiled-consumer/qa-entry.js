import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import TraceChain from "../../../../src/COMPONENTs/chat-bubble/trace_chain";
import { ConfigContext, LocaleContext } from "../../../../src/CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "../../../../src/COMPONENTs/chat-bubble/components/streaming_message_store_context";
import { createRuntimeEventStore } from "../../../../src/SERVICEs/runtime_events/event_store";
import { reduceActivityTree } from "../../../../src/SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../../../src/SERVICEs/runtime_events/trace_chain_adapter";
import { settleStreamingAssistantMessages } from "../../../../src/PAGEs/chat/utils/chat_turn_utils";
import { createChatInSelectedContext, getChatMessages, getChatsStore, selectTreeNode, setChatMessages } from "../../../../src/SERVICEs/chat_storage";
import observedBatch from "../../../../src/SERVICEs/runtime_events/fixtures/ticket_384_observed_batch.json";

const h = React.createElement;
const streamSnapshot = Object.freeze({ version: 0, textLength: 0, chunks: Object.freeze([]), updatedAt: 0 });
const streamStore = Object.freeze({
  getSnapshot: () => streamSnapshot,
  subscribe: () => () => {},
});
const params = new URLSearchParams(window.location.search);
const initialChatId = params.get("chat") || getChatsStore().activeChatId ||
  createChatInSelectedContext({ title: "#384 QA empty" }, { source: "ticket-384-qa" }).chatId;
const initialScenario = params.get("scenario") || "";

function nodeIdForChat(chatId) {
  return Object.entries(getChatsStore().tree?.nodesById || {})
    .find(([, node]) => node?.entity === "chat" && node.chatId === chatId)?.[0] || "";
}

function setIdentityInUrl(chatId, scenario) {
  const next = new URL(window.location.href);
  next.searchParams.set("chat", chatId);
  if (scenario) next.searchParams.set("scenario", scenario);
  else next.searchParams.delete("scenario");
  window.history.replaceState(null, "", next);
}

function actualFixtureTrace(chatId) {
  const runId = "observed-batch-run";
  const callIds = { "observed-batch-call-1": "qa-completed-call", "observed-batch-call-2": "qa-pending-call" };
  const events = observedBatch.slice(0, 5).map((source) => {
    const event = JSON.parse(JSON.stringify(source));
    event.event_id = `ticket-384-qa-${event.seq}`;
    event.session_id = chatId;
    event.run_id = runId;
    event.turn_id = `${runId}:turn-0`;
    const oldId = event.links?.tool_call_id;
    if (oldId && callIds[oldId]) {
      event.links.tool_call_id = callIds[oldId];
      if (event.payload?.call_id) event.payload.call_id = callIds[oldId];
      if (typeof event.links?.step_id === "string") event.links.step_id = `tool:${callIds[oldId]}`;
      if (typeof event.payload?.step_id === "string") event.payload.step_id = `tool:${callIds[oldId]}`;
    }
    return event;
  });
  const eventStore = createRuntimeEventStore();
  eventStore.appendManyForReduction(events);
  return adaptActivityTreeToTraceChain(reduceActivityTree(null, eventStore.getReductionSnapshot()));
}

function makeInterruptedMessage(kind, chatId) {
  const projected = actualFixtureTrace(chatId);
  const frames = [...projected.frames];
  const subagentFrames = { ...projected.subagentFrames };
  const subagentMetaByRunId = { ...projected.subagentMetaByRunId };

  if (kind === "nested") {
    frames.push({ seq: 20, ts: Date.now(), run_id: "observed-batch-run", type: "tool_call",
      payload: { call_id: "qa-delegate-call", tool_name: "delegate_to_subagent", arguments: { task: "Search the project" } } });
    frames.push({ seq: 21, ts: Date.now(), run_id: "observed-batch-run", type: "tool_result",
      payload: { call_id: "qa-delegate-call", result: { agent_name: "qa-worker", status: "running" } } });
    subagentFrames["qa-worker-run"] = [{ seq: 22, ts: Date.now(), run_id: "qa-worker-run", type: "tool_call",
      payload: { call_id: "qa-child-call", tool_name: "read_file", arguments: { path: "worker.txt" } } }];
    subagentMetaByRunId["qa-worker-run"] = {
      subagentId: "qa-worker", mode: "delegate", template: "search", parentId: "observed-batch-run", lineage: [], status: "running",
    };
  }

  if (kind === "approval") {
    frames.push({ seq: 30, ts: Date.now(), run_id: "observed-batch-run", type: "tool_call",
      payload: {
        call_id: "qa-approval-call", confirmation_id: "qa-approval-384",
        tool_name: "shell", toolkit_id: "core", requires_confirmation: true,
        arguments: { command: "echo approval" }, interact_type: "confirmation",
      } });
  }

  return settleStreamingAssistantMessages([{
    id: `assistant-${kind}-384`, role: "assistant", content: "", status: "streaming",
    createdAt: Date.now(), updatedAt: Date.now(), traceFrames: frames,
    subagentFrames, subagentMetaByRunId,
  }]).nextMessages[0];
}

function App() {
  const [chatId, setChatId] = useState(initialChatId);
  const [scenario, setScenario] = useState(initialScenario);
  const [savedScenario, setSavedScenario] = useState(initialScenario);
  const [revision, setRevision] = useState(0);
  const [actions, setActions] = useState(0);
  const messages = getChatMessages(chatId);
  const saved = messages.find((message) => message.id === `assistant-${scenario}-384`) || null;

  const seedScenario = (kind) => {
    const assistant = makeInterruptedMessage(kind, chatId);
    setChatMessages(chatId, [
      { id: `user-${kind}-384`, role: "user", content: "Inspect the interrupted tool chain", createdAt: Date.now(), updatedAt: Date.now() },
      assistant,
    ], { source: "ticket-384-compiled-consumer-seed" });
    setScenario(kind);
    setSavedScenario(kind);
    setIdentityInUrl(chatId, kind);
    setRevision((value) => value + 1);
  };

  const switchAway = () => {
    const other = createChatInSelectedContext({ title: "#384 switch check" }, { source: "ticket-384-qa" });
    setChatId(other.chatId);
    setScenario("");
    setIdentityInUrl(other.chatId, "");
    setRevision((value) => value + 1);
  };

  const returnToSavedChat = () => {
    const nodeId = nodeIdForChat(initialChatId);
    if (nodeId) selectTreeNode({ nodeId }, { source: "ticket-384-qa" });
    setChatId(initialChatId);
    setScenario(savedScenario);
    setIdentityInUrl(initialChatId, savedScenario);
    setRevision((value) => value + 1);
  };

  const savedConfirmationUi = {};
  (saved?.traceFrames || []).forEach((frame) => {
    const id = frame?.payload?.confirmation_id;
    if (id && frame.payload?.requires_confirmation) savedConfirmationUi[id] = { status: "idle", resolved: false };
  });
  const traceProps = saved ? {
    frames: saved.traceFrames || [],
    status: saved.status,
    messageId: saved.id,
    streamingContent: saved.content || "",
    subagentFrames: saved.subagentFrames || {},
    subagentMetaByRunId: saved.subagentMetaByRunId || {},
    toolConfirmationUiStateById: savedConfirmationUi,
  } : null;

  return h(ConfigContext.Provider, { value: { theme: {}, onThemeMode: "light_mode" } },
    h(LocaleContext.Provider, { value: { locale: "en", setLocale: () => {} } },
      h(StreamingMessageStoreContext.Provider, { value: { chatId, store: streamStore, notifyStreamingContentCommitted: null } },
        h("main", { style: { fontFamily: "sans-serif", margin: "24px auto", maxWidth: 900, padding: 16, color: "#222" } },
          h("h1", null, "PuPu #384 compiled consumer fixture"),
          h("p", null, "Scenario buttons seed once. Switch and reload render the saved assistant record."),
          h("nav", { style: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 } },
            ...["generic", "nested", "approval"].map((name) => h("button", { key: name, "data-testid": `scenario-${name}`, onClick: () => seedScenario(name) }, `Seed ${name}`)),
            h("button", { "data-testid": "switch-away", onClick: switchAway }, "Switch away"),
            h("button", { "data-testid": "return", onClick: returnToSavedChat }, "Return to saved chat"),
            h("button", { "data-testid": "reload", onClick: () => window.location.reload() }, "Cold reload"),
          ),
          h("div", { "data-testid": "metadata", "data-chat-id": chatId, "data-scenario": scenario, "data-status": saved?.status || "missing", "data-action-count": actions },
            `scenario=${scenario || "none"}; status=${saved?.status || "missing"}; body=${saved?.content ?? "missing"}; approvalActions=${actions}; revision=${revision}`),
          h("section", { style: { border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 } },
            traceProps ? h(TraceChain, { ...traceProps, onToolConfirmationDecision: () => setActions((value) => value + 1), onStopStream: () => {}, showContainerHeader: true }) : h("p", null, "Choose a scenario to seed a persisted record."),
          ),
          h("pre", { "data-testid": "persisted", style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 11, marginTop: 18 } }, saved ? JSON.stringify(saved, null, 2) : "No saved assistant record."),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById("root")).render(h(App));
