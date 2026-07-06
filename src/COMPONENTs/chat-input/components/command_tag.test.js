import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandTag from "./command_tag";
import { splitCommandPrefix } from "../chat_input";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

describe("splitCommandPrefix", () => {
  test("splits a completed, available command prefix into tag + body", () => {
    const { command, body } = splitCommandPrefix("/btw how far along?", {
      isStreaming: true,
    });
    expect(command?.name).toBe("/btw");
    expect(body).toBe("how far along?");
  });

  test("no split while the command is still being typed (no space yet)", () => {
    const { command, body } = splitCommandPrefix("/btw", { isStreaming: true });
    expect(command).toBeNull();
    expect(body).toBe("/btw");
  });

  test("no split when the command is unavailable in this context", () => {
    // interject commands are streaming-only
    const { command, body } = splitCommandPrefix("/btw hello", {
      isStreaming: false,
    });
    expect(command).toBeNull();
    expect(body).toBe("/btw hello");
  });

  test("no split for unknown commands or plain text", () => {
    expect(
      splitCommandPrefix("/nope hello", { isStreaming: true }).command,
    ).toBeNull();
    expect(splitCommandPrefix("hello /btw", { isStreaming: true }).command)
      .toBeNull();
  });

  test("matches case-insensitively and reports the canonical name", () => {
    const { command, body } = splitCommandPrefix("/BTW hi", {
      isStreaming: true,
    });
    expect(command?.name).toBe("/btw");
    expect(body).toBe("hi");
  });
});

describe("CommandTag", () => {
  test("renders the command name and fires onRemove", () => {
    const onRemove = jest.fn();
    render(
      <CommandTag name="/btw" icon="chat" onRemove={onRemove} isDark={false} />,
    );

    expect(screen.getByText("/btw")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove /btw" }));
    expect(onRemove).toHaveBeenCalled();
  });
});
