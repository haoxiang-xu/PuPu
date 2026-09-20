import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import AttachPanel from "./attach_panel";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import {
  CONTEXT_COMPOSITION_EXTENSION_KEY,
  hasContextCompositionEvidence,
} from "../../../SERVICEs/context_composition_v1";
import {
  buildContextUsageView,
  selectContextUsage,
} from "../../../SERVICEs/context_usage_v1";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
import {
  MOVABLE_ATTACH_WIDGETS,
  readAttachPanelLayout,
  writeAttachPanelLayout,
} from "../../../SERVICEs/attach_panel_layout";
import { resetSettingsRepositoryForTests } from "../../../SERVICEs/settings_repository";
import { Z } from "../../../BUILTIN_COMPONENTs/layer/z_layers";

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

/* Keyed by selector: AttachPanel renders several Selects and only the model
   one carries a keep-open predicate — a single shared slot would be
   overwritten with undefined by whichever Select renders last. */
const mockKeepOpenBySelector = {};

const mockSelectStyleBySelector = {};

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
    palette_actions = null,
    palette_footer = null,
    keep_open_on_select,
    style = {},
  }) => {
    mockSelectStyleBySelector[search_placeholder || placeholder || "default"] =
      style;
    /* Surfaced so a test can assert the predicate AttachPanel hands down,
       rather than re-implementing close-on-select inside this mock — the
       real semantics belong to use_select and are tested there. */
    mockKeepOpenBySelector[search_placeholder || placeholder || "default"] =
      keep_open_on_select;
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
        {palette_actions ? (
          <div data-testid="palette-actions">{palette_actions}</div>
        ) : null}
        {palette_footer ? (
          <div data-testid="palette-footer">{palette_footer}</div>
        ) : null}
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
  // Forwards ref, dom_props and children like the real Button: controls that
  // drive a popup put their testid, aria-expanded and focus target on the
  // button itself, and a mock that drops them hides real wiring.
  default: require("react").forwardRef(
    (
      {
        onClick = () => {},
        prefix_icon,
        style = {},
        title,
        ariaLabel,
        children,
        dom_props = {},
      },
      ref,
    ) => (
      <button
        {...dom_props}
        ref={ref}
        data-testid={dom_props["data-testid"] || `button-${prefix_icon || "default"}`}
        data-icon-size={style.iconSize ?? ""}
        data-height={style.height ?? ""}
        data-hover-bg={style.hoverBackgroundColor ?? ""}
        data-active-bg={style.activeBackgroundColor ?? ""}
        title={title}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children || "mock-button"}
      </button>
    ),
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

  test("shows pressure from provider usage alone, with no composition evidence", async () => {
    // Composition needs an instrumented contribution source; provider usage
    // lands on every call. The indicator has to appear on the latter, otherwise
    // it stays invisible in every ordinary chat.
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });

    const plainBundle = buildRunBundleV1();
    plainBundle.provider_calls.forEach((call) => {
      call.usage.input.total_tokens = 1000;
    });
    expect(hasContextCompositionEvidence(plainBundle)).toBe(false);
    const usageView = buildContextUsageView(
      selectContextUsage(plainBundle),
      4000,
    );

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
        contextCompositionBundle={null}
        contextUsageView={usageView}
      />,
    );

    const progress = screen.getByTestId("context-composition-progress");
    expect(progress).toHaveAttribute("data-context-pressure", "25");

    fireEvent.click(progress);
    const popover = await screen.findByTestId("context-composition-popover");
    expect(within(popover).getByTestId("context-usage-only")).toBeInTheDocument();
    expect(within(popover).getByText("25% Full")).toBeInTheDocument();
    // It says the breakdown is missing rather than showing eight empty rows.
    expect(within(popover).getByTestId("context-usage-note")).toHaveTextContent(
      "Category breakdown unavailable",
    );
    expect(
      within(popover).queryByTestId("context-composition-groups"),
    ).not.toBeInTheDocument();
  });

  test("renders no indicator when there is neither usage nor composition", () => {
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
        contextCompositionBundle={null}
        contextUsageView={null}
      />,
    );

    expect(
      screen.queryByTestId("context-composition-progress"),
    ).not.toBeInTheDocument();
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
    // Both scopes are available and share this bundle's single call, so the
    // inactive (Summary) pane would carry the same category labels — scope
    // through the (active-pane-only) groups testid rather than getByText.
    const groups = within(popover).getByTestId("context-composition-groups");
    expect(groups).toHaveTextContent("Instructions");
    // 400 attributed + 600 residual against a 2000 window: the residual is a
    // listed row, so what the reader sees adds up to the 50% headline.
    expect(groups).toHaveTextContent("Unattributed");
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

  test("opening the context usage ring closes the model selector, and vice versa", async () => {
    /* Regression: the ring used to own its open state entirely on its own —
       an island the model/tools/workspace selectors' shared `openSelector`
       state never knew about. Opening the model selector and then clicking
       the ring left BOTH open at once, since neither told the other to close. */
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
        modelOptions={[{ value: "openai:gpt-5", label: "GPT-5" }]}
        selectedModelId="openai:gpt-5"
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
        contextCompositionBundle={buildContextCompositionBundle()}
      />,
    );

    const modelSelect = screen.getByTestId("select-Search models…");
    const progress = screen.getByTestId("context-composition-progress");

    fireEvent.click(modelSelect);
    expect(modelSelect).toHaveAttribute("data-open", "true");

    fireEvent.click(progress);
    await screen.findByTestId("context-composition-popover");
    expect(modelSelect).toHaveAttribute("data-open", "false");
    expect(progress).toHaveAttribute("aria-expanded", "true");

    // And the reverse direction: opening the model selector while the ring's
    // popover is open must close the popover in turn.
    fireEvent.click(modelSelect);
    expect(modelSelect).toHaveAttribute("data-open", "true");
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
    writeFeatureFlags({ enable_user_access_to_agents: true });
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

describe("AttachPanel reasoning effort slider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatInputToolkits.mockReset();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });

  const baseProps = {
    color: "#222",
    active: false,
    focused: false,
    onAttachFile: () => {},
    isDark: false,
    attachments: [],
    selectedToolkits: [],
    onToolkitsChange: () => {},
    selectedWorkspaceIds: [],
    onWorkspaceIdsChange: () => {},
    modelOptions: [{ value: "openai:gpt-5", label: "gpt-5" }],
    selectedModelId: "openai:gpt-5",
    onSelectModel: () => {},
  };

  const renderPanel = (props = {}) =>
    render(<AttachPanel {...baseProps} {...props} />);

  const modelSelect = () => screen.getByTestId("select-Search models…");
  const footer = () => within(modelSelect()).getByTestId("palette-footer");
  const row = () => within(footer()).getByTestId("effort-row");
  const slider = () => within(row()).getByRole("slider");
  const readout = () => within(row()).getByTestId("effort-readout");

  test("the track spans the declared levels and the well reads the chosen one, labelled short", () => {
    renderPanel({
      reasoningEffortOptions: ["none", "minimal", "low", "medium", "high", "xhigh", "max"],
      selectedReasoningEffort: "xhigh",
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort: () => {},
    });
    expect(slider().getAttribute("aria-valuemin")).toBe("0");
    expect(slider().getAttribute("aria-valuemax")).toBe("6");
    expect(slider().getAttribute("aria-valuenow")).toBe("5");
    expect(readout()).toHaveTextContent("x-high");
    expect(within(row()).getByTestId("slider-track")).toBeInTheDocument();
    expect(row().getAttribute("data-picked")).toBe("true");
  });

  test("the EFFORT label is optically centred in its well, not line-box centred", () => {
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high"],
      selectedReasoningEffort: "medium",
      defaultReasoningEffort: "low",
      onSelectReasoningEffort: () => {},
    });
    const label = within(footer()).getByText("effort");
    expect(label.tagName).toBe("SPAN");
    expect(label.style.display).toBe("block");
    expect(label.style.textBox).toBe("trim-both cap alphabetic");
  });

  test("an untouched model rests on its default with no accent and names it in the tooltip", () => {
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high", "xhigh"],
      selectedReasoningEffort: null,
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort: () => {},
    });
    expect(slider().getAttribute("aria-valuenow")).toBe("1");
    expect(readout()).toHaveTextContent("med");
    expect(row().getAttribute("data-picked")).toBe("false");
    expect(row().getAttribute("title")).toBe("Model default: medium");
    // no accent until a pick: the progress is transparent
    expect(within(row()).getByTestId("slider-progress").style.background).toMatch(/rgba\(0,\s*0,\s*0,\s*0\)/);
  });

  test("arrow keys step through the levels and commit at once; the end is not a new pick", () => {
    const onSelectReasoningEffort = jest.fn();
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high"],
      selectedReasoningEffort: "medium",
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort,
    });
    // the row is controlled: every key steps from the chosen level (medium)
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSelectReasoningEffort).toHaveBeenLastCalledWith("high");
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(onSelectReasoningEffort).toHaveBeenLastCalledWith("low");
    fireEvent.keyDown(slider(), { key: "End" });
    expect(onSelectReasoningEffort).toHaveBeenLastCalledWith("high");
    expect(onSelectReasoningEffort).toHaveBeenCalledTimes(3);
    expect(onSelectReasoningEffort).not.toHaveBeenCalledWith(null);
  });

  test("re-choosing the level already chosen commits nothing; never a null", () => {
    const onSelectReasoningEffort = jest.fn();
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high"],
      selectedReasoningEffort: "high",
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort,
    });
    fireEvent.keyDown(slider(), { key: "End" });
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSelectReasoningEffort).not.toHaveBeenCalled();
  });

  test("a drag follows the pointer locally and commits the level once on release", () => {
    const onSelectReasoningEffort = jest.fn();
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high", "xhigh", "max"],
      selectedReasoningEffort: "low",
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort,
    });
    jest
      .spyOn(slider(), "getBoundingClientRect")
      .mockReturnValue({ left: 0, width: 150, top: 0, height: 22, right: 150, bottom: 22 });
    // channel 16 → 8px cap inset, 134 usable; the fourth of five sits at 8 + 0.75 * 134
    if (window.PointerEvent) {
      fireEvent.pointerDown(slider(), { clientX: 108, pointerId: 1, buttons: 1 });
    } else {
      fireEvent.mouseDown(slider(), { clientX: 108 });
    }
    expect(readout()).toHaveTextContent("x-high");
    expect(onSelectReasoningEffort).not.toHaveBeenCalled();
    if (window.PointerEvent) {
      fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });
    } else {
      fireEvent.mouseUp(window);
    }
    expect(onSelectReasoningEffort).toHaveBeenCalledTimes(1);
    expect(onSelectReasoningEffort).toHaveBeenLastCalledWith("xhigh");
  });

  test("picking a model never closes the palette, effort or not", () => {
    renderPanel({
      reasoningEffortOptions: [],
      selectedReasoningEffort: null,
      onSelectReasoningEffort: () => {},
    });

    // A model with no effort row is no longer a special case: switching
    // models is something users do repeatedly to compare, so the palette
    // stays put and the trigger / an outside click remain the ways out.
    expect(mockKeepOpenBySelector["Search models…"]).toBe(true);
  });

  test("a model with no effort levels passes no footer at all", () => {
    renderPanel({
      reasoningEffortOptions: [],
      selectedReasoningEffort: null,
      onSelectReasoningEffort: () => {},
    });
    expect(within(modelSelect()).queryByTestId("palette-footer")).toBeNull();
  });
});

