import {
  MCP_STORE_CATEGORIES,
  MCP_STORE_ENTRIES,
  clearMcpStoreMetadataCache,
  clearMcpStoreEntriesCache,
  listMcpStoreEntries,
  getMcpStoreEntry,
  mcpStoreIconFor,
  resolveMcpIcon,
  searchMcpStoreEntries,
  setMcpStoreEntriesCache,
  setMcpStoreMetadataCache,
  withMcpStoreIcon,
} from "./mcp_toolkit_store";

describe("mcp_toolkit_store", () => {
  afterEach(() => {
    clearMcpStoreMetadataCache();
    clearMcpStoreEntriesCache();
  });

  test("categories start with all and include the known set", () => {
    expect(MCP_STORE_CATEGORIES[0]).toBe("all");
    expect(MCP_STORE_CATEGORIES).toEqual(
      expect.arrayContaining([
        "browser",
        "dev",
        "devops",
        "productivity",
        "workspace",
        "memory",
      ]),
    );
  });

  test("every entry carries the Installed-compatible fields", () => {
    for (const entry of listMcpStoreEntries()) {
      expect(typeof entry.id).toBe("string");
      expect(entry.toolkitId).toMatch(/^mcp\./);
      expect(typeof entry.toolkitName).toBe("string");
      expect(typeof entry.toolkitDescription).toBe("string");
      expect(entry.source).toBe("mcp");
      expect(MCP_STORE_CATEGORIES).toContain(entry.category);
      expect(["stdio", "http"]).toContain(entry.mcp.transport);
      expect(Array.isArray(entry.tools)).toBe(true);
      expect(["builtin", "file"]).toContain(resolveMcpIcon(entry).type);
    }
  });

  test("entries may omit toolkitIcon and resolve to the mcp icon without background", () => {
    const playwright = getMcpStoreEntry("browser.playwright");
    expect(playwright.toolkitIcon).toBeUndefined();
    expect(resolveMcpIcon(playwright)).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
  });

  test("mcp toolkit fallbacks use the mcp icon when backend sends an empty icon", () => {
    expect(
      resolveMcpIcon({
        toolkitId: "mcp.custom.local-empty",
        source: "mcp",
        toolkitIcon: {},
      }),
    ).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
    expect(
      withMcpStoreIcon({
        toolkitId: "mcp.custom.local-empty",
        source: "mcp",
        toolkitIcon: {},
      }).toolkitIcon,
    ).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
    expect(mcpStoreIconFor("mcp.custom.local-empty")).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
  });

  test("mcp toolkit treats generic tool and invalid builtin icons as missing icons", () => {
    expect(
      resolveMcpIcon({
        source: "mcp",
        toolkitId: "mcp.custom.generic-tool",
        toolkitIcon: {
          type: "builtin",
          name: "tool",
          backgroundColor: "#111827",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );

    expect(
      withMcpStoreIcon({
        source: "mcp",
        toolkitId: "mcp.custom.invalid-icon",
        toolkitIcon: {
          type: "builtin",
          name: "missing_icon",
          backgroundColor: "#111827",
        },
      }).toolkitIcon,
    ).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
  });

  test("browser use uses the official brand svg icon", () => {
    const browserUse = getMcpStoreEntry("browser.browser-use-local");

    expect(browserUse.toolkitIcon).toEqual(
      expect.objectContaining({
        type: "file",
        mimeType: "image/svg+xml",
      }),
    );
    expect(browserUse.toolkitIcon.content).toContain('viewBox="-24 -24 148 148"');
    expect(browserUse.toolkitIcon.content).toContain(
      '<rect x="-24" y="-24" width="148" height="148" rx="28" fill="#18181B"/>',
    );
    expect(browserUse.toolkitIcon.content).toContain('fill="#FE750E"');
    expect(browserUse.toolkitIcon.content).toContain("M97.8916 39.0448");
    expect(resolveMcpIcon(browserUse)).toEqual(browserUse.toolkitIcon);
  });

  test("figma remote uses the official brand svg icon", () => {
    const figma = getMcpStoreEntry("dev.figma-remote");

    expect(figma.toolkitIcon).toEqual(
      expect.objectContaining({
        type: "file",
        mimeType: "image/svg+xml",
      }),
    );
    expect(figma.toolkitIcon.content).toContain('viewBox="0 0 1024 1024"');
    expect(figma.toolkitIcon.content).toContain(
      '<rect width="1024" height="1024" rx="180" fill="#000000"/>',
    );
    expect(figma.toolkitIcon.content).toContain('fill="#FF3737"');
    expect(figma.toolkitIcon.content).toContain('fill="#874FFF"');
    expect(figma.toolkitIcon.content).toContain('fill="#24CB71"');
    expect(figma.toolkitIcon.content).toContain('fill="#FF7237"');
    expect(figma.toolkitIcon.content).toContain('fill="#00B6FF"');
    expect(resolveMcpIcon(figma)).toEqual(figma.toolkitIcon);
  });

  test("metadata cache overlays entries without mutating the static registry", () => {
    const before = getMcpStoreEntry("browser.playwright");
    expect(before.toolkitDescription).toBe(
      "Browser automation through the official Playwright MCP server.",
    );

    setMcpStoreMetadataCache({
      entries: [
        {
          entryId: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          metadata: {
            description: "Fetched Playwright description",
            license: "Apache-2.0",
            stars: 1234,
            fullName: "microsoft/playwright-mcp",
          },
          icon: {
            type: "file",
            mimeType: "image/svg+xml",
            content: "<svg />",
          },
          iconPolicy: "fallback",
        },
      ],
    });

    const after = getMcpStoreEntry("browser.playwright");
    expect(after.toolkitDescription).toBe("Fetched Playwright description");
    expect(after.license).toBe("Apache-2.0");
    expect(after.repoStars).toBe(1234);
    expect(after.repoFullName).toBe("microsoft/playwright-mcp");
    expect(MCP_STORE_ENTRIES.find((entry) => entry.id === "browser.playwright").toolkitDescription).toBe(
      "Browser automation through the official Playwright MCP server.",
    );
  });

  test("external registry entries overlay the static store as review-only", () => {
    setMcpStoreEntriesCache({
      entries: [
        ...MCP_STORE_ENTRIES,
        {
          id: "external.sample",
          toolkitId: "mcp.external.sample",
          toolkitName: "External Sample",
          toolkitDescription: "External review entry",
          category: "dev",
          source: "mcp_registry",
          trustLevel: "external_review",
          status: "needs_review",
          installable: false,
          registryId: "registry.inline.test",
          registryName: "Sample Registry",
          mcp: {
            transport: "http",
            runtime_transport: "streamable_http",
            url: "https://example.test/mcp",
            headers: [],
          },
          tools: [{ name: "external_search", title: "Search" }],
          policySummary: { reviewed: false },
        },
      ],
    });

    const external = getMcpStoreEntry("external.sample");
    expect(external).toEqual(
      expect.objectContaining({
        source: "mcp_registry",
        trustLevel: "external_review",
        status: "needs_review",
        installable: false,
        registryName: "Sample Registry",
      }),
    );
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "external_search", "all")
        .map((entry) => entry.id),
    ).toContain("external.sample");
  });

  test("metadata fallback icon does not override the default mcp icon", () => {
    const avatarIcon = {
      type: "file",
      mimeType: "image/png",
      content: "iVBORw0KGgo=",
    };
    setMcpStoreMetadataCache({
      entries: [
        {
          entryId: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          icon: avatarIcon,
          iconPolicy: "fallback",
        },
        {
          entryId: "dev.github-remote",
          toolkitId: "mcp.dev.github-remote",
          icon: avatarIcon,
          iconPolicy: "fallback",
        },
      ],
    });

    expect(resolveMcpIcon(getMcpStoreEntry("browser.playwright"))).toEqual(
      expect.objectContaining({ type: "builtin", name: "mcp" }),
    );
    expect(mcpStoreIconFor("mcp.browser.playwright")).toEqual(
      expect.objectContaining({ type: "builtin", name: "mcp" }),
    );
    expect(resolveMcpIcon(getMcpStoreEntry("dev.github-remote"))).toEqual(
      expect.objectContaining({ type: "builtin", name: "github" }),
    );
  });

  test("metadata replace icon can override an explicit registry icon", () => {
    const replacement = {
      type: "file",
      mimeType: "image/png",
      content: "iVBORw0KGgo=",
    };
    setMcpStoreMetadataCache({
      entries: [
        {
          entryId: "dev.github-remote",
          toolkitId: "mcp.dev.github-remote",
          icon: replacement,
          iconPolicy: "replace",
        },
      ],
    });

    expect(resolveMcpIcon(getMcpStoreEntry("dev.github-remote"))).toEqual(
      replacement,
    );
    expect(withMcpStoreIcon({
      source: "mcp",
      toolkitId: "mcp.dev.github-remote",
    }).toolkitIcon).toEqual(replacement);
  });

  test("getMcpStoreEntry returns the entry or null", () => {
    expect(getMcpStoreEntry("browser.playwright").toolkitName).toBe(
      "Playwright Browser",
    );
    expect(getMcpStoreEntry("does.not.exist")).toBeNull();
  });

  test("searchMcpStoreEntries filters by category", () => {
    const browser = searchMcpStoreEntries(
      listMcpStoreEntries(),
      "",
      "browser",
    );
    expect(browser.length).toBeGreaterThan(0);
    expect(browser.every((entry) => entry.category === "browser")).toBe(true);
  });

  test("searchMcpStoreEntries all category returns everything", () => {
    const all = searchMcpStoreEntries(listMcpStoreEntries(), "", "all");
    expect(all.length).toBe(listMcpStoreEntries().length);
  });

  test("searchMcpStoreEntries matches name, description and tool names", () => {
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "github", "all").some(
        (entry) => entry.id === "dev.github-remote",
      ),
    ).toBe(true);
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "notion", "all").some(
        (entry) => entry.id === "productivity.notion-remote",
      ),
    ).toBe(true);
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "filesystem", "all").some(
        (entry) => entry.id === "workspace.filesystem",
      ),
    ).toBe(true);
  });

  test("registry includes stdio and http MCP shapes", () => {
    expect(MCP_STORE_ENTRIES.some((entry) => entry.mcp.transport === "stdio"))
      .toBe(true);
    expect(MCP_STORE_ENTRIES.some((entry) => entry.mcp.transport === "http"))
      .toBe(true);
  });

  test("workspace requirements are exposed through generic registry fields", () => {
    const filesystem = getMcpStoreEntry("workspace.filesystem");
    expect(filesystem.requiresWorkspace).toBe(true);
    expect(filesystem.workspaceBinding).toBe("agent_workspace_root");
    expect(filesystem.workspacePlaceholder).toBe("${WORKSPACE}");
  });

  test("markitdown is registered as a workspace MCP converter", () => {
    const markitdown = getMcpStoreEntry("workspace.markitdown");

    expect(markitdown).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.workspace.markitdown",
        toolkitName: "MarkItDown",
        category: "workspace",
        source: "mcp",
        trustLevel: "verified",
        installable: true,
        license: "MIT",
        sourceRepo: "https://github.com/microsoft/markitdown",
        docsUrl: "https://github.com/microsoft/markitdown/tree/main/packages/markitdown-mcp",
      }),
    );
    expect(markitdown.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "uvx",
        args: ["markitdown-mcp"],
      }),
    );
    expect(markitdown.secrets).toEqual([]);
    expect(markitdown.prerequisites).toEqual(
      expect.arrayContaining(["uv / uvx", "Python >= 3.10"]),
    );
    expect(markitdown.tools).toEqual([
      expect.objectContaining({
        name: "convert_to_markdown",
        title: "Convert to Markdown",
        requiresConfirmation: true,
      }),
    ]);
    expect(markitdown.policySummary).toEqual(
      expect.objectContaining({
        reviewed: true,
        defaultEnabledTools: 0,
        confirmationRequiredTools: 1,
      }),
    );
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "convert_to_markdown", "workspace")
        .map((entry) => entry.id),
    ).toContain("workspace.markitdown");
  });

  test("devops category includes Sentry, Vercel, Grafana and Netdata recipes", () => {
    const devopsEntries = searchMcpStoreEntries(
      listMcpStoreEntries(),
      "",
      "devops",
    );
    expect(devopsEntries.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "devops.sentry-remote",
        "devops.vercel-remote",
        "devops.grafana",
        "devops.netdata-cloud",
      ]),
    );

    const sentry = getMcpStoreEntry("devops.sentry-remote");
    expect(sentry).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.devops.sentry-remote",
        toolkitName: "Sentry",
        category: "devops",
        trustLevel: "verified",
        installable: false,
        license: "NOASSERTION",
        docsUrl: "https://mcp.sentry.dev",
      }),
    );
    expect(sentry.mcp).toEqual(
      expect.objectContaining({
        transport: "http",
        runtime_transport: "streamable_http",
        url: "https://mcp.sentry.dev/mcp",
      }),
    );
    expect(sentry.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "sentry",
        clientRegistration: "dynamic",
        mcpUrl: "https://mcp.sentry.dev/mcp",
        authorizationEndpoint: "https://mcp.sentry.dev/oauth/authorize",
        tokenEndpoint: "https://mcp.sentry.dev/oauth/token",
        registrationEndpoint: "https://mcp.sentry.dev/oauth/register",
      }),
    );

    const vercel = getMcpStoreEntry("devops.vercel-remote");
    expect(vercel.mcp).toEqual(
      expect.objectContaining({
        transport: "http",
        runtime_transport: "streamable_http",
        url: "https://mcp.vercel.com",
      }),
    );
    expect(vercel.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "vercel",
        clientRegistration: "dynamic",
        mcpUrl: "https://mcp.vercel.com",
        protectedResourceMetadataUrl:
          "https://mcp.vercel.com/.well-known/oauth-protected-resource",
      }),
    );

    const grafana = getMcpStoreEntry("devops.grafana");
    expect(grafana.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "uvx",
        args: ["mcp-grafana"],
      }),
    );
    expect(grafana.secrets).toEqual([
      expect.objectContaining({ key: "GRAFANA_URL" }),
      expect.objectContaining({ key: "GRAFANA_SERVICE_ACCOUNT_TOKEN" }),
    ]);

    const netdata = getMcpStoreEntry("devops.netdata-cloud");
    expect(netdata.mcp).toEqual(
      expect.objectContaining({
        transport: "http",
        runtime_transport: "streamable_http",
        url: "https://app.netdata.cloud/api/v1/mcp",
      }),
    );
    expect(netdata.secrets).toEqual([
      expect.objectContaining({ key: "NETDATA_CLOUD_MCP_TOKEN" }),
    ]);
    expect(netdata.mcp.headers).toEqual([
      expect.objectContaining({
        name: "Authorization",
        value_from_secret: "NETDATA_CLOUD_MCP_TOKEN",
        prefix: "Bearer ",
      }),
    ]);
  });

  test("chrome devtools MCP is registered as a direct browser toolkit", () => {
    const chrome = getMcpStoreEntry("browser.chrome-devtools");

    expect(chrome).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.browser.chrome-devtools",
        toolkitName: "Chrome DevTools",
        category: "browser",
        trustLevel: "verified",
        installable: true,
        license: "Apache-2.0",
        sourceRepo: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
      }),
    );
    expect(chrome.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "npx",
        args: ["-y", "chrome-devtools-mcp@latest"],
      }),
    );
    expect(chrome.secrets).toEqual([]);
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "performance trace", "browser")
        .map((entry) => entry.id),
    ).toContain("browser.chrome-devtools");
  });

  test("new devops and chrome entries carry JSON-defined brand icons", () => {
    for (const id of [
      "browser.chrome-devtools",
      "devops.sentry-remote",
      "devops.vercel-remote",
      "devops.grafana",
      "devops.netdata-cloud",
    ]) {
      const entry = getMcpStoreEntry(id);
      expect(resolveMcpIcon(entry)).toEqual(
        expect.objectContaining({
          type: "file",
          mimeType: "image/svg+xml",
          displayScale: 0.82,
        }),
      );
      expect(resolveMcpIcon(entry).content).toContain("<svg");
    }
  });

  test("github remote uses GITHUB_MCP_PAT, not GITHUB_TOKEN", () => {
    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.secrets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "GITHUB_MCP_PAT" }),
      ]),
    );
    expect(github.secrets.some((secret) => secret.key === "GITHUB_TOKEN"))
      .toBe(false);
  });

  test("github and slack entries declare all backend-required secrets", () => {
    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.secrets).toEqual([
      expect.objectContaining({ key: "GITHUB_MCP_PAT" }),
    ]);
    expect(github.secrets[0].optional).not.toBe(true);

    const slack = getMcpStoreEntry("productivity.slack");
    expect(slack.status).toBe("available");
    expect(slack.trustLevel).toBe("needs_review");
    expect(slack.secrets).toEqual([
      expect.objectContaining({ key: "SLACK_BOT_TOKEN" }),
      expect.objectContaining({ key: "SLACK_TEAM_ID" }),
    ]);
  });

  test("oauth-capable entries declare generic oauth recipes", () => {
    const notion = getMcpStoreEntry("productivity.notion-remote");
    expect(notion.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "notion",
        clientRegistration: "dynamic",
        transport: "streamable_http",
      }),
    );

    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "github",
        clientRegistration: "user_credentials",
      }),
    );

    const slackRemote = getMcpStoreEntry("productivity.slack-remote");
    expect(slackRemote.toolkitId).toBe("mcp.productivity.slack-remote");
    expect(slackRemote.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "slack",
        clientRegistration: "user_credentials",
        mcpUrl: "https://mcp.slack.com/mcp",
      }),
    );
    const sentry = getMcpStoreEntry("devops.sentry-remote");
    expect(sentry.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "sentry",
        clientRegistration: "dynamic",
      }),
    );

    const vercel = getMcpStoreEntry("devops.vercel-remote");
    expect(vercel.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "vercel",
        clientRegistration: "dynamic",
      }),
    );

    const figma = getMcpStoreEntry("dev.figma-remote");
    expect(figma).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.dev.figma-remote",
        toolkitName: "Figma",
        category: "dev",
        installable: false,
      }),
    );
    expect(figma.mcp).toEqual(
      expect.objectContaining({
        transport: "http",
        runtime_transport: "streamable_http",
        url: "https://mcp.figma.com/mcp",
      }),
    );
    expect(figma.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "figma",
        clientRegistration: "dynamic",
        mcpUrl: "https://mcp.figma.com/mcp",
        protectedResourceMetadataUrl: "https://mcp.figma.com/.well-known/oauth-protected-resource",
        authorizationServerMetadataUrl: "https://api.figma.com/.well-known/oauth-authorization-server",
        scopes: ["mcp:connect"],
      }),
    );
    expect(getMcpStoreEntry("productivity.slack").toolkitId).toBe(
      "mcp.productivity.slack",
    );
  });
});
