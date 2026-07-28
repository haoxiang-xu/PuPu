import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createStreamingMessageStore } from "../../SERVICEs/streaming_message_store";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import ChatBubble from "./chat_bubble";
import CharacterChatBubble from "./character_chat_bubble";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderWithConfig = (ui) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      {ui}
    </ConfigContext.Provider>,
  );

const renderWithStore = (ui, { chatId = "chat", store = null } = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId,
          store,
          notifyStreamingContentCommitted: jest.fn(),
        }}
      >
        {ui}
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

const streamingAssistantMessage = {
  id: "assistant-1",
  role: "assistant",
  content: "",
  status: "streaming",
  createdAt: 1710000000000,
  updatedAt: 1710000000000,
};

const pendingContinuationRequest = {
  confirmationId: "continue-1",
  iteration: 4,
  status: "idle",
};

const pendingToolConfirmationRequests = {
  "confirm-1": {
    confirmationId: "confirm-1",
    callId: "call-1",
    toolName: "delete_file",
    arguments: { path: "demo.txt" },
    interactType: "confirmation",
    interactConfig: {},
    requestedAt: 1710000000100,
  },
};

const toolConfirmationUiStateById = {
  "confirm-1": {
    status: "idle",
    error: "",
    resolved: false,
  },
};

describe("chat bubble continuation prompts", () => {
  test("shows tool confirmation controls for plain assistant streams without trace activity", () => {
    const onToolConfirmationDecision = jest.fn();

    renderWithConfig(
      <ChatBubble
        message={streamingAssistantMessage}
        traceFrames={[]}
        onToolConfirmationDecision={onToolConfirmationDecision}
        toolConfirmationUiStateById={toolConfirmationUiStateById}
        pendingToolConfirmationRequests={pendingToolConfirmationRequests}
      />,
    );

    expect(screen.getByText("delete_file")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
      scope: "once",
    });
  });

  test("shows tool confirmation controls for character assistant streams without trace activity", () => {
    const onToolConfirmationDecision = jest.fn();

    renderWithConfig(
      <CharacterChatBubble
        message={streamingAssistantMessage}
        traceFrames={[]}
        onToolConfirmationDecision={onToolConfirmationDecision}
        toolConfirmationUiStateById={toolConfirmationUiStateById}
        pendingToolConfirmationRequests={pendingToolConfirmationRequests}
        characterName="Lena"
      />,
    );

    expect(screen.getByText("delete_file")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: false,
      scope: "once",
    });
  });

  test.each([
    ["plain", ChatBubble, {}],
    [
      "character",
      CharacterChatBubble,
      { characterName: "Lena", characterAvailability: "available" },
    ],
  ])(
    "keeps a recovered confirmation actionable beside a bare %s tool trace",
    (_label, Bubble, extraProps) => {
      const onToolConfirmationDecision = jest.fn();

      renderWithConfig(
        <Bubble
          {...extraProps}
          message={streamingAssistantMessage}
          traceFrames={[
            {
              seq: 1,
              type: "tool_call",
              payload: {
                call_id: "call-1",
                tool_name: "delete_file",
                arguments: { path: "demo.txt" },
              },
            },
          ]}
          onToolConfirmationDecision={onToolConfirmationDecision}
          toolConfirmationUiStateById={toolConfirmationUiStateById}
          pendingToolConfirmationRequests={pendingToolConfirmationRequests}
        />,
      );

      expect(screen.getAllByText("delete_file")).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
      expect(onToolConfirmationDecision).toHaveBeenCalledWith({
        confirmationId: "confirm-1",
        approved: true,
        scope: "once",
      });
    },
  );

  test("keeps a recovered subagent confirmation in the child timeline only", () => {
    const onToolConfirmationDecision = jest.fn();
    const message = {
      ...streamingAssistantMessage,
      id: "assistant-child-confirmation",
      subagentFrames: {
        "child-run": [
          {
            seq: 1,
            type: "tool_call",
            payload: {
              call_id: "call-1",
              confirmation_id: "confirm-1",
              requires_confirmation: true,
              tool_name: "delete_file",
              arguments: { path: "demo.txt" },
              interact_type: "confirmation",
              interact_config: {},
            },
          },
        ],
      },
      subagentMetaByRunId: {
        "child-run": {
          subagentId: "developer.worker.1",
          mode: "delegate",
          template: "worker",
          parentId: "developer",
          lineage: ["developer", "developer.worker.1"],
          status: "running",
        },
      },
    };

    renderWithConfig(
      <CharacterChatBubble
        message={message}
        traceFrames={[
          {
            seq: 1,
            type: "tool_call",
            payload: {
              call_id: "delegate-1",
              tool_name: "delegate_to_subagent",
              arguments: { target: "worker", task: "Delete demo.txt" },
            },
          },
          {
            seq: 2,
            type: "tool_result",
            payload: {
              call_id: "delegate-1",
              tool_name: "delegate_to_subagent",
              result: {
                agent_name: "developer.worker.1",
                template_name: "worker",
                status: "running",
              },
            },
          },
        ]}
        onToolConfirmationDecision={onToolConfirmationDecision}
        toolConfirmationUiStateById={toolConfirmationUiStateById}
        pendingToolConfirmationRequests={pendingToolConfirmationRequests}
        characterName="Lena"
      />,
    );

    expect(screen.queryByRole("button", { name: "Allow once" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getAllByRole("button", { name: "Allow once" })).toHaveLength(
      1,
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
    expect(onToolConfirmationDecision).toHaveBeenCalledTimes(1);
    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
      scope: "once",
    });
  });
});