/* ======================================================================== */
/*  Hover convergence                                                       */
/*                                                                          */
/*  One gesture, one meaning. Before this the model pill stacked the global  */
/*  hover wash on its own fill and landed at ~0.145, the icon buttons landed */
/*  at 0.08 and the keyboard glow at 0.10 — so hovering an icon left it      */
/*  DIMMER than an untouched pill beside it. These lock the RESULT, not the  */
/*  constants: a control's wash is whatever gets it to the row's target from */
/*  wherever it starts.                                                      */
/* ======================================================================== */

describe("AttachPanel hover lands on one brightness", () => {
  /* These are written as rgba(var(--pupu-text-rgb),A) — one channel token, not
     three numbers — so the alpha is simply the last argument. */
  const alphaOf = (css) => {
    const m = /,\s*([0-9.]+)\s*\)\s*$/.exec(String(css || "").trim());
    return m ? parseFloat(m[1]) : null;
  };
  /* plain source-over: what the viewer actually sees when `wash` is painted
     over a control already carrying `fill` */
  const composite = (fill, wash) => 1 - (1 - fill) * (1 - wash);

  const renderPanel = (isDark) => {
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
    /* module-level and shared: a stale entry from the previous theme would
       otherwise be read as this one's */
    Object.keys(mockSelectStyleBySelector).forEach((k) => {
      delete mockSelectStyleBySelector[k];
    });
    // the ring only mounts when there is usage to show
    const bundle = buildRunBundleV1();
    bundle.provider_calls.forEach((call) => {
      call.usage.input.total_tokens = 1000;
    });
    return render(
      <AttachPanel
        color="#222"
        active={false}
        focused={false}
        onAttachFile={() => {}}
        onAttachScreenshot={() => {}}
        isDark={isDark}
        attachments={[]}
        selectedToolkits={[]}
        onToolkitsChange={() => {}}
        selectedWorkspaceIds={[]}
        onWorkspaceIdsChange={() => {}}
        showModelSelector
        modelOptions={[{ value: "openai:gpt-5", label: "GPT-5" }]}
        selectedModelId="openai:gpt-5"
        contextCompositionBundle={null}
        contextUsageView={buildContextUsageView(
          selectContextUsage(bundle),
          4000,
        )}
      />,
    );
  };

  const iconWashes = () =>
    screen
      .getAllByTestId(/^button-/)
      .map((n) => n.getAttribute("data-hover-bg"))
      .filter(Boolean);

  test.each([
    ["dark", true, 0.14],
    ["light", false, 0.1],
  ])("every bare control reaches the same wash (%s)", (_n, isDark, target) => {
    const { unmount } = renderPanel(isDark);
    const washes = iconWashes();

    expect(washes.length).toBeGreaterThan(1);
    expect(new Set(washes).size).toBe(1);
    expect(alphaOf(washes[0])).toBeCloseTo(target, 3);
    unmount();
  });

  test.each([
    ["dark", true, 0.07, 0.14],
    ["light", false, 0.05, 0.1],
  ])(
    "the filled model pill is solved against its own fill (%s)",
    (_n, isDark, fill, target) => {
      const { unmount } = renderPanel(isDark);
      const modelStyle = mockSelectStyleBySelector["Search models…"] || {};
      const wash = alphaOf(modelStyle.hoverBackgroundColor);

      expect(wash).not.toBeNull();
      // NOT the same number as a bare control's — the same RESULT
      expect(wash).toBeLessThan(target);
      expect(composite(fill, wash)).toBeCloseTo(target, 2);
      unmount();
    },
  );

  test("pressing lands above hovering, everywhere", () => {
    const { unmount } = renderPanel(true);
    const hover = alphaOf(iconWashes()[0]);
    const press = alphaOf(
      screen.getAllByTestId(/^button-/)[0].getAttribute("data-active-bg"),
    );

    expect(press).toBeGreaterThan(hover);
    unmount();
  });

  test("the context ring is not left on the global token", () => {
    /* Its own comment claims it cannot drift from its neighbours because it
       borrows Button for everything. The wash colour was the hole in that:
       the neighbours override theirs, so borrowing the default IS drifting. */
    const { unmount } = renderPanel(true);
    const ring = screen.getByTestId("context-composition-progress");

    expect(alphaOf(ring.getAttribute("data-hover-bg"))).toBeCloseTo(0.14, 3);
    unmount();
  });
});

