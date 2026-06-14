import React from "react";
import { render, screen } from "@testing-library/react";
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

const messageWithTokenSummary = {
  id: "assistant-token-summary",
  role: "assistant",
  content: "Final answer",
  status: "done",
  meta: {
    bundle: {
      input_tokens: 4,
      output_tokens: 6,
      consumed_tokens: 10,
    },
  },
};

describe("assistant token summary", () => {
  test("ChatBubble renders token totals even without tool trace activity", async () => {
    const originalIdle = window.requestIdleCallback;
    const originalCancelIdle = window.cancelIdleCallback;
    window.requestIdleCallback = (callback) => {
      callback();
      return 1;
    };
    window.cancelIdleCallback = jest.fn();

    try {
      renderWithConfig(
        <ChatBubble message={messageWithTokenSummary} traceFrames={[]} />,
      );

      expect(
        await screen.findByText(/4 in\s+·\s+6 out\s+·\s+10 total/),
      ).toBeInTheDocument();
    } finally {
      window.requestIdleCallback = originalIdle;
      window.cancelIdleCallback = originalCancelIdle;
    }
  });

  test("CharacterChatBubble renders token totals even without tool trace activity", () => {
    renderWithConfig(
      <CharacterChatBubble
        message={messageWithTokenSummary}
        traceFrames={[]}
        characterName="Lena"
      />,
    );

    expect(
      screen.getByText(/4 in\s+·\s+6 out\s+·\s+10 total/),
    ).toBeInTheDocument();
  });
});
