jest.mock("./api", () => ({
  __esModule: true,
  default: { unchain: {} },
}));
jest.mock("../COMPONENTs/settings/runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));
jest.mock("./default_toolkit_store", () => ({
  __esModule: true,
  setDefaultToolkitEnabled: jest.fn(() => []),
}));

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
} from "./mcp_install";
import api from "./api";
import { setDefaultToolkitEnabled } from "./default_toolkit_store";
import { getMcpStoreEntry } from "./mcp_toolkit_store";

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

  test("setupKindForEntry classifies workspace, secret, http secret, oauth, custom, and direct entries", () => {
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
      }),
    ).toBe("oauth");
    expect(setupKindForEntry({ id: "custom" })).toBe("custom");
    expect(setupKindForEntry({ id: "memory.memory" })).toBe("direct");
  });

  test("auth recipe marks entries as oauth-connectable without blocking PAT install", () => {
    const github = {
      id: "dev.github-remote",
      toolkitId: "mcp.dev.github-remote",
      status: "available",
      installable: true,
      secrets: [{ key: "GITHUB_MCP_PAT" }],
      auth: { oauth: { provider: "github", clientRegistration: "user_credentials" } },
      mcp: { transport: "http" },
    };
    const slackRemote = {
      id: "productivity.slack-remote",
      toolkitId: "mcp.productivity.slack-remote",
      status: "available",
      installable: false,
      secrets: [],
      auth: { oauth: { provider: "slack", clientRegistration: "user_credentials" } },
      mcp: { transport: "http" },
    };

    expect(isEntryOAuthConnectable(github)).toBe(true);
    expect(isEntryInstallable(github)).toBe(true);
    expect(entryInstallState(github, new Set())).toBe("installable");
    expect(isEntryOAuthConnectable(slackRemote)).toBe(true);
    expect(isEntryInstallable(slackRemote)).toBe(false);
    expect(entryInstallState(slackRemote, new Set())).toBe("oauth");
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
        mcp: { transport: "http" },
      },
      { pollDelayMs: 0, maxAttempts: 1 },
    );

    expect(api.unchain.startMcpOAuth).toHaveBeenCalledWith(
      "productivity.notion-remote",
    );
    expect(api.unchain.getMcpOAuthStatus).toHaveBeenCalledWith(
      "productivity.notion-remote",
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
