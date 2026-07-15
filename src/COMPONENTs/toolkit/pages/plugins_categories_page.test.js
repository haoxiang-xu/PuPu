import { render, screen, fireEvent, within } from "@testing-library/react";
import PluginsCategoriesPage from "./plugins_categories_page";

/* NOTE: useTranslation is intentionally left un-mocked, same rationale as
   plugins_installed_page.test.js — the vocabulary assertion reads rendered
   TEXT and an identity-key mock would leak key NAMES (containing "tool")
   into the DOM. */

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  ToolkitIconFrame: () => <span data-testid="icon" />,
}));

const ENTRIES = [
  {
    id: "notion",
    toolkitId: "mcp.productivity.notion-remote",
    toolkitName: "Notion",
    toolkitDescription: "Read, search and summarize your pages and databases.",
    source: "mcp",
    category: "productivity",
    status: "available",
    installable: true,
    tools: [{ name: "notion_search", title: "Search pages", requiresConfirmation: false }],
    skills: [{ name: "summarize", title: "Summarize", description: "Summarize a page." }],
  },
  {
    id: "github",
    toolkitId: "mcp.dev.github-remote",
    toolkitName: "GitHub",
    toolkitDescription: "Repos, issues and pull requests, right in the chat.",
    source: "mcp",
    category: "dev",
    status: "available",
    installable: true,
    tools: [{ name: "review_pr", title: "Review pull request", requiresConfirmation: false }],
    skills: [{ name: "review-pr", title: "Review PR", description: "Review a pull request." }],
  },
];

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => ({
  __esModule: true,
  listMcpStoreEntries: jest.fn(),
  searchMcpStoreEntries: jest.fn(),
  resolveMcpIcon: jest.fn(),
}));

const {
  listMcpStoreEntries,
  searchMcpStoreEntries,
} = require("../../../SERVICEs/mcp_toolkit_store");

/* react-scripts sets `resetMocks: true` — every jest.fn() implementation is
   wiped before EACH test, so implementations must be re-established here
   rather than in the jest.mock factory above (same pattern as
   plugins_shell.test.js). */
beforeEach(() => {
  listMcpStoreEntries.mockReturnValue(ENTRIES);
  searchMcpStoreEntries.mockImplementation((entries, query, category) => {
    const q = (query || "").trim().toLowerCase();
    return entries.filter((e) => {
      if (category && category !== "all" && e.category !== category) return false;
      if (!q) return true;
      return (e.toolkitName || "").toLowerCase().includes(q);
    });
  });
  require("../../../SERVICEs/mcp_toolkit_store").resolveMcpIcon.mockReturnValue({
    type: "builtin",
    name: "plug",
  });
});

const renderPage = (props = {}) => {
  listMcpStoreEntries.mockReturnValue(ENTRIES);
  return render(
    <PluginsCategoriesPage
      isDark={false}
      onOpenDetail={() => {}}
      installedIds={new Set()}
      installingIds={new Set()}
      {...props}
    />,
  );
};

describe("PluginsCategoriesPage — fixed header", () => {
  test("renders the 22px title and a row per matched entry", () => {
    renderPage();

    expect(screen.getByText("Categories")).toBeInTheDocument();
    expect(screen.getByTestId("category-row-notion")).toBeInTheDocument();
    expect(screen.getByTestId("category-row-github")).toBeInTheDocument();
    expect(screen.getByText("/summarize")).toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — pill filter", () => {
  test("category pill narrows the tile grid", () => {
    renderPage();

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dev" }));

    expect(screen.getByText("GitHub")).toBeInTheDocument();
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — tile click", () => {
  test("clicking a tile fires onOpenDetail with the entry id", () => {
    const onOpenDetail = jest.fn();
    renderPage({ onOpenDetail });

    fireEvent.click(screen.getByText("Notion"));

    expect(onOpenDetail).toHaveBeenCalledWith("notion");
  });
});

describe("PluginsCategoriesPage — vocabulary", () => {
  test("never renders the word 'tool' — plugin vocabulary only", () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/tool/i);
  });
});

/* C2 regression (review-mandated): a secrets-backed entry's tile pill reads
   "Set up" (usePluginInstallState's opensSetup) — clicking it must open the
   detail page to collect the secret, never fire a bare install. Exercises
   the real PluginTile + usePluginInstallState wiring this page uses (not a
   mock), so a regression in either would fail this test. */
describe("PluginsCategoriesPage — Set-up pill", () => {
  const SECRET_ENTRY = {
    id: "browser-use-local",
    toolkitId: "mcp.browser.browser-use-local",
    toolkitName: "Browser Use",
    toolkitDescription: "Local browser automation agent.",
    source: "mcp",
    category: "dev",
    status: "available",
    installable: true,
    mcp: { transport: "stdio" },
    secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
    tools: [],
  };

  test("clicking the Set-up pill opens detail instead of installing", () => {
    /* Deliberately not using the shared renderPage() helper — it resets
       listMcpStoreEntries back to the default ENTRIES fixture on every
       call, which would clobber this test's SECRET_ENTRY-only list. */
    listMcpStoreEntries.mockReturnValue([SECRET_ENTRY]);
    searchMcpStoreEntries.mockImplementation((entries) => entries);

    const onInstall = jest.fn();
    const onOpenDetail = jest.fn();
    render(
      <PluginsCategoriesPage
        isDark={false}
        onOpenDetail={onOpenDetail}
        installedIds={new Set()}
        installingIds={new Set()}
        onInstall={onInstall}
      />,
    );

    const pill = screen.getByText("Set up");
    fireEvent.click(pill);

    expect(onInstall).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledWith("browser-use-local");
  });
});

/* T5: the legacy "Custom MCP" store tab (toolkits_page.js's TOOLKIT_SUB_PAGES)
   is retired — its entry point demotes to a low-key footer link here and on
   PluginsInstalledPage, opening the same (unmodified) CustomMcpPage via the
   shell's onOpenCustomMcp callback. */
describe("PluginsCategoriesPage — custom MCP footer entry", () => {
  test("renders a low-key 'Add a custom plugin' footer entry", () => {
    renderPage();
    expect(screen.getByText(/Add a custom plugin/i)).toBeInTheDocument();
  });

  test("clicking the footer entry calls onOpenCustomMcp", () => {
    const onOpenCustomMcp = jest.fn();
    renderPage({ onOpenCustomMcp });

    fireEvent.click(screen.getByText(/Add a custom plugin/i));

    expect(onOpenCustomMcp).toHaveBeenCalledTimes(1);
  });
});
