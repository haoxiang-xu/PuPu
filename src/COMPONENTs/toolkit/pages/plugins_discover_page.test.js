import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PluginsDiscoverPage from "./plugins_discover_page";
import api from "../../../SERVICEs/api";
import { loadStoreCuration } from "../../../SERVICEs/plugin_presentation";
import { installStoreSkillPack, listStoreSkillPacks } from "../utils/skill_pack_store_install";
import {
  emitToolkitCatalogRefresh,
  subscribeToolkitCatalogRefresh,
} from "../../../SERVICEs/toolkit_catalog_refresh";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span aria-hidden="true" data-icon-name={src} />,
}));

/* useTranslation is left un-mocked: assertions read rendered English text,
   and an identity mock would leak key names (which contain "tool") into the
   vocabulary check. */

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  ...jest.requireActual("../components/toolkit_icon"),
  ToolkitIconFrame: () => <span data-testid="icon" />,
}));

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: { unchain: { listToolModalCatalog: jest.fn() } },
}));

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => ({
  __esModule: true,
  listMcpStoreEntries: jest.fn(),
  resolveMcpIcon: jest.fn(),
}));

jest.mock("../../../SERVICEs/plugin_presentation", () => {
  const actual = jest.requireActual("../../../SERVICEs/plugin_presentation");
  return {
    __esModule: true,
    toPluginPresentation: actual.toPluginPresentation,
    loadStoreCuration: jest.fn(),
  };
});

jest.mock("../utils/skill_pack_store_install", () => ({
  __esModule: true,
  listStoreSkillPacks: jest.fn(),
  installStoreSkillPack: jest.fn(),
  DEFAULT_SKILL_PACK_ICON: { type: "builtin", name: "command" },
}));

jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  subscribeToolkitCatalogRefresh: jest.fn(),
  emitToolkitCatalogRefresh: jest.fn(),
}));

jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

/* A fixed "today", so relative dates and the future-date cut are stable. */
jest.mock("../../../SERVICEs/store_latest", () => ({
  __esModule: true,
  ...jest.requireActual("../../../SERVICEs/store_latest"),
  todayIso: () => "2026-10-03",
}));

const { listMcpStoreEntries } = require("../../../SERVICEs/mcp_toolkit_store");

const NOTION = {
  id: "notion",
  toolkitId: "mcp.productivity.notion-remote",
  toolkitName: "Notion",
  toolkitDescription: "Read, search and summarize your pages and databases.",
  source: "mcp",
  category: "productivity",
  status: "available",
  installable: true,
  addedAt: "2026-09-22",
  tools: [{ name: "notion_search", title: "Search pages", requiresConfirmation: false }],
  skills: [{ name: "summarize", title: "Summarize", description: "Summarize a page." }],
};
const GITHUB = {
  id: "github",
  toolkitId: "mcp.dev.github-remote",
  toolkitName: "GitHub",
  toolkitDescription: "Repos, issues and pull requests, right in the chat.",
  source: "mcp",
  category: "dev",
  status: "available",
  installable: true,
  addedAt: "2026-09-13",
  secrets: [{ key: "GITHUB_TOKEN", label: "Token" }],
  tools: [],
  skills: [],
};
const FILESYSTEM = {
  id: "filesystem",
  toolkitId: "mcp.workspace.filesystem",
  toolkitName: "Filesystem",
  toolkitDescription: "Read and write files in a folder you choose.",
  source: "mcp",
  category: "workspace",
  status: "available",
  installable: true,
  addedAt: "2026-06-06",
  tools: [],
  skills: [],
};
const FIGMA_SOON = {
  id: "figma",
  toolkitId: "mcp.dev.figma-remote",
  toolkitName: "Figma",
  toolkitDescription: "Design files.",
  source: "mcp",
  category: "dev",
  status: "coming_soon",
  installable: false,
  addedAt: "2026-10-01",
  tools: [],
  skills: [],
};
const HUMANIZER = {
  id: "skillpack.humanizer",
  title: "Humanizer",
  blurb: "Revise pasted prose for clearer language.",
  review: { reviewedAt: "2026-09-22" },
};
const SUPERPOWERS = {
  id: "skillpack.superpowers-essentials",
  title: "Superpowers Essentials",
  blurb: "Methodology skills for building software.",
  review: { reviewedAt: "2026-07-18" },
};
const HUMANIZER_INSTALLED = {
  toolkitId: "skillpack.humanizer",
  toolkitName: "Humanizer",
  toolkitDescription: "Revise pasted prose for clearer language.",
  source: "skillpack",
  tools: [],
  skills: [{ name: "humanizer", title: "Humanizer", description: "Revise prose." }],
};
const CURATION = {
  featured: {
    pluginId: "mcp.dev.github-remote",
    kicker: "Editor's pick",
    headline: "GitHub, in the chat",
    blurb: "Browse repos and act on your code.",
    gradient: ["#6478f6", "#4a5bd8"],
  },
  essentials: [
    "mcp.productivity.notion-remote",
    "mcp.dev.github-remote",
    "skillpack.superpowers-essentials",
  ],
  collections: [
    {
      id: "research-kit",
      title: "Research Kit",
      blurb: "See, browse and extract.",
      gradient: ["#4cbe8b", "#2f9a68"],
      pluginIds: ["mcp.productivity.notion-remote", "mcp.workspace.filesystem"],
    },
  ],
  skillPacks: [],
};

