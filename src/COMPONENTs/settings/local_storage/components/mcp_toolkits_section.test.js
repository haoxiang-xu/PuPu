import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import McpToolkitsSection from "./mcp_toolkits_section";
import api from "../../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../../SERVICEs/mcp_install";

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listMcpToolkits: jest.fn(),
      reloadMcpToolkits: jest.fn(() => Promise.resolve({ toolkits: [], count: 0 })),
      checkMcpToolkitHealth: jest.fn(() =>
        Promise.resolve({ toolkit: { toolkitId: "mcp.memory.memory" } }),
      ),
      configureMcpToolkit: jest.fn(() =>
        Promise.resolve({ toolkit: { toolkitId: "mcp.productivity.slack" } }),
      ),
      startMcpOAuth: jest.fn(() =>
        Promise.resolve({ toolkitId: "mcp.productivity.notion-remote" }),
      ),
      disconnectMcpOAuth: jest.fn(() =>
        Promise.resolve({ ok: true, toolkitId: "mcp.productivity.notion-remote" }),
      ),
      listMcpOAuthApps: jest.fn(() =>
        Promise.resolve({
          apps: [
            {
              toolkitId: "mcp.dev.github-remote",
              provider: "github",
              providerLabel: "GitHub",
              configured: false,
              clientIdPreview: "",
              scopes: ["repo"],
            },
          ],
          count: 1,
        }),
      ),
      configureMcpOAuthApp: jest.fn(() =>
        Promise.resolve({
          app: {
            toolkitId: "mcp.dev.github-remote",
            provider: "github",
            configured: true,
          },
        }),
      ),
      deleteMcpOAuthApp: jest.fn(() =>
        Promise.resolve({ ok: true, toolkitId: "mcp.dev.github-remote" }),
      ),
      listMcpStoreRegistries: jest.fn(() =>
        Promise.resolve({ registries: [], count: 0 }),
      ),
      refreshMcpStoreRegistry: jest.fn(() =>
        Promise.resolve({ registry: { registryId: "registry.url.test" } }),
      ),
      deleteMcpStoreRegistry: jest.fn(() =>
        Promise.resolve({ ok: true, registryId: "registry.url.test" }),
      ),
    },
  },
}));

jest.mock("../../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  deleteMcpEntry: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));

jest.mock("../../appearance", () => ({
  __esModule: true,
  SettingsSection: ({ title, children }) => (
    <div>
      <span>{title}</span>
      {children}
    </div>
  ),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, prefix_icon, onClick }) => (
    <button
      data-testid={label ? `btn-${label}` : `btn-${prefix_icon}`}
      onClick={onClick}
    >
      {label || prefix_icon}
    </button>
  ),
}));

jest.mock("./confirm_delete_modal", () => ({
  __esModule: true,
  default: ({ open, onConfirm }) =>
    open ? (
      <button data-testid="confirm-delete" onClick={onConfirm}>
        confirm
      </button>
    ) : null,
}));

const oneToolkit = {
  toolkits: [
    {
      toolkitId: "mcp.memory.memory",
      toolkitName: "Memory",
      status: "available",
      tools: [{ name: "a" }],
      toolCount: 1,
      toolkitIcon: { type: "builtin", name: "server" },
    },
  ],
};

