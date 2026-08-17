import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import AttachPanel from "./attach_panel";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import { CONTEXT_COMPOSITION_EXTENSION_KEY } from "../../../SERVICEs/context_composition_v1";

const {
  buildRunBundleV1,
} = require("../../../../electron/tests/fixtures/run_bundle_v1_fixture.cjs");

const buildContextCompositionBundle = () => {
  const bundle = buildRunBundleV1();
  bundle.provider_calls[0].extensions[CONTEXT_COMPOSITION_EXTENSION_KEY] = {
    schema: "unchain.context/context_composition_v1",
    method: "utf8_heuristic_v1",
    quality: "reconciled_estimate",
    context_window_tokens: 2000,
    wire: {
      envelope_sha256: `sha256:${"a".repeat(64)}`,
      route_name: "primary",
      route_sha256: `sha256:${"b".repeat(64)}`,
      context_mode: "semantic",
    },
    categories: [
      {
        id: "instructions",
        tokens: 400,
        source_count: 1,
        subtypes: [{ id: "core_system", tokens: 400, source_count: 1 }],
      },
    ],
    attributed_tokens: 400,
    residual_tokens: 600,
    coverage: {
      status: "complete",
      manifest_items: 1,
      matched_items: 1,
      wire_surfaces: 1,
      matched_surfaces: 1,
    },
  };
  return bundle;
};

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
    custom_trigger,
    multi = false,
    value,
    set_value = () => {},
  }) => {
    const toggleOption = (item) => {
      if (!item || item.disabled) return;
      if (multi) {
        const current = Array.isArray(value) ? value : [];
        const next = current.includes(item.value)
          ? current.filter((v) => v !== item.value)
          : [...current, item.value];
        set_value(next);
      } else {
        set_value(item.value);
      }
    };
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
          <button
            type="button"
            key={`option-${item.value || item.label}`}
            data-testid={`option-${item.value || item.label}`}
            data-disabled={item.disabled ? "true" : "false"}
            onClick={(event) => {
              event.stopPropagation();
              toggleOption(item);
            }}
          >
            {item.label || item.value}
          </button>,
        ];
      });

    return (
      <div
        role="button"
        tabIndex={0}
        data-testid={`select-${search_placeholder || placeholder || "default"}`}
        data-open={open ? "true" : "false"}
        data-dropdown-position={dropdown_position}
        onClick={() => on_open_change(!open)}
      >
        {search_placeholder || placeholder || "select"}
        {renderOptionLabels(options)}
        {custom_trigger}
      </div>
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
  default: ({ onClick = () => {}, prefix_icon, style = {}, title }) => (
    <button
      data-testid={`button-${prefix_icon || "default"}`}
      data-icon-size={style.iconSize ?? ""}
      title={title}
      onClick={onClick}
    >
      mock-button
    </button>
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

    const toolsSelect = screen.getByTestId("select-Search plugins...");

    expect(toolsSelect.getAttribute("data-open")).toBe("false");

    fireEvent.click(toolsSelect);
    expect(refreshToolkits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("select-Search plugins...")).toHaveAttribute(
      "data-open",
      "true",
    );

    fireEvent.click(screen.getByTestId("select-Search plugins..."));
    expect(refreshToolkits).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("select-Search plugins...")).toHaveAttribute(
      "data-open",
      "false",
    );

    fireEvent.click(screen.getByTestId("select-Search plugins..."));
    expect(refreshToolkits).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("select-Search plugins...")).toHaveAttribute(
      "data-open",
      "true",
    );
  });

  test("shows current context pressure and opens the composition modal", async () => {
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
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
        contextCompositionBundle={buildContextCompositionBundle()}
      />,
    );

    const progress = screen.getByTestId("context-composition-progress");
    expect(progress).toHaveAttribute("data-context-pressure", "50");
    expect(progress).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(progress);
    // Tooltip keeps the bubble visibility:hidden until it can measure itself,
    // and jsdom reports every rect as 0 — so it never flips to visible here and
    // role queries (which walk the a11y tree) would miss it. Assert on the
    // mounted node instead; visible placement is a real-window concern.
    const popover = await screen.findByTestId("context-composition-popover");
    expect(within(popover).getByText("Context Usage")).toBeInTheDocument();
    expect(within(popover).getByText("Instructions")).toBeInTheDocument();
    // 400 attributed + 600 residual against a 2000 window: the residual is a
    // listed row, so what the reader sees adds up to the 50% headline.
    expect(within(popover).getByText("Unattributed")).toBeInTheDocument();
    expect(within(popover).getByText("50% Full")).toBeInTheDocument();
    expect(progress).toHaveAttribute("aria-expanded", "true");

    // It opens as an anchored menu, like the model dropdown beside it — so it
    // carries no close button of its own and toggles off the same trigger.
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();

    fireEvent.click(progress);
    await waitFor(() => {
      expect(
        screen.queryByTestId("context-composition-popover"),
      ).not.toBeInTheDocument();
    });
    expect(progress).toHaveAttribute("aria-expanded", "false");
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

    expect(screen.getByTestId("select-Search models…")).toHaveAttribute(
      "data-dropdown-position",
      "top",
    );
    expect(screen.getByTestId("select-Search plugins...")).toHaveAttribute(
      "data-dropdown-position",
      "top",
    );
    expect(screen.getByTestId("select-Search workspaces...")).toHaveAttribute(
      "data-dropdown-position",
      "top",
    );
  });

  test("renders the tool selector trigger with a larger icon", () => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "workspace_toolkit", label: "Workspace Files" }],
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
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByTestId("button-tool")).toHaveAttribute(
      "data-icon-size",
      "18",
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
    expect(screen.queryByTestId("select-Search plugins...")).not.toBeInTheDocument();
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
    expect(screen.getByTestId("select-Search plugins...")).toBeInTheDocument();
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

  test("renders the catalog-native Computer entry alongside other toolkits", () => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [
        { value: "workspace_toolkit", label: "Workspace Files" },
        { value: "builtin.computer", label: "Computer" },
      ],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
      computerAvailable: true,
      computerResolutionKnown: true,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedModelId="anthropic:claude-opus-4-8"
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByTestId("option-workspace_toolkit")).toBeInTheDocument();
    expect(screen.getByTestId("option-builtin.computer")).toBeInTheDocument();
  });

  test("omits Computer when the capability-filtered catalog yields none", () => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "workspace_toolkit", label: "Workspace Files" }],
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
        selectedModelId="openai:gpt-5"
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.getByTestId("option-workspace_toolkit")).toBeInTheDocument();
    expect(
      screen.queryByTestId("option-builtin.computer"),
    ).not.toBeInTheDocument();
  });

  test("selecting the Computer entry adds builtin.computer to the payload", () => {
    const onToolkitsChange = jest.fn();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "builtin.computer", label: "Computer" }],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
      computerAvailable: true,
      computerResolutionKnown: true,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedModelId="anthropic:claude-opus-4-8"
        selectedToolkits={[]}
        onToolkitsChange={onToolkitsChange}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("option-builtin.computer"));

    expect(onToolkitsChange).toHaveBeenCalledWith(["builtin.computer"]);
  });

  test("an unsupported Computer entry is absent and cannot be selected", () => {
    const onToolkitsChange = jest.fn();
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
        selectedModelId="openai:gpt-5"
        selectedToolkits={[]}
        onToolkitsChange={onToolkitsChange}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    expect(screen.queryByTestId("option-builtin.computer")).not.toBeInTheDocument();
    expect(onToolkitsChange).not.toHaveBeenCalled();
  });

  test("uses one catalog refresh for toolkits and capability status", () => {
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

    fireEvent.click(screen.getByTestId("select-Search plugins..."));
    expect(refreshToolkits).toHaveBeenCalledTimes(1);
  });

  test("strips a residual builtin.computer when the model becomes unsupported", async () => {
    const onToolkitsChange = jest.fn();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
      computerAvailable: false,
      computerResolutionKnown: true,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedModelId="openai:gpt-5"
        selectedToolkits={["builtin.computer"]}
        onToolkitsChange={onToolkitsChange}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    await waitFor(() => expect(onToolkitsChange).toHaveBeenCalledWith([]));
  });

  test("strips a residual builtin.computer when the master switch is off", async () => {
    const onToolkitsChange = jest.fn();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
      computerAvailable: false,
      computerResolutionKnown: true,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedModelId="anthropic:claude-opus-4-8"
        selectedToolkits={["workspace_toolkit", "builtin.computer"]}
        onToolkitsChange={onToolkitsChange}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    await waitFor(() =>
      expect(onToolkitsChange).toHaveBeenCalledWith(["workspace_toolkit"]),
    );
  });

  test("keeps builtin.computer selected and re-selectable on a supported model", () => {
    const onToolkitsChange = jest.fn();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "builtin.computer", label: "Computer" }],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
      computerAvailable: true,
      computerResolutionKnown: true,
    });

    render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        isDark={false}
        attachments={[]}
        selectedModelId="anthropic:claude-opus-4-8"
        selectedToolkits={["builtin.computer"]}
        onToolkitsChange={onToolkitsChange}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
      />,
    );

    // selection is NOT stripped
    expect(onToolkitsChange).not.toHaveBeenCalled();
    // and the entry is present + enabled (re-selectable)
    const entry = screen.getByTestId("option-builtin.computer");
    expect(entry).toHaveAttribute("data-disabled", "false");
  });
});

describe("attach panel semantic surface binding", () => {
  test("frosted panel + pill backgrounds derive from semantic vars, not hardcoded rgba", () => {
    const src = require("fs").readFileSync(
      require("path").join(__dirname, "attach_panel.js"),
      "utf8",
    );
    // near-opaque frosted surface must bind to the surface tier
    expect(src).not.toMatch(/rgba\(28,28,28/);
    expect(src).not.toMatch(/rgba\(252,252,252/);
    expect(src).toMatch(/panelBg = isDark[\s\S]{0,140}var\(--pupu-surface-rgb\)/);
    // pill overlay follows the neutral-overlay policy (text tier + alpha)
    expect(src).toMatch(/selectBg = isDark[\s\S]{0,140}var\(--pupu-text-rgb\)/);
    // floating pill hairline border binds the mid border-strength tier (input-family)
    expect(src).toMatch(/border: floating[\s\S]{0,80}var\(--pupu-border-mid\)/);
  });
});
