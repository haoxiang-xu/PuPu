import { fireEvent, render, screen } from "@testing-library/react";
import ChatMessages from "./chat_messages";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("./components/message_jump_controls", () => () => null);

beforeAll(() => {
  if (!HTMLElement.prototype.scrollTo) {
    HTMLElement.prototype.scrollTo = function scrollTo() {};
  }
});

const renderChatMessages = (props = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        onThemeMode: "light_mode",
        theme: {
          color: "#222222",
          font: { fontFamily: "Arial, sans-serif" },
        },
      }}
    >
      <ChatMessages chatId="chat-plan-docs" messages={[]} {...props} />
    </ConfigContext.Provider>,
  );

test("renders plan docs as compact chips and opens a read-only panel", () => {
  renderChatMessages({
    messages: [
      {
        id: "user-1",
        role: "user",
        content: "Create a plan",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "",
      },
    ],
    planDocs: [
      {
        plan_id: "plan_1",
        title: "Standalone plan",
        status: "draft",
        revision: 3,
        markdown: "# Standalone plan\n\n- Step one",
      },
    ],
  });

  const chip = screen.getByTitle("Standalone plan");
  expect(chip.closest("[data-message-id]")).toHaveAttribute(
    "data-message-id",
    "assistant-1",
  );

  fireEvent.click(chip);

  expect(
    screen.getByRole("dialog", { name: "Standalone plan" }),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Standalone plan").length).toBeGreaterThan(0);
  expect(screen.getByText("Step one")).toBeInTheDocument();
});
