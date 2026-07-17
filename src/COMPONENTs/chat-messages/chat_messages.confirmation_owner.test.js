import { render, screen } from "@testing-library/react";
import ChatMessages from "./chat_messages";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("../chat-bubble/chat_bubble", () => ({
  __esModule: true,
  default: ({
    message,
    pendingToolConfirmationRequests = {},
    toolConfirmationUiStateById = {},
  }) => {
    const React = require("react");
    return React.createElement("div", {
      "data-testid": `bubble-${message.id}`,
      "data-pending-confirmations": Object.keys(
        pendingToolConfirmationRequests,
      )
        .sort()
        .join(","),
      "data-ui-confirmations": Object.keys(toolConfirmationUiStateById)
        .sort()
        .join(","),
    });
  },
}));

jest.mock("../chat-bubble/character_chat_bubble", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("./components/message_minimap", () => ({
  __esModule: true,
  default: () => null,
}));

const renderChatMessages = ({ messages, request, uiState }) =>
  render(
    <ConfigContext.Provider
      value={{ onThemeMode: "light_mode", theme: { color: "#222" } }}
    >
      <ChatMessages
        chatId="chat-owner-test"
        messages={messages}
        pendingToolConfirmationRequests={{
          "confirmation-1": request,
        }}
        toolConfirmationUiStateById={{
          "confirmation-1": uiState,
        }}
        initialVisibleCount={10}
        bootVisibleCount={10}
        maxMountedCount={10}
      />
    </ConfigContext.Provider>,
  );

const expectConfirmationProps = (messageId, expectedIds) => {
  const bubble = screen.getByTestId(`bubble-${messageId}`);
  expect(bubble).toHaveAttribute(
    "data-pending-confirmations",
    expectedIds,
  );
  expect(bubble).toHaveAttribute("data-ui-confirmations", expectedIds);
};

describe("ChatMessages confirmation owner bubble", () => {
  beforeAll(() => {
    if (!HTMLElement.prototype.scrollTo) {
      HTMLElement.prototype.scrollTo = function scrollTo() {};
    }
  });

  test("routes a confirmation only to the assistant bubble containing its tool_call", () => {
    renderChatMessages({
      messages: [
        { id: "user-1", role: "user", content: "run it" },
        {
          id: "assistant-owner",
          role: "assistant",
          content: "",
          traceFrames: [
            {
              type: "tool_call",
              payload: {
                call_id: "call-1",
                confirmation_id: "confirmation-1",
              },
            },
          ],
        },
        {
          id: "assistant-other",
          role: "assistant",
          content: "later answer",
        },
      ],
      request: {
        confirmationId: "confirmation-1",
        callId: "call-1",
      },
      uiState: { status: "idle", resolved: false },
    });

    expectConfirmationProps("assistant-owner", "confirmation-1");
    expectConfirmationProps("assistant-other", "");
    expectConfirmationProps("user-1", "");
  });

  test("uses ownerMessageId to pin a recovered confirmation to one assistant bubble", () => {
    renderChatMessages({
      messages: [
        { id: "assistant-owner", role: "assistant", content: "waiting" },
        { id: "assistant-other", role: "assistant", content: "later answer" },
      ],
      request: {
        confirmationId: "confirmation-1",
        callId: "call-1",
        ownerMessageId: "assistant-owner",
      },
      uiState: { status: "idle", resolved: false },
    });

    expectConfirmationProps("assistant-owner", "confirmation-1");
    expectConfirmationProps("assistant-other", "");
  });
});
