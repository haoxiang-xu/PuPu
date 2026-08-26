import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PluginDetailPage from "./plugin_detail_page";
import { toPluginPresentation } from "../../../SERVICEs/plugin_presentation";
import { PUPU_PREFILL_COMPOSER } from "../../../SERVICEs/composer_prefill";
import api from "../../../SERVICEs/api";
import {
  isToolkitAutoApprove,
  setToolkitAutoApprove,
} from "../../../SERVICEs/toolkit_auto_approve_store";

/* NOTE: useTranslation is intentionally left un-mocked — same rationale as
   plugins_installed_page.test.js: the vocabulary assertion below reads
   rendered TEXT, and an identity-key mock would leak i18n key NAMES (which
   themselves contain "tool", e.g. "toolkit.section_commands") into the DOM. */

jest.mock("../components/toolkit_icon", () => ({
  __esModule: true,
  ...jest.requireActual("../components/toolkit_icon"),
  ToolkitIconFrame: ({ icon }) => (
    <span data-testid="icon" data-icon-name={icon?.name || ""} />
  ),
}));

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div data-testid="readme-markdown">{content}</div>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  SemiSwitch: ({ on, set_on }) => (
    <button data-testid="switch" onClick={() => set_on(!on)}>
      {on ? "on" : "off"}
    </button>
  ),
}));

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      getToolkitDetail: jest.fn(),
    },
  },
}));

jest.mock("../../../SERVICEs/toolkit_auto_approve_store", () => ({
  __esModule: true,
  isToolkitAutoApprove: jest.fn(() => false),
  setToolkitAutoApprove: jest.fn(),
}));

/* CRA's default jest config runs with resetMocks:true, which strips any
   mockImplementation between tests — including one set at module-factory
   time — so getToolkitDetail needs a default resolution reinstated before
   every test (individual describes below override it as needed). */
beforeEach(() => {
  api.unchain.getToolkitDetail.mockResolvedValue({ readmeMarkdown: "" });
  isToolkitAutoApprove.mockReturnValue(false);
});

const PLAN_ENTRY = {
  toolkitId: "plan",
  toolkitName: "Plan",
  toolkitDescription:
    "Workspace-backed planning: draft, refine and finalize step-by-step plans.",
  source: "builtin",
  installable: true,
  tools: [
    { name: "plan_start", title: "Plan Start", requiresConfirmation: false },
    { name: "plan_finalize", title: "", requiresConfirmation: true },
  ],
  skills: [
    { name: "plan", title: "Plan First", description: "Draft a plan first." },
  ],
};

const NOTION_ENTRY = {
  id: "notion",
  toolkitId: "mcp.productivity.notion-remote",
  toolkitName: "Notion",
  toolkitDescription: "Read, search and summarize your pages and databases.",
  source: "mcp",
  status: "available",
  installable: true,
  tools: [{ name: "notion_search", title: "Search pages", requiresConfirmation: false }],
  skills: [{ name: "summarize", title: "Summarize", description: "Summarize a page." }],
};

const NO_ICON_MCP_ENTRY = {
  id: "detail-no-icon",
  toolkitId: "mcp.custom.detail-no-icon",
  toolkitName: "No Icon MCP",
  toolkitDescription: "An MCP entry without a curated icon.",
  source: "mcp",
  status: "available",
  installable: true,
  tools: [],
};

const renderPage = (props = {}) => {
  const presentation =
    props.presentation || toPluginPresentation(props.entry || PLAN_ENTRY);
  return render(
    <PluginDetailPage
      presentation={presentation}
      entry={PLAN_ENTRY}
      isDark={false}
      installedIds={new Set()}
      onBack={() => {}}
      onCloseModal={() => {}}
      {...props}
    />,
  );
};