describe("McpToolkitsSection", () => {
  beforeEach(() => {
    api.unchain.listMcpToolkits.mockReset();
    api.unchain.listMcpToolkits.mockResolvedValue(oneToolkit);
    api.unchain.reloadMcpToolkits.mockClear();
    api.unchain.checkMcpToolkitHealth.mockClear();
    api.unchain.configureMcpToolkit.mockClear();
    api.unchain.startMcpOAuth.mockClear();
    api.unchain.disconnectMcpOAuth.mockClear();
    api.unchain.listMcpOAuthApps.mockReset();
    api.unchain.listMcpOAuthApps.mockResolvedValue({
      apps: [
        {
          toolkitId: "mcp.dev.github-remote",
          provider: "github",
          providerLabel: "GitHub",
          configured: false,
          clientIdPreview: "",
          scopes: ["repo"],
        },
      ],
      count: 1,
    });
    api.unchain.configureMcpOAuthApp.mockClear();
    api.unchain.deleteMcpOAuthApp.mockClear();
    api.unchain.listMcpStoreRegistries.mockReset();
    api.unchain.listMcpStoreRegistries.mockResolvedValue({
      registries: [],
      count: 0,
    });
    api.unchain.refreshMcpStoreRegistry.mockClear();
    api.unchain.deleteMcpStoreRegistry.mockClear();
    deleteMcpEntry.mockClear();
  });

  test("renders installed mcp toolkits with status", async () => {
    render(<McpToolkitsSection isDark={false} />);

    await screen.findByText("Memory");
    expect(
      screen.getByText("toolkit.store_status_available"),
    ).toBeInTheDocument();
  });

  test("renders secret configuration status when required secrets are present or missing", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          toolkitId: "mcp.productivity.slack",
          toolkitName: "Slack",
          status: "available",
          tools: [],
          toolCount: 0,
          toolkitIcon: { type: "builtin", name: "slack" },
          secretKeys: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
          secretStatus: [
            { key: "SLACK_BOT_TOKEN", configured: true },
            { key: "SLACK_TEAM_ID", configured: true },
          ],
        },
        {
          toolkitId: "mcp.browser.browser-use-local",
          toolkitName: "Browser Use",
          status: "error",
          lastError: "OPENAI_API_KEY is required to run this MCP toolkit",
          tools: [],
          toolCount: 0,
          toolkitIcon: { type: "builtin", name: "globe" },
          secretKeys: ["OPENAI_API_KEY"],
          secretStatus: [{ key: "OPENAI_API_KEY", configured: false }],
        },
      ],
    });

    render(<McpToolkitsSection isDark={false} />);

    await screen.findByText("Slack");
    expect(
      screen.getByText((text) =>
        text.includes("local_storage.mcp_secrets_configured"),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((text) =>
        text.includes("local_storage.mcp_secrets_missing"),
      ),
    ).toBeInTheDocument();
  });

  test("Reload all calls reloadMcpToolkits", async () => {
    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Memory");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_reload_all"));
    });

    expect(api.unchain.reloadMcpToolkits).toHaveBeenCalled();
  });

  test("Recheck calls health for one MCP toolkit", async () => {
    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Memory");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_recheck"));
    });

    expect(api.unchain.checkMcpToolkitHealth).toHaveBeenCalledWith(
      "mcp.memory.memory",
      { workspaceRoot: "" },
    );
  });

  test("renders workspace metadata from requiresWorkspace without a toolkit id special case", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          toolkitId: "mcp.workspace.sample",
          toolkitName: "Workspace Sample",
          status: "available",
          tools: [],
          toolCount: 0,
          toolkitIcon: { type: "builtin", name: "folder" },
          requiresWorkspace: true,
          workspaceRoot: "/tmp/agent-workspace",
        },
      ],
    });

    render(<McpToolkitsSection isDark={false} />);

    await screen.findByText("Workspace Sample");
    expect(
      screen.getByText((text) => text.includes("/tmp/agent-workspace")),
    ).toBeInTheDocument();
  });

  test("Update secrets opens a setup form and configures the MCP toolkit", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          toolkitId: "mcp.productivity.slack",
          toolkitName: "Slack",
          status: "available",
          tools: [],
          toolCount: 0,
          toolkitIcon: { type: "builtin", name: "server" },
          secretKeys: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
          secretStatus: [
            { key: "SLACK_BOT_TOKEN", configured: true },
            { key: "SLACK_TEAM_ID", configured: true },
          ],
        },
      ],
    });

    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Slack");

    fireEvent.click(screen.getByTestId("btn-local_storage.mcp_update_secrets"));
    fireEvent.change(screen.getByPlaceholderText("SLACK_BOT_TOKEN"), {
      target: { value: "xoxb-new" },
    });
    fireEvent.change(screen.getByPlaceholderText("SLACK_TEAM_ID"), {
      target: { value: "TNEW" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_save_secrets"));
    });

    expect(api.unchain.configureMcpToolkit).toHaveBeenCalledWith(
      "mcp.productivity.slack",
      {
        workspaceRoot: "",
        secrets: {
          SLACK_BOT_TOKEN: "xoxb-new",
          SLACK_TEAM_ID: "TNEW",
        },
      },
    );
  });

  test("delete confirms and calls deleteMcpEntry", async () => {
    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Memory");

    fireEvent.click(screen.getByTestId("btn-delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-delete"));
    });

    expect(deleteMcpEntry).toHaveBeenCalledWith("mcp.memory.memory");
  });

  test("renders registry sources and supports refresh and delete", async () => {
    api.unchain.listMcpStoreRegistries.mockResolvedValue({
      registries: [
        {
          registryId: "registry.url.test",
          name: "External Registry",
          sourceType: "url",
          entryCount: 2,
          approvedCount: 1,
          staleApprovalCount: 1,
          riskCounts: { low: 1, medium: 0, high: 1, critical: 0 },
        },
      ],
      count: 1,
    });

    render(<McpToolkitsSection isDark={false} />);

    await screen.findByText("External Registry");
    expect(
      screen.getByText("local_storage.mcp_registry_sources"),
    ).toBeInTheDocument();
    expect(
      screen.getByText((text) =>
        text.includes("1 local_storage.mcp_registry_approved") &&
        text.includes("1 local_storage.mcp_registry_stale") &&
        text.includes("1 local_storage.mcp_registry_risk_low") &&
        text.includes("1 local_storage.mcp_registry_risk_high"),
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_registry_refresh"));
    });
    expect(api.unchain.refreshMcpStoreRegistry).toHaveBeenCalledWith(
      "registry.url.test",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_registry_delete"));
    });
    expect(api.unchain.deleteMcpStoreRegistry).toHaveBeenCalledWith(
      "registry.url.test",
    );
  });

  test("OAuth toolkit renders auth status and supports reconnect and disconnect", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({
      toolkits: [
        {
          entryId: "productivity.notion-remote",
          toolkitId: "mcp.productivity.notion-remote",
          toolkitName: "Notion",
          status: "available",
          authType: "oauth",
          authProvider: "notion",
          authStatus: "connected",
          tools: [],
          toolCount: 0,
          toolkitIcon: { type: "builtin", name: "link" },
        },
      ],
    });

    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Notion");
    expect(
      screen.getByText((text) =>
        text.includes("local_storage.mcp_auth_connected"),
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_reconnect"));
    });
    expect(api.unchain.startMcpOAuth).toHaveBeenCalledWith(
      "productivity.notion-remote",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_disconnect"));
    });
    expect(api.unchain.disconnectMcpOAuth).toHaveBeenCalledWith(
      "mcp.productivity.notion-remote",
    );
  });

  test("empty state shows no installed message", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({ toolkits: [], count: 0 });
    render(<McpToolkitsSection isDark={false} />);

    await waitFor(() =>
      expect(
        screen.getByText("local_storage.mcp_no_installed"),
      ).toBeInTheDocument(),
    );
  });

  test("renders OAuth apps and can configure and delete app credentials", async () => {
    render(<McpToolkitsSection isDark={false} />);

    await waitFor(() =>
      expect(api.unchain.listMcpOAuthApps).toHaveBeenCalled(),
    );
    await screen.findByText("GitHub");
    expect(screen.getByText("local_storage.mcp_oauth_apps")).toBeInTheDocument();
    expect(
      screen.getByText("local_storage.mcp_oauth_app_missing"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("btn-local_storage.mcp_oauth_app_update"));
    fireEvent.change(screen.getByPlaceholderText("client_id"), {
      target: { value: "github-client-id" },
    });
    fireEvent.change(screen.getByPlaceholderText("client_secret"), {
      target: { value: "github-client-secret" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_oauth_app_save"));
    });

    expect(api.unchain.configureMcpOAuthApp).toHaveBeenCalledWith({
      toolkitId: "mcp.dev.github-remote",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      scopes: ["repo"],
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_oauth_app_delete"));
    });

    expect(api.unchain.deleteMcpOAuthApp).toHaveBeenCalledWith(
      "mcp.dev.github-remote",
    );
  });
});
