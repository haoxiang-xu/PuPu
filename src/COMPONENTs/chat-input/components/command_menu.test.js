import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CommandMenu from "./command_menu";

const makeItems = () => [
  { name: "/btw", description: "立即回答,不打断当前任务", insertText: "/btw " },
  { name: "/fyi", description: "补充给当前任务", insertText: "/fyi " },
  { name: "/queue", description: "排队，当前任务完成后执行", insertText: "/queue " },
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
    expect(screen.getByText("/queue")).toBeInTheDocument();
    expect(screen.getByText("排队，当前任务完成后执行")).toBeInTheDocument();
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

  test("uses a compact translucent blurred surface", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    const menu = screen.getByRole("listbox", { name: "斜杠命令" });
    const options = screen.getAllByRole("option");

    expect(menu.style.backgroundColor).toBe("rgba(255, 255, 255, 0.72)");
    expect(menu.style.backdropFilter).toBe("blur(18px) saturate(1.4)");
    expect(menu.style.maxHeight).toBe("192px");
    expect(menu.style.padding).toBe("3px");
    expect(options[0].style.height).toBe("32px");
    expect(options[0].style.padding).toBe("0px 8px");
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

  test("renders a trailing source tag when item.sourceLabel is set", () => {
    const items = [
      {
        name: "/plan",
        description: "app",
        insertText: "/plan ",
        sourceLabel: "Plankit",
      },
    ];
    render(
      <CommandMenu items={items} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    expect(screen.getByText("Plankit")).toBeInTheDocument();
  });

  test("renders no source tag node when item.sourceLabel is absent", () => {
    render(
      <CommandMenu items={makeItems()} activeIndex={0} onPick={() => {}} isDark={false} />,
    );

    // none of the builtin items (no icon, no sourceLabel) carry a third
    // trailing span — just the name span + description span per row
    const rows = screen.getAllByRole("option");
    rows.forEach((row) => {
      expect(row.children.length).toBe(2);
    });
  });
});
