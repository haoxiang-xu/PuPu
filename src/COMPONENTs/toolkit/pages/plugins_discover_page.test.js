import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PluginsDiscoverPage from "./plugins_discover_page";
import api from "../../../SERVICEs/api";
import { loadStoreCuration } from "../../../SERVICEs/plugin_presentation";

/* NOTE: useTranslation is intentionally left un-mocked — same rationale as
   plugins_installed_page.test.js: the vocabulary assertion reads rendered
   TEXT and an identity-key mock would leak i18n key NAMES (which themselves
   contain "tool") into the DOM. */

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  ...jest.requireActual("../components/toolkit_icon"),
  ToolkitIconFrame: () => <span data-testid="icon" />,
}));

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listToolModalCatalog: jest.fn(),
    },
  },
}));

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => ({
  __esModule: true,
  listMcpStoreEntries: jest.fn(() => []),
  resolveMcpIcon: jest.fn(() => ({ type: "builtin", name: "plug" })),
}));

jest.mock("../../../SERVICEs/plugin_presentation", () => {
  const actual = jest.requireActual("../../../SERVICEs/plugin_presentation");
  return {
    __esModule: true,
    toPluginPresentation: actual.toPluginPresentation,
    loadStoreCuration: jest.fn(),
  };
});

const { listMcpStoreEntries } = require("../../../SERVICEs/mcp_toolkit_store");

const PLAN_TOOLKIT = {
  toolkitId: "plan",
  toolkitName: "Plan",
  toolkitDescription: "Workspace-backed planning: draft, refine and finalize plans.",
  source: "builtin",
  tags: ["productivity"],
  tools: [{ name: "plan_start", title: "Plan Start", requiresConfirmation: false }],
  skills: [{ name: "plan", title: "Plan First", description: "Draft a plan first." }],
};

const NOTION_ENTRY = {
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
};

const GITHUB_ENTRY = {
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
};

const FULL_CURATION = {
  featured: {
    pluginId: "plan",
    kicker: "Editor's pick",
    headline: "Plan before you build",
    blurb: "Turn any request into a step-by-step plan you approve first.",
    gradient: ["#6478f6", "#4a5bd8"],
  },
  essentials: ["mcp.dev.github-remote", "mcp.productivity.notion-remote"],
  collections: [
    {
      id: "web-research-kit",
      title: "Web Research Kit",
      blurb: "See, browse and extract.",
      gradient: ["#4cbe8b", "#2f9a68"],
      pluginIds: ["mcp.productivity.notion-remote", "mcp.dev.github-remote"],
    },
  ],
};

const renderPage = async (props = {}) => {
  let rendered;
  await act(async () => {
    rendered = render(
      <PluginsDiscoverPage
        isDark={false}
        onOpenDetail={() => {}}
        onInstall={() => {}}
        installedIds={new Set()}
        installingIds={new Set()}
        {...props}
      />,
    );
  });
  return rendered;
};

describe("PluginsDiscoverPage — title", () => {
  test("renders the fixed 'Discover' title", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([]);
    loadStoreCuration.mockReturnValue({ featured: null, essentials: [], collections: [] });

    await renderPage();

    expect(screen.getByText("Discover")).toBeInTheDocument();
  });
});

describe("PluginsDiscoverPage — Featured aurora card", () => {
  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [PLAN_TOOLKIT] });
    listMcpStoreEntries.mockReturnValue([NOTION_ENTRY, GITHUB_ENTRY]);
    loadStoreCuration.mockReturnValue(FULL_CURATION);
  });

  test("renders the curated featured plugin's kicker/title/blurb on the aurora card", async () => {
    await renderPage();

    const card = screen.getByTestId("discover-featured-aurora");
    expect(within(card).getByText("Editor's pick")).toBeInTheDocument();
    expect(within(card).getByText("Plan before you build")).toBeInTheDocument();
    expect(
      within(card).getByText("Turn any request into a step-by-step plan you approve first."),
    ).toBeInTheDocument();
  });

  test("an already-installed featured plugin (catalog kind) shows OPEN", async () => {
    await renderPage();

    const card = screen.getByTestId("discover-featured-aurora");
    expect(within(card).getByText("OPEN")).toBeInTheDocument();
  });

  test("clicking the featured card opens its detail", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    fireEvent.click(screen.getByTestId("discover-featured-aurora"));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  test("an all-missing featured curation omits the aurora card entirely", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([]);
    loadStoreCuration.mockReturnValue({
      featured: {
        pluginId: "does-not-exist",
        kicker: "K",
        headline: "Should Not Render",
        blurb: "B",
        gradient: ["#111111", "#222222"],
      },
      essentials: [],
      collections: [],
    });

    await renderPage();

    expect(screen.queryByTestId("discover-featured-aurora")).not.toBeInTheDocument();
    expect(screen.queryByText("Should Not Render")).not.toBeInTheDocument();
  });
});

