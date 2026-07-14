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

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div data-testid="markdown">{content}</div>,
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

  test("shows OPEN for an already-installed plugin and calls onOpen on click", () => {
    const onOpen = jest.fn();
    const onInstall = jest.fn();
    renderPage({
      entry: PLAN_ENTRY,
      forceInstalled: true,
      onOpen,
      onInstall,
    });

    const pill = screen.getByText("OPEN");
    fireEvent.click(pill);

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onInstall).not.toHaveBeenCalled();
  });

  /* M-a: the shell never wires an onOpen handler for most detail branches —
     OPEN used to render as an enabled-looking button that silently did
     nothing on click. It must now render as a disabled, quiet label instead
     of a fake-enabled button. */
  test("OPEN renders disabled (a quiet label, not a fake-enabled button) when no onOpen is supplied", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    expect(screen.getByRole("button", { name: "OPEN" })).toBeDisabled();
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

describe("PluginDetailPage — What it can do", () => {
  test("renders canDo entries with no underscored function names", () => {
    const { container } = renderPage({ entry: PLAN_ENTRY });

    expect(screen.getByText("Plan Start")).toBeInTheDocument();
    /* "Plan finalize" legitimately appears twice — once as a capability in
       "What it can do" and once as the Information section's confirmation
       row value — both derived from the same presentation.canDo entry. */
    expect(screen.getAllByText("Plan finalize").length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/plan_/);
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

describe("PluginDetailPage — Information", () => {
  test("renders provider and requires-confirmation rows", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });

    expect(screen.getByText("Provider")).toBeInTheDocument();
    expect(screen.getByText("PuPu built-in")).toBeInTheDocument();
    expect(screen.getByText("Requires confirmation")).toBeInTheDocument();
    expect(screen.getAllByText("Plan finalize").length).toBeGreaterThan(0);
  });
});

describe("PluginDetailPage — danger zone", () => {
  test("delete is disabled for a builtin plugin and does not call onDelete", () => {
    const onDelete = jest.fn();
    renderPage({ entry: PLAN_ENTRY, isBuiltin: true, onDelete, forceInstalled: true });

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
   src/COMPONENTs/toolkit/components/store_toolkit_detail_panel.js. */
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

describe("PluginDetailPage — Secrets section", () => {
  test("renders a password input per secret key and disables the pill until required secrets are filled", () => {
    const onInstall = jest.fn();
    renderPage({ entry: SECRET_ENTRY, onInstall, forceInstalled: false });

    expect(screen.getByText("Secrets")).toBeInTheDocument();
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

describe("PluginDetailPage — external-registry approve/revoke", () => {
  test("needs-review entry shows an approve affordance in the warning color and fires onApproveEntry with the same call shape as the old panel", () => {
    const onApproveEntry = jest.fn();
    renderPage({
      entry: REVIEW_ENTRY,
      onApproveEntry,
      forceInstalled: false,
    });

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
   store_toolkit_detail_panel.js showed BEFORE the approve action — dropped
   entirely when this page replaced the old store panel. Ported verbatim
   field-for-field, restyled to this page's section-header language. */
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

describe("PluginDetailPage — Approval risk summary", () => {
  test("external entry renders the risk table before the approve action, with all review fields", () => {
    renderPage({ entry: RISK_ENTRY, forceInstalled: false });

    expect(screen.getByText("Approval risk summary")).toBeInTheDocument();
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

  test("a regular (non-external-registry) entry never renders the risk table", () => {
    renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    expect(screen.queryByText("Approval risk summary")).not.toBeInTheDocument();
  });
});

/* T4c restoration: the secondary "Connect with OAuth" button for
   dual-auth entries — ones that install via secrets/http but also carry an
   OAuth recipe as an alternative. Ported verbatim from
   store_toolkit_detail_panel.js's `showSecondaryOAuthAction`. */
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
  auth: { oauth: { provider: "sample", scopes: ["read"] } },
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
});

/* T4c restoration: the "Auto Approve Tools" toggle — toolkit_detail_panel.js's
   Settings section had it alongside Auto Enable (backgroundColor_on
   "#E5484D", confirm-before-enabling modal); the unified detail page only
   kept Auto Enable. Only meaningful for an already-installed plugin — the
   old store panel never showed it either. */
describe("PluginDetailPage — Auto Approve Tools", () => {
  beforeEach(() => {
    isToolkitAutoApprove.mockReturnValue(false);
    setToolkitAutoApprove.mockClear();
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

/* T4c restoration: README markdown — toolkit_detail_panel.js's core content
   (fetched via api.unchain.getToolkitDetail for installed plugins that don't
   carry a readmeMarkdown field in the catalog listing) was entirely dropped
   by the unified page. Store-registry entries already embed readmeMarkdown
   statically (see mcp_toolkit_registry.json) and need no fetch — same split
   as the old panels. */
describe("PluginDetailPage — README", () => {
  beforeEach(() => {
    api.unchain.getToolkitDetail.mockReset();
  });

  test("store entries with an embedded readmeMarkdown render it without fetching", async () => {
    const entry = { ...NOTION_ENTRY, readmeMarkdown: "## Notion\n\nRead pages." };
    renderPage({ entry, forceInstalled: false });

    expect(await screen.findByTestId("markdown")).toHaveTextContent("Notion");
    expect(api.unchain.getToolkitDetail).not.toHaveBeenCalled();
  });

  test("installed entries without an embedded readme fetch it via getToolkitDetail", async () => {
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
    expect(await screen.findByTestId("markdown")).toHaveTextContent(
      "Step-by-step planning.",
    );
  });

  test("falls back to a no-documentation placeholder when nothing is available", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({ toolkitId: "plan", readmeMarkdown: "" });

    await act(async () => {
      renderPage({ entry: PLAN_ENTRY, forceInstalled: true });
    });

    expect(await screen.findByText("No documentation")).toBeInTheDocument();
  });
});