describe("AttachPanel context window slider (#227)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatInputToolkits.mockReset();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });

  const PRESETS = [4096, 8192, 16384, 32768, 65536, 131072];

  const baseProps = {
    color: "#222",
    active: false,
    focused: false,
    onAttachFile: () => {},
    isDark: false,
    attachments: [],
    selectedToolkits: [],
    onToolkitsChange: () => {},
    selectedWorkspaceIds: [],
    onWorkspaceIdsChange: () => {},
    modelOptions: [{ value: "ollama:deepseek-r1:14b", label: "deepseek-r1:14b" }],
    selectedModelId: "ollama:deepseek-r1:14b",
    onSelectModel: () => {},
    contextWindowPresets: PRESETS,
    defaultContextWindow: 32768,
    maxContextWindow: null,
    selectedContextWindow: null,
    onSelectContextWindow: () => {},
  };

  const renderPanel = (props = {}) =>
    render(<AttachPanel {...baseProps} {...props} />);

  const modelSelect = () => screen.getByTestId("select-Search models…");
  const footer = () => within(modelSelect()).getByTestId("palette-footer");
  const row = () => within(footer()).getByTestId("context-window-row");
  /* The BUILTIN Slider is the track: role=slider, index space 0..N-1. */
  const slider = () => within(row()).getByRole("slider");
  /* jsdom has no layout: give the track a real width so a press at clientX
     lands on a notch the way it does on screen. The Slider guards against the
     duplicate mousedown that follows a pointerdown, so press with whichever
     event family this environment has. */
  const laidOut = (width = 150) => {
    jest
      .spyOn(slider(), "getBoundingClientRect")
      .mockReturnValue({ left: 0, width, top: 0, height: 22, right: width, bottom: 22 });
  };
  const press = (clientX) => {
    if (window.PointerEvent) {
      fireEvent.pointerDown(slider(), { clientX, pointerId: 1, buttons: 1 });
    } else {
      fireEvent.mouseDown(slider(), { clientX });
    }
  };

  test("renders only for a model that declares a default window", () => {
    const { rerender } = renderPanel({ defaultContextWindow: null });
    expect(within(modelSelect()).queryByTestId("context-window-row")).toBeNull();

    rerender(<AttachPanel {...baseProps} />);
    expect(row()).toBeInTheDocument();
    expect(within(row()).getByText("context")).toBeInTheDocument();
  });

  const readout = () => within(row()).getByTestId("context-window-readout");

  test("the track is the glass Slider over the presets and reads PuPu's default until a pick", () => {
    renderPanel();
    expect(slider().getAttribute("aria-valuemin")).toBe("0");
    expect(slider().getAttribute("aria-valuemax")).toBe("5");
    // 32768 is the fourth preset: the untouched track rests there
    expect(slider().getAttribute("aria-valuenow")).toBe("3");
    // glass material: the channel and the frosted thumb are the mini_ui ones
    expect(within(row()).getByTestId("slider-track")).toBeInTheDocument();
    expect(within(row()).getByTestId("slider-thumb").style.backdropFilter).toContain("blur");
    // glass carries no centre label, so the well at the end reads the value
    expect(readout()).toHaveTextContent("32k");
    expect(row().getAttribute("data-picked")).toBe("false");
    expect(row().getAttribute("title")).toBe("PuPu default: 32k");
  });

  test("a real pick moves the track and reads back the value", () => {
    renderPanel({ selectedContextWindow: 65536 });
    expect(slider().getAttribute("aria-valuenow")).toBe("4");
    expect(readout()).toHaveTextContent("64k");
    expect(row().getAttribute("data-picked")).toBe("true");
    expect(row().getAttribute("title")).toBeNull();
  });

  const release = () => {
    if (window.PointerEvent) {
      fireEvent.pointerUp(window, { pointerId: 1, buttons: 0 });
    } else {
      fireEvent.mouseUp(window);
    }
  };

  test("a drag follows the pointer locally and commits once on release", () => {
    const onSelectContextWindow = jest.fn();
    renderPanel({ selectedContextWindow: 32768, onSelectContextWindow });
    laidOut(150);

    // glass insets the travel by the cap radius (8px at channelHeight 16):
    // 150 - 16 = 134 usable, so the fifth of six notches sits at 8 + 0.8 * 134
    press(115);
    // the thumb and the well follow immediately, without a commit …
    expect(slider().getAttribute("aria-valuenow")).toBe("4");
    expect(readout()).toHaveTextContent("64k");
    expect(onSelectContextWindow).not.toHaveBeenCalled();
    // … the value is committed exactly once when the pointer is released
    release();
    expect(onSelectContextWindow).toHaveBeenCalledTimes(1);
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(65536);
  });

  test("releasing on the notch already chosen commits nothing; never a null", () => {
    const onSelectContextWindow = jest.fn();
    renderPanel({ selectedContextWindow: 32768, onSelectContextWindow });
    laidOut(150);

    press(88); // 60% of the usable travel → the fourth notch, already the value
    release();
    expect(onSelectContextWindow).not.toHaveBeenCalled();
    expect(onSelectContextWindow).not.toHaveBeenCalledWith(null);
  });

  test("arrow keys step through the presets", () => {
    const onSelectContextWindow = jest.fn();
    renderPanel({ selectedContextWindow: 32768, onSelectContextWindow });

    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(65536);
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(16384);
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(4096);
    fireEvent.keyDown(slider(), { key: "End" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(131072);
  });

  test("the track ends on the model's declared window as its own last notch", () => {
    const onSelectContextWindow = jest.fn();
    renderPanel({
      selectedContextWindow: 32768,
      maxContextWindow: 40960,
      onSelectContextWindow,
    });

    // 4k · 8k · 16k · 32k, then the model's own 40k; 64k and 128k are gone.
    expect(slider().getAttribute("aria-valuemax")).toBe("4");
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(40960);
    fireEvent.keyDown(slider(), { key: "End" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(40960);
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(16384);
  });

  test("a declared window just under a preset becomes that top notch, labelled the way the model is sold", () => {
    const onSelectContextWindow = jest.fn();
    // deepseek-r1:14b declares 128000: 2.4% under the 131072 preset
    renderPanel({
      selectedContextWindow: 65536,
      maxContextWindow: 128000,
      onSelectContextWindow,
    });
    expect(slider().getAttribute("aria-valuemax")).toBe("5");
    fireEvent.keyDown(slider(), { key: "End" });
    expect(onSelectContextWindow).toHaveBeenLastCalledWith(128000);
  });

  test("a declared window equal to a preset adds no extra notch", () => {
    renderPanel({ selectedContextWindow: 32768, maxContextWindow: 65536 });
    expect(slider().getAttribute("aria-valuemax")).toBe("4");
  });

  test("a remembered pick above the model's window rests on the model's own top notch", () => {
    renderPanel({ selectedContextWindow: 131072, maxContextWindow: 40960 });
    expect(slider().getAttribute("aria-valuenow")).toBe("4");
    expect(readout()).toHaveTextContent("40k");
  });

  test("a remembered pick that is the model's own window reads as picked", () => {
    renderPanel({ selectedContextWindow: 128000, maxContextWindow: 128000 });
    expect(slider().getAttribute("aria-valuenow")).toBe("5");
    expect(readout()).toHaveTextContent("128k");
    expect(row().getAttribute("data-picked")).toBe("true");
  });

  test("stacks under the effort row inside one footer with a single rule", () => {
    renderPanel({
      reasoningEffortOptions: ["low", "medium", "high"],
      selectedReasoningEffort: null,
      defaultReasoningEffort: "medium",
      onSelectReasoningEffort: () => {},
    });
    expect(within(footer()).getByText("effort")).toBeInTheDocument();
    expect(within(footer()).getByText("context")).toBeInTheDocument();
    const rows = footer().querySelectorAll('[data-testid="context-window-row"], [data-testid="effort-row"]');
    expect(rows).toHaveLength(2);
  });
});

describe("AttachPanel footer rows stack as one family", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatInputToolkits.mockReset();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });

  test("the label wells and the value wells share one floor width, so the two tracks line up", () => {
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
        modelOptions={[{ value: "ollama:gpt-oss:20b", label: "gpt-oss:20b" }]}
        selectedModelId="ollama:gpt-oss:20b"
        onSelectModel={() => {}}
        reasoningEffortOptions={["low", "medium", "high"]}
        selectedReasoningEffort={null}
        defaultReasoningEffort="medium"
        onSelectReasoningEffort={() => {}}
        contextWindowPresets={[4096, 8192, 16384, 32768, 65536, 131072]}
        defaultContextWindow={32768}
        maxContextWindow={null}
        selectedContextWindow={131072}
        onSelectContextWindow={() => {}}
      />,
    );
    const footer = within(screen.getByTestId("select-Search models…")).getByTestId("palette-footer");
    const effort = within(footer).getByTestId("effort-row");
    const context = within(footer).getByTestId("context-window-row");
    const labelWell = (row) => row.firstElementChild;
    expect(labelWell(effort).style.minWidth).toBe(labelWell(context).style.minWidth);
    expect(labelWell(effort).style.minWidth).not.toBe("");
    const effortValue = within(effort).getByTestId("effort-readout");
    const contextValue = within(context).getByTestId("context-window-readout");
    expect(effortValue.style.minWidth).toBe(contextValue.style.minWidth);
    expect(effortValue).toHaveTextContent("med");
    expect(contextValue).toHaveTextContent("128k");
  });
});