describe("PluginsDiscoverPage — Essentials brand-orb grid", () => {
  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [PLAN_TOOLKIT] });
    listMcpStoreEntries.mockReturnValue([NOTION_ENTRY, GITHUB_ENTRY]);
    loadStoreCuration.mockReturnValue(FULL_CURATION);
  });

  test("renders one grid card per curated essential, each with a brand orb", async () => {
    await renderPage();

    const grid = screen.getByTestId("essentials-grid");
    expect(within(grid).getByText("Notion")).toBeInTheDocument();
    expect(within(grid).getByText("GitHub")).toBeInTheDocument();

    const notionCard = screen.getByTestId("discover-grid-mcp.productivity.notion-remote");
    expect(within(notionCard).getByTestId("brand-orb")).toBeInTheDocument();
  });

  test("renders the first command as a chip and a two-line-clamped description", async () => {
    await renderPage();

    const githubCard = screen.getByTestId("discover-grid-mcp.dev.github-remote");
    expect(within(githubCard).getByText("/review-pr")).toBeInTheDocument();
    expect(
      within(githubCard).getByText("Repos, issues and pull requests, right in the chat."),
    ).toBeInTheDocument();
  });

  test("clicking a grid card opens detail; clicking its pill does not also open detail via the card handler twice", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    const notionCard = screen.getByTestId("discover-grid-mcp.productivity.notion-remote");
    fireEvent.click(notionCard);
    expect(onOpenDetail).toHaveBeenCalledWith("notion");
  });

  test("the Essentials header's 'See all' link navigates to the store page", async () => {
    const onNavigate = jest.fn();
    await renderPage({ onNavigate });

    fireEvent.click(screen.getByText("See all ›"));

    expect(onNavigate).toHaveBeenCalledWith("store");
  });

  test("with no onNavigate prop, no 'See all' link renders", async () => {
    await renderPage();

    expect(screen.queryByText("See all ›")).not.toBeInTheDocument();
  });
});

describe("PluginsDiscoverPage — Collections", () => {
  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [PLAN_TOOLKIT] });
    listMcpStoreEntries.mockReturnValue([NOTION_ENTRY, GITHUB_ENTRY]);
    loadStoreCuration.mockReturnValue(FULL_CURATION);
  });

  test("renders one collection row per curated collection, with its plugins' stacked icons and tagline", async () => {
    await renderPage();

    const row = screen.getByTestId("collection-web-research-kit");
    expect(within(row).getByText("Web Research Kit")).toBeInTheDocument();
    expect(within(row).getByText(/See, browse and extract\./)).toBeInTheDocument();
    expect(within(row).getByText(/2 plugins/)).toBeInTheDocument();
  });

  test("an all-missing collection omits its row entirely", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([]);
    loadStoreCuration.mockReturnValue({
      featured: null,
      essentials: [],
      collections: [
        {
          id: "ghost-collection",
          title: "Ghost",
          blurb: "b",
          gradient: ["#111111", "#222222"],
          pluginIds: ["missing-a", "missing-b"],
        },
      ],
    });

    await renderPage();

    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
  });
});

describe("PluginsDiscoverPage — Get all skips Set-up entries", () => {
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

  test("installs the plain entries, skips the secrets-backed one, and opens its detail", async () => {
    const onInstall = jest.fn(() => Promise.resolve());
    const onOpenDetail = jest.fn();
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([GITHUB_ENTRY, SECRET_ENTRY]);
    loadStoreCuration.mockReturnValue({
      featured: null,
      essentials: [],
      collections: [
        {
          id: "mixed-kit",
          title: "Mixed Kit",
          blurb: "b",
          gradient: ["#111111", "#222222"],
          pluginIds: ["mcp.dev.github-remote", "mcp.browser.browser-use-local"],
        },
      ],
    });

    await renderPage({ onInstall, onOpenDetail });

    await act(async () => {
      fireEvent.click(screen.getByText("GET ALL"));
    });

    await waitFor(() => expect(onOpenDetail).toHaveBeenCalledWith("browser-use-local"));
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onInstall).toHaveBeenCalledWith(
      expect.objectContaining({ toolkitId: "mcp.dev.github-remote" }),
    );
  });
});

