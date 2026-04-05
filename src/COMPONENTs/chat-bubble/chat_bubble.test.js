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
  test("shows continuation controls for plain assistant streams without trace activity", () => {
    const onContinuationDecision = jest.fn();

    renderWithConfig(
      <ChatBubble
        message={streamingAssistantMessage}
        traceFrames={[]}
        pendingContinuationRequest={pendingContinuationRequest}
        onContinuationDecision={onContinuationDecision}
      />,
    );

    expect(
      screen.getByText("Agent reached 4 iterations without a final response."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onContinuationDecision).toHaveBeenCalledWith({
      confirmationId: "continue-1",
      approved: true,
    });
  });

  test("shows continuation controls for character assistant streams without trace activity", () => {
    const onContinuationDecision = jest.fn();

    renderWithConfig(
      <CharacterChatBubble
        message={streamingAssistantMessage}
        traceFrames={[]}
        pendingContinuationRequest={pendingContinuationRequest}
        onContinuationDecision={onContinuationDecision}
        characterName="Lena"
      />,
    );

    expect(
      screen.getByText("Agent reached 4 iterations without a final response."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    expect(onContinuationDecision).toHaveBeenCalledWith({
      confirmationId: "continue-1",
      approved: false,
    });
  });

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

    fireEvent.click(screen.getByRole("button", { name: "Allow" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
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
    });
  });
});
