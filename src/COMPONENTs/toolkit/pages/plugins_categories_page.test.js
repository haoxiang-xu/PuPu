import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PluginsCategoriesPage from "./plugins_categories_page";
import api from "../../../SERVICEs/api";
import { categoryCounts } from "../../../SERVICEs/store_categories";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span aria-hidden="true" data-icon-name={src} />,
}));

/* NOTE: useTranslation is intentionally left un-mocked, same rationale as
   plugins_installed_page.test.js — the vocabulary assertion reads rendered
   TEXT and an identity-key mock would leak key NAMES (containing "tool")
   into the DOM. */

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

jest.mock("../../../SERVICEs/toolkit_catalog_refresh", () => ({
  __esModule: true,
  subscribeToolkitCatalogRefresh: jest.fn(() => () => {}),
  emitToolkitCatalogRefresh: jest.fn(),
}));

jest.mock("../../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn(), error: jest.fn() },
}));

/* The store skill-pack half (S6b) is mocked so the page's own tests stay
   decoupled from the real curation JSON — the dedicated describe below
   re-arms listStoreSkillPacks with its own fixture. The orchestration
   itself is covered by skill_pack_store_install.test.js. */
jest.mock("../utils/skill_pack_store_install", () => ({
  __esModule: true,
  listStoreSkillPacks: jest.fn(() => []),
  installStoreSkillPack: jest.fn(),
}));

const {
  listStoreSkillPacks,
  installStoreSkillPack,
} = require("../utils/skill_pack_store_install");

/* Scoped to just isBaseToolkitId (the only thing this page needs from
   plugin_actions.js) — the real module also pulls in mcp_install.js and
   default_toolkit_store.js, which this page never touches. None of this
   page's fixtures use a base-toolkit id, so a static false is equivalent to
   the real predicate for every case exercised here; plugin_actions.js's own
   behavior is covered by plugin_actions.test.js. */
jest.mock("../utils/plugin_actions", () => ({
  __esModule: true,
  isBaseToolkitId: () => false,
}));

/* ── Store registry half of the union ── */
const REGISTRY_ENTRIES = [
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
    id: "aws",
    toolkitId: "mcp.devops.aws",
    toolkitName: "AWS",
    toolkitDescription: "Manage cloud infrastructure.",
    source: "mcp",
    category: "devops",
    status: "available",
    installable: true,
    tools: [{ name: "aws_describe", title: "Describe resources", requiresConfirmation: false }],
    skills: [],
  },
];

/* ── Installed/builtin catalog half of the union ── */
const CATALOG_PLAN = {
  toolkitId: "plan",
  toolkitName: "Plan",
  toolkitDescription: "Workspace-backed planning: draft, refine and finalize step-by-step plans.",
  source: "builtin",
  tools: [{ name: "plan_start", title: "Plan Start", requiresConfirmation: false }],
  skills: [{ name: "plan", title: "Plan First", description: "Draft a plan first." }],
};
const CATALOG_CORE = {
  toolkitId: "agent_reach",
  toolkitName: "Agent Reach",
  toolkitDescription: "Reach out to other agents.",
  source: "builtin",
  tools: [{ name: "reach", title: "Reach", requiresConfirmation: false }],
  skills: [],
};
/* Same toolkitId as the REGISTRY_ENTRIES "notion" entry — this is the
   already-installed duplicate the union must dedupe down to the registry
   row only. */
const CATALOG_NOTION_INSTALLED = {
  toolkitId: "mcp.productivity.notion-remote",
  toolkitName: "Notion",
  toolkitDescription: "Read, search and summarize your pages and databases.",
  source: "mcp",
  tools: [{ name: "notion_search", title: "Search pages", requiresConfirmation: false }],
  skills: [{ name: "summarize", title: "Summarize", description: "Summarize a page." }],
};
/* An MCP install with no matching registry entry (e.g. a custom server) —
   catalog-only, must still land under the MCP segment with an OPEN pill.
   Name deliberately avoids the substring "tool" (see the vocabulary test
   below). */