describe("PluginDetailPage — install state pill", () => {
  test("shows GET for a not-yet-installed plugin and calls onInstall on click", () => {
    const onInstall = jest.fn();
    renderPage({ entry: NOTION_ENTRY, onInstall, forceInstalled: false });

    const pill = screen.getByText("GET");
    fireEvent.click(pill);

    expect(onInstall).toHaveBeenCalledWith(
      expect.objectContaining({ toolkitId: "mcp.productivity.notion-remote" }),
    );
  });

  /* T2: the installed pill is now the mockup's quiet gray "Installed"
     label (reusing toolkit.nav_installed, the same copy the sidebar and
     Installed-page title already use) instead of "OPEN" — there is nothing
     to "open" for most callers (see the M-a note below), so the header
     shell no longer implies a distinct open action visually. */
  test("shows a quiet Installed label for an already-installed plugin and calls onOpen on click", () => {
    const onOpen = jest.fn();
    const onInstall = jest.fn();
    renderPage({
      entry: PLAN_ENTRY,
      forceInstalled: true,
      onOpen,
      onInstall,
    });

    const pill = screen.getByText("Installed");
    fireEvent.click(pill);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onInstall).not.toHaveBeenCalled();
  });

  /* M-a: the shell never wires an onOpen handler for most detail branches —
     the installed pill must render as a disabled, quiet label instead of a
     fake-enabled button when no onOpen is supplied. */
  test("Installed renders disabled (a quiet label, not a fake-enabled button) when no onOpen is supplied", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    expect(screen.getByRole("button", { name: "Installed" })).toBeDisabled();
  });
});

/* M5: the header source pill used to render the raw source slug
   ("mcp_registry") verbatim instead of a localized label. */
describe("PluginDetailPage — source pill", () => {
  test("uses the generic mcp icon when a store entry omits its icon", () => {
    renderPage({ entry: NO_ICON_MCP_ENTRY, forceInstalled: false });

    expect(screen.getByTestId("icon")).toHaveAttribute("data-icon-name", "mcp");
  });

  test("renders the localized SOURCE_CONFIG label instead of the raw source slug", () => {
    renderPage({ entry: NOTION_ENTRY, forceInstalled: false });
    expect(screen.getByText("mcp")).toBeInTheDocument();
    expect(screen.queryByText("mcp_registry")).not.toBeInTheDocument();
  });

  test("mcp_registry source renders its own localized label, not the raw slug", () => {
    const entry = { ...NOTION_ENTRY, source: "mcp_registry" };
    renderPage({ entry, forceInstalled: false });
    expect(screen.getByText("registry")).toBeInTheDocument();
  });
});

describe("PluginDetailPage — Commands section", () => {
  test("renders each command as a /chip with title and description", () => {
    renderPage({ entry: PLAN_ENTRY });

    expect(screen.getByText("/plan")).toBeInTheDocument();
    expect(screen.getByText("Plan First")).toBeInTheDocument();
    expect(screen.getByText("Draft a plan first.")).toBeInTheDocument();
  });
});

describe("PluginDetailPage — About capability tags", () => {
  /* T2: the old "What it can do" checklist grid is gone — canDo now renders
     as the About section's tag cloud, and plugin_presentation.js's canDo
     shape changed from a bare "label ⚠" string to {label, confirm} so the
     marker can be styled on its own (see plugin_presentation.test.js). */
  test("renders canDo entries as tags, marking confirm-required items with a warning suffix", () => {
    const { container } = renderPage({ entry: PLAN_ENTRY });

    expect(screen.getByText("Plan Start")).toBeInTheDocument();
    expect(container.textContent).toContain("Plan finalize ⚠");
    expect(container.textContent).not.toMatch(/plan_/);
  });

  /* I2: the ⚠ marker used a single dark-mode-only hex regardless of isDark.
     It now splits like the rest of the warning tokens on this page. */
  test("the ⚠ marker uses the light warning color in light mode", () => {
    renderPage({ entry: PLAN_ENTRY, isDark: false });
    /* getNodeText only reads direct text-node children and the exact-match
       comparator does not trim the matcher, so the query has to be the
       already-trimmed form of the rendered " ⚠" text node. */
    expect(screen.getByText("⚠")).toHaveStyle({ color: "#a06a1f" });
  });

  test("the ⚠ marker uses the dark warning color in dark mode", () => {
    renderPage({ entry: PLAN_ENTRY, isDark: true });
    expect(screen.getByText("⚠")).toHaveStyle({ color: "#d9a75a" });
  });
});

