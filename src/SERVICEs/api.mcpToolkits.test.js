import { api } from "./api";

describe("api.unchain MCP toolkits", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.unchainAPI = {};
  });

  afterEach(() => {
    jest.clearAllMocks();
    window.unchainAPI = originalUnchainApi;
  });

  test("returns stable fallbacks when MCP bridge methods are missing", async () => {
    await expect(api.unchain.listMcpToolkits()).resolves.toEqual({
      toolkits: [],
      count: 0,
    });
    await expect(api.unchain.reloadMcpToolkits()).resolves.toEqual({
      toolkits: [],
      count: 0,
    });
    await expect(
      api.unchain.getMcpOAuthStatus("productivity.notion-remote"),
    ).resolves.toEqual({
      entryId: "productivity.notion-remote",
      toolkitId: "",
      authStatus: "unknown",
    });
    await expect(api.unchain.listMcpOAuthApps()).resolves.toEqual({
      apps: [],
      count: 0,
    });
    await expect(
      api.unchain.configureMcpToolkit("mcp.memory.memory"),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
    await expect(
      api.unchain.startMcpOAuth("productivity.notion-remote"),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
    await expect(
      api.unchain.disconnectMcpOAuth("mcp.productivity.notion-remote"),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
    await expect(
      api.unchain.configureMcpOAuthApp({
        toolkitId: "mcp.dev.github-remote",
        clientId: "github-client-id",
        clientSecret: "github-client-secret",
      }),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
    await expect(
      api.unchain.deleteMcpOAuthApp("mcp.dev.github-remote"),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });

  test("proxies install/delete/reload/health/configure/oauth through the bridge", async () => {
    window.unchainAPI = {
      listMcpToolkits: jest.fn().mockResolvedValue({ toolkits: [], count: 0 }),
      installMcpToolkit: jest.fn().mockResolvedValue({
        toolkit: { toolkitId: "mcp.workspace.filesystem" },
      }),
      deleteMcpToolkit: jest.fn().mockResolvedValue({ ok: true }),
      reloadMcpToolkits: jest.fn().mockResolvedValue({ toolkits: [], count: 0 }),
      checkMcpToolkitHealth: jest.fn().mockResolvedValue({
        toolkit: { toolkitId: "mcp.workspace.filesystem" },
      }),
      configureMcpToolkit: jest.fn().mockResolvedValue({
        toolkit: { toolkitId: "mcp.workspace.filesystem" },
      }),
      startMcpOAuth: jest.fn().mockResolvedValue({
        entryId: "productivity.notion-remote",
        toolkitId: "mcp.productivity.notion-remote",
        authUrl: "https://auth.notion.test/authorize",
      }),
      getMcpOAuthStatus: jest.fn().mockResolvedValue({
        entryId: "productivity.notion-remote",
        toolkitId: "mcp.productivity.notion-remote",
        authStatus: "connected",
      }),
      disconnectMcpOAuth: jest.fn().mockResolvedValue({
        ok: true,
        toolkitId: "mcp.productivity.notion-remote",
      }),
      listMcpOAuthApps: jest.fn().mockResolvedValue({
        apps: [{ toolkitId: "mcp.dev.github-remote", configured: false }],
        count: 1,
      }),
      configureMcpOAuthApp: jest.fn().mockResolvedValue({
        app: { toolkitId: "mcp.dev.github-remote", configured: true },
      }),
      deleteMcpOAuthApp: jest.fn().mockResolvedValue({
        ok: true,
        toolkitId: "mcp.dev.github-remote",
      }),
    };

    await api.unchain.listMcpToolkits();
    await api.unchain.installMcpToolkit({
      entryId: "custom",
      secrets: {
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_TEAM_ID: "T012345",
      },
      customRecipe: {
        toolkit_id: "mcp.custom.local-test",
        toolkit_name: "Local Test",
        mcp: { transport: "stdio", command: "echo", args: ["ok"] },
      },
    });
    await api.unchain.reloadMcpToolkits({ workspaceRoot: "/tmp/project" });
    await api.unchain.checkMcpToolkitHealth("mcp.workspace.filesystem", {
      workspaceRoot: "/tmp/project",
    });
    await api.unchain.configureMcpToolkit("mcp.workspace.filesystem", {
      workspaceRoot: "/tmp/project",
      secrets: { OPENAI_API_KEY: "sk-test" },
    });
    await api.unchain.startMcpOAuth("productivity.notion-remote");
    await api.unchain.getMcpOAuthStatus("productivity.notion-remote");
    await api.unchain.disconnectMcpOAuth("mcp.productivity.notion-remote");
    await api.unchain.listMcpOAuthApps();
    await api.unchain.configureMcpOAuthApp({
      toolkitId: "mcp.dev.github-remote",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      scopes: ["repo"],
    });
    await api.unchain.deleteMcpOAuthApp("mcp.dev.github-remote");
    await api.unchain.deleteMcpToolkit("mcp.workspace.filesystem");

    expect(window.unchainAPI.listMcpToolkits).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.installMcpToolkit).toHaveBeenCalledWith({
      entryId: "custom",
      secrets: {
        SLACK_BOT_TOKEN: "xoxb-test",
        SLACK_TEAM_ID: "T012345",
      },
      customRecipe: {
        toolkit_id: "mcp.custom.local-test",
        toolkit_name: "Local Test",
        mcp: { transport: "stdio", command: "echo", args: ["ok"] },
      },
    });
    expect(window.unchainAPI.reloadMcpToolkits).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project",
    });
    expect(window.unchainAPI.checkMcpToolkitHealth).toHaveBeenCalledWith(
      "mcp.workspace.filesystem",
      { workspaceRoot: "/tmp/project" },
    );
    expect(window.unchainAPI.configureMcpToolkit).toHaveBeenCalledWith(
      "mcp.workspace.filesystem",
      {
        workspaceRoot: "/tmp/project",
        secrets: { OPENAI_API_KEY: "sk-test" },
      },
    );
    expect(window.unchainAPI.startMcpOAuth).toHaveBeenCalledWith(
      "productivity.notion-remote",
    );
    expect(window.unchainAPI.getMcpOAuthStatus).toHaveBeenCalledWith(
      "productivity.notion-remote",
    );
    expect(window.unchainAPI.disconnectMcpOAuth).toHaveBeenCalledWith(
      "mcp.productivity.notion-remote",
    );
    expect(window.unchainAPI.listMcpOAuthApps).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.configureMcpOAuthApp).toHaveBeenCalledWith({
      toolkitId: "mcp.dev.github-remote",
      clientId: "github-client-id",
      clientSecret: "github-client-secret",
      scopes: ["repo"],
    });
    expect(window.unchainAPI.deleteMcpOAuthApp).toHaveBeenCalledWith(
      "mcp.dev.github-remote",
    );
    expect(window.unchainAPI.deleteMcpToolkit).toHaveBeenCalledWith(
      "mcp.workspace.filesystem",
    );
  });

  test("preserves stable MCP error code from bridge errors", async () => {
    window.unchainAPI = {
      installMcpToolkit: jest
        .fn()
        .mockRejectedValue(
          new Error("mcp_workspace_required: Workspace required"),
        ),
    };

    await expect(
      api.unchain.installMcpToolkit({ entryId: "workspace.filesystem" }),
    ).rejects.toMatchObject({
      code: "mcp_workspace_required",
      message: "mcp_workspace_required: Workspace required",
    });
  });
});