const HUE = /154, 168, 255|37, 99, 235|124, 140, 248/;

beforeEach(() => {
  // react-scripts resets mock implementations before every test.
  api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
  listMcpStoreEntries.mockReturnValue([NOTION, GITHUB, FILESYSTEM, FIGMA_SOON]);
  listStoreSkillPacks.mockReturnValue([HUMANIZER, SUPERPOWERS]);
  loadStoreCuration.mockReturnValue(CURATION);
  subscribeToolkitCatalogRefresh.mockReturnValue(() => {});
});

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

const latestIds = () =>
  screen
    .getAllByTestId(/^discover-latest-/)
    .map((row) => row.getAttribute("data-testid").replace("discover-latest-", ""));

describe("Discover — title", () => {
  test("renders the fixed 'Discover' title", async () => {
    await renderPage();

    expect(screen.getByText("Discover")).toBeInTheDocument();
  });
});

describe("Discover — featured row", () => {
  test("shows the curated headline, blurb and the plugin's type", async () => {
    await renderPage();

    const featured = screen.getByTestId("discover-featured");
    expect(within(featured).getByText("GitHub, in the chat")).toBeInTheDocument();
    expect(within(featured).getByText("Browse repos and act on your code.")).toBeInTheDocument();
    expect(within(featured).getByTestId("type-tag")).toHaveTextContent("MCP");
  });

  test("carries no install pill — the whole row opens detail (owner decision 2026-07-18)", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    const featured = screen.getByTestId("discover-featured");
    expect(within(featured).queryAllByRole("button")).toHaveLength(0);

    fireEvent.click(featured);
    expect(onOpenDetail).toHaveBeenCalledWith("github");
  });

  test("a featured id found nowhere omits the row and its caption", async () => {
    loadStoreCuration.mockReturnValue({ ...CURATION, featured: { ...CURATION.featured, pluginId: "mcp.nope" } });
    await renderPage();

    expect(screen.queryByTestId("discover-featured")).not.toBeInTheDocument();
    expect(screen.queryByText("Featured")).not.toBeInTheDocument();
  });
});