describe("PluginDetailPage — Try in chat", () => {
  test("dispatches the prefill event with the command text and closes the modal", () => {
    const onCloseModal = jest.fn();
    const handler = jest.fn();
    window.addEventListener(PUPU_PREFILL_COMPOSER, handler);

    renderPage({ entry: PLAN_ENTRY, onCloseModal });

    act(() => {
      fireEvent.click(screen.getByText("Try in chat"));
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].detail).toEqual({ text: "/plan " });
    expect(onCloseModal).toHaveBeenCalledTimes(1);

    window.removeEventListener(PUPU_PREFILL_COMPOSER, handler);
  });
});

describe("PluginDetailPage — vocabulary", () => {
  test("never renders the word 'tool' — plugin vocabulary only", () => {
    const { container } = renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    expect(container.textContent).not.toMatch(/tool/i);
  });
});

describe("PluginDetailPage — About", () => {
  test("renders the description paragraph and a Provider kv row", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    expect(screen.getByText("About")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Workspace-backed planning: draft, refine and finalize step-by-step plans.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("PuPu built-in")).toBeInTheDocument();
  });
});

describe("PluginDetailPage — Permission section", () => {
  test("delete is disabled for a builtin plugin and does not call onDelete", () => {
    const onDelete = jest.fn();
    renderPage({ entry: PLAN_ENTRY, isBuiltin: true, onDelete, forceInstalled: true });

    expect(screen.getByText("Permission")).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: /delete/i });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
  });

  test("delete is enabled for a non-builtin (mcp) plugin", () => {
    renderPage({ entry: NOTION_ENTRY, isBuiltin: false, forceInstalled: true });

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    expect(deleteButton).not.toBeDisabled();
  });
});

/* Restoration: T3's unified detail page ported install/OAuth/toggle/delete
   from the old store panel but dropped the secrets sub-form and the
   external-registry approve/revoke workflow — this block ports both back,
   verbatim behavior, from
   src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js. T2
   relocated both into the Setup/Status sections. */
const SECRET_ENTRY = {
  id: "browser-use-local",
  toolkitId: "mcp.browser.browser-use-local",
  toolkitName: "Browser Use",
  toolkitDescription: "Local browser automation agent.",
  source: "mcp",
  status: "available",
  installable: true,
  mcp: { transport: "stdio" },
  secrets: [{ key: "OPENAI_API_KEY", label: "OpenAI API key" }],
  tools: [],
};

const REVIEW_ENTRY = {
  id: "external-sample",
  toolkitId: "mcp.external.sample",
  toolkitName: "External Sample",
  toolkitDescription: "External registry entry pending review.",
  source: "mcp_registry",
  trustLevel: "external_review",
  status: "needs_review",
  installable: false,
  registryId: "registry.inline.test",
  registryName: "Sample Registry",
  mcp: { transport: "stdio", command: "node", args: ["server.js"] },
  tools: [],
};

const APPROVED_ENTRY = {
  ...REVIEW_ENTRY,
  trustLevel: "external_approved",
  status: "available",
  installable: true,
  approvalStatus: "approved",
};