describe("AttachPanel widget layout and the ⋯ overflow menu (#217)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    useChatInputToolkits.mockReset();
    useChatInputToolkits.mockReturnValue({
      toolkitOptions: [{ value: "core", label: "Core" }],
      toolkitLoading: false,
      refreshToolkits: jest.fn(),
    });
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });

  const baseProps = () => ({
    color: "#222",
    active: false,
    focused: false,
    isDark: false,
    attachments: [],
    selectedToolkits: [],
    onToolkitsChange: () => {},
    selectedWorkspaceIds: [],
    onWorkspaceIdsChange: () => {},
    modelOptions: [{ value: "openai:gpt-5", label: "gpt-5" }],
    selectedModelId: "openai:gpt-5",
    onSelectModel: () => {},
    onAttachFile: jest.fn(),
    onAttachScreenshot: jest.fn(),
    onAttachLink: jest.fn(),
  });

  const rowIds = () =>
    Array.from(screen.getByTestId("attach-row").querySelectorAll("[data-widget]")).map((el) =>
      el.getAttribute("data-widget"),
    );
  const more = () => screen.queryByTestId("attach-more");
  const menu = () => screen.getByTestId("attach-more-menu");
  const menuIds = () =>
    Array.from(menu().querySelectorAll("[data-widget]")).map((el) => el.getAttribute("data-widget"));

  test("a first launch shows plugins and workspace on the row (and the ring when the chat has one) and tucks attach, screenshot and link", () => {
    render(<AttachPanel {...baseProps()} />);
    expect(rowIds()).toEqual(["tools", "workspace"]);
    expect(more()).toBeInTheDocument();
    fireEvent.click(more());
    expect(menuIds()).toEqual(["attach", "screenshot", "link"]);
  });

  test("a widget the model has disabled is not shown at all — in the row or in the menu — and the ⋯ goes with the last tucked one", () => {
    /* attachments unsupported by this model: attach and screenshot are the
       two widgets that used to sit disabled; now they are simply absent */
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["attach", "screenshot"] });
    const { rerender } = render(
      <AttachPanel {...baseProps()} attachmentsEnabled={false} attachmentsDisabledReason="This model cannot read images." />,
    );
    expect(rowIds()).toEqual(["tools", "workspace", "link"]);
    expect(more()).toBeNull();
    /* on the row too */
    act(() => {
      writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    });
    expect(rowIds()).toEqual(["tools", "workspace"]);
    expect(more()).toBeInTheDocument();
    /* the model changes to one that can: they come back where the record says */
    rerender(<AttachPanel {...baseProps()} attachmentsEnabled={true} />);
    expect(rowIds()).toEqual(["attach", "screenshot", "tools", "workspace"]);
  });

  test("a record that tucks nothing renders today's order and no ⋯ button", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: [] });
    render(<AttachPanel {...baseProps()} />);
    expect(rowIds()).toEqual(["attach", "screenshot", "tools", "workspace", "link"]);
    expect(more()).toBeNull();
  });

  test("the user's order is the row's order, and keyboard ←/→ walks it the same way", () => {
    writeAttachPanelLayout({
      version: 1,
      order: ["link", "tools", "screenshot", "attach", "workspace", "context_composition"],
      hidden: [],
    });
    const ref = React.createRef();
    render(<AttachPanel ref={ref} {...baseProps()} />);
    expect(rowIds()).toEqual(["link", "tools", "screenshot", "attach", "workspace"]);

    act(() => {
      ref.current.enterKeyboard();
    });
    const row = screen.getByTestId("attach-row");
    expect(row.getAttribute("data-kb-active")).toBe("model");
    act(() => {
      ref.current.handleKeyboardKey("ArrowRight");
    });
    expect(row.getAttribute("data-kb-active")).toBe("link");
    act(() => {
      ref.current.handleKeyboardKey("ArrowRight");
    });
    expect(row.getAttribute("data-kb-active")).toBe("tools");
  });

  test("a tucked widget leaves the row for the ⋯ menu and still works from there", () => {
    writeAttachPanelLayout({
      version: 1,
      order: ["attach", "screenshot", "tools", "workspace", "link", "context_composition"],
      hidden: ["screenshot", "link"],
    });
    const props = baseProps();
    render(<AttachPanel {...props} />);
    expect(rowIds()).toEqual(["attach", "tools", "workspace"]);
    expect(more()).toBeInTheDocument();

    fireEvent.click(more());
    expect(menuIds()).toEqual(["screenshot", "link"]);
    fireEvent.click(within(menu()).getByText("Take a screenshot"));
    expect(props.onAttachScreenshot).toHaveBeenCalledTimes(1);
    // invoking closes the menu
    expect(screen.queryByTestId("attach-more-menu")).toBeNull();
  });

  test("the ⋯ button is itself a keyboard stop, after the visible widgets", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    const ref = React.createRef();
    render(<AttachPanel ref={ref} {...baseProps()} />);
    act(() => {
      ref.current.enterKeyboard();
    });
    const row = screen.getByTestId("attach-row");
    // model, attach, screenshot, tools, workspace, then ⋯
    for (let i = 0; i < 5; i += 1) {
      act(() => {
        ref.current.handleKeyboardKey("ArrowRight");
      });
    }
    expect(row.getAttribute("data-kb-active")).toBe("more");
    act(() => {
      ref.current.handleKeyboardKey("Enter");
    });
    expect(menu()).toBeInTheDocument();
  });

  test("a tucked tools widget opens its palette from the menu row", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["tools"] });
    render(<AttachPanel {...baseProps()} />);
    expect(rowIds()).not.toContain("tools");
    fireEvent.click(more());
    fireEvent.click(within(menu()).getByText("Select plugins"));
    expect(screen.getByTestId("select-Search plugins...")).toHaveAttribute("data-open", "true");
  });

  test("widgets this chat cannot offer are skipped in the row and in the menu", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot"] });
    const props = baseProps();
    delete props.onAttachScreenshot;
    render(<AttachPanel {...props} />);
    expect(rowIds()).toEqual(["attach", "tools", "workspace", "link"]);
    // the only tucked widget is unavailable, so there is nothing to show
    expect(more()).toBeNull();
  });

  test("a layout written while the panel is open is picked up without a remount", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: [] });
    render(<AttachPanel {...baseProps()} />);
    expect(rowIds()).toEqual(["attach", "screenshot", "tools", "workspace", "link"]);
    act(() => {
      writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["attach"] });
    });
    expect(rowIds()).toEqual(["screenshot", "tools", "workspace", "link"]);
    expect(more()).toBeInTheDocument();
  });
});

