import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AttachPanel from "./attach_panel";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";

jest.mock("../hooks/use_chat_input_toolkits", () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock("../hooks/use_chat_input_workspaces", () => ({
  __esModule: true,
  default: jest.fn(() => ({ workspaceOptions: [] })),
}));

jest.mock("../../../BUILTIN_COMPONENTs/select/select", () => ({
  __esModule: true,
  Select: ({
    open = false,
    on_open_change = () => {},
    placeholder,
    search_placeholder,
  }) => (
    <button
      data-testid={`select-${search_placeholder || placeholder || "default"}`}
      data-open={open ? "true" : "false"}
      onClick={() => on_open_change(!open)}
    >
      {search_placeholder || placeholder || "select"}
    </button>
  ),
}));

jest.mock("./attachment_chip_list", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../../workspace/workspace_modal", () => ({
  __esModule: true,
  WorkspaceModal: () => null,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ onClick = () => {} }) => (
    <button onClick={onClick}>mock-button</button>
  ),
}));

describe("AttachPanel toolkit selector refresh", () => {
  beforeEach(() => {
    useChatInputToolkits.mockReset();
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });

  test("requests toolkits every time the tools selector is opened", () => {
    const refreshToolkits = jest.fn();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    const toolsSelect = screen.getByTestId("select-Search toolkits...");

    expect(toolsSelect.getAttribute("data-open")).toBe("false");

    fireEvent.click(toolsSelect);
    expect(refreshToolkits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("select-Search toolkits...")).toHaveAttribute(
      "data-open",
      "true",
    );

    fireEvent.click(screen.getByTestId("select-Search toolkits..."));
    expect(refreshToolkits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("select-Search toolkits...")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("select-Search toolkits..."));
    expect(refreshToolkits).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("select-Search toolkits...")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  test("can hide model, tool, and workspace selectors for character chats", () => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        showModelSelector={false}
        showToolSelector={false}
        showWorkspaceSelector={false}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.queryByTestId("select-Select model...")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-Search toolkits...")).not.toBeInTheDocument();
    expect(screen.queryByTestId("select-Search workspaces...")).not.toBeInTheDocument();
  });
});
