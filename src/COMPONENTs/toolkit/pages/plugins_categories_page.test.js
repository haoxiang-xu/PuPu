import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import PluginsCategoriesPage from "./plugins_categories_page";
import api from "../../../SERVICEs/api";

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
}));

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

const clickSegment = (name) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("PluginsCategoriesPage — fixed header", () => {
  test("renders the static 'Store' title and all four segment labels", async () => {
    await renderPage();

    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toolkits" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "MCP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skills" })).toBeInTheDocument();
  });

  test("defaults to the All segment — the unified directory with no type narrowing", async () => {
    await renderPage();

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());
    expect(screen.getByText("Agent Reach")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());
  });
});

describe("PluginsCategoriesPage — type filtering (segment clicks)", () => {
  test("Toolkits shows only catalog rows with a non-MCP source", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    clickSegment("Toolkits");

    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.getByText("Agent Reach")).toBeInTheDocument();
    expect(screen.queryByText("Notion")).not.toBeInTheDocument();
    expect(screen.queryByText("AWS")).not.toBeInTheDocument();
    expect(screen.queryByText("Home Bridge")).not.toBeInTheDocument();
  });

  test("MCP shows registry entries and MCP-sourced catalog-only rows", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());

    clickSegment("MCP");

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(screen.getByText("Home Bridge")).toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Reach")).not.toBeInTheDocument();
  });

  test("Skills shows only plugins that carry a command, from either source", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    clickSegment("Skills");

    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.queryByText("AWS")).not.toBeInTheDocument();
    expect(screen.queryByText("Agent Reach")).not.toBeInTheDocument();
    expect(screen.queryByText("Home Bridge")).not.toBeInTheDocument();
  });

  /* CEO example, verbatim: Plan (builtin toolkit with a /plan command)
     appears on both Toolkits and Skills; Notion (MCP with /summarize)
     appears on both MCP and Skills. A dual-nature plugin is a feature of the
     union, not a bug to dedupe away. One page instance, one internal
     segment state — no remount-between-stages workaround needed now that
     the segment lives in this page rather than a caller-supplied prop. */
  test("a dual-nature plugin appears under both of its type segments", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());

    clickSegment("Toolkits");
    expect(screen.getByText("Plan")).toBeInTheDocument();

    clickSegment("Skills");
    expect(screen.getByText("Plan")).toBeInTheDocument();

    clickSegment("MCP");
    expect(screen.getByText("Notion")).toBeInTheDocument();

    clickSegment("Skills");
    expect(screen.getByText("Notion")).toBeInTheDocument();
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
    clickSegment("Toolkits");

    const row = screen.getByTestId("category-row-plan");
    expect(within(row).getByText("OPEN")).toBeInTheDocument();
  });

  test("clicking the catalog-only row's OPEN pill calls onOpenDetail with a presentation-shaped object", async () => {
    const onOpenDetail = jest.fn();
    await renderPage({ onOpenDetail });
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());
    clickSegment("Toolkits");

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
  test("no theme pill row renders — segments are the only filter", async () => {
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

/* store-final (2026-07-17): "Toolkits"/"MCP"/"Skills" are now ALWAYS on
   screen as the segmented control's own CEO-approved labels (vocabulary
   rule: category NAMES are approved, only PER-ITEM copy must avoid
   "tool/toolkit/skill") — so this guard now scopes to the scrollable rows
   area only, not the whole container. */
describe("PluginsCategoriesPage — vocabulary", () => {
  test("per-item copy never renders the word 'tool' (segment labels are exempt)", async () => {
    const { container } = await renderPage();
    await waitFor(() => expect(api.unchain.listToolModalCatalog).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText("Home Bridge")).toBeInTheDocument());

    const rowsArea = container.querySelector(".scrollable");
    expect(rowsArea.textContent).not.toMatch(/tool/i);
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
  test("renders the footer entry on the MCP segment", async () => {
    await renderPage();
    clickSegment("MCP");
    expect(screen.getByText(/Add a custom plugin/i)).toBeInTheDocument();
  });

  test("does not render the footer entry on All, Toolkits or Skills", async () => {
    await renderPage();
    expect(screen.queryByText(/Add a custom plugin/i)).not.toBeInTheDocument();

    clickSegment("Toolkits");
    expect(screen.queryByText(/Add a custom plugin/i)).not.toBeInTheDocument();

    clickSegment("Skills");
    expect(screen.queryByText(/Add a custom plugin/i)).not.toBeInTheDocument();
  });

  test("clicking the footer entry calls onOpenCustomMcp", async () => {
    const onOpenCustomMcp = jest.fn();
    await renderPage({ onOpenCustomMcp });
    clickSegment("MCP");

    fireEvent.click(screen.getByText(/Add a custom plugin/i));

    expect(onOpenCustomMcp).toHaveBeenCalledTimes(1);
  });
});

/* store-final (2026-07-17): the Skills segment puts the command chip BEFORE
   the name (mockup screen ②) and the row description prefers the skill's
   own description over the plugin's tagline. */
describe("PluginsCategoriesPage — Skills segment: chip-first rows", () => {
  test("the command chip renders before the name, for both registry and catalog rows", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Plan")).toBeInTheDocument());
    clickSegment("Skills");

    const notionRow = screen.getByTestId("category-row-notion");
    expect(notionRow.textContent.indexOf("/summarize")).toBeLessThan(
      notionRow.textContent.indexOf("Notion"),
    );

    const planRow = screen.getByTestId("category-row-plan");
    expect(planRow.textContent.indexOf("/plan")).toBeLessThan(
      planRow.textContent.indexOf("Plan"),
    );
  });

  test("description prefers the skill's own description over the tagline", async () => {
    await renderPage();
    clickSegment("Skills");

    await waitFor(() => expect(screen.getByText("Notion")).toBeInTheDocument());
    expect(screen.getByText("Summarize a page.")).toBeInTheDocument();
  });

  test("falls back to the tagline when the skill carries no description of its own", async () => {
    listMcpStoreEntries.mockReturnValue([
      {
        id: "no-desc-skill",
        toolkitId: "mcp.example.no-desc-skill",
        toolkitName: "No Desc Skill",
        toolkitDescription: "A plugin whose skill has no description of its own.",
        source: "mcp",
        category: "dev",
        status: "available",
        installable: true,
        tools: [],
        skills: [{ name: "run", title: "Run", description: "" }],
      },
    ]);
    searchMcpStoreEntries.mockImplementation((entries) => entries);
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });

    await renderPage();
    clickSegment("Skills");

    await waitFor(() => expect(screen.getByText("No Desc Skill")).toBeInTheDocument());
    expect(
      screen.getByText("A plugin whose skill has no description of its own."),
    ).toBeInTheDocument();
  });

  test("outside Skills, the chip (when present) stays after the name and the description stays the tagline", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("Notion")).toBeInTheDocument());

    /* Default segment is "All" — Notion still carries a /summarize command,
       so its chip renders, just name-first (not chip-first: that reorder is
       Skills-only) — and the description is the plugin's tagline, not the
       skill's own description. */
    const row = screen.getByTestId("category-row-notion");
    expect(row.textContent.indexOf("Notion")).toBeLessThan(
      row.textContent.indexOf("/summarize"),
    );
    expect(row.textContent).toContain(
      "Read, search and summarize your pages and databases.",
    );
  });
});