const CATALOG_CUSTOM_MCP = {
  toolkitId: "mcp.custom.home-bridge",
  toolkitName: "Home Bridge",
  toolkitDescription: "A locally installed custom MCP server.",
  source: "mcp",
  tools: [],
  skills: [],
};

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => ({
  __esModule: true,
  listMcpStoreEntries: jest.fn(),
  searchMcpStoreEntries: jest.fn(),
  resolveMcpIcon: jest.fn(),
  withMcpStoreIcon: (tk) => tk,
}));

const {
  listMcpStoreEntries,
  searchMcpStoreEntries,
} = require("../../../SERVICEs/mcp_toolkit_store");

/* react-scripts sets `resetMocks: true` — every jest.fn() implementation is
   wiped before EACH test, so implementations must be re-established here
   rather than in the jest.mock factory above (same pattern as
   plugins_shell.test.js / plugins_installed_page.test.js). */
beforeEach(() => {
  listStoreSkillPacks.mockReturnValue([]);
  listMcpStoreEntries.mockReturnValue(REGISTRY_ENTRIES);
  searchMcpStoreEntries.mockImplementation((entries, query) => {
    const q = (query || "").trim().toLowerCase();
    return entries.filter((e) => {
      if (e.status === "deprecated" || e.deprecated === true) return false;
      if (!q) return true;
      return (e.toolkitName || "").toLowerCase().includes(q);
    });
  });
  require("../../../SERVICEs/mcp_toolkit_store").resolveMcpIcon.mockReturnValue({
    type: "builtin",
    name: "plug",
  });
  api.unchain.listToolModalCatalog.mockReset();
  api.unchain.listToolModalCatalog.mockResolvedValue({
    toolkits: [CATALOG_PLAN, CATALOG_CORE, CATALOG_NOTION_INSTALLED, CATALOG_CUSTOM_MCP],
  });
});

const renderPage = async (props = {}) => {
  let rendered;
  await act(async () => {
    rendered = render(
      <PluginsCategoriesPage
        isDark={false}
        onOpenDetail={() => {}}
        installedIds={new Set()}
        installingIds={new Set()}
        {...props}
      />,
    );
  });
  return rendered;
};

describe("PluginsCategoriesPage — header", () => {
  test("titles the page with its category's label", async () => {
    await renderPage({ category: "devops" });

    expect(screen.getByText("DevOps")).toBeInTheDocument();
  });

  test("All is titled All", async () => {
    await renderPage();

    expect(screen.getByText("All")).toBeInTheDocument();
  });

  test("the type segmented control is gone — type is a tag on the row now", async () => {
    await renderPage();

    expect(screen.queryByRole("button", { name: "Toolkits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MCP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skills" })).not.toBeInTheDocument();
  });

  test("defaults to All — the unified directory with no narrowing", async () => {
    await renderPage();

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());
    expect(screen.getByText("Agent Reach")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());
  });
});

describe("PluginsCategoriesPage — category filtering", () => {
  test("a category lists only the registry entries in it", async () => {
    await renderPage({ category: "devops" });

    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
  });

  test("catalog-only rows carry no category, so no category page lists them", async () => {
    await renderPage({ category: "devops" });
    await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalled());

    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Reach")).not.toBeInTheDocument();
    expect(screen.queryByText("Home Bridge")).not.toBeInTheDocument();
  });

  test("an entry with a category we do not recognise is reachable under All and nowhere else", async () => {
    listMcpStoreEntries.mockReturnValue([
      ...REGISTRY_ENTRIES,
      {
        id: "mystery",
        toolkitId: "mcp.misc.mystery",
        toolkitName: "Mystery",
        toolkitDescription: "Carries a category the store does not know.",
        source: "mcp",
        category: "nonsense",
        status: "available",
        installable: true,
        tools: [],
        skills: [],
      },
    ]);

    const { unmount } = await renderPage({ category: "all" });
    expect(screen.getByText("Mystery")).toBeInTheDocument();
    unmount();

    await renderPage({ category: "devops" });
    expect(screen.queryByText("Mystery")).not.toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — type tags", () => {
  test("rows carry their type, and a plugin that is two types carries both tags", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    // Notion: an MCP server that also ships a /summarize command.
    const notion = screen.getByTestId("category-row-notion");
    expect(within(notion).getByTestId("type-tag").textContent).toMatch(/MCP/);
    expect(within(notion).getByTestId("type-tag").textContent).toMatch(/SKILL/);

    // Plan: a builtin toolkit that also ships /plan.
    const plan = screen.getByTestId("category-row-plan");
    expect(within(plan).getByTestId("type-tag").textContent).toMatch(/TOOLKIT/);
    expect(within(plan).getByTestId("type-tag").textContent).toMatch(/SKILL/);

    // AWS: just an MCP server.
    const aws = screen.getByTestId("category-row-aws");
    expect(within(aws).getByTestId("type-tag").textContent).toBe("MCP");
  });
});

