import { fireEvent, render } from "@testing-library/react";
import ChatMessages from "./chat_messages";
import { ConfigContext } from "../../CONTAINERs/config/context";

beforeAll(() => {
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function scrollTo() {};
  }
});

const messages = [
  { id: "m0", role: "user", content: "hello" },
  { id: "m1", role: "assistant", content: "world" },
];

const renderCM = (props = {}) =>
  render(
    <ConfigContext.Provider
      value={{ onThemeMode: "light_mode", theme: { color: "#222" } }}
    >
      <ChatMessages chatId="c1" messages={messages} {...props} />
    </ConfigContext.Provider>,
  );

describe("ChatMessages minimap integration", () => {
  it("is a renderable component (memo-wrapped)", () => {
    expect(ChatMessages).toBeDefined();
    expect(["function", "object"]).toContain(typeof ChatMessages);
  });

  it("uses chat-scroll-host (minimap takeover), not the global scrollable class", () => {
    const { container } = renderCM();
    expect(container.querySelector(".chat-scroll-host")).not.toBeNull();
    expect(container.querySelector(".scrollable")).toBeNull();
  });

  it("renders the minimap track when there are messages", () => {
    const { container } = renderCM();
    expect(container.querySelector("[data-mm-track]")).not.toBeNull();
  });

  it("adds the bottom viewport inset to the scroll host padding", () => {
    const { container } = renderCM({ bottomViewportInset: 32 });
    const scrollHost = container.querySelector(".chat-scroll-host");
    expect(scrollHost.style.paddingTop).toBe("28px");
    expect(scrollHost.style.paddingBottom).toBe("96px");
  });

  it("keeps the minimap track mounted while streaming (lite mode)", () => {
    const { container } = renderCM({ isStreaming: true });
    expect(container.querySelector("[data-mm-track]")).not.toBeNull();
  });

  it("bubbles pointer interaction from message content into landing cancellation", () => {
    const hookModule = require("./hooks/use_message_window_scroll");
    const handlePointerInteraction = jest.fn();
    const hookSpy = jest
      .spyOn(hookModule, "useMessageWindowScroll")
      .mockReturnValue({
        messagesRef: { current: null },
        bottomSentinelRef: { current: null },
        messageNodeRefs: { current: new Map() },
        safeVisibleStart: 0,
        safeVisibleEnd: messages.length,
        visibleMessages: messages,
        isAtBottom: true,
        isAtTop: true,
        handleScroll: jest.fn(),
        handlePointerInteraction,
        handleUserScrollIntent: jest.fn(),
        handleWheel: jest.fn(),
        notifyStreamingContentCommitted: jest.fn(),
        handleBackToBottom: jest.fn(),
        handleSkipToTop: jest.fn(),
        handleJumpToPreviousMessage: jest.fn(),
        scrollToMessageIndex: jest.fn(),
      });

    try {
      const { container } = renderCM();
      fireEvent.pointerDown(container.querySelector('[data-message-id="m0"]'));
      expect(handlePointerInteraction).toHaveBeenCalledTimes(1);
    } finally {
      hookSpy.mockRestore();
    }
  });
});
