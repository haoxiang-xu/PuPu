import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandMenu from "./command_menu";

const makeItems = () => [
  { name: "/btw", description: "立即回答,不打断当前任务", insertText: "/btw " },
  { name: "/fyi", description: "补充给当前任务", insertText: "/fyi " },
  { name: "/steer", description: "本轮结束后执行", insertText: "/steer " },
];

describe("CommandMenu", () => {
  test("renders nothing when items is empty", () => {
    const { container } = render(
      <CommandMenu items={[]} activeIndex={0} onPick={() => {}} isDark={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("renders each item's name and description", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    expect(screen.getByText("/btw")).toBeInTheDocument();
    expect(screen.getByText("立即回答,不打断当前任务")).toBeInTheDocument();
    expect(screen.getByText("/fyi")).toBeInTheDocument();
    expect(screen.getByText("补充给当前任务")).toBeInTheDocument();
    expect(screen.getByText("/steer")).toBeInTheDocument();
    expect(screen.getByText("本轮结束后执行")).toBeInTheDocument();
  });

  test("highlights the row at activeIndex", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={1} onPick={() => {}} isDark={false} />,
    );

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  test("onPick fires with the picked item when a row is clicked", () => {
    const onPick = jest.fn();
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={onPick} isDark={false} />,
    );

    fireEvent.mouseDown(screen.getByText("/fyi"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(makeItems()[1]);
  });
});