describe("AttachPanel ⋯ menu geometry (#217)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    useChatInputToolkits.mockReset();
    useChatInputToolkits.mockReturnValue({ toolkitOptions: [], toolkitLoading: false, refreshToolkits: jest.fn() });
    useChatInputWorkspaces.mockReset();
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
  });
  const props = () => ({
    color: "#222", active: false, focused: false, isDark: true, attachments: [],
    selectedToolkits: [], onToolkitsChange: () => {}, selectedWorkspaceIds: [], onWorkspaceIdsChange: () => {},
    modelOptions: [{ value: "openai:gpt-5", label: "gpt-5" }], selectedModelId: "openai:gpt-5", onSelectModel: () => {},
    onAttachFile: () => {}, onAttachScreenshot: () => {}, onAttachLink: () => {},
  });

  test("the menu is the palette surface, every row a full-width pill whose icon circle is concentric with it, and no Arrange… row", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link", "tools"] });
    render(<AttachPanel {...props()} />);
    fireEvent.click(screen.getByTestId("attach-more"));
    const menu = screen.getByTestId("attach-more-menu");
    expect(menu.style.borderRadius).toBe("22px");
    expect(menu.style.padding).toBe("8px");
    expect(menu.style.backdropFilter).toContain("blur");
    expect(menu.getAttribute("data-surface")).toBe("palette");
    const rows = Array.from(menu.querySelectorAll('[data-widget]'));
    expect(rows.map((r) => r.getAttribute("data-widget"))).toEqual(["screenshot", "tools", "link"]);
    rows.forEach((row, i) => {
      expect(row.style.height).toBe("28px");
      expect(row.style.borderRadius).toBe("14px");
      expect(row.style.paddingLeft).toBe("0px");
      // every row stretches to the menu, the plugin row (a Select trigger) included
      expect(row.style.width).toBe("100%");
      const circle = row.querySelector('[data-icon-circle]');
      expect(circle.style.width).toBe("28px");
      expect(circle.style.height).toBe("28px");
      expect(circle.style.borderRadius).toBe("999px");
      expect(row.style.animationName).toBe("pupu-attach-menu-in");
      expect(row.style.animationDelay).toBe(`${60 + i * 30}ms`);
    });
    expect(screen.queryByTestId("attach-arrange")).toBeNull();
    expect(within(menu).queryByText("Arrange…")).toBeNull();
  });

  test("the context usage ring is centred in its circle by geometry, not by hope", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["context_composition"] });
    render(
      <AttachPanel
        {...props()}
        contextUsageView={{ percentage: 12, contextWindowTokens: 128000, usedTokens: 15000 }}
      />,
    );
    fireEvent.click(screen.getByTestId("attach-more"));
    const row = screen.getByTestId("attach-more-menu").querySelector('[data-widget="context_composition"]');
    const circle = row.querySelector('[data-icon-circle]');
    expect(circle.style.position).toBe("relative");
    const holder = circle.firstElementChild;
    expect(holder.style.position).toBe("absolute");
    expect(holder.style.left).toBe("-2px");
    expect(holder.style.top).toBe("-2px");
    expect(holder.style.width).toBe("32px");
    expect(holder.style.height).toBe("32px");
    expect(holder.style.transform).toBe("scale(0.875)");
    expect(holder.style.transformOrigin).toBe("50% 50%");
  });
});

/* Shared layout mock for the arrange-mode suites. jsdom has no layout: row
   slots sit 32px apart from x=0 (context_composition is unavailable in these
   chats), the "…" button at x 168..200 on the row's line (y 170..202), the
   menu a column above it at x 200..400, y 0..160, its rows 30px apart from
   y=40. Resolved by attribute so it holds for
   elements created later. */
const ARRANGE_ORDER = ["context_composition", "attach", "screenshot", "tools", "workspace", "link"];
const mockArrangeLayout = () =>
  jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
    const testId = this.getAttribute && this.getAttribute("data-testid");
    if (testId === "attach-more-menu") {
      return { left: 200, right: 400, width: 200, top: 0, bottom: 160, height: 160 };
    }
    if (testId === "attach-more") {
      /* the row (and so the button) sits under the menu, 10px below it */
      return { left: 168, right: 200, width: 32, top: 170, bottom: 202, height: 32 };
    }
    const id = this.getAttribute && this.getAttribute("data-widget");
    if (!id || this.getAttribute("data-ghost") === "true") {
      return { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 };
    }
    const inMenu = this.closest && this.closest('[data-testid="attach-more-menu"]');
    if (inMenu) {
      const MENU_Y = { screenshot: 40, link: 70, attach: 100, tools: 130, workspace: 160, context_composition: 190 };
      const y = MENU_Y[id] ?? 220;
      return { left: 208, right: 392, width: 184, top: y, bottom: y + 28, height: 28 };
    }
    const i = ARRANGE_ORDER.indexOf(id) - 1;
    return { left: i * 32, right: i * 32 + 32, width: 32, top: 0, bottom: 32, height: 32 };
  });
const arrangeProps = () => ({
  color: "#222", active: false, focused: false, isDark: false, attachments: [],
  selectedToolkits: [], onToolkitsChange: () => {}, selectedWorkspaceIds: [], onWorkspaceIdsChange: () => {},
  modelOptions: [{ value: "openai:gpt-5", label: "gpt-5" }], selectedModelId: "openai:gpt-5", onSelectModel: () => {},
  onAttachFile: jest.fn(), onAttachScreenshot: jest.fn(), onAttachLink: jest.fn(),
});
const arrangeSetup = () => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
  /* the arrange suites reason about "nothing tucked" as the plain case;
     the first-launch default tucks three, so start from everything visible
     (tests that want a menu write their own record) */
  writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: [] });
  useChatInputToolkits.mockReset();
  useChatInputToolkits.mockReturnValue({
    toolkitOptions: [{ value: "core", label: "Core" }],
    toolkitLoading: false,
    refreshToolkits: jest.fn(),
  });
  useChatInputWorkspaces.mockReset();
  useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
};
const pointerEv = (node, type, init) =>
  fireEvent(node, new MouseEvent(type, { bubbles: true, cancelable: true, ...init }));