describe("Discover — Latest", () => {
  test("lists the three newest across MCP servers and packs; same-day ties by name", async () => {
    await renderPage();

    // Humanizer and Notion share 2026-09-22; GitHub is 2026-09-13; Figma is
    // coming_soon and Filesystem is older.
    expect(latestIds()).toEqual([
      "skillpack.humanizer",
      "mcp.productivity.notion-remote",
      "mcp.dev.github-remote",
    ]);
  });

  test("each row says how long ago it landed, in the app's words", async () => {
    await renderPage();

    expect(within(screen.getByTestId("discover-latest-skillpack.humanizer")).getByText("11 days ago")).toBeInTheDocument();
    expect(within(screen.getByTestId("discover-latest-mcp.dev.github-remote")).getByText("3 weeks ago")).toBeInTheDocument();
  });

  test("a pack is tagged SKILL and an MCP server that ships a command is tagged MCP · SKILL", async () => {
    await renderPage();

    expect(within(screen.getByTestId("discover-latest-skillpack.humanizer")).getByTestId("type-tag")).toHaveTextContent("SKILL");
    expect(within(screen.getByTestId("discover-latest-mcp.productivity.notion-remote")).getByTestId("type-tag")).toHaveTextContent("MCP · SKILL");
  });

  test("a future-dated entry is never listed", async () => {
    listMcpStoreEntries.mockReturnValue([
      { ...NOTION, id: "future", toolkitId: "mcp.x.future", toolkitName: "Aaa Future", addedAt: "2099-01-01" },
      NOTION,
    ]);
    await renderPage();

    expect(latestIds()).not.toContain("mcp.x.future");
  });

  test("an old sidecar that sends no dates leaves Latest to the packs (SEQ-002 cell 2)", async () => {
    listMcpStoreEntries.mockReturnValue(
      [NOTION, GITHUB, FILESYSTEM].map(({ addedAt, ...rest }) => rest),
    );
    await renderPage();

    expect(latestIds()).toEqual(["skillpack.humanizer", "skillpack.superpowers-essentials"]);
  });

  test("with nothing dated at all, the band and its caption are left out", async () => {
    listMcpStoreEntries.mockReturnValue([NOTION, GITHUB].map(({ addedAt, ...rest }) => rest));
    listStoreSkillPacks.mockReturnValue([{ ...HUMANIZER, review: {} }]);
    await renderPage();

    expect(screen.queryByTestId("discover-section-latest")).not.toBeInTheDocument();
    expect(screen.queryAllByTestId(/^discover-latest-/)).toHaveLength(0);
  });

  test("GET on a pack runs the pack installer", async () => {
    installStoreSkillPack.mockResolvedValue({ toolkitName: "Humanizer", skills: [{}] });
    await renderPage();

    const row = screen.getByTestId("discover-latest-skillpack.humanizer");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: "GET" }));
    });

    expect(installStoreSkillPack).toHaveBeenCalledWith(HUMANIZER);
    expect(emitToolkitCatalogRefresh).toHaveBeenCalledWith({ source: "skill_pack_store_install" });
  });

  test("an installed pack shows OPEN and opens its installed detail", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [HUMANIZER_INSTALLED] });
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    const row = await screen.findByTestId("discover-latest-skillpack.humanizer");
    await waitFor(() => expect(within(row).getByRole("button", { name: "OPEN" })).toBeInTheDocument());
    expect(within(row).getByTestId("type-tag")).toHaveTextContent("SKILL");

    fireEvent.click(within(row).getByRole("button", { name: "OPEN" }));
    expect(onOpenDetail.mock.calls[0][0].raw.toolkitId).toBe("skillpack.humanizer");
  });

  test("reloads the catalog when a pack install announces itself, so GET turns into OPEN", async () => {
    await renderPage();
    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1);

    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [HUMANIZER_INSTALLED] });
    const onRefresh = subscribeToolkitCatalogRefresh.mock.calls[0][0];
    await act(async () => {
      onRefresh();
    });

    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(2);
    const row = screen.getByTestId("discover-latest-skillpack.humanizer");
    await waitFor(() => expect(within(row).getByRole("button", { name: "OPEN" })).toBeInTheDocument());
  });
});

describe("Discover — Essentials", () => {
  test("one row per resolved essential, including a not-yet-installed pack", async () => {
    await renderPage();

    expect(screen.getByTestId("discover-essential-mcp.productivity.notion-remote")).toBeInTheDocument();
    expect(screen.getByTestId("discover-essential-mcp.dev.github-remote")).toBeInTheDocument();
    const pack = screen.getByTestId("discover-essential-skillpack.superpowers-essentials");
    expect(within(pack).getByTestId("type-tag")).toHaveTextContent("SKILL");
  });

  test("'See all' goes to Browse › All", async () => {
    const onNavigate = jest.fn();
    await renderPage({ onNavigate });

    fireEvent.click(screen.getByRole("button", { name: /see all/i }));
    expect(onNavigate).toHaveBeenCalledWith("cat:all");
  });

  test("with no onNavigate prop, no 'See all' renders", async () => {
    await renderPage();

    expect(screen.queryByRole("button", { name: /see all/i })).not.toBeInTheDocument();
  });

  test("a secrets-backed essential's pill opens detail instead of installing", async () => {
    const onOpenDetail = jest.fn();
    const onInstall = jest.fn();
    await renderPage({ onOpenDetail, onInstall });

    const row = screen.getByTestId("discover-essential-mcp.dev.github-remote");
    fireEvent.click(within(row).getByRole("button", { name: /set up/i }));

    expect(onOpenDetail).toHaveBeenCalledWith("github");
    expect(onInstall).not.toHaveBeenCalled();
  });
});