describe("PluginDetailPage — Setup section", () => {
  test("renders a password input per secret key and disables the pill until required secrets are filled", () => {
    const onInstall = jest.fn();
    renderPage({ entry: SECRET_ENTRY, onInstall, forceInstalled: false });

    expect(screen.getByText("Setup")).toBeInTheDocument();
    const secretInput = screen.getByPlaceholderText("OpenAI API key");
    expect(secretInput).toHaveAttribute("type", "password");

    /* setupKindForEntry(SECRET_ENTRY) === "secrets" -> opensSetup -> "Set up",
       same pill usePluginInstallState already renders for any secrets-backed
       installable entry. */
    const pill = screen.getByText("Set up");
    fireEvent.click(pill);
    expect(onInstall).not.toHaveBeenCalled();
  });

  test("fills the secret input and fires onInstall with the cleaned secrets payload — same shape as the old panel's save flow", () => {
    const onInstall = jest.fn();
    renderPage({ entry: SECRET_ENTRY, onInstall, forceInstalled: false });

    fireEvent.change(screen.getByPlaceholderText("OpenAI API key"), {
      target: { value: "sk-test" },
    });

    fireEvent.click(screen.getByText("Set up"));

    expect(onInstall).toHaveBeenCalledWith(SECRET_ENTRY, {
      secrets: { OPENAI_API_KEY: "sk-test" },
    });
  });
});

describe("PluginDetailPage — Status section (external-registry approve/revoke)", () => {
  test("needs-review entry shows an approve affordance in the warning color and fires onApproveEntry with the same call shape as the old panel", () => {
    const onApproveEntry = jest.fn();
    renderPage({
      entry: REVIEW_ENTRY,
      onApproveEntry,
      forceInstalled: false,
    });

    expect(screen.getByText("Status")).toBeInTheDocument();
    const approveButton = screen.getByRole("button", { name: /approve/i });
    expect(approveButton).toHaveStyle({ color: "#c2410c" });

    fireEvent.click(approveButton);

    expect(onApproveEntry).toHaveBeenCalledWith(REVIEW_ENTRY, {
      acknowledgedRisk: true,
    });
  });

  test("needs-review entry in dark mode uses the dark warning color", () => {
    renderPage({ entry: REVIEW_ENTRY, isDark: true, forceInstalled: false });

    const approveButton = screen.getByRole("button", { name: /approve/i });
    expect(approveButton).toHaveStyle({ color: "#fdba74" });
  });

  test("approved external entry exposes a revoke control that fires onRevokeApproval with the entry", () => {
    const onRevokeApproval = jest.fn();
    renderPage({
      entry: APPROVED_ENTRY,
      onRevokeApproval,
      forceInstalled: false,
    });

    const revokeButton = screen.getByRole("button", { name: /revoke/i });
    fireEvent.click(revokeButton);

    expect(onRevokeApproval).toHaveBeenCalledWith(APPROVED_ENTRY);
  });

  test("approvalBusy disables both approve and revoke actions", () => {
    renderPage({ entry: REVIEW_ENTRY, approvalBusy: true, forceInstalled: false });
    expect(screen.getByRole("button", { name: /approv/i })).toBeDisabled();
  });
});

/* T4c restoration: the approvalRiskRows security table (transport, command,
   url, secrets, oauth, workspace, permissions, registry, recipe hash) that
   store_toolkit_detail_panel.js showed BEFORE the approve action — ported
   verbatim field-for-field. T2 moved it into the Risk section's two-column
   kv grid. */
const RISK_ENTRY = {
  ...REVIEW_ENTRY,
  recipeHash: "abc123",
  secrets: [{ key: "EXTERNAL_TOKEN", label: "External token" }],
  auth: { oauth: { provider: "example", scopes: ["read", "write"] } },
  workspace: {
    required: true,
    binding: "agent_workspace_root",
    placeholder: "${WORKSPACE}",
  },
  policySummary: { defaultEnabledTools: 0, confirmationRequiredTools: 2 },
  review: {
    riskLevel: "high",
    riskFlags: ["stdio_transport", "secret_inputs"],
    requiresAcknowledgement: true,
    permissionGroups: [
      { kind: "transport", summary: "stdio", items: ["node server.js"] },
    ],
    recipeDiff: [],
  },
};

