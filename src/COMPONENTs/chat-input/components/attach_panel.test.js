import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    options = [],
    open = false,
    on_open_change = () => {},
    placeholder,
    search_placeholder,
    dropdown_position = "bottom",
  }) => {
    const renderOptionLabels = (items = []) =>
      items.flatMap((item) => {
        if (!item) return [];
        if (item.group) {
          return [
            <span key={`group-${item.group}`}>{item.group}</span>,
            ...renderOptionLabels(item.options),
          ];
        }
        return [
          <span key={`option-${item.value || item.label}`}>
            {item.label || item.value}
          </span>,
        ];
      });

    return (
      <button
        data-testid={`select-${search_placeholder || placeholder || "default"}`}
        data-open={open ? "true" : "false"}
        data-dropdown-position={dropdown_position}
        onClick={() => on_open_change(!open)}
      >
        {search_placeholder || placeholder || "select"}
        {renderOptionLabels(options)}
      </button>
    );
  },
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
    window.localStorage.clear();
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

  test("opens attach panel selector menus above the input controls", () => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "workspace_toolkit", label: "Workspace Files" }],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReturnValue({
      workspaceOptions: [{ value: "ws-1", label: "Project" }],
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        modelOptions={[{ value: "openai:gpt-5", label: "GPT-5" }]}
        selectedModelId="openai:gpt-5"
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByTestId("select-Search models...")).toHaveAttribute(
      "data-dropdown-position",
      "top",
    );
    expect(screen.getByTestId("select-Search toolkits...")).toHaveAttribute(
      "data-dropdown-position",
      "top",
    );
    expect(screen.getByTestId("select-Search workspaces...")).toHaveAttribute(
      "data-dropdown-position",
      "top",
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

  test("hides agent recipe options when the agents feature flag is disabled", () => {
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
        modelOptions={[{ value: "gpt-5.5", label: "GPT-5.5" }]}
        recipeOptions={[
          { value: "Default", label: "Default" },
          { value: "Research Agent", label: "Research Agent" },
        ]}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByText("GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Research Agent")).not.toBeInTheDocument();
  });

  test("resets active agent recipe state when the agents feature flag is disabled", async () => {
    const onSelectRecipe = jest.fn();
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
        modelOptions={[{ value: "gpt-5.5", label: "GPT-5.5" }]}
        recipeOptions={[
          { value: "Default", label: "Default" },
          { value: "Research Agent", label: "Research Agent" },
        ]}
        selectedRecipeName="Research Agent"
        onSelectRecipe={onSelectRecipe}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByText("GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.getByTestId("select-Search toolkits...")).toBeInTheDocument();
    await waitFor(() => {
      expect(onSelectRecipe).toHaveBeenCalledWith("Default");
    });
  });

  test("never shows agent recipe options in the model selector", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        feature_flags: {
          enable_user_access_to_agents: true,
        },
      }),
    );
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
        modelOptions={[{ value: "gpt-5.5", label: "GPT-5.5" }]}
        recipeOptions={[
          { value: "Default", label: "Default" },
          { value: "Research Agent", label: "Research Agent" },
        ]}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByText("GPT-5.5")).toBeInTheDocument();
    expect(screen.queryByText("Agents")).not.toBeInTheDocument();
    expect(screen.queryByText("Research Agent")).not.toBeInTheDocument();
  });
});