describe("PluginsCategoriesPage — union de-dupe", () => {
  test("an id present in both the registry and the catalog renders exactly one row", async () => {
    await renderPage();

    await waitFor(() =>
      expect(api.unchain.listToolModalCatalog).toHaveBeenCalled(),
    );
    /* The surviving row is keyed by the registry entry's `id` ("notion"),
       not the shared toolkitId — the catalog-side duplicate was dropped
       entirely, not merely hidden. */
    expect(screen.getAllByTestId("category-row-notion")).toHaveLength(1);
  });

  test("the surviving row is the registry entry (drives the install pill), marked installed via installedIds", async () => {
    await renderPage({
      installedIds: new Set(["mcp.productivity.notion-remote"]),
    });

    await waitFor(() =>
      expect(api.unchain.listToolModalCatalog).toHaveBeenCalled(),
    );
    const row = screen.getByTestId("category-row-notion");
    expect(within(row).getByText("OPEN")).toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — catalog-only OPEN row", () => {
  test("a catalog-only builtin toolkit gets the quiet OPEN pill instead of GET", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    const row = screen.getByTestId("category-row-plan");
    expect(within(row).getByText("OPEN")).toBeInTheDocument();
  });

  test("clicking the catalog-only row's OPEN pill calls onOpenDetail with a presentation-shaped object", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    fireEvent.click(within(screen.getByTestId("category-row-plan")).getByText("OPEN"));

    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    const arg = onOpenDetail.mock.calls[0][0];
    expect(arg.id).toBe("plan");
    expect(arg.raw.toolkitId).toBe("plan");
  });
});

/* store-final (2026-07-17): the theme pill row (dev/devops/productivity/…)
   from the pre-final design is retired entirely — the only filter left is
   the type-segment control. */
describe("PluginsCategoriesPage — theme pills retired", () => {
  test("no in-page category pill row renders — the sidebar rail is the only category control", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("AWS")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: "DevOps" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dev" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Productivity" })).not.toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — row click", () => {
  test("clicking a registry row fires onOpenDetail with the entry id", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });

    fireEvent.click(screen.getByText("Notion"));

    expect(onOpenDetail).toHaveBeenCalledWith("notion");
  });
});

