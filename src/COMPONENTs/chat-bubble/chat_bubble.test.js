import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
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
