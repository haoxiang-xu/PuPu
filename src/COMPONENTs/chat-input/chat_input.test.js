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

  test("Enter picks the active command instead of sending; the command renders as an inline tag", () => {
    const onSend = jest.fn();
    const { container } = render(
      <ControlledChatInput isStreaming onSend={onSend} />,
    );
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    // the "/btw " prefix now renders as a chip; the textarea only holds the body
    expect(container.querySelector('[data-command-tag="/btw"]')).toBeTruthy();
    expect(container.querySelector("textarea")).toHaveValue("");
    // menu closed after picking
    expect(screen.queryByText("补充给当前任务")).not.toBeInTheDocument();
  });

  test("ArrowDown/ArrowUp move the active row, and Enter picks the highlighted one", () => {
    const onSend = jest.fn();
    const { container } = render(
      <ControlledChatInput isStreaming onSend={onSend} />,
    );
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "ArrowDown" }); // -> /fyi
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('[data-command-tag="/fyi"]')).toBeTruthy();
    expect(container.querySelector("textarea")).toHaveValue("");
  });

  test("Tab also picks the active command", () => {
    const { container } = render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(container.querySelector('[data-command-tag="/btw"]')).toBeTruthy();
    expect(container.querySelector("textarea")).toHaveValue("");
  });

  test("Backspace at the start removes the command tag and keeps the body", () => {
    const { container } = render(
      <ControlledChatInput isStreaming initialValue="/btw hello there" />,
    );
    const textarea = container.querySelector("textarea");
    expect(container.querySelector('[data-command-tag="/btw"]')).toBeTruthy();
    expect(textarea).toHaveValue("hello there");

    textarea.setSelectionRange(0, 0);
    fireEvent.keyDown(textarea, { key: "Backspace" });

    expect(container.querySelector('[data-command-tag="/btw"]')).toBeNull();
    expect(container.querySelector("textarea")).toHaveValue("hello there");
  });

  test("clicking the tag's × removes the command", () => {
    const { container } = render(
      <ControlledChatInput isStreaming initialValue="/steer wrap it up" />,
    );
    expect(container.querySelector('[data-command-tag="/steer"]')).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove /steer" }));

    expect(container.querySelector('[data-command-tag="/steer"]')).toBeNull();
    expect(container.querySelector("textarea")).toHaveValue("wrap it up");
  });

  test("no tag when not streaming — the prefix stays plain text", () => {
    const { container } = render(
      <ControlledChatInput isStreaming={false} initialValue="/btw hello" />,
    );
    expect(container.querySelector('[data-command-tag="/btw"]')).toBeNull();
    expect(container.querySelector("textarea")).toHaveValue("/btw hello");
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
