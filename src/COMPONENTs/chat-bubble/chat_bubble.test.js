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

  test("renders an ArtifactSummary block per completed turn bucket", () => {
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
    expect(screen.getAllByTestId("artifact-summary")).toHaveLength(2);
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
