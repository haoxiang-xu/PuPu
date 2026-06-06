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
  });

  test("proxies install/delete/reload/health through the bridge", async () => {
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
    };

    await api.unchain.listMcpToolkits();
    await api.unchain.installMcpToolkit({
      entryId: "workspace.filesystem",
      workspaceRoot: "/tmp/project",
    });
    await api.unchain.reloadMcpToolkits({ workspaceRoot: "/tmp/project" });
    await api.unchain.checkMcpToolkitHealth("mcp.workspace.filesystem", {
      workspaceRoot: "/tmp/project",
    });
    await api.unchain.deleteMcpToolkit("mcp.workspace.filesystem");

    expect(window.unchainAPI.listMcpToolkits).toHaveBeenCalledTimes(1);
    expect(window.unchainAPI.installMcpToolkit).toHaveBeenCalledWith({
      entryId: "workspace.filesystem",
      workspaceRoot: "/tmp/project",
    });
    expect(window.unchainAPI.reloadMcpToolkits).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project",
    });
    expect(window.unchainAPI.checkMcpToolkitHealth).toHaveBeenCalledWith(
      "mcp.workspace.filesystem",
      { workspaceRoot: "/tmp/project" },
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