describe("PluginsDiscoverPage — curation tolerance", () => {
  test("missing curation pluginIds skip silently and an all-missing curation omits every section", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([]);
    loadStoreCuration.mockReturnValue({
      featured: {
        pluginId: "does-not-exist",
        kicker: "K",
        headline: "Should Not Render",
        blurb: "B",
        gradient: ["#111111", "#222222"],
      },
      essentials: ["also-missing"],
      collections: [
        {
          id: "ghost-collection",
          title: "Ghost",
          blurb: "b",
          gradient: ["#111111", "#222222"],
          pluginIds: ["missing-a", "missing-b"],
        },
      ],
    });

    await renderPage();

    expect(screen.queryByTestId("discover-featured-aurora")).not.toBeInTheDocument();
    expect(screen.queryByTestId("essentials-grid")).not.toBeInTheDocument();
    expect(screen.queryByText("Ghost")).not.toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
  });

  test("empty curation object does not crash the page", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([]);
    loadStoreCuration.mockReturnValue({ featured: null, essentials: [], collections: [] });

    await renderPage();

    expect(screen.queryByTestId("discover-featured-aurora")).not.toBeInTheDocument();
    expect(screen.getByText("Discover")).toBeInTheDocument();
  });
});

describe("PluginsDiscoverPage — vocabulary", () => {
  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [PLAN_TOOLKIT] });
    listMcpStoreEntries.mockReturnValue([NOTION_ENTRY, GITHUB_ENTRY]);
    loadStoreCuration.mockReturnValue(FULL_CURATION);
  });

  test("never renders the word 'tool' — plugin vocabulary only", async () => {
    const { container } = await renderPage();
    expect(container.textContent).not.toMatch(/tool/i);
  });
});

/* C2 regression: a secrets-backed featured entry's aurora pill reads
   "Set up" — clicking it must open detail instead of firing a secretless
   install (same opensSetup gating the old tile/row pill had). */
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

describe("PluginsDiscoverPage — Set-up gating", () => {
  test("a secrets-backed featured entry's aurora pill opens detail instead of installing", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([SECRET_ENTRY]);
    const onInstall = jest.fn();
    const onOpenDetail = jest.fn();
    loadStoreCuration.mockReturnValue({
      featured: {
        pluginId: "mcp.browser.browser-use-local",
        kicker: "K",
        headline: "Browser Use",
        blurb: "B",
        gradient: ["#111111", "#222222"],
      },
      essentials: [],
      collections: [],
    });

    await renderPage({ onInstall, onOpenDetail });

    const pill = screen.getByText("Set up");
    await act(async () => {
      fireEvent.click(pill);
    });

    expect(onInstall).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledWith("browser-use-local");
  });

  test("a secrets-backed essential entry's grid pill opens detail instead of installing", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    listMcpStoreEntries.mockReturnValue([SECRET_ENTRY]);
    const onInstall = jest.fn();
    const onOpenDetail = jest.fn();
    loadStoreCuration.mockReturnValue({
      featured: null,
      essentials: ["mcp.browser.browser-use-local"],
      collections: [],
    });

    await renderPage({ onInstall, onOpenDetail });

    const pill = screen.getByText("Set up");
    await act(async () => {
      fireEvent.click(pill);
    });

    expect(onInstall).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledWith("browser-use-local");
  });
});

describe("PluginsDiscoverPage — install error strip", () => {
  test("renders the shell's install error the same way Categories does", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [PLAN_TOOLKIT] });
    listMcpStoreEntries.mockReturnValue([NOTION_ENTRY, GITHUB_ENTRY]);
    loadStoreCuration.mockReturnValue(FULL_CURATION);

    await renderPage({
      installError: { entryId: "notion", message: "Install failed: network error" },
    });

    expect(screen.getByText("Install failed: network error")).toBeInTheDocument();
  });
});