describe("PluginsCategoriesPage — release gating", () => {
  test("hides needs-review entries from the ordinary Store", async () => {
    const needsReviewEntry = {
      id: "external-review",
      toolkitId: "mcp.external.review",
      toolkitName: "External Review",
      toolkitDescription: "Pending review.",
      source: "mcp_registry",
      status: "needs_review",
      installable: false,
      tools: [],
    };
    listMcpStoreEntries.mockReturnValue([...REGISTRY_ENTRIES, needsReviewEntry]);
    searchMcpStoreEntries.mockImplementation((entries) => entries);

    await renderPage();

    expect(screen.queryByText("External Review")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Needs review" })).not.toBeInTheDocument();
  });

  test("a coming-soon OAuth entry never exposes Connect", async () => {
    const comingSoonEntry = {
      id: "remote-pending",
      toolkitId: "mcp.remote.pending",
      toolkitName: "Remote Pending",
      toolkitDescription: "Provider approval pending.",
      source: "mcp",
      status: "coming_soon",
      installable: false,
      auth: { oauth: { releaseStatus: "ready" } },
      tools: [],
    };
    listMcpStoreEntries.mockReturnValue([comingSoonEntry]);
    searchMcpStoreEntries.mockImplementation((entries) => entries);

    await renderPage();

    const row = screen.getByTestId("category-row-remote-pending");
    expect(within(row).getByText("Coming soon")).toBeInTheDocument();
    expect(within(row).queryByText("Connect")).not.toBeInTheDocument();
    expect(
      within(row).getByRole("button", { name: "Coming soon" }),
    ).toBeDisabled();
  });
});

/* store-final (2026-07-17): "Toolkits"/"MCP"/"Skills" are now ALWAYS on
   screen as the segmented control's own CEO-approved labels (vocabulary
   rule: category NAMES are approved, only PER-ITEM copy must avoid
   "tool/toolkit/skill") — so this guard now scopes to the scrollable rows
   area only, not the whole container. */
describe("PluginsCategoriesPage — vocabulary", () => {
  test("per-item copy never renders the word 'tool' (type tags are exempt)", async () => {
    const { container } = await renderPage();
    await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());

    /* The TOOLKIT and SKILL type tags are the owner-approved design (#207),
       not per-item copy, so they are lifted out before the check. */
    const rowsArea = container.querySelector(".scrollable").cloneNode(true);
    rowsArea.querySelectorAll('[data-testid="type-tag"]').forEach((tag) => tag.remove());
    expect(rowsArea.textContent).not.toMatch(/tool/i);
  });
});

describe("PluginsCategoriesPage — trust badges", () => {
  test("keeps trust badges out of registry, builtin and custom MCP rows", async () => {
    const onOpenDetail = jest.fn();
    const onInstall = jest.fn();
    await renderPage({ onOpenDetail, onInstall });
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());

    expect(screen.queryByTestId("plugin-trust-badge")).toBeNull();
    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(onInstall).not.toHaveBeenCalled();
  });
});

/* C2 regression (review-mandated, carried over from the pre-split
   Categories page): a secrets-backed entry's row pill reads "Set up"
   (usePluginInstallState's opensSetup) — clicking it must open the detail
   page to collect the secret, never fire a bare install. Exercises the real
   PluginListRow + PluginInstallPill + usePluginInstallState wiring this page
   uses (not a mock), so a regression in any of them would fail this test. */
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

  test("clicking the Set-up pill opens detail instead of installing", async () => {
    listMcpStoreEntries.mockReturnValue([SECRET_ENTRY]);
    searchMcpStoreEntries.mockImplementation((entries) => entries);
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });

    const onInstall = jest.fn();
    const onOpenDetail = jest.fn();
    await renderPage({ onInstall, onOpenDetail });

    const pill = screen.getByText("Set up");
    fireEvent.click(pill);

    expect(onInstall).not.toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledWith("browser-use-local");
  });
});

/* T5: the legacy "Custom MCP" store tab (toolkits_page.js's TOOLKIT_SUB_PAGES)
   is retired — its entry point demotes to a low-key footer link here (MCP
   segment only, since a custom entry is always an MCP server) and on
   PluginsInstalledPage, opening the same (unmodified) CustomMcpPage via the
   shell's onOpenCustomMcp callback. */
describe("PluginsCategoriesPage — custom MCP footer entry", () => {
  test("renders the footer entry on All", async () => {
    await renderPage({ category: "all" });

    expect(screen.getByText(/Add a custom plugin/i)).toBeInTheDocument();
  });

  test("does not render the footer entry on a specific category", async () => {
    await renderPage({ category: "devops" });

    expect(screen.queryByText(/Add a custom plugin/i)).not.toBeInTheDocument();
  });

  test("clicking the footer entry calls onOpenCustomMcp", async () => {
    const onOpenCustomMcp = jest.fn();
    await renderPage({ category: "all", onOpenCustomMcp });

    fireEvent.click(screen.getByText(/Add a custom plugin/i));

    expect(onOpenCustomMcp).toHaveBeenCalledTimes(1);
  });
});