describe("AttachPanel arrange mode: dragging into and out of the ⋯ menu (#217)", () => {
  beforeEach(arrangeSetup);
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const row = () => screen.getByTestId("attach-row");
  const menu = () => screen.queryByTestId("attach-more-menu");
  const rowIds = () =>
    Array.from(row().querySelectorAll('[data-arrange="row"] [data-widget]')).map((el) => el.getAttribute("data-widget"));
  const menuIds = () =>
    Array.from(menu().querySelectorAll('[data-widget]')).map((el) => el.getAttribute("data-widget"));
  const ghost = () => document.body.querySelector('[data-ghost="true"]');
  const enterArrange = () =>
    fireEvent.contextMenu(row().querySelector('[data-arrange="row"] [data-widget], [data-widget]'));

  test("entering arrange mode leaves the menu closed; the ⋯ button is there to be hovered", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    expect(row().getAttribute("data-arranging")).toBe("true");
    expect(menu()).toBeNull();
    expect(screen.getByTestId("attach-more")).toBeInTheDocument();
    expect(screen.queryByTestId("attach-tray")).toBeNull();
  });

  test("with a widget in hand, hovering the ⋯ opens the menu as the drop zone; leaving it closes the menu again", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    mockArrangeLayout();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    expect(menu()).toBeNull();
    // over the ⋯ button
    pointerEv(window, "pointermove", { clientX: 184, clientY: 186, buttons: 1 });
    expect(menu()).toBeInTheDocument();
    expect(menu().getAttribute("data-arranging")).toBe("true");
    expect(menuIds()).toEqual(["screenshot", "link"]);
    // a gap opens at the end while over the button itself
    expect(Array.from(menu().querySelectorAll("[data-menu-gap]")).map((g) => g.getAttribute("data-menu-gap"))).toEqual(["closed", "closed", "open"]);
    // into the menu, between screenshot (y 54) and link (y 84)
    pointerEv(window, "pointermove", { clientX: 300, clientY: 70, buttons: 1 });
    expect(Array.from(menu().querySelectorAll("[data-menu-gap]")).map((g) => g.getAttribute("data-menu-gap"))).toEqual(["closed", "open", "closed"]);
    // the origin slot in the row stays open meanwhile
    expect(Array.from(row().querySelectorAll('[data-arrange="row"] [data-arrange-gap]')).map((g) => g.getAttribute("data-arrange-gap"))).toEqual(["open", "closed", "closed"]);
    // away from both: the menu closes, the row gap follows the pointer
    pointerEv(window, "pointermove", { clientX: 90, clientY: 16, buttons: 1 });
    expect(menu()).toBeNull();
    pointerEv(window, "pointerup", { clientX: 90, clientY: 16, buttons: 0 });
    expect(rowIds()).toEqual(["tools", "attach", "workspace"]);
  });

  test("dropping inside the menu tucks the widget at that position and closes the menu", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    mockArrangeLayout();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    pointerEv(window, "pointermove", { clientX: 184, clientY: 186, buttons: 1 });
    pointerEv(window, "pointermove", { clientX: 300, clientY: 70, buttons: 1 });
    expect(ghost()).toBeInTheDocument();
    pointerEv(window, "pointerup", { clientX: 300, clientY: 70, buttons: 0 });
    expect(ghost()).toBeNull();
    expect(menu()).toBeNull();
    expect(rowIds()).toEqual(["tools", "workspace"]);
    expect(readAttachPanelLayout()).toEqual({
      version: 1,
      order: ["context_composition", "screenshot", "tools", "workspace", "attach", "link"],
      hidden: ["screenshot", "link", "attach"],
    });
    // still arranging; opening the menu by hand shows the new order
    expect(row().getAttribute("data-arranging")).toBe("true");
    fireEvent.click(screen.getByTestId("attach-more"));
    expect(menuIds()).toEqual(["screenshot", "attach", "link"]);
  });

  test("with nothing tucked, hovering the ⋯ shows one plain drop row (no dashes)", () => {
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    mockArrangeLayout();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    pointerEv(window, "pointermove", { clientX: 184, clientY: 186, buttons: 1 });
    expect(menu()).toBeInTheDocument();
    const dropRow = within(menu()).getByText("Drop here to tuck away");
    expect(dropRow).toBeInTheDocument();
    expect(dropRow.style.border).toBe("");
    pointerEv(window, "pointerup", { clientX: 184, clientY: 186, buttons: 0 });
    expect(readAttachPanelLayout().hidden).toEqual(["attach"]);
  });

  test("a long press on a menu row lifts it; dragging it out of the menu closes the menu and it lands in the row", () => {
    jest.useFakeTimers();
    try {
      writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link"] });
      render(<AttachPanel {...arrangeProps()} />);
      mockArrangeLayout();
      fireEvent.click(screen.getByTestId("attach-more"));
      const linkRow = menu().querySelector('[data-widget="link"]');
      pointerEv(linkRow, "pointerdown", { clientX: 300, clientY: 84, buttons: 1, button: 0 });
      act(() => { jest.advanceTimersByTime(600); });
      expect(row().getAttribute("data-arranging")).toBe("true");
      expect(document.body.querySelector('[data-widget="link"][data-ghost="true"]')).toBeInTheDocument();
      // still inside the menu: open, with the origin gap holding its place
      expect(menu()).toBeInTheDocument();
      expect(Array.from(menu().querySelectorAll("[data-menu-gap]")).map((g) => g.getAttribute("data-menu-gap"))).toEqual(["closed", "open"]);
      // out into the row, before tools (centre 48): x=40
      pointerEv(window, "pointermove", { clientX: 40, clientY: 16, buttons: 1 });
      expect(menu()).toBeNull();
      pointerEv(window, "pointerup", { clientX: 40, clientY: 16, buttons: 0 });
      expect(rowIds()).toEqual(["attach", "link", "tools", "workspace"]);
      expect(readAttachPanelLayout().hidden).toEqual(["screenshot"]);
    } finally {
      jest.useRealTimers();
    }
  });

  test("while arranging, open menu rows jiggle too, and nothing in the menu is dashed — the gap is plain empty space", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    fireEvent.click(screen.getByTestId("attach-more"));
    const rows = Array.from(menu().querySelectorAll('[data-widget]'));
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r.style.animationName).toBe("pupu-attach-jiggle-row"));
    expect(new Set(rows.map((r) => r.style.animationDelay)).size).toBe(2);
    const dashed = Array.from(menu().querySelectorAll("*")).filter((el) => /dashed/.test(el.style.border || el.style.borderStyle || ""));
    expect(dashed).toHaveLength(0);
    mockArrangeLayout();
    pointerEv(rows[0], "pointerdown", { clientX: 300, clientY: 54, buttons: 1, button: 0 });
    pointerEv(window, "pointermove", { clientX: 300, clientY: 100, buttons: 1 });
    const open = menu().querySelector('[data-menu-gap="open"]');
    expect(open).not.toBeNull();
    expect(open.style.height).toBe("28px");
    expect(open.style.border).toBe("");
    expect(open.style.backgroundColor).toBe("");
    pointerEv(window, "pointerup", { clientX: 300, clientY: 100, buttons: 0 });
  });

  test("dragging a row widget past its neighbours reorders the row and persists", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    mockArrangeLayout();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    pointerEv(window, "pointermove", { clientX: 90, clientY: 16, buttons: 1 });
    expect(row().querySelector('[data-arrange="row"] [data-widget="attach"]')).toBeNull();
    const gaps = Array.from(row().querySelectorAll('[data-arrange="row"] [data-arrange-gap]'));
    expect(gaps.map((g) => g.getAttribute("data-arrange-gap"))).toEqual(["closed", "closed", "open", "closed"]);
    expect(gaps[2].style.width).toBe("32px");
    pointerEv(window, "pointerup", { clientX: 90, clientY: 16, buttons: 0 });
    expect(rowIds()).toEqual(["screenshot", "tools", "attach", "workspace"]);
    expect(readAttachPanelLayout().order).toEqual([
      "context_composition", "screenshot", "tools", "attach", "workspace", "link",
    ]);
    expect(row().getAttribute("data-arranging")).toBe("true");
  });

  test("a click inside the open menu does not end the session; a click elsewhere does — and the menu has no heading", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    fireEvent.click(screen.getByTestId("attach-more"));
    expect(within(menu()).queryByText("In the ⋯ menu")).toBeNull();
    // the first child is a row's slot (gap + row), not a heading
    expect(menu().firstElementChild.querySelector("[data-menu-gap]")).not.toBeNull();
    fireEvent.mouseDown(menu().querySelector('[data-widget="link"]'));
    expect(row().getAttribute("data-arranging")).toBe("true");
    fireEvent.mouseDown(document.body);
    expect(row().getAttribute("data-arranging")).toBe("false");
    expect(menu()).toBeNull();
  });

  test("keyboard: ←/→ walk row slots then menu rows, Shift+→ moves, Enter tucks or restores, Escape is Done", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    const ref = React.createRef();
    render(<AttachPanel ref={ref} {...arrangeProps()} />);
    enterArrange();
    expect(row().getAttribute("data-kb-active")).toBe("");
    act(() => { ref.current.handleKeyboardKey("ArrowRight"); });
    expect(row().getAttribute("data-kb-active")).toBe("attach");
    act(() => { ref.current.handleKeyboardKey("ArrowRight"); });
    expect(row().getAttribute("data-kb-active")).toBe("screenshot");
    act(() => { ref.current.handleKeyboardKey("ArrowRight", { shift: true }); });
    expect(rowIds()).toEqual(["attach", "tools", "screenshot", "workspace"]);
    expect(row().getAttribute("data-kb-active")).toBe("screenshot");
    act(() => { ref.current.handleKeyboardKey("Enter"); });
    expect(rowIds()).toEqual(["attach", "tools", "workspace"]);
    expect(row().getAttribute("data-kb-active")).toBe("screenshot");
    fireEvent.click(screen.getByTestId("attach-more"));
    expect(menuIds()).toEqual(["link", "screenshot"]);
    act(() => { ref.current.handleKeyboardKey("Enter"); });
    expect(rowIds()).toEqual(["attach", "tools", "workspace", "screenshot"]);
    act(() => { ref.current.handleKeyboardKey("Escape"); });
    expect(row().getAttribute("data-arranging")).toBe("false");
  });

  test("a widget's own action never fires while arranging", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    const props = arrangeProps();
    render(<AttachPanel {...props} />);
    enterArrange();
    mockArrangeLayout();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    pointerEv(window, "pointerup", { clientX: 16, clientY: 16, buttons: 0 });
    expect(props.onAttachFile).not.toHaveBeenCalled();
    expect(rowIds()).toEqual(["attach", "screenshot", "tools", "workspace"]);
  });

  test("the ghost rides above everything through a body portal", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
    render(<AttachPanel {...arrangeProps()} />);
    enterArrange();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    const g = ghost();
    expect(g.parentElement).toBe(document.body);
    expect(g.style.position).toBe("fixed");
    expect(g.style.zIndex).toBe(String(Z.DRAG_GHOST));
    pointerEv(window, "pointerup", { clientX: 16, clientY: 16, buttons: 0 });
  });
});