describe("Discover — Collections", () => {
  test("one row per collection with its plugin count, expanding to its members", async () => {
    await renderPage();

    const collection = screen.getByTestId("collection-research-kit");
    expect(within(collection).getByText("Research Kit")).toBeInTheDocument();
    expect(within(collection).getByText("· 2 plugins")).toBeInTheDocument();
    expect(collection).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(collection);

    expect(collection).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("discover-member-research-kit-mcp.workspace.filesystem")).toBeInTheDocument();
  });

  test("a collection whose ids are all missing is left out", async () => {
    loadStoreCuration.mockReturnValue({
      ...CURATION,
      collections: [{ ...CURATION.collections[0], pluginIds: ["mcp.nope"] }],
    });
    await renderPage();

    expect(screen.queryByTestId("collection-research-kit")).not.toBeInTheDocument();
    expect(screen.queryByText("Collections")).not.toBeInTheDocument();
  });

  test("there is no 'Install all' (owner decision 2026-07-21)", async () => {
    await renderPage();

    expect(screen.queryByRole("button", { name: /install all|get all/i })).not.toBeInTheDocument();
  });
});

describe("Discover — curation tolerance", () => {
  test("missing ids skip silently", async () => {
    loadStoreCuration.mockReturnValue({ ...CURATION, essentials: ["mcp.nope", "mcp.productivity.notion-remote"] });
    await renderPage();

    expect(screen.getAllByTestId(/^discover-essential-/)).toHaveLength(1);
  });

  test("an empty store renders the title and nothing else, without crashing", async () => {
    loadStoreCuration.mockReturnValue({ featured: null, essentials: [], collections: [], skillPacks: [] });
    listMcpStoreEntries.mockReturnValue([]);
    listStoreSkillPacks.mockReturnValue([]);
    await renderPage();

    expect(screen.getByText("Discover")).toBeInTheDocument();
    ["Featured", "Latest", "Essentials", "Collections"].forEach((label) =>
      expect(screen.queryByText(label)).not.toBeInTheDocument(),
    );
  });
});

describe("Discover — the store's language", () => {
  test("the WebGL cards are gone", async () => {
    await renderPage();

    expect(screen.queryByTestId("discover-featured-aurora")).not.toBeInTheDocument();
    expect(screen.queryByTestId("essentials-grid")).not.toBeInTheDocument();
  });

  test("nothing on the page carries a hue", async () => {
    const { container } = await renderPage();

    expect(container.querySelector(".scrollable").outerHTML).not.toMatch(HUE);
  });

  test("per-item copy never says 'tool' (type tags are exempt)", async () => {
    const { container } = await renderPage();

    const body = container.querySelector(".scrollable").cloneNode(true);
    body.querySelectorAll('[data-testid="type-tag"]').forEach((tag) => tag.remove());
    expect(body.textContent).not.toMatch(/tool/i);
  });

  test("keeps trust badges out of every section", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("collection-research-kit"));

    expect(screen.queryAllByTestId("plugin-trust-badge")).toHaveLength(0);
  });

  test("shows the shell's install error and a pack install error", async () => {
    installStoreSkillPack.mockRejectedValue(Object.assign(new Error("x"), { code: "integrity" }));
    await renderPage({ installError: { message: "Network down" } });

    expect(screen.getByText("Network down")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(screen.getByTestId("discover-latest-skillpack.humanizer")).getByRole("button", { name: "GET" }),
      );
    });
    expect(screen.getByText(/reviewed fingerprint/i)).toBeInTheDocument();
  });
});
