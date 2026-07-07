import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import InputActionButtons from "./input_action_buttons";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => {
  const React = require("react");
  return function MockIcon({ src, style }) {
    return React.createElement("span", {
      "data-icon": src,
      "data-testid": `icon-${src}`,
      style,
    });
  };
});

describe("InputActionButtons", () => {
  test("streaming stop button has no default background when text also shows send", () => {
    render(
      <InputActionButtons
        value="queued steer"
        color="#eeeeee"
        isDark
        isStreaming
        sendDisabled={false}
        onClear={() => {}}
        onSend={() => {}}
        onStop={() => {}}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    const closeButton = buttons[0];
    const stopButton = buttons[1];
    const sendButton = buttons[2];

    expect(closeButton).toContainElement(
      screen.getByTestId("icon-close"),
    );
    expect(stopButton).toContainElement(
      screen.getByTestId("icon-stop_mini_filled"),
    );
    expect(sendButton).toContainElement(
      screen.getByTestId("icon-arrow_up"),
    );

    expect(stopButton).toHaveStyle({ background: "transparent" });
    expect(stopButton.querySelector("[aria-hidden='true']")).toHaveStyle({
      opacity: "0",
    });

    fireEvent.mouseEnter(stopButton);
    expect(stopButton.querySelector("[aria-hidden='true']")).toHaveStyle({
      opacity: "1",
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    });
  });
});
