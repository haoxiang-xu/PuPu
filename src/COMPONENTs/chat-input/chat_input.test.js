import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { LocaleContext } from "../../CONTAINERs/config/context";
import ChatInput from "./chat_input";
import { registerCommand, unregisterBySource } from "../../SERVICEs/command_registry";

// Renders ChatInput as a controlled component so keyboard interaction can
// actually mutate `value`, the way the real chat page wires onChange.
const ControlledChatInput = ({
  isStreaming = false,
  onSend = () => {},
  initialValue = "",
  selectedToolkits = [],
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
        selectedToolkits={selectedToolkits}
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
    expect(screen.getByText("/queue")).toBeInTheDocument();
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
    expect(screen.queryByText("/queue")).not.toBeInTheDocument();
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
    // the command text stays in the value, dyed inline by the mirror overlay
    expect(container.querySelector("textarea")).toHaveValue("/btw ");
    const token = container.querySelector('[data-command-token="/btw"]');
    expect(token).toBeTruthy();
    expect(token.getAttribute("data-active")).toBe("true");
    // menu closed after picking
    expect(screen.queryByText("Add info to the current task")).not.toBeInTheDocument();
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
    expect(container.querySelector("textarea")).toHaveValue("/fyi ");
    expect(
      container.querySelector('[data-command-token="/fyi"]'),
    ).toBeTruthy();
  });

  test("Tab also picks the active command", () => {
    const { container } = render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    fireEvent.change(textarea, { target: { value: "/" } });
    fireEvent.keyDown(textarea, { key: "Tab" });

    expect(container.querySelector("textarea")).toHaveValue("/btw ");
    expect(
      container.querySelector('[data-command-token="/btw"]'),
    ).toBeTruthy();
  });

  test("Backspace right after the token deletes it atomically", () => {
    const { container } = render(
      <ControlledChatInput isStreaming initialValue="/btw hello there" />,
    );
    const textarea = container.querySelector("textarea");
    expect(
      container.querySelector('[data-command-token="/btw"]'),
    ).toBeTruthy();

    // caret right after "/btw" (before the space) → atomic delete
    textarea.setSelectionRange(4, 4);
    fireEvent.keyDown(textarea, { key: "Backspace" });

    expect(container.querySelector('[data-command-token="/btw"]')).toBeNull();
    expect(container.querySelector("textarea")).toHaveValue(" hello there");
  });

  test("typing '/' mid-text opens the menu; picking moves the command to the front tag", () => {
    const { container } = render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    // user typed some text first, then a slash token at the end (caret at end)
    fireEvent.change(textarea, { target: { value: "check the budget /f" } });
    expect(screen.getByText("/fyi")).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Enter" });

    // the command lands IN PLACE where the token was typed
    expect(container.querySelector("textarea")).toHaveValue(
      "check the budget /fyi ",
    );
    const token = container.querySelector('[data-command-token="/fyi"]');
    expect(token).toBeTruthy();
    expect(token.getAttribute("data-active")).toBe("true");
  });

  test("mid-text token narrows the menu and requires a word boundary", () => {
    render(<ControlledChatInput isStreaming />);
    const textarea = getTextarea();

    // no word boundary before "/" → no menu
    fireEvent.change(textarea, { target: { value: "path/to" } });
    expect(screen.queryByText("/btw")).not.toBeInTheDocument();

    // boundary + token → narrowed menu
    fireEvent.change(textarea, { target: { value: "see /qu" } });
    expect(screen.getByText("/queue")).toBeInTheDocument();
    expect(screen.queryByText("/btw")).not.toBeInTheDocument();
  });

  test("conflicting commands are filtered from the menu once one is active", () => {
    const { container } = render(
      <ControlledChatInput isStreaming initialValue="/btw hello " />,
    );
    const textarea = container.querySelector("textarea");
    expect(
      container.querySelector('[data-command-token="/btw"]'),
    ).toBeTruthy();

    // typing another slash token: all three share "interject-channel", so
    // the menu offers nothing
    fireEvent.change(textarea, { target: { value: "/btw hello /qu" } });
    expect(screen.queryByText("/queue")).not.toBeInTheDocument();
  });

  test("a hand-typed conflicting token stays plain text (inactive)", () => {
    const { container } = render(
      <ControlledChatInput
        isStreaming
        initialValue="/btw hello /queue world"
      />,
    );
    const btw = container.querySelector('[data-command-token="/btw"]');
    const queueToken = container.querySelector('[data-command-token="/queue"]');
    expect(btw.getAttribute("data-active")).toBe("true");
    expect(queueToken.getAttribute("data-active")).toBe("false");
  });

  test("no tag when not streaming — the prefix stays plain text", () => {
    const { container } = render(
      <ControlledChatInput isStreaming={false} initialValue="/btw hello" />,
    );
    expect(container.querySelector('[data-command-token="/btw"]')).toBeNull();
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

  describe("plugin skill commands (always visible while installed)", () => {
    const PLUGIN_SOURCE = "plugin:plankit";

    beforeEach(() => {
      // Mirrors plugin_skill_sync's registration: phase-gated only — an
      // installed plugin's skills always show in the composer menu; using
      // one selects the plugin for that run alone (via sourceToolkitId).
      registerCommand({
        name: "/plan",
        description: "Plan the task",
        source: PLUGIN_SOURCE,
        sourceLabel: "Plankit",
        sourceToolkitId: "plankit",
        availability: (ctx) => ctx.phase === "composer",
      });
    });

    afterEach(() => {
      unregisterBySource(PLUGIN_SOURCE);
    });

    test("lists a plugin skill command when its toolkit is selected and not streaming", () => {
      render(
        <ControlledChatInput
          isStreaming={false}
          selectedToolkits={["plankit"]}
        />,
      );
      const textarea = getTextarea();

      fireEvent.change(textarea, { target: { value: "/" } });

      expect(screen.getByText("/plan")).toBeInTheDocument();
    });

    test("still lists the plugin skill command when its toolkit is NOT selected", () => {
      render(
        <ControlledChatInput isStreaming={false} selectedToolkits={[]} />,
      );
      const textarea = getTextarea();

      fireEvent.change(textarea, { target: { value: "/" } });

      expect(screen.getByText("/plan")).toBeInTheDocument();
    });

    test("hides the plugin skill command while streaming (composer phase only)", () => {
      render(
        <ControlledChatInput isStreaming={true} selectedToolkits={["plankit"]} />,
      );
      const textarea = getTextarea();

      fireEvent.change(textarea, { target: { value: "/" } });

      expect(screen.queryByText("/plan")).not.toBeInTheDocument();
    });
  });
});