describe("PluginsCategoriesPage — trademark disclaimer", () => {
  test("shows on a page that lists registry servers", async () => {
    await renderPage({ category: "devops" });

    expect(screen.getByText(/not affiliated with or endorsed by them/i)).toBeInTheDocument();
  });

  test("is absent from a page that lists none", async () => {
    await renderPage({ category: "dev" });

    expect(screen.queryByText(/not affiliated with or endorsed by them/i)).not.toBeInTheDocument();
  });
});

describe("PluginsCategoriesPage — row layout", () => {
  test("the command chip (when present) stays after the name and the description stays the tagline", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Notion")).toBeInTheDocument());

    /* The chip-first reorder belonged to the retired Skills segment. Notion
       still carries a /summarize command, so its chip renders — name-first —
       and the description is the plugin's tagline, not the skill's own. */
    const row = screen.getByTestId("category-row-notion");
    expect(row.textContent.indexOf("Notion")).toBeLessThan(
      row.textContent.indexOf("/summarize"),
    );
    expect(row.textContent).toContain(
      "Read, search and summarize your pages and databases.",
    );
  });
});

describe("PluginsCategoriesPage — store skill packs (S6b)", () => {
  const STORE_PACK = {
    id: "skillpack.test-pack",
    title: "Test Pack",
    titleZh: "测试包",
    blurb: "Battle-tested methodology commands.",
    blurbZh: "经过实战检验的方法论命令。",
    gradient: ["#6478f6", "#4a5bd8"],
    source: {
      provider: "github",
      repo: "obra/superpowers",
      sha: "a".repeat(40),
      license: "MIT",
    },
    storeCategory: "dev",
    subset: ["skills/brainstorming"],
    manifest: [{ path: "skills/brainstorming/SKILL.md", sha256: "b".repeat(64) }],
    review: { recordId: "S5-test", reviewedAt: "2026-07-18", reviewers: ["x"] },
  };

  beforeEach(() => {
    listStoreSkillPacks.mockReturnValue([STORE_PACK]);
  });

  test("a pack renders a GET row under All and under its own category, and nowhere else", async () => {
    const { unmount } = await renderPage({ category: "all" });
    await waitFor(() => expect(screen.getByText("Notion")).toBeInTheDocument());
    const row = screen.getByTestId("skillpack-row-skillpack.test-pack");
    expect(within(row).getByText("Test Pack")).toBeInTheDocument();
    expect(within(row).getByText("/brainstorming")).toBeInTheDocument();
    expect(within(row).getByTestId("type-tag").textContent).toBe("SKILL");
    expect(within(row).getByRole("button", { name: /get/i })).toBeInTheDocument();
    unmount();

    const own = await renderPage({ category: "dev" });
    expect(screen.getByTestId("skillpack-row-skillpack.test-pack")).toBeInTheDocument();
    own.unmount();

    await renderPage({ category: "devops" });
    expect(
      screen.queryByTestId("skillpack-row-skillpack.test-pack"),
    ).not.toBeInTheDocument();
  });

  test("an installed pack stays in its category, as the catalog row", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({
      toolkits: [
        {
          toolkitId: "skillpack.test-pack",
          toolkitName: "Test Pack",
          toolkitDescription: "Battle-tested methodology commands.",
          source: "skillpack",
          tools: [],
          skills: [{ name: "brainstorming", title: "Brainstorming", description: "Ideate first." }],
        },
      ],
    });
    await renderPage({ category: "dev" });

    /* Without this, installing a pack would make it vanish from the very
       category it was listed under: the store row is dropped once installed,
       and a catalog row carries no category of its own. */
    await waitFor(() =>
      expect(screen.getByTestId("category-row-skillpack.test-pack")).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("skillpack-row-skillpack.test-pack"),
    ).not.toBeInTheDocument();

    // Installing must not relabel it: a skill pack is a SKILL before and after,
    // never a TOOLKIT.
    const row = screen.getByTestId("category-row-skillpack.test-pack");
    expect(within(row).getByTestId("type-tag").textContent).toBe("SKILL");
  });

  test("the rows a category page lists equal the count the rail derives for it", async () => {
    const counts = categoryCounts({ entries: REGISTRY_ENTRIES, packs: [STORE_PACK] });

    for (const category of ["dev", "productivity", "devops"]) {
      const { unmount } = await renderPage({ category });
      await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalled());

      expect(screen.getAllByTestId(/^(category-row|skillpack-row)-/)).toHaveLength(
        counts[category],
      );
      unmount();
    }
  });

  test("the pack's GET carries no hue", async () => {
    await renderPage({ category: "all" });
    await waitFor(() => expect(screen.getByText("Test Pack")).toBeInTheDocument());

    const row = screen.getByTestId("skillpack-row-skillpack.test-pack");
    expect(within(row).getByRole("button", { name: /get/i }).outerHTML).not.toMatch(
      /154, 168, 255|37, 99, 235|124, 140, 248/,
    );
  });

  test("keeps trust badges out of skill pack rows", async () => {
    const onOpenDetail = jest.fn();
    const onInstall = jest.fn();
    await renderPage({ onOpenDetail, onInstall });
    await waitFor(() => expect(screen.getByText("Test Pack")).toBeInTheDocument());

    const row = screen.getByTestId("skillpack-row-skillpack.test-pack");
    expect(within(row).queryByTestId("plugin-trust-badge")).toBeNull();

    expect(onOpenDetail).not.toHaveBeenCalled();
    expect(onInstall).not.toHaveBeenCalled();
    expect(installStoreSkillPack).not.toHaveBeenCalled();
  });

  test("an already-installed pack (present in the catalog) drops its store row", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValue({
      toolkits: [
        CATALOG_PLAN,
        {
          toolkitId: "skillpack.test-pack",
          toolkitName: "Test Pack",
          toolkitDescription: "Battle-tested methodology commands.",
          source: "skillpack",
          tools: [],
          skills: [{ name: "brainstorming", title: "Brainstorming", description: "Ideate first." }],
        },
      ],
    });
    await renderPage();
    await waitFor(() => expect(screen.getByText("Test Pack")).toBeInTheDocument());

    /* The pack renders exactly once — as the catalog row (quiet OPEN pill),
       never as a duplicate store GET row. */
    expect(
      screen.queryByTestId("skillpack-row-skillpack.test-pack"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("category-row-skillpack.test-pack"),
    ).toBeInTheDocument();
  });

  test("GET runs the install chain and emits a catalog refresh on success", async () => {
    const { emitToolkitCatalogRefresh } = require("../../../SERVICEs/toolkit_catalog_refresh");
    installStoreSkillPack.mockResolvedValue({
      toolkitId: "skillpack.test-pack",
      toolkitName: "Test Pack",
      skills: [{ name: "brainstorming" }],
    });
    await renderPage();
    await waitFor(() => expect(screen.getByText("Test Pack")).toBeInTheDocument());

    const row = screen.getByTestId("skillpack-row-skillpack.test-pack");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /get/i }));
    });

    expect(installStoreSkillPack).toHaveBeenCalledWith(STORE_PACK);
    expect(emitToolkitCatalogRefresh).toHaveBeenCalledWith({
      source: "skill_pack_store_install",
    });
  });

  test("a coded install failure surfaces its own error strip", async () => {
    const failure = new Error("integrity");
    failure.code = "integrity";
    installStoreSkillPack.mockRejectedValue(failure);
    await renderPage();
    await waitFor(() => expect(screen.getByText("Test Pack")).toBeInTheDocument());

    const row = screen.getByTestId("skillpack-row-skillpack.test-pack");
    await act(async () => {
      fireEvent.click(within(row).getByRole("button", { name: /get/i }));
    });

    expect(
      screen.getByText(/reviewed fingerprint/i),
    ).toBeInTheDocument();
  });
});