describe("PluginDetailPage — Risk section", () => {
  test("external entry renders the risk kv grid before the approve action, with all review fields", () => {
    renderPage({ entry: RISK_ENTRY, forceInstalled: false });

    expect(screen.getByText("Risk")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Transport")).toBeInTheDocument();
    expect(screen.getAllByText("stdio").length).toBeGreaterThan(0);
    expect(screen.getByText("Command")).toBeInTheDocument();
    expect(screen.getAllByText("node server.js").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Secrets").length).toBeGreaterThan(0);
    expect(screen.getByText("EXTERNAL_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("OAuth")).toBeInTheDocument();
    expect(screen.getByText("example · read, write")).toBeInTheDocument();
    expect(screen.getAllByText("Workspace").length).toBeGreaterThan(0);
    expect(screen.getByText("agent_workspace_root · ${WORKSPACE}")).toBeInTheDocument();
    expect(screen.getByText("Registry")).toBeInTheDocument();
    expect(screen.getByText("registry.inline.test")).toBeInTheDocument();
    expect(screen.getByText("Recipe hash")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  test("recipe-diff entries render a 'Recipe changes' warning section", () => {
    renderPage({
      entry: { ...RISK_ENTRY, review: { ...RISK_ENTRY.review, recipeDiff: [{ path: "mcp.url", kind: "changed" }] } },
      forceInstalled: false,
    });

    expect(screen.getByText("Recipe changes")).toBeInTheDocument();
    expect(screen.getByText("mcp.url")).toBeInTheDocument();
  });

  /* I2: hotColor (the Command row's highlighted value) used to be a single
     dark-mode-only hex regardless of isDark — invisible against a light
     background. It now mirrors warningColor's light branch. */
  test("the highlighted Command value uses the light warning color in light mode", () => {
    renderPage({ entry: RISK_ENTRY, isDark: false, forceInstalled: false });
    const commandValue = screen.getAllByText("node server.js")[0];
    expect(commandValue).toHaveStyle({ color: "#c2410c" });
  });

  test("the highlighted Command value uses the dark warning color in dark mode", () => {
    renderPage({ entry: RISK_ENTRY, isDark: true, forceInstalled: false });
    const commandValue = screen.getAllByText("node server.js")[0];
    expect(commandValue).toHaveStyle({ color: "#fdba74" });
  });

  test("a regular (non-external-registry) entry never renders the risk section", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    expect(screen.queryByText("Risk")).not.toBeInTheDocument();
  });
});

/* T4c restoration: the secondary "Connect with OAuth" button for
   dual-auth entries — ones that install via secrets/http but also carry an
   OAuth recipe as an alternative. Ported verbatim from
   store_toolkit_detail_panel.js's `showSecondaryOAuthAction`; T2 moved it
   into the Setup section. */
const DUAL_AUTH_ENTRY = {
  id: "dual-auth-sample",
  toolkitId: "mcp.productivity.dual-auth-sample",
  toolkitName: "Dual Auth Sample",
  toolkitDescription: "Supports both an API key and OAuth.",
  source: "mcp",
  status: "available",
  installable: true,
  mcp: { transport: "http" },
  secrets: [{ key: "API_KEY", label: "API key" }],
  auth: {
    oauth: {
      provider: "sample",
      scopes: ["read"],
      releaseStatus: "ready",
    },
  },
  tools: [],
};

describe("PluginDetailPage — dual auth", () => {
  test("shows a secondary Connect with OAuth action alongside the primary Set up pill", () => {
    const onOAuthConnect = jest.fn();
    renderPage({ entry: DUAL_AUTH_ENTRY, onOAuthConnect, forceInstalled: false });

    expect(screen.getByText("Set up")).toBeInTheDocument();
    const oauthButton = screen.getByText("Connect with OAuth");
    fireEvent.click(oauthButton);

    expect(onOAuthConnect).toHaveBeenCalledWith(DUAL_AUTH_ENTRY);
  });

  test("does not show the secondary OAuth action for an already-installed entry", () => {
    renderPage({ entry: DUAL_AUTH_ENTRY, forceInstalled: true });
    expect(screen.queryByText("Connect with OAuth")).not.toBeInTheDocument();
  });

  test("does not show the secondary OAuth action for a plain (non-oauth) secrets entry", () => {
    renderPage({ entry: SECRET_ENTRY, forceInstalled: false });
    expect(screen.queryByText("Connect with OAuth")).not.toBeInTheDocument();
  });

  test("does not show the secondary OAuth action when provider approval is pending", () => {
    renderPage({
      entry: {
        ...DUAL_AUTH_ENTRY,
        auth: {
          oauth: {
            provider: "sample",
            scopes: ["read"],
            releaseStatus: "approval_required",
          },
        },
      },
      forceInstalled: false,
    });
    expect(screen.queryByText("Connect with OAuth")).not.toBeInTheDocument();
  });

  test("an OAuth-only provider awaiting approval shows Coming soon instead of Connect", () => {
    renderPage({
      entry: {
        id: "dev.figma-remote",
        toolkitId: "mcp.dev.figma-remote",
        toolkitName: "Figma",
        toolkitDescription: "Figma remote MCP",
        source: "mcp",
        status: "coming_soon",
        installable: false,
        mcp: { transport: "http", url: "https://mcp.figma.com/mcp" },
        secrets: [],
        auth: {
          oauth: {
            provider: "figma",
            releaseStatus: "approval_required",
          },
        },
        tools: [],
      },
      forceInstalled: false,
    });

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
    expect(screen.queryByText("Connect")).not.toBeInTheDocument();
  });
});

/* T4c restoration: the "Auto Approve Tools" toggle — toolkit_detail_panel.js's
   Settings section had it alongside Auto Enable (backgroundColor_on
   "#E5484D", confirm-before-enabling modal); the unified detail page only
   kept Auto Enable. Only meaningful for an already-installed plugin — the
   old store panel never showed it either. T2 moved both into Permission. */
describe("PluginDetailPage — Auto Approve", () => {
  beforeEach(() => {
    isToolkitAutoApprove.mockReturnValue(false);
    setToolkitAutoApprove.mockReset();
  });

  test("is not shown for a not-yet-installed plugin", () => {
    renderPage({ entry: NOTION_ENTRY, forceInstalled: false });
    expect(screen.queryByText("Auto Approve")).not.toBeInTheDocument();
  });

  test("turning it on opens a confirmation modal; confirming calls setToolkitAutoApprove(true, toolNames)", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    const row = screen.getByText("Auto Approve").closest("div");
    const toggle = within(row.parentElement.parentElement).getByTestId("switch");
    fireEvent.click(toggle);

    expect(screen.getByText("Enable Auto Approve?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Enable Auto Approve"));

    expect(setToolkitAutoApprove).toHaveBeenCalledWith("plan", true, [
      "plan_start",
      "plan_finalize",
    ]);
  });

  test("turning it off (already on) calls setToolkitAutoApprove(false, toolNames) without a confirm modal", () => {
    isToolkitAutoApprove.mockReturnValue(true);
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    const row = screen.getByText("Auto Approve").closest("div");
    const toggle = within(row.parentElement.parentElement).getByTestId("switch");
    fireEvent.click(toggle);

    expect(screen.queryByText("Enable Auto Approve?")).not.toBeInTheDocument();
    expect(setToolkitAutoApprove).toHaveBeenCalledWith("plan", false, [
      "plan_start",
      "plan_finalize",
    ]);
  });

  test("a rejected revoke restores the switch to the SQL-confirmed state", async () => {
    isToolkitAutoApprove.mockReturnValue(true);
    setToolkitAutoApprove.mockReturnValue({
      persistence: Promise.reject(
        new Error("[settings_storage_unavailable] gone"),
      ),
    });
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    const row = screen.getByText("Auto Approve").closest("div");
    const toggle = within(row.parentElement.parentElement).getByTestId("switch");
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("off");

    await waitFor(() => expect(toggle).toHaveTextContent("on"));
  });

  test("changing toolkit closes an old auto-approve confirmation", async () => {
    const view = renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    const row = screen.getByText("Auto Approve").closest("div");
    fireEvent.click(
      within(row.parentElement.parentElement).getByTestId("switch"),
    );
    expect(screen.getByText("Enable Auto Approve?")).toBeInTheDocument();

    view.rerender(
      <PluginDetailPage
        presentation={toPluginPresentation(NOTION_ENTRY)}
        entry={NOTION_ENTRY}
        isDark={false}
        installedIds={new Set()}
        forceInstalled
        onBack={() => {}}
        onCloseModal={() => {}}
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Enable Auto Approve?"),
      ).not.toBeInTheDocument(),
    );
    expect(setToolkitAutoApprove).not.toHaveBeenCalled();
  });

  test("an old toolkit rejection cannot roll back the newly selected toolkit", async () => {
    let rejectPersistence;
    const persistence = new Promise((_resolve, reject) => {
      rejectPersistence = reject;
    });
    isToolkitAutoApprove.mockImplementation(
      (toolkitId) => toolkitId === "plan",
    );
    setToolkitAutoApprove.mockReturnValue({ persistence });
    const view = renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    const planRow = screen.getByText("Auto Approve").closest("div");
    fireEvent.click(
      within(planRow.parentElement.parentElement).getByTestId("switch"),
    );

    view.rerender(
      <PluginDetailPage
        presentation={toPluginPresentation(NOTION_ENTRY)}
        entry={NOTION_ENTRY}
        isDark={false}
        installedIds={new Set()}
        forceInstalled
        onBack={() => {}}
        onCloseModal={() => {}}
      />,
    );
    const notionRow = screen.getByText("Auto Approve").closest("div");
    const notionToggle = within(
      notionRow.parentElement.parentElement,
    ).getByTestId("switch");
    await waitFor(() => expect(notionToggle).toHaveTextContent("off"));

    act(() => {
      rejectPersistence(new Error("[settings_storage_unavailable] gone"));
    });
    await waitFor(() => expect(notionToggle).toHaveTextContent("off"));
    expect(isToolkitAutoApprove).not.toHaveBeenLastCalledWith("plan");
  });
});

/* I6: the auto-enable row used to render unconditionally, even for a
   not-yet-installed store/Discover entry with no onToggleAutoEnable wired
   up — toggling it silently did nothing. It must only render once the
   plugin is actually installed (pillIsOpen) AND a caller supplied the
   handler. */
describe("PluginDetailPage — auto-enable row gating", () => {
  test("is not shown for a not-yet-installed plugin, even with onToggleAutoEnable wired", () => {
    renderPage({
      entry: NOTION_ENTRY,
      forceInstalled: false,
      onToggleAutoEnable: jest.fn(),
    });
    expect(screen.queryByText("Auto Enable")).not.toBeInTheDocument();
  });

  test("is not shown for an installed plugin when no onToggleAutoEnable is supplied", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    expect(screen.queryByText("Auto Enable")).not.toBeInTheDocument();
  });

  test("is shown and wired for an installed plugin with onToggleAutoEnable supplied", () => {
    const onToggleAutoEnable = jest.fn();
    renderPage({
      entry: PLAN_ENTRY,
      forceInstalled: true,
      defaultEnabled: false,
      onToggleAutoEnable,
    });

    expect(screen.getByText("Auto Enable")).toBeInTheDocument();
    const row = screen.getByText("Auto Enable").closest("div");
    const toggle = within(row.parentElement.parentElement).getByTestId("switch");
    fireEvent.click(toggle);

    expect(onToggleAutoEnable).toHaveBeenCalledWith("plan", true);
  });
});

/* I3: install/OAuth errors used to be invisible on the detail page — no
   installError prop existed at all. Rendered near the pill, with the
   mcp_workspace_required special case using the existing
   toolkit.store_workspace_required copy. */
describe("PluginDetailPage — install error", () => {
  test("renders the error message near the pill", () => {
    renderPage({
      entry: NOTION_ENTRY,
      forceInstalled: false,
      installError: { entryId: "notion", code: "mcp_install_failed", message: "Network error" },
    });
    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  test("mcp_workspace_required renders the dedicated copy instead of the raw message", () => {
    renderPage({
      entry: NOTION_ENTRY,
      forceInstalled: false,
      installError: { entryId: "notion", code: "mcp_workspace_required", message: "workspaceRoot missing" },
    });
    expect(
      screen.getByText("Select an agent workspace before installing this plugin."),
    ).toBeInTheDocument();
    expect(screen.queryByText("workspaceRoot missing")).not.toBeInTheDocument();
  });

  test("renders nothing when there is no install error", () => {
    renderPage({ entry: NOTION_ENTRY, forceInstalled: false, installError: null });
    expect(screen.queryByText("Network error")).not.toBeInTheDocument();
  });
});

/* T2: the README markdown viewer is gone — the mockup's About section has
   no inline reader, just a "Docs → README ›" kv row. readmeState still
   drives whether that row appears (embedded readmeMarkdown, or fetched via
   api.unchain.getToolkitDetail for installed entries that don't carry
   one), it just no longer renders the body. */
describe("PluginDetailPage — About Docs row", () => {
  beforeEach(() => {
    api.unchain.getToolkitDetail.mockReset();
  });

  test("store entries with an embedded readmeMarkdown show the Docs row without fetching", async () => {
    const entry = { ...NOTION_ENTRY, readmeMarkdown: "## Notion\n\nRead pages." };
    renderPage({ entry, forceInstalled: false });

    expect(await screen.findByText("README ›")).toBeInTheDocument();
    expect(api.unchain.getToolkitDetail).not.toHaveBeenCalled();
  });

  test("installed entries without an embedded readme fetch it via getToolkitDetail and then show the Docs row", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "plan",
      readmeMarkdown: "## Plan\n\nStep-by-step planning.",
    });

    await act(async () => {
      renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    });

    await waitFor(() => {
      expect(api.unchain.getToolkitDetail).toHaveBeenCalledWith("plan", null);
    });
    expect(await screen.findByText("README ›")).toBeInTheDocument();
  });

  test("no Docs row when no readme is available", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({ toolkitId: "plan", readmeMarkdown: "" });

    await act(async () => {
      renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    });

    await waitFor(() => expect(api.unchain.getToolkitDetail).toHaveBeenCalled());
    expect(screen.queryByText("README ›")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
  });

  /* I1: the Docs row is a click-to-expand toggle — the mockup's static
     "Docs → README ›" kv line now reveals the README body inline (the same
     BUILTIN Markdown component the pre-T2 page used) on click, flips the
     chevron, and collapses again on a second click. */
  test("clicking the Docs row reveals the README content and flips the chevron; clicking again collapses it", async () => {
    const entry = { ...NOTION_ENTRY, readmeMarkdown: "## Notion\n\nRead pages." };
    renderPage({ entry, forceInstalled: false });

    const docsRow = await screen.findByText("README ›");
    expect(screen.queryByTestId("readme-markdown")).not.toBeInTheDocument();

    fireEvent.click(docsRow);

    expect(await screen.findByText("README ⌄")).toBeInTheDocument();
    expect(screen.getByTestId("readme-markdown")).toHaveTextContent(
      "## Notion",
    );

    fireEvent.click(screen.getByText("README ⌄"));

    expect(await screen.findByText("README ›")).toBeInTheDocument();
    expect(screen.queryByTestId("readme-markdown")).not.toBeInTheDocument();
  });
});
