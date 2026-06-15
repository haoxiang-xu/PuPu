import { render } from "@testing-library/react";
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

  it("does not render the minimap track while streaming", () => {
    const { container } = renderCM({ isStreaming: true });
    expect(container.querySelector("[data-mm-track]")).toBeNull();
  });
});
