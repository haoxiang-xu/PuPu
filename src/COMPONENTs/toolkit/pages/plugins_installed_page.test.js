import { act, fireEvent, render, screen, within } from "@testing-library/react";
import PluginsInstalledPage from "./plugins_installed_page";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";

/* NOTE: useTranslation is intentionally left un-mocked here — the vocabulary
   test below asserts on rendered TEXT, and an identity-key mock would leak
   the i18n key NAME ("toolkit.installed_title") into the DOM, which itself
   contains the substring "tool". Falling back to the real en.json values
   (no LocaleContext provider needed — the hook defaults to "en") keeps the
   assertion meaningful. */

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listToolModalCatalog: jest.fn(),
      listMcpToolkits: jest.fn(),
    },
  },
}));

jest.mock("../../../SERVICEs/default_toolkit_store", () => ({
  __esModule: true,
  getDefaultToolkitSelection: jest.fn(() => []),
  setDefaultToolkitEnabled: jest.fn(() => []),
  removeInvalidToolkitIds: jest.fn(),
}));

jest.mock("../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  deleteMcpEntry: jest.fn(() => Promise.resolve()),
}));

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => ({
  __esModule: true,
  withMcpStoreIcon: (tk) => tk,
}));

jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  subscribeToolkitCatalogRefresh: jest.fn(() => () => {}),
}));

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  ...jest.requireActual("../components/toolkit_icon"),
  ToolkitIconFrame: () => <span data-testid="icon" />,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  SemiSwitch: ({ on, set_on }) => (
    <button data-testid="switch" onClick={() => set_on(!on)}>
      {on ? "on" : "off"}
    </button>
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/tooltip/tooltip", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

/* Stub the status pill so this list-level test never touches runtimeBridge —
   the pill's own tri-state behavior is covered in computer_status_pill.test.js.
   Text is "status" (no "tool") to keep the plugin-vocabulary assertion valid. */
jest.mock("../components/computer_status_pill", () => ({
  __esModule: true,
  default: () => <span data-testid="computer-status-pill">status</span>,
}));

const CATALOG = [
  {
    toolkitId: "builtin.computer",
    toolkitName: "Computer",
    toolkitDescription: "See the screen and control mouse and keyboard input.",
    source: "builtin",
    settingsKind: "computer_use",
    capabilityRequirements: ["computer_use"],
    tools: [{ name: "computer", title: "Computer" }],
    skills: [],
  },
  {
    toolkitId: "plan",
    toolkitName: "Plan",
    toolkitDescription:
      "Workspace-backed planning: draft, refine and finalize step-by-step plans.",
    source: "builtin",
    tools: [{ name: "plan_start", title: "Plan Start", requiresConfirmation: false }],
    skills: [
      { name: "plan", title: "Plan First", description: "Draft a plan first." },
    ],
  },
  {
    toolkitId: "mcp.productivity.notion-remote",
    toolkitName: "Notion",
    toolkitDescription: "Read, search and summarize your pages and databases.",
    source: "mcp",
    tools: [{ name: "notion_search", title: "Search pages", requiresConfirmation: false }],
    skills: [
      { name: "summarize", title: "Summarize", description: "Summarize a page." },
    ],
  },
];

describe("PluginsInstalledPage", () => {
  const renderPage = async (props = {}) => {
    let rendered;
    await act(async () => {
      rendered = render(
        <PluginsInstalledPage isDark={false} onOpenDetail={() => {}} {...props} />,
      );
    });
    return rendered;
  };

  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockReset();
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: CATALOG });
    api.unchain.listMcpToolkits.mockReset();
    api.unchain.listMcpToolkits.mockResolvedValue({ toolkits: [] });
    getDefaultToolkitSelection.mockReturnValue([]);
    setDefaultToolkitEnabled.mockReturnValue([]);
    removeInvalidToolkitIds.mockClear();
  });

  test("renders one row per installed plugin with its name", async () => {
    await renderPage();

    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getAllByTestId("switch")).toHaveLength(2);
  });

  test("renders the plugin's first command as a chip", async () => {
    await renderPage();

    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("/summarize")).toBeInTheDocument();
  });

  test("never renders the word 'tool' — plugin vocabulary only", async () => {
    const { container } = await renderPage();

    expect(container.textContent).not.toMatch(/tool/i);
  });

  test("clicking a row calls onOpenDetail with a presentation-shaped object", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    fireEvent.click(screen.getByText("Plan"));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    const arg = onOpenDetail.mock.calls[0][0];
    expect(arg.id).toBe("plan");
    expect(arg.commands).toEqual([
      { name: "/plan", title: "Plan First", description: "Draft a plan first." },
    ]);
    expect(arg.raw.toolkitId).toBe("plan");
  });

  test("keeps an unavailable MCP install visible with a Needs attention path to detail", async () => {
    const onOpenDetail = jest.fn();
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          entryId: "figma-remote",
          toolkitId: "mcp.dev.figma-remote",
          toolkitName: "Figma",
          toolkitDescription: "Previously installed remote MCP.",
          source: "mcp",
          status: "error",
          releaseBlocked: true,
          lastError: "This MCP toolkit is not available in this release",
          tools: [],
          skills: [],
        },
      ],
    });

    await renderPage({ onOpenDetail });

    const row = screen.getByTestId("installed-row-mcp.dev.figma-remote");
    expect(within(row).getByText("Figma")).toBeInTheDocument();
    const attention = within(row).getByRole("button", { name: "Needs attention" });
    expect(within(row).queryByTestId("switch")).not.toBeInTheDocument();

    fireEvent.click(attention);
    expect(onOpenDetail).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mcp.dev.figma-remote",
        raw: expect.objectContaining({
          toolkitId: "mcp.dev.figma-remote",
          status: "error",
          releaseBlocked: true,
        }),
      }),
    );
  });

  test("still renders MCP install records when the selectable catalog request fails", async () => {
    api.unchain.listToolModalCatalog.mockRejectedValue(new Error("catalog unavailable"));
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          toolkitId: "mcp.custom.offline",
          toolkitName: "Offline MCP",
          toolkitDescription: "Needs repair.",
          source: "mcp",
          status: "unavailable",
          tools: [],
          skills: [],
        },
      ],
    });

    await renderPage();

    expect(screen.getByText("Offline MCP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Needs attention" })).toBeInTheDocument();
    expect(removeInvalidToolkitIds).not.toHaveBeenCalled();
  });

  test("toggling the switch writes back through setDefaultToolkitEnabled", async () => {
    await renderPage();

    fireEvent.click(screen.getAllByTestId("switch")[0]);

    expect(setDefaultToolkitEnabled).toHaveBeenCalledWith("global", "plan", true);
  });

  test("a rejected toggle reconciles the switch to the store rollback", async () => {
    let rejectPersistence;
    const persistence = new Promise((_resolve, reject) => {
      rejectPersistence = reject;
    });
    const optimistic = ["plan"];
    Object.defineProperty(optimistic, "persistence", {
      value: persistence,
      enumerable: false,
    });
    setDefaultToolkitEnabled.mockReturnValue(optimistic);
    getDefaultToolkitSelection.mockReturnValue([]);
    await renderPage();

    const planSwitch = screen.getAllByTestId("switch")[0];
    fireEvent.click(planSwitch);
    expect(planSwitch).toHaveTextContent("on");

    await act(async () => {
      rejectPersistence(new Error("[settings_storage_unavailable] gone"));
      await expect(persistence).rejects.toThrow(/settings_storage_unavailable/);
    });
    expect(planSwitch).toHaveTextContent("off");
  });

  /* T3: two SettingsSections group rows by source — Built-in (builtin/local)
     and MCP — matching mockup screen ③'s "Built-in" / "MCP" section
     headers. */
  describe("PluginsInstalledPage — source grouping", () => {
    test("groups rows into a Built-in section and an MCP section", async () => {
      await renderPage();

      const builtinSection = screen.getByText("Built-in").closest("div").parentElement;
      expect(within(builtinSection).getByText("Plan")).toBeInTheDocument();

      const mcpSection = screen.getByText("mcp").closest("div").parentElement;
      expect(within(mcpSection).getByText("Notion")).toBeInTheDocument();
    });

    test("imported skill packs get their own 'Skill packs' section, not Built-in", async () => {
      api.unchain.listToolModalCatalog.mockResolvedValue({
        toolkits: [
          ...CATALOG,
          {
            toolkitId: "skillpack.superpowers",
            toolkitName: "Superpowers",
            toolkitDescription: "Imported skill pack",
            source: "skillpack",
            tools: [],
            skills: [
              { name: "brainstorming", title: "Brainstorming", description: "Explore." },
            ],
          },
        ],
      });
      await renderPage();

      const skillSection = screen.getByText("Skill packs").closest("div").parentElement;
      expect(within(skillSection).getByText("Superpowers")).toBeInTheDocument();

      // ...and it must NOT leak into the Built-in section.
      const builtinSection = screen.getByText("Built-in").closest("div").parentElement;
      expect(within(builtinSection).queryByText("Superpowers")).not.toBeInTheDocument();
    });
  });

  describe("PluginsInstalledPage — search", () => {
    test("renders a search input", async () => {
      await renderPage();

      expect(screen.getByPlaceholderText("Search plugins...")).toBeInTheDocument();
    });

    test("typing filters rows by name", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search plugins..."), {
        target: { value: "Notion" },
      });

      expect(screen.getByText("Notion")).toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });

    test("typing filters rows by description and by command/tool name", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search plugins..."), {
        target: { value: "summarize" },
      });
      expect(screen.getByText("Notion")).toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });

    test("a query with no matches shows no rows", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search plugins..."), {
        target: { value: "zzz-no-match" },
      });

      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
      expect(screen.queryByText("Notion")).not.toBeInTheDocument();
    });
  });

  /* T5: the legacy "Custom MCP" store tab (toolkits_page.js's
     TOOLKIT_SUB_PAGES) is retired — its entry point demotes to a low-key
     footer link here and on PluginsCategoriesPage, opening the same
     (unmodified) CustomMcpPage via the shell's onOpenCustomMcp callback. */
  describe("PluginsInstalledPage — custom MCP footer entry", () => {
    test("renders a low-key 'Add a custom plugin' footer entry", async () => {
      await renderPage();
      expect(screen.getByText(/Add a custom plugin/i)).toBeInTheDocument();
    });

    test("clicking the footer entry calls onOpenCustomMcp", async () => {
      const onOpenCustomMcp = jest.fn();
      await renderPage({ onOpenCustomMcp });

      fireEvent.click(screen.getByText(/Add a custom plugin/i));

      expect(onOpenCustomMcp).toHaveBeenCalledTimes(1);
    });

    test("still renders the footer entry when there are no installed plugins", async () => {
      const onOpenCustomMcp = jest.fn();
      api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
      await renderPage({ onOpenCustomMcp });

      expect(screen.getByText(/Add a custom plugin/i)).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Add a custom plugin/i));
      expect(onOpenCustomMcp).toHaveBeenCalledTimes(1);
    });
  });

  describe("PluginsInstalledPage — catalog-native Computer row", () => {
    test("renders the catalog Computer row with its read-only status pill", async () => {
      await renderPage();

      expect(screen.getByText("Computer")).toBeInTheDocument();
      expect(screen.getByTestId("computer-status-pill")).toBeInTheDocument();
    });

    test("Computer row carries no auto-enable switch (pill only, toggle lives in detail)", async () => {
      await renderPage();

      // Only the two catalog plugins get switches; Computer does not.
      expect(screen.getAllByTestId("switch")).toHaveLength(2);
    });

    test("clicking the Computer row opens its settings detail, not the catalog detail", async () => {
      const onOpenPluginSettings = jest.fn();
      const onOpenDetail = jest.fn();
      await renderPage({ onOpenPluginSettings, onOpenDetail });

      fireEvent.click(screen.getByText("Computer"));

      expect(onOpenPluginSettings).toHaveBeenCalledTimes(1);
      expect(onOpenPluginSettings).toHaveBeenCalledWith("builtin.computer");
      expect(onOpenDetail).not.toHaveBeenCalled();
    });

    test("does not synthesize Computer when an older/empty catalog omits it", async () => {
      api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
      await renderPage();

      expect(screen.queryByText("Computer")).not.toBeInTheDocument();
    });

    test("participates in search — hidden when the query doesn't match", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search plugins..."), {
        target: { value: "Notion" },
      });

      expect(screen.queryByText("Computer")).not.toBeInTheDocument();
    });

    test("participates in search — kept when the query matches its name", async () => {
      await renderPage();

      fireEvent.change(screen.getByPlaceholderText("Search plugins..."), {
        target: { value: "Comp" },
      });

      expect(screen.getByText("Computer")).toBeInTheDocument();
      expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    });
  });
});