describe("ChatBubble lazy trace chain", () => {
  test("assistant bubble with tool_call frames renders lazy placeholder first", () => {
    const originalIdle = window.requestIdleCallback;
    window.requestIdleCallback = () => 1;
    try {
      const traceFrames = [
        { seq: 1, type: "tool_call", payload: { tool_name: "fs_read" } },
      ];
      const { container } = renderWithConfig(
        <ChatBubble
          message={{
            id: "assistant-lazy",
            role: "assistant",
            content: "done",
            status: "done",
            traceFrames,
          }}
          traceFrames={traceFrames}
        />,
      );
      expect(
        container.querySelector('[data-testid="lazy-trace-placeholder"]'),
      ).not.toBeNull();
    } finally {
      window.requestIdleCallback = originalIdle;
    }
  });
});

describe("ChatBubble artifact summaries", () => {
  const fileBucket = (turnId, order) => ({
    order,
    status: "completed",
    artifacts: [
      {
        artifact_id: `file_diff:${turnId}`,
        kind: "file_diff",
        snapshot: {
          files: [
            {
              path: `src/${turnId}.js`,
              operation: "edit",
              unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            },
          ],
        },
      },
    ],
  });

  // A plan bucket is NOT covered by a run-level workspace_change_set, so it
  // survives the covered-turn-artifact dedup filter and still renders.
  const planBucket = (turnId, order) => ({
    order,
    status: "completed",
    artifacts: [
      {
        artifact_id: `plan:${turnId}`,
        kind: "plan",
        title: `Plan ${turnId}`,
        revision: 1,
        snapshot: {
          plan_id: turnId,
          status: "draft",
          revision: 1,
          title: `Plan ${turnId}`,
          markdown: `# Plan ${turnId}\n\n- Step one`,
          truncated: false,
          total_lines: 3,
          displayed_lines: 3,
        },
      },
    ],
  });

  test("folds file diff ArtifactSummary blocks across completed turn buckets", () => {
    renderWithConfig(
      <ChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-1": fileBucket("turn-1", 1),
            "run-1:turn-2": fileBucket("turn-2", 2),
          },
        }}
      />,
    );
    expect(screen.getAllByTestId("artifact-summary")).toHaveLength(1);
    expect(screen.getAllByTestId("files-changed-card")).toHaveLength(1);
    expect(screen.getByText("2 files")).toBeInTheDocument();
  });

  test("renders a run-level ArtifactSummary before turn buckets", () => {
    renderWithConfig(
      <ChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          runArtifactSummary: {
            order: 0,
            status: "completed",
            artifacts: [
              {
                artifact_id: "workspace_change_set:run-1",
                kind: "workspace_change_set",
                snapshot: {
                  files: [
                    {
                      path: "src/run.js",
                      operation: "edit",
                      unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
                    },
                  ],
                },
              },
            ],
          },
          artifactSummariesByTurnId: {
            "run-1:turn-1": planBucket("turn-1", 1),
          },
        }}
      />,
    );

    expect(screen.getByTestId("run-artifact-summary-section")).toBeInTheDocument();
    expect(screen.getAllByTestId("turn-artifact-summary-section")).toHaveLength(1);
    expect(screen.getAllByTestId("artifact-summary")).toHaveLength(2);
    expect(screen.getAllByTestId("files-changed-card")[0].textContent).toMatch(
      /Workspace changes/,
    );
  });

  test("renders nothing artifact-related when artifactSummariesByTurnId is empty", () => {
    renderWithConfig(
      <ChatBubble
        message={{ role: "assistant", status: "done", content: "done" }}
      />,
    );
    expect(screen.queryAllByTestId("artifact-summary")).toHaveLength(0);
  });

  test("orders ArtifactSummary blocks by bucket.order", () => {
    renderWithConfig(
      <ChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-2": fileBucket("turn-2", 2),
            "run-1:turn-1": fileBucket("turn-1", 1),
          },
        }}
      />,
    );
    const summaries = screen.getAllByTestId("files-changed-card");
    // The first rendered summary should correspond to turn-1 (order: 1).
    expect(summaries[0].textContent).toMatch(/Files changed/);
  });
});

