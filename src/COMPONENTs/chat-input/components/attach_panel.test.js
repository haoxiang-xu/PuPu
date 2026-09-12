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
import {
  CONTEXT_COMPOSITION_EXTENSION_KEY,
  hasContextCompositionEvidence,
} from "../../../SERVICEs/context_composition_v1";
import {
  buildContextUsageView,
  selectContextUsage,
} from "../../../SERVICEs/context_usage_v1";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";

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
