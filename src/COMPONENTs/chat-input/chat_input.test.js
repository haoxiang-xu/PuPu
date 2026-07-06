import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleContext } from "../../CONTAINERs/config/context";
import ChatInput from "./chat_input";

// Renders ChatInput as a controlled component so keyboard interaction can
// actually mutate `value`, the way the real chat page wires onChange.
const ControlledChatInput = ({
  isStreaming = false,
  onSend = () => {},
  initialValue = "",
}) => {
  const [value, setValue] = useState(initialValue);
  return (
    <LocaleContext.Provider value={{ locale: "en", setLocale: () => {} }}>
      <ChatInput
        value={value}
        onChange={setValue}
        onSend={onSend}
        onStop={() => {}}
        isStreaming={isStreaming}
        showAttachments={false}
      />
    </LocaleContext.Provider>
  );
};

const getTextarea = () => screen.getByPlaceholderText(/./i);

describe("ChatInput slash-command menu wiring", () => {
  test("typing '/' while streaming opens the command menu with matching commands", () => {
    render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });

    expect(screen.getByText("/btw")).toBeInTheDocument();
    expect(screen.getByText("/fyi")).toBeInTheDocument();
    expect(screen.getByText("/steer")).toBeInTheDocument();
  });

  test("does not open the command menu when not streaming (no available commands)", () => {
    render(<ControlledChatInput isStreaming={false} />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });

    expect(screen.queryByText("/btw")).not.toBeInTheDocument();
  });

  test("narrows items by prefix as the user keeps typing", () => {
    render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/b" } });

    expect(screen.getByText("/btw")).toBeInTheDocument();
    expect(screen.queryByText("/fyi")).not.toBeInTheDocument();
    expect(screen.queryByText("/steer")).not.toBeInTheDocument();
  });

  test("Enter picks the active command instead of sending, when the menu is open", () => {
    const onSend = jest.fn();
    render(<ControlledChatInput isStreaming onSend={onSend} />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("/btw ");
    // menu closes after picking (trailing space breaks the slash-prefix match)
    expect(screen.queryByText("/fyi")).not.toBeInTheDocument();
  });

  test("ArrowDown/ArrowUp move the active row, and Enter picks the highlighted one", () => {
    const onSend = jest.fn();
    render(<ControlledChatInput isStreaming onSend={onSend} />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "ArrowDown" }); // -> /fyi
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("/fyi ");
  });

  test("Tab also picks the active command", () => {
    render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(textarea).toHaveValue("/btw ");
  });

  test("Escape closes the menu without changing the input, and a plain Enter then sends", () => {
    const onSend = jest.fn();
    render(<ControlledChatInput isStreaming onSend={onSend} />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(screen.queryByText("/btw")).not.toBeInTheDocument();
    expect(textarea).toHaveValue("/");

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  test("plain Enter still sends when the input does not look like a command", () => {
    const onSend = jest.fn();
    render(<ControlledChatInput isStreaming={false} onSend={onSend} />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