describe("AttachPanel arrange mode entry points (#217)", () => {
  beforeEach(arrangeSetup);
  const row = () => screen.getByTestId("attach-row");

  test("with nothing tucked there is no ⋯ button, so a right-click on a widget is the way in", () => {
    render(<AttachPanel {...arrangeProps()} />);
    expect(screen.queryByTestId("attach-more")).toBeNull();
    fireEvent.contextMenu(row().querySelector('[data-widget="screenshot"]'));
    expect(row().getAttribute("data-arranging")).toBe("true");
    expect(screen.getByTestId("attach-more")).toBeInTheDocument();
    expect(screen.queryByTestId("attach-more-menu")).toBeNull();
  });

  test("a long press on a widget enters arrange mode; a short press does not", () => {
    jest.useFakeTimers();
    try {
      const props = arrangeProps();
      render(<AttachPanel {...props} />);
      const widget = row().querySelector('[data-widget="attach"]');
      fireEvent.pointerDown(widget, { button: 0 });
      act(() => { jest.advanceTimersByTime(200); });
      fireEvent.pointerUp(widget);
      expect(row().getAttribute("data-arranging")).toBe("false");
      fireEvent.pointerDown(widget, { button: 0 });
      act(() => { jest.advanceTimersByTime(600); });
      expect(row().getAttribute("data-arranging")).toBe("true");
      fireEvent.pointerUp(widget);
      expect(props.onAttachFile).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("Shift+Enter on a keyboard-highlighted widget enters arrange mode", () => {
    const ref = React.createRef();
    render(<AttachPanel ref={ref} {...arrangeProps()} />);
    act(() => { ref.current.enterKeyboard(); });
    act(() => { ref.current.handleKeyboardKey("ArrowRight"); });
    expect(row().getAttribute("data-kb-active")).toBe("attach");
    act(() => { ref.current.handleKeyboardKey("Enter", { shift: true }); });
    expect(row().getAttribute("data-arranging")).toBe("true");
    expect(row().getAttribute("data-kb-active")).toBe("attach");
  });
});

describe("AttachPanel arrange mode jiggle (#217)", () => {
  beforeEach(arrangeSetup);
  const row = () => screen.getByTestId("attach-row");
  const slots = () => Array.from(row().querySelectorAll('[data-arrange="row"] [data-widget]'));

  test("while arranging every slot jiggles like an iOS home screen, each on its own phase", () => {
    render(<AttachPanel {...arrangeProps()} />);
    fireEvent.contextMenu(row().querySelector('[data-widget="attach"]'));
    expect(slots().every((el) => el.style.animationName === "pupu-attach-jiggle")).toBe(true);
    expect(new Set(slots().map((el) => el.style.animationDelay)).size).toBe(slots().length);
    expect(document.head.querySelectorAll("style[data-pupu-attach-jiggle]")).toHaveLength(1);
  });

  test("the widget in hand is a still ghost; the rest keep jiggling", () => {
    render(<AttachPanel {...arrangeProps()} />);
    fireEvent.contextMenu(row().querySelector('[data-widget="attach"]'));
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1 });
    pointerEv(window, "pointermove", { clientX: 60, clientY: 16, buttons: 1 });
    const dragged = document.body.querySelector('[data-widget="attach"][data-ghost="true"]');
    expect(dragged).toBeInTheDocument();
    expect(dragged.style.animationName).toBe("");
    expect(row().querySelector('[data-widget="screenshot"]').style.animationName).toBe("pupu-attach-jiggle");
    pointerEv(window, "pointerup", { clientX: 60, clientY: 16, buttons: 0 });
  });

  test("reduced motion turns the jiggle off", () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion"), media: query,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {},
    }));
    try {
      render(<AttachPanel {...arrangeProps()} />);
      fireEvent.contextMenu(row().querySelector('[data-widget="attach"]'));
      expect(slots().every((el) => el.style.animationName === "none")).toBe(true);
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("AttachPanel arrange mode Done pill geometry (#217)", () => {
  beforeEach(arrangeSetup);

  test("Done is a full-height pill, concentric with the row like every other control", () => {
    render(<AttachPanel {...arrangeProps()} />);
    fireEvent.contextMenu(screen.getByTestId("attach-row").querySelector('[data-widget="attach"]'));
    expect(screen.getByTestId("attach-arrange-done").getAttribute("data-height")).toBe("32");
  });
});

describe("AttachPanel long press lifts straight into a drag (#217)", () => {
  beforeEach(arrangeSetup);
  afterEach(() => {
    jest.restoreAllMocks();
  });
  const row = () => screen.getByTestId("attach-row");

  test("the pressed widget is lifted the moment the long press fires, and the same gesture drops it", () => {
    jest.useFakeTimers();
    mockArrangeLayout();
    try {
      const p = arrangeProps();
      render(<AttachPanel {...p} />);
      pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
      act(() => { jest.advanceTimersByTime(600); });
      expect(row().getAttribute("data-arranging")).toBe("true");
      expect(document.body.querySelector('[data-widget="attach"][data-ghost="true"]')).toBeInTheDocument();
      const gaps = Array.from(row().querySelectorAll('[data-arrange="row"] [data-arrange-gap]'));
      expect(gaps.map((g) => g.getAttribute("data-arrange-gap"))).toEqual(["open", "closed", "closed", "closed", "closed"]);
      pointerEv(window, "pointermove", { clientX: 90, clientY: 16, buttons: 1 });
      pointerEv(window, "pointerup", { clientX: 90, clientY: 16, buttons: 0 });
      expect(readAttachPanelLayout().order).toEqual([
        "context_composition", "screenshot", "tools", "attach", "workspace", "link",
      ]);
      expect(row().getAttribute("data-arranging")).toBe("true");
      expect(row().getAttribute("data-kb-active")).toBe("");
      expect(p.onAttachFile).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test("in arrange mode a press lifts the widget at once, and a release in place changes nothing", () => {
    mockArrangeLayout();
    render(<AttachPanel {...arrangeProps()} />);
    fireEvent.contextMenu(row().querySelector('[data-widget="screenshot"]'));
    pointerEv(row().querySelector('[data-widget="tools"]'), "pointerdown", { clientX: 80, clientY: 16, buttons: 1, button: 0 });
    expect(document.body.querySelector('[data-widget="tools"][data-ghost="true"]')).toBeInTheDocument();
    const before = readAttachPanelLayout();
    pointerEv(window, "pointerup", { clientX: 80, clientY: 16, buttons: 0 });
    expect(document.body.querySelector('[data-ghost="true"]')).toBeNull();
    expect(readAttachPanelLayout()).toEqual(before);
  });
});

describe("AttachPanel drag targets follow the panel while it moves (#217)", () => {
  beforeEach(arrangeSetup);
  afterEach(() => {
    jest.restoreAllMocks();
  });
  const row = () => screen.getByTestId("attach-row");

  test("a long press that floats the panel up still drops into the menu where the ⋯ IS, not where it was", () => {
    jest.useFakeTimers();
    let phase = "before";
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const testId = this.getAttribute && this.getAttribute("data-testid");
      const shift = phase === "before" ? 0 : -60;
      if (testId === "attach-more") {
        return { left: 168, right: 200, width: 32, top: shift, bottom: 32 + shift, height: 32 };
      }
      if (testId === "attach-more-menu") {
        return { left: 200, right: 400, width: 200, top: -200 + shift, bottom: -100 + shift, height: 100 };
      }
      const id = this.getAttribute && this.getAttribute("data-widget");
      const i = ARRANGE_ORDER.indexOf(id) - 1;
      if (id && i >= 0 && this.getAttribute("data-ghost") !== "true" && !(this.closest && this.closest('[data-testid="attach-more-menu"]'))) {
        return { left: i * 32, right: i * 32 + 32, width: 32, top: shift, bottom: 32 + shift, height: 32 };
      }
      return { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 };
    });
    try {
      render(<AttachPanel {...arrangeProps()} />);
      pointerEv(row().querySelector('[data-widget="screenshot"]'), "pointerdown", { clientX: 48, clientY: 16, buttons: 1, button: 0 });
      act(() => { jest.advanceTimersByTime(600); });
      expect(row().getAttribute("data-arranging")).toBe("true");
      phase = "after";
      // the ⋯ has moved up 60px: hover it where it IS
      pointerEv(window, "pointermove", { clientX: 184, clientY: -44, buttons: 1 });
      expect(screen.getByTestId("attach-more-menu")).toBeInTheDocument();
      pointerEv(window, "pointermove", { clientX: 300, clientY: -200, buttons: 1 });
      expect(screen.getByTestId("attach-more-menu").querySelector('[data-menu-gap="open"]')).toBeInTheDocument();
      pointerEv(window, "pointerup", { clientX: 300, clientY: -200, buttons: 0 });
      expect(readAttachPanelLayout().hidden).toEqual(["screenshot"]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("AttachPanel ⋯ menu below the row (#217)", () => {
  beforeEach(arrangeSetup);
  afterEach(() => {
    jest.restoreAllMocks();
  });
  const row = () => screen.getByTestId("attach-row");
  const menu = () => screen.queryByTestId("attach-more-menu");
  const gaps = () => Array.from(menu().querySelectorAll("[data-menu-gap]")).map((g) => g.getAttribute("data-menu-gap"));
  /* an empty chat's composer sits at the top of the window, so the popover
     engine flips the menu BELOW the "…": x 100..300, y 40..200 */
  const mockBelow = () =>
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function rect() {
      const testId = this.getAttribute && this.getAttribute("data-testid");
      if (testId === "attach-more-menu") return { left: 100, right: 300, width: 200, top: 40, bottom: 200, height: 160 };
      if (testId === "attach-more") return { left: 168, right: 200, width: 32, top: 0, bottom: 32, height: 32 };
      const id = this.getAttribute && this.getAttribute("data-widget");
      if (!id || this.getAttribute("data-ghost") === "true") return { left: 0, right: 0, width: 0, top: 0, bottom: 0, height: 0 };
      if (this.closest && this.closest('[data-testid="attach-more-menu"]')) {
        const y = { screenshot: 60, link: 90 }[id] ?? 120;
        return { left: 108, right: 292, width: 184, top: y, bottom: y + 28, height: 28 };
      }
      const i = ARRANGE_ORDER.indexOf(id) - 1;
      return { left: i * 32, right: i * 32 + 32, width: 32, top: 0, bottom: 32, height: 32 };
    });

  test("hovering the ⋯ targets the NEAR end of the menu, and a row point under the menu's span is still the row", () => {
    writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["screenshot", "link"] });
    render(<AttachPanel {...arrangeProps()} />);
    fireEvent.contextMenu(row().querySelector('[data-widget="attach"]'));
    mockBelow();
    pointerEv(row().querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    pointerEv(window, "pointermove", { clientX: 184, clientY: 16, buttons: 1 });
    expect(menu()).toBeInTheDocument();
    // the menu hangs below: its top is the near end
    expect(gaps()).toEqual(["open", "closed", "closed"]);
    // the seam between button and menu (x within the button, y between them) keeps it
    pointerEv(window, "pointermove", { clientX: 184, clientY: 36, buttons: 1 });
    expect(menu()).toBeInTheDocument();
    expect(gaps()).toEqual(["open", "closed", "closed"]);
    // a row slot's position (x=120, y=16) lies inside the menu's x span but is the row, not the menu
    pointerEv(window, "pointermove", { clientX: 120, clientY: 16, buttons: 1 });
    expect(menu()).toBeNull();
    expect(Array.from(row().querySelectorAll('[data-arrange="row"] [data-arrange-gap]')).map((g) => g.getAttribute("data-arrange-gap"))).toEqual(["closed", "closed", "open"]);
    pointerEv(window, "pointerup", { clientX: 120, clientY: 16, buttons: 0 });
  });
});

describe("AttachPanel drag cursor (#217)", () => {
  beforeEach(arrangeSetup);

  test("the whole page shows the grabbing hand while a widget is in hand, and nothing can be text-selected", () => {
    render(<AttachPanel {...arrangeProps()} />);
    const row = screen.getByTestId("attach-row");
    fireEvent.contextMenu(row.querySelector('[data-widget="attach"]'));
    expect(document.body.style.cursor).toBe("");
    pointerEv(row.querySelector('[data-widget="attach"]'), "pointerdown", { clientX: 16, clientY: 16, buttons: 1, button: 0 });
    expect(document.body.style.cursor).toBe("grabbing");
    expect(document.body.style.userSelect).toBe("none");
    pointerEv(window, "pointerup", { clientX: 16, clientY: 16, buttons: 0 });
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
  });
});

describe("AttachPanel ⋯ menu rides along while arranging (#217)", () => {
  beforeEach(arrangeSetup);

  test("the menu popover follows its anchor only for the arrange session", () => {
    const tooltipMod = require("../../../BUILTIN_COMPONENTs/tooltip/tooltip");
    const seen = [];
    const spy = jest.spyOn(tooltipMod, "default").mockImplementation((props) => {
      if (props.tooltip_component && props.tooltip_component.props && props.tooltip_component.props["data-testid"] === "attach-more-menu") {
        seen.push(Boolean(props.follow_trigger));
      }
      return props.children;
    });
    try {
      writeAttachPanelLayout({ version: 1, order: MOVABLE_ATTACH_WIDGETS, hidden: ["link"] });
      render(<AttachPanel {...arrangeProps()} />);
      expect(seen[seen.length - 1]).toBe(false);
      fireEvent.contextMenu(screen.getByTestId("attach-row").querySelector('[data-widget="attach"]'));
      expect(seen[seen.length - 1]).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
