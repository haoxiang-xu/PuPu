import {
  normalizeCustomMcpRecipe,
  parseCustomMcpEnvSecrets,
  setupKindForEntry,
  isEntryOAuthConnectable,
  isEntryInstallable,
  entryInstallState,
  resolveInstallWorkspace,
  installMcpEntry,
  connectMcpOAuthEntry,
  ensureWorkspaceForEntry,
} from "./mcp_install";
import api from "./api";
import { setDefaultToolkitEnabled } from "./default_toolkit_store";
import { getMcpStoreEntry } from "./mcp_toolkit_store";
import {
  readWorkspaceRoot,
  writeWorkspaceRoot,
} from "../COMPONENTs/settings/runtime";
import { runtimeBridge } from "./bridges/unchain_bridge";

jest.mock("./api", () => ({
  __esModule: true,
  default: { unchain: {} },
}));
jest.mock("../COMPONENTs/settings/runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: jest.fn(() => ""),
  writeWorkspaceRoot: jest.fn(),
}));
jest.mock("./bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: { showOpenDialog: jest.fn() },
}));
jest.mock("./default_toolkit_store", () => ({
  __esModule: true,
  setDefaultToolkitEnabled: jest.fn(() => []),
}));

describe("mcp_install helpers", () => {
  test("installability is derived from registry metadata", () => {
    expect(isEntryInstallable(getMcpStoreEntry("browser.playwright"))).toBe(true);
    expect(isEntryInstallable(getMcpStoreEntry("dev.github-remote"))).toBe(true);
    expect(isEntryInstallable(getMcpStoreEntry("productivity.notion-remote")))
      .toBe(false);
    expect(isEntryInstallable({ status: "available", installable: false }))
      .toBe(false);
    expect(isEntryInstallable({ id: "custom", status: "available" })).toBe(true);
  });

  test("setupKindForEntry classifies workspace, secret, http secret, explicit oauth, public HTTP, custom, and direct entries", () => {
    expect(
      setupKindForEntry({
        workspace: { required: true, binding: "agent_workspace_root" },
      }),
    ).toBe("workspace");
    expect(
      setupKindForEntry({
        id: "browser.browser-use-local",
        secrets: [{ key: "OPENAI_API_KEY" }],
        mcp: { transport: "stdio" },
      }),
    ).toBe("secrets");
    expect(
      setupKindForEntry({
        id: "dev.github-remote",
        secrets: [{ key: "GITHUB_MCP_PAT" }],
        mcp: { transport: "http" },
      }),
    ).toBe("http_secret");
    expect(
      setupKindForEntry({
        id: "productivity.notion-remote",
        secrets: [],
        mcp: { transport: "http" },
        auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
      }),
    ).toBe("oauth");
    expect(
      setupKindForEntry({
        id: "public-http",
        installable: true,
        secrets: [],
        mcp: { transport: "http" },
      }),
    ).toBe("direct");
    expect(setupKindForEntry({ id: "custom" })).toBe("custom");
    expect(setupKindForEntry({ id: "memory.memory" })).toBe("direct");
  });

  test("OAuth release readiness gates Connect without blocking PAT install", () => {
    const github = {
      id: "dev.github-remote",
      toolkitId: "mcp.dev.github-remote",
      status: "available",
      installable: true,
      secrets: [{ key: "GITHUB_MCP_PAT" }],
      auth: {
        oauth: {
          provider: "github",
          clientRegistration: "user_credentials",
          releaseStatus: "app_required",
        },
      },
      mcp: { transport: "http" },
    };
    const notionRemote = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      installable: false,
      secrets: [],
      auth: {
        oauth: {
          provider: "notion",
          clientRegistration: "dynamic",
          releaseStatus: "ready",
        },
      },
      mcp: { transport: "http" },
    };
    const figmaRemote = {
      ...notionRemote,
      id: "dev.figma-remote",
      toolkitId: "mcp.dev.figma-remote",
      status: "coming_soon",
      auth: {
        oauth: {
          provider: "figma",
          clientRegistration: "dynamic",
          releaseStatus: "approval_required",
        },
      },
    };

    expect(isEntryOAuthConnectable(github)).toBe(false);
    expect(isEntryInstallable(github)).toBe(true);
    expect(entryInstallState(github, new Set())).toBe("installable");
    expect(isEntryOAuthConnectable(notionRemote)).toBe(true);
    expect(
      isEntryOAuthConnectable({ ...notionRemote, status: undefined }),
    ).toBe(false);
    expect(isEntryInstallable(notionRemote)).toBe(false);
    expect(entryInstallState(notionRemote, new Set())).toBe("oauth");
    expect(isEntryOAuthConnectable(figmaRemote)).toBe(false);
    expect(entryInstallState(figmaRemote, new Set())).toBe("coming_soon");
  });

  test("entryInstallState reflects installed set", () => {
    const installed = new Set(["mcp.browser.playwright"]);
    expect(
      entryInstallState(
        {
          id: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          status: "available",
          installable: true,
        },
        installed,
      ),
    ).toBe("installed");
    expect(
      entryInstallState(
        {
          id: "memory.memory",
          toolkitId: "mcp.memory.memory",
          status: "available",
          installable: true,
        },
        installed,
      ),
    ).toBe("installable");
    expect(
      entryInstallState(
        {
          id: "productivity.notion-remote",
          toolkitId: "mcp.productivity.notion-remote",
          status: "available",
          installable: false,
          mcp: { transport: "http" },
          secrets: [],
          auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
        },
        installed,
      ),
    ).toBe("oauth");
    expect(
      entryInstallState(
        {
          id: "productivity.slack",
          toolkitId: "mcp.productivity.slack",
          status: "needs_review",
        },
        installed,
      ),
    ).toBe("needs_review");
    expect(
      entryInstallState(
        {
          id: "legacy.unknown-policy",
          toolkitId: "mcp.legacy.unknown-policy",
          installable: true,
        },
        new Set(["mcp.legacy.unknown-policy"]),
      ),
    ).toBe("coming_soon");
  });

  test("entryInstallState applies the current release policy before an old installed record", () => {
    const installed = new Set(["mcp.dev.figma-remote"]);

    expect(
      entryInstallState(
        {
          id: "dev.figma-remote",
          toolkitId: "mcp.dev.figma-remote",
          status: "coming_soon",
          installable: false,
          mcp: { transport: "http" },
          auth: {
            oauth: {
              provider: "figma",
              releaseStatus: "approval_required",
            },
          },
        },
        installed,
      ),
    ).toBe("coming_soon");
    expect(
      entryInstallState(
        {
          id: "productivity.slack-remote",
          toolkitId: "mcp.productivity.slack-remote",
          status: "needs_review",
        },
        new Set(["mcp.productivity.slack-remote"]),
      ),
    ).toBe("needs_review");
  });

  test("workspace entries require workspace root, others do not", () => {
    const workspaceEntry = {
      workspace: { required: true, binding: "agent_workspace_root" },
    };
    expect(resolveInstallWorkspace(workspaceEntry, "")).toEqual({
      ok: false,
      code: "mcp_workspace_required",
    });
    expect(resolveInstallWorkspace(workspaceEntry, "/ws")).toEqual({
      ok: true,
      workspaceRoot: "/ws",
    });
    expect(resolveInstallWorkspace({ id: "browser.playwright" }, "")).toEqual({
      ok: true,
      workspaceRoot: "",
    });
  });

  test("installMcpEntry forwards secrets and custom recipe and auto-enables returned toolkit id", async () => {
    api.unchain.installMcpToolkit = jest.fn().mockResolvedValue({
      toolkit: { toolkitId: "mcp.custom.local-test" },
    });
    const customRecipe = {
      toolkit_id: "mcp.custom.local-test",
      toolkit_name: "Local Test",
      mcp: { transport: "stdio", command: "echo", args: ["ok"] },
    };

    const result = await installMcpEntry(
      {
        id: "custom",
        toolkitId: "mcp.custom.local-test",
        status: "available",
      },
      {
        secrets: { TOKEN: "secret" },
        customRecipe,
      },
    );

    expect(api.unchain.installMcpToolkit).toHaveBeenCalledWith({
      entryId: "custom",
      workspaceRoot: "",
      secrets: { TOKEN: "secret" },
      customRecipe,
    });
    expect(setDefaultToolkitEnabled).toHaveBeenCalledWith(
      "global",
      "mcp.custom.local-test",
      true,
    );
    expect(result).toEqual({ ok: true, toolkitId: "mcp.custom.local-test" });
  });

  test("connectMcpOAuthEntry starts OAuth, polls status, auto-enables, and refreshes catalog", async () => {
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      entryId: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      authUrl: "https://auth.notion.test/authorize",
      state: "state-success",
    });
    api.unchain.getMcpOAuthStatus = jest.fn().mockResolvedValue({
      entryId: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      authStatus: "connected",
    });

    const result = await connectMcpOAuthEntry(
      {
        id: "productivity.notion-remote",
        toolkitId: "mcp.productivity.notion-remote",
        status: "available",
        mcp: { transport: "http" },
        auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
      },
      { pollDelayMs: 0, maxAttempts: 1 },
    );

    expect(api.unchain.startMcpOAuth).toHaveBeenCalledWith(
      "productivity.notion-remote",
    );
    expect(api.unchain.getMcpOAuthStatus).toHaveBeenCalledWith(
      "state-success",
    );
    expect(setDefaultToolkitEnabled).toHaveBeenCalledWith(
      "global",
      "mcp.productivity.notion-remote",
      true,
    );
    expect(result).toEqual({
      ok: true,
      toolkitId: "mcp.productivity.notion-remote",
    });
  });

  test("connectMcpOAuthEntry rejects a release-blocked provider before calling the API", async () => {
    api.unchain.startMcpOAuth = jest.fn();

    await expect(
      connectMcpOAuthEntry({
        id: "dev.figma-remote",
        toolkitId: "mcp.dev.figma-remote",
        status: "coming_soon",
        mcp: { transport: "http" },
        auth: {
          oauth: {
            provider: "figma",
            releaseStatus: "approval_required",
          },
        },
      }),
    ).rejects.toMatchObject({ code: "unsupported_mcp_entry" });

    expect(api.unchain.startMcpOAuth).not.toHaveBeenCalled();
  });

  test("connectMcpOAuthEntry aborts with mcp_oauth_cancelled", async () => {
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      ok: true,
      state: "state-cancel",
    });
    api.unchain.cancelMcpOAuth = jest
      .fn()
      .mockResolvedValue({ ok: true, cancelled: true });
    api.unchain.getMcpOAuthStatus = jest
      .fn()
      .mockResolvedValue({ authStatus: "pending" });
    const controller = new AbortController();
    const promise = connectMcpOAuthEntry(oauthEntry, {
      maxAttempts: 5,
      pollDelayMs: 1,
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toMatchObject({
      code: "mcp_oauth_cancelled",
    });
    expect(api.unchain.cancelMcpOAuth).toHaveBeenCalledWith("state-cancel");
  });

  test("connectMcpOAuthEntry ignores a status that resolves after abort", async () => {
    setDefaultToolkitEnabled.mockClear();
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      ok: true,
      state: "state-stale-status",
    });
    api.unchain.cancelMcpOAuth = jest
      .fn()
      .mockResolvedValue({ ok: true, cancelled: true });
    let resolveStatus;
    api.unchain.getMcpOAuthStatus = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveStatus = resolve;
        }),
    );
    const controller = new AbortController();
    const promise = connectMcpOAuthEntry(oauthEntry, {
      maxAttempts: 5,
      pollDelayMs: 1,
      signal: controller.signal,
    });
    // Let the poll loop reach the pending getMcpOAuthStatus await.
    while (!api.unchain.getMcpOAuthStatus.mock.calls.length) {
      await Promise.resolve();
    }
    // User cancels while the status call is in flight, then a stale
    // "connected" status resolves afterwards.
    controller.abort();
    resolveStatus({
      authStatus: "connected",
      toolkitId: "mcp.productivity.notion-remote",
    });
    await expect(promise).rejects.toMatchObject({
      code: "mcp_oauth_cancelled",
    });
    expect(setDefaultToolkitEnabled).not.toHaveBeenCalled();
    expect(api.unchain.cancelMcpOAuth).toHaveBeenCalledWith(
      "state-stale-status",
    );
  });

  test("connectMcpOAuthEntry reports a failed backend cancellation", async () => {
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      ok: true,
      state: "state-cancel-failed",
    });
    api.unchain.getMcpOAuthStatus = jest
      .fn()
      .mockResolvedValue({ authStatus: "pending" });
    const cancelError = Object.assign(new Error("Cancel failed"), {
      code: "mcp_oauth_cancel_failed",
    });
    api.unchain.cancelMcpOAuth = jest.fn().mockRejectedValue(cancelError);
    const controller = new AbortController();
    const promise = connectMcpOAuthEntry(oauthEntry, {
      maxAttempts: 5,
      pollDelayMs: 1,
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toBe(cancelError);
    expect(api.unchain.cancelMcpOAuth).toHaveBeenCalledWith(
      "state-cancel-failed",
    );
  });

  test("connectMcpOAuthEntry rejects when backend says cancellation lost the race", async () => {
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      state: "state-cancel-too-late",
    });
    api.unchain.getMcpOAuthStatus = jest
      .fn()
      .mockResolvedValue({ authStatus: "pending" });
    api.unchain.cancelMcpOAuth = jest
      .fn()
      .mockResolvedValue({ ok: true, cancelled: false, authStatus: "connected" });
    const controller = new AbortController();
    const promise = connectMcpOAuthEntry(oauthEntry, {
      maxAttempts: 5,
      pollDelayMs: 1,
      signal: controller.signal,
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      code: "mcp_oauth_cancel_failed",
    });
    expect(api.unchain.cancelMcpOAuth).toHaveBeenCalledWith(
      "state-cancel-too-late",
    );
  });

  test("connectMcpOAuthEntry rejects a start response without attempt state", async () => {
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({ ok: true });
    api.unchain.getMcpOAuthStatus = jest.fn();

    await expect(connectMcpOAuthEntry(oauthEntry)).rejects.toMatchObject({
      code: "mcp_oauth_start_failed",
    });
    expect(api.unchain.getMcpOAuthStatus).not.toHaveBeenCalled();
  });

  test("connectMcpOAuthEntry defaults to 60 attempts", async () => {
    const oauthEntry = {
      id: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      status: "available",
      mcp: { transport: "http" },
      auth: { oauth: { provider: "notion", releaseStatus: "ready" } },
    };
    api.unchain.startMcpOAuth = jest.fn().mockResolvedValue({
      ok: true,
      state: "state-default-attempts",
    });
    api.unchain.getMcpOAuthStatus = jest
      .fn()
      .mockResolvedValue({ authStatus: "pending" });
    api.unchain.cancelMcpOAuth = jest
      .fn()
      .mockResolvedValue({ ok: true, cancelled: true });
    await expect(
      connectMcpOAuthEntry(oauthEntry, { pollDelayMs: 0 }),
    ).rejects.toMatchObject({ code: "mcp_oauth_pending" });
    expect(api.unchain.getMcpOAuthStatus).toHaveBeenCalledTimes(60);
  });

  describe("ensureWorkspaceForEntry", () => {
    const workspaceEntry = {
      workspace: { required: true, binding: "agent_workspace_root" },
    };
    const directEntry = { id: "browser.playwright" };

    beforeEach(() => {
      readWorkspaceRoot.mockReset();
      writeWorkspaceRoot.mockReset();
      runtimeBridge.showOpenDialog.mockReset();
    });

    test("ensureWorkspaceForEntry passes through when workspace already set", async () => {
      readWorkspaceRoot.mockReturnValue("/Users/me/ws");
      const result = await ensureWorkspaceForEntry(workspaceEntry);
      expect(result).toEqual({ ok: true, workspaceRoot: "/Users/me/ws" });
      expect(runtimeBridge.showOpenDialog).not.toHaveBeenCalled();
    });

    test("ensureWorkspaceForEntry opens picker and persists choice", async () => {
      readWorkspaceRoot.mockReturnValue("");
      runtimeBridge.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ["/Users/me/picked"],
      });
      const result = await ensureWorkspaceForEntry(workspaceEntry);
      expect(runtimeBridge.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: expect.arrayContaining(["openDirectory"]),
        }),
      );
      expect(writeWorkspaceRoot).toHaveBeenCalledWith("/Users/me/picked");
      expect(result).toEqual({ ok: true, workspaceRoot: "/Users/me/picked" });
    });

    test("ensureWorkspaceForEntry returns canceled when user dismisses", async () => {
      readWorkspaceRoot.mockReturnValue("");
      runtimeBridge.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: [],
      });
      await expect(ensureWorkspaceForEntry(workspaceEntry)).resolves.toEqual({
        ok: false,
        canceled: true,
      });
      expect(writeWorkspaceRoot).not.toHaveBeenCalled();
    });

    test("ensureWorkspaceForEntry treats a whitespace-only pick as canceled", async () => {
      readWorkspaceRoot.mockReturnValue("");
      runtimeBridge.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ["   "],
      });
      await expect(ensureWorkspaceForEntry(workspaceEntry)).resolves.toEqual({
        ok: false,
        canceled: true,
      });
      expect(writeWorkspaceRoot).not.toHaveBeenCalled();
    });

    test("ensureWorkspaceForEntry is a no-op for non-workspace entries", async () => {
      readWorkspaceRoot.mockReturnValue("");
      const result = await ensureWorkspaceForEntry(directEntry);
      expect(result.ok).toBe(true);
      expect(runtimeBridge.showOpenDialog).not.toHaveBeenCalled();
    });
  });

  test("normalizeCustomMcpRecipe builds a stable stdio recipe", () => {
    expect(
      normalizeCustomMcpRecipe({
        name: "Local",
        command: "npx",
        argsText: '-y "@scope/server"',
        envSecretsText: "LOCAL_TOKEN=secret-value",
      }),
    ).toEqual({
      toolkit_id: expect.stringMatching(/^mcp\.custom\.local$/),
      toolkit_name: "Local",
      toolkit_description: "",
      secrets: [{ key: "LOCAL_TOKEN", label: "LOCAL_TOKEN" }],
      mcp: { transport: "stdio", command: "npx", args: ["-y", "@scope/server"] },
    });
  });

  test("parseCustomMcpEnvSecrets returns secret specs and install values", () => {
    expect(
      parseCustomMcpEnvSecrets(`
        LOCAL_TOKEN=secret-value
        API_KEY = sk-test
      `),
    ).toEqual({
      specs: [
        { key: "LOCAL_TOKEN", label: "LOCAL_TOKEN" },
        { key: "API_KEY", label: "API_KEY" },
      ],
      values: {
        LOCAL_TOKEN: "secret-value",
        API_KEY: "sk-test",
      },
    });
  });
});