describe("ChatBubble streaming live-text ownership", () => {
  // Regression (c417d9c): the no-tool placeholder TraceChain subscribes to the
  // same streaming store as the bubble body, so a live turn rendered the answer
  // twice (once as a trace "Response" node, once as the bubble body). The bubble
  // body is the sole owner of live text — the placeholder must only show
  // "Thinking…" before the first token and render nothing once text arrives.
  const seededStore = (text) => {
    const store = createStreamingMessageStore();
    store.begin({ chatId: "chat", messageId: "assistant-1" });
    if (text) {
      store.append({ chatId: "chat", messageId: "assistant-1", delta: text });
    }
    store.flushNow({ chatId: "chat", messageId: "assistant-1" });
    return store;
  };

  test("no-tool streaming renders live store text once, not as a trace Response node", () => {
    const store = seededStore("live streaming answer");

    const { container } = renderWithStore(
      <ChatBubble message={streamingAssistantMessage} traceFrames={[]} />,
      { store },
    );

    const occurrences = (
      (container.textContent || "").match(/live streaming answer/g) || []
    ).length;
    expect(occurrences).toBe(1);
    expect(screen.queryByText("Response")).not.toBeInTheDocument();
  });

  test("CharacterChatBubble no-tool streaming renders live store text once", () => {
    const store = seededStore("live streaming answer");

    const { container } = renderWithStore(
      <CharacterChatBubble
        message={streamingAssistantMessage}
        traceFrames={[]}
        characterName="Lena"
      />,
      { store },
    );

    const occurrences = (
      (container.textContent || "").match(/live streaming answer/g) || []
    ).length;
    expect(occurrences).toBe(1);
    expect(screen.queryByText("Response")).not.toBeInTheDocument();
  });

  test("no-tool streaming without live text still shows Thinking…", () => {
    const store = seededStore("");

    renderWithStore(
      <ChatBubble message={streamingAssistantMessage} traceFrames={[]} />,
      { store },
    );

    expect(screen.getAllByText("Thinking…").length).toBeGreaterThan(0);
  });
});

describe("ChatBubble done trace header", () => {
  // A finished no-tool message that carries a token bundle mounts a TraceChain
  // with empty frames (token-summary path). stepCount === 0 must NOT read as
  // "Processing" on an already-done message.
  const doneWithBundle = {
    id: "assistant-done",
    role: "assistant",
    content: "final answer",
    status: "done",
    meta: {
      bundle: { input_tokens: 4, output_tokens: 6, consumed_tokens: 10 },
    },
  };

  test("done no-tool message with token bundle does not show Processing", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble message={doneWithBundle} traceFrames={[]} />,
      );

      // token summary confirms the trace header rendered at all
      expect(
        await screen.findByText(/4 in\s+·\s+6 out\s+·\s+10 total/),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Processing/)).not.toBeInTheDocument();
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });
});
