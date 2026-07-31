import {
  DEFAULT_MCP_ICON,
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

  /* ── store-front icon invariant ─────────────────────────────────────────
     2026-07-27 asserted "every registry entry declares its own brand icon".
     2026-07-28 the CEO retired that rule: only entries with a genuine official
     logo may carry one, and an entry with no official logo must SHOW the
     generic mcp glyph rather than wear a self-made or borrowed mark. So an
     entry omitting `icon` is now a legal, intended state.

     What replaces it is a total spec — every entry falls in exactly one bucket
     and both buckets have a pinned outcome:
       (A) declares an icon  -> resolveMcpIcon returns THAT icon, verbatim
       (B) omits it          -> resolveMcpIcon returns DEFAULT_MCP_ICON exactly

     (A) is the property actually worth defending: a real logo must never be
     shadowed by the default, by a metadata icon, or by a future placeholder
     scheme. (B) pins the newly-legal path so it cannot silently drift into a
     derived/generated placeholder without a fresh product decision — the
     grey glyph is the decision, not an accident. */
  test("a store entry that declares an icon resolves to exactly that icon", () => {
    const declared = listMcpStoreEntries().filter((e) => e.toolkitIcon);
    /* Anti-vacuity: if curation ever cleared every icon, bucket (A) would pass
       trivially and this gate would stop protecting the real logos. */
    expect(declared.length).toBeGreaterThan(0);
    for (const entry of declared) {
      expect({ id: entry.id, icon: resolveMcpIcon(entry) }).toEqual({
        id: entry.id,
        icon: entry.toolkitIcon,
      });
    }
  });

  test("a store entry that omits its icon resolves to the generic mcp glyph", () => {
    for (const entry of listMcpStoreEntries()) {
      if (entry.toolkitIcon) continue;
      expect({ id: entry.id, icon: resolveMcpIcon(entry) }).toEqual({
        id: entry.id,
        icon: DEFAULT_MCP_ICON,
      });
    }
  });

  test("a toolkit that omits its icon resolves to the mcp icon without background", () => {
    expect(
      resolveMcpIcon({ toolkitId: "mcp.custom.local-noicon", source: "mcp" }),
    ).toEqual(
      expect.objectContaining({
        type: "builtin",
        name: "mcp",
        backgroundColor: "transparent",
      }),
    );
  });

  test("a no-icon Store entry overrides a stale installed icon on every surface", () => {
    const staleInstalledMarkitdown = {
      source: "mcp",
      toolkitId: "mcp.workspace.markitdown",
      toolkitIcon: {
        type: "file",
        mimeType: "image/png",
        content: "stale-installed-icon",
      },
    };

    expect(getMcpStoreEntry("workspace.markitdown").toolkitIcon).toBeUndefined();
    expect(resolveMcpIcon(staleInstalledMarkitdown)).toEqual(DEFAULT_MCP_ICON);
    expect(withMcpStoreIcon(staleInstalledMarkitdown).toolkitIcon).toEqual(
      DEFAULT_MCP_ICON,
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

  test("browser use uses the official brand mark in an official monochrome treatment", () => {
    /* The shape is verified browser-use official (matches their favicon, the
       orbit/lens mark). The COLOR was not: until 2026-07-29 the mark was filled
       #FE750E, an accent that appears zero times on browser-use.com — it is
       only the theme color of their Mintlify docs site. So PuPu was shipping an
       official mark in a combination they never use.

       Every official browser-use rendering is monochrome: logo-grey.svg is
       solid #18181B, logo-white.svg is solid white, and the README/avatar/
       favicon are pure black-and-white. The mark is now white on their own
       near-black #18181B — i.e. logo-white.svg on their own ground, an
       authentic combination, and consistent with the other dark bricks
       (github/notion/slack are all #ffffff on a dark brand ground). */
    const browserUse = getMcpStoreEntry("browser.browser-use-local");
    const content = browserUse.toolkitIcon.content;

    expect(browserUse.toolkitIcon).toEqual(
      expect.objectContaining({
        type: "file",
        mimeType: "image/svg+xml",
      }),
    );
    /* shape preserved — the 2026-07-29 change was colour-only */
    expect(content).toContain('viewBox="-24 -24 148 148"');
    expect(content).toContain("M97.8916 39.0448");

    const brick = "#18181B";
    expect(content).toContain(
      `<rect x="-24" y="-24" width="148" height="148" rx="28" fill="${brick}"/>`,
    );
    /* monochrome: the mark is white on every path, and the docs-only accent is
       gone entirely */
    expect(content).toContain('fill="#ffffff"');
    expect(content).not.toContain("#FE750E");
    const markFills = [...content.matchAll(/<path [^>]*fill="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(markFills).toEqual(["#ffffff", "#ffffff", "#ffffff", "#ffffff"]);
    /* Contrast guard: the mark must never collapse into the brick. Recolouring
       a mark to the brick's own hex is a one-character mistake that renders an
       entirely invisible tile, and no other assertion here would catch it. */
    expect(markFills).not.toContain(brick);

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

  test("a fallback metadata icon loses to a registry-declared icon", () => {
    const avatarIcon = {
      type: "file",
      mimeType: "image/png",
      content: "iVBORw0KGgo=",
    };
    /* Premise: both samples must be entries that DECLARE a registry icon —
       that is the whole point of the assertions below. Curation may clear an
       entry's icon at any time (legal since 2026-07-28), so assert the premise
       here: if this trips, repoint the sample at a still-branded entry, do NOT
       relax the assertion. */
    expect(getMcpStoreEntry("browser.playwright").toolkitIcon).toBeTruthy();
    expect(getMcpStoreEntry("dev.github-remote").toolkitIcon).toBeTruthy();

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

    /* playwright ships an explicit registry icon, so a "fallback" metadata
       icon must lose to it — the registry svg wins, not the avatar png. */
    expect(resolveMcpIcon(getMcpStoreEntry("browser.playwright"))).toEqual(
      expect.objectContaining({ type: "file", mimeType: "image/svg+xml" }),
    );
    expect(mcpStoreIconFor("mcp.browser.playwright")).not.toMatchObject({
      content: avatarIcon.content,
    });
    expect(resolveMcpIcon(getMcpStoreEntry("dev.github-remote"))).toEqual(
      expect.objectContaining({ type: "builtin", name: "github" }),
    );
  });

  test("a fallback metadata icon also loses to the generic glyph when the entry declares no icon", () => {
    /* The branch the 2026-07-28 decision activates: a registry entry with no
       official logo. A repo-avatar metadata icon must NOT quietly fill the
       gap — a borrowed org avatar is exactly the kind of not-really-ours mark
       the decision removed, so the honest generic glyph wins. Only an explicit
       iconPolicy "replace" may override it (asserted in the next test).

       Uses an injected entry, so this holds regardless of which real entries
       curation has cleared — it cannot rot, and it is not a vacuous test even
       while the shipped registry happens to be fully branded. */
    setMcpStoreEntriesCache({
      entries: [
        {
          id: "dev.no-logo",
          toolkitId: "mcp.dev.no-logo",
          name: "No Logo Server",
          description: "Ships without an official brand logo",
          category: "dev",
          source: "mcp",
          mcp: { transport: "stdio", command: "npx" },
        },
      ],
    });
    setMcpStoreMetadataCache({
      entries: [
        {
          entryId: "dev.no-logo",
          toolkitId: "mcp.dev.no-logo",
          icon: { type: "file", mimeType: "image/png", content: "iVBORw0=" },
          iconPolicy: "fallback",
        },
      ],
    });

    expect(getMcpStoreEntry("dev.no-logo").toolkitIcon).toBeUndefined();
    expect(resolveMcpIcon(getMcpStoreEntry("dev.no-logo"))).toEqual(
      DEFAULT_MCP_ICON,
    );
    expect(mcpStoreIconFor("mcp.dev.no-logo")).toEqual(DEFAULT_MCP_ICON);
    expect(
      withMcpStoreIcon({ source: "mcp", toolkitId: "mcp.dev.no-logo" })
        .toolkitIcon,
    ).toEqual(DEFAULT_MCP_ICON);
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

  test("searchMcpStoreEntries all category returns everything except deprecated", () => {
    const entries = listMcpStoreEntries();
    const all = searchMcpStoreEntries(entries, "", "all");
    const nonDeprecated = entries.filter(
      (entry) => entry.status !== "deprecated" && entry.deprecated !== true,
    );
    expect(all.length).toBe(nonDeprecated.length);
  });

  test("searchMcpStoreEntries hides deprecated entries but keeps the live replacement", () => {
    const all = searchMcpStoreEntries(listMcpStoreEntries(), "", "all");
    expect(all.some((entry) => entry.id === "productivity.slack")).toBe(false);
    expect(all.some((entry) => entry.id === "productivity.slack-remote")).toBe(
      true,
    );
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
        args: [
          "--exclude-newer=2026-07-28T00:00:00Z",
          "--from",
          "markitdown-mcp==0.0.1a4",
          "markitdown-mcp",
        ],
      }),
    );
    expect(markitdown.secrets).toEqual([]);
    expect(markitdown.prerequisites).toEqual([]);
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

  test("fetch is registered as a workspace MCP", () => {
    const fetch = getMcpStoreEntry("workspace.fetch");

    expect(fetch).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.workspace.fetch",
        toolkitName: "Fetch",
        category: "workspace",
        source: "mcp",
        trustLevel: "verified",
        installable: true,
        license: "Apache-2.0 / MIT",
        sourceRepo: "https://github.com/modelcontextprotocol/servers",
        docsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
      }),
    );
    expect(fetch.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "uvx",
        args: [
          "--exclude-newer=2026-07-28T00:00:00Z",
          "--from",
          "mcp-server-fetch==2026.7.10",
          "--with",
          "mcp==1.28.0",
          "mcp-server-fetch",
        ],
      }),
    );
    expect(fetch.secrets).toEqual([]);
    expect(fetch.prerequisites).toEqual([]);
    expect(fetch.tools).toEqual([
      expect.objectContaining({
        name: "fetch",
        title: "Fetch URL",
        requiresConfirmation: true,
      }),
    ]);
    expect(fetch.policySummary).toEqual(
      expect.objectContaining({
        reviewed: true,
        defaultEnabledTools: 0,
        confirmationRequiredTools: 1,
      }),
    );
    expect(fetch.readmeMarkdown).toContain(
      "This server can access local/internal IP addresses and may represent a security risk. Exercise caution when using this MCP server to ensure this does not expose any sensitive data.",
    );
  });

  test("discord is registered as a needs-review communication MCP", () => {
    const discord = getMcpStoreEntry("productivity.discord");

    expect(discord).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.productivity.discord",
        toolkitName: "Discord",
        category: "communication",
        source: "mcp",
        trustLevel: "needs_review",
        status: "needs_review",
        installable: false,
        license: "MIT",
        sourceRepo: "https://github.com/IQAIcom/mcp-discord",
        docsUrl: "https://github.com/IQAIcom/mcp-discord",
      }),
    );
    expect(discord.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "npx",
        args: [
          "-y",
          "--before=2026-07-28T00:00:00Z",
          "@iqai/mcp-discord@0.0.6",
        ],
      }),
    );
    expect(discord.secrets).toEqual([
      expect.objectContaining({ key: "DISCORD_TOKEN" }),
    ]);
    expect(discord.tools).toHaveLength(22);
    expect(
      discord.tools.filter((tool) => tool.requiresConfirmation === true),
    ).toHaveLength(18);
    expect(
      discord.tools.filter((tool) => tool.requiresConfirmation === false),
    ).toHaveLength(4);
    expect(discord.policySummary).toEqual(
      expect.objectContaining({
        reviewed: true,
        defaultEnabledTools: 0,
        confirmationRequiredTools: 18,
      }),
    );
    expect(discord.readmeMarkdown).toContain("Administrator");
    expect(discord.readmeMarkdown).toContain("pending review");
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "discord_send", "communication")
        .map((entry) => entry.id),
    ).toContain("productivity.discord");
  });

  test("telegram is registered as a needs-review communication MCP", () => {
    const telegram = getMcpStoreEntry("productivity.telegram");

    expect(telegram).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.productivity.telegram",
        toolkitName: "Telegram",
        category: "communication",
        source: "mcp",
        trustLevel: "needs_review",
        status: "needs_review",
        installable: false,
        license: "MIT",
        sourceRepo: "https://github.com/IQAIcom/mcp-telegram",
        docsUrl: "https://github.com/IQAIcom/mcp-telegram",
      }),
    );
    expect(telegram.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "npx",
        args: [
          "-y",
          "--before=2026-07-28T00:00:00Z",
          "@iqai/mcp-telegram@0.1.4",
        ],
      }),
    );
    expect(telegram.secrets).toEqual([
      expect.objectContaining({ key: "TELEGRAM_BOT_TOKEN" }),
    ]);
    expect(telegram.tools).toHaveLength(5);
    expect(
      telegram.tools.filter((tool) => tool.requiresConfirmation === true),
    ).toHaveLength(3);
    expect(
      telegram.tools.filter((tool) => tool.requiresConfirmation === false),
    ).toHaveLength(2);
    // FORWARD_MESSAGE is an exfiltration primitive and MUST be gated.
    expect(
      telegram.tools.find((tool) => tool.name === "FORWARD_MESSAGE")
        .requiresConfirmation,
    ).toBe(true);
    expect(telegram.policySummary).toEqual(
      expect.objectContaining({
        reviewed: true,
        defaultEnabledTools: 0,
        confirmationRequiredTools: 3,
      }),
    );
    expect(telegram.readmeMarkdown).toContain("mention-only");
    expect(telegram.readmeMarkdown).toContain("pending review");
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "SEND_MESSAGE", "communication")
        .map((entry) => entry.id),
    ).toContain("productivity.telegram");
  });

  test("sqlite is registered as a community workspace MCP", () => {
    const sqlite = getMcpStoreEntry("workspace.sqlite");

    expect(sqlite).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.workspace.sqlite",
        toolkitName: "SQLite",
        category: "workspace",
        source: "mcp",
        trustLevel: "community",
        installable: true,
        license: "MIT",
        sourceRepo: "https://github.com/modelcontextprotocol/servers-archived",
        docsUrl:
          "https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite",
      }),
    );
    // Local DB file is bound to the agent workspace, mirroring filesystem.
    expect(sqlite.workspace).toEqual(
      expect.objectContaining({
        required: true,
        placeholder: "${WORKSPACE}",
        binding: "agent_workspace_root",
      }),
    );
    // Version pinned via uvx (community stdio never rides @latest); db path is an arg.
    expect(sqlite.mcp).toEqual(
      expect.objectContaining({
        transport: "stdio",
        command: "uvx",
        args: [
          "--exclude-newer=2026-07-28T00:00:00Z",
          "--from",
          "mcp-server-sqlite==2025.4.25",
          "--with",
          "mcp==1.28.0",
          "mcp-server-sqlite",
          "--db-path",
          "${WORKSPACE}/pupu-mcp.sqlite",
        ],
      }),
    );
    // No connection string, password, or secret — it is a local file path only.
    expect(sqlite.secrets).toEqual([]);
    expect(sqlite.prerequisites).toEqual([]);
    expect(sqlite.tools).toHaveLength(6);
    expect(
      sqlite.tools.filter((tool) => tool.requiresConfirmation === true),
    ).toHaveLength(3);
    expect(
      sqlite.tools.filter((tool) => tool.requiresConfirmation === false),
    ).toHaveLength(3);
    // Every write/DDL/resource-mutating tool MUST be gated.
    expect(
      sqlite.tools.find((tool) => tool.name === "write_query")
        .requiresConfirmation,
    ).toBe(true);
    expect(
      sqlite.tools.find((tool) => tool.name === "create_table")
        .requiresConfirmation,
    ).toBe(true);
    expect(
      sqlite.tools.find((tool) => tool.name === "append_insight")
        .requiresConfirmation,
    ).toBe(true);
    // read_query (SELECT only) stays ungated.
    expect(
      sqlite.tools.find((tool) => tool.name === "read_query")
        .requiresConfirmation,
    ).toBe(false);
    expect(sqlite.policySummary).toEqual(
      expect.objectContaining({
        reviewed: true,
        defaultEnabledTools: 0,
        confirmationRequiredTools: 3,
      }),
    );
    expect(sqlite.readmeMarkdown).toContain("non-production");
    expect(sqlite.readmeMarkdown).toContain("community");
    expect(
      searchMcpStoreEntries(listMcpStoreEntries(), "read_query", "workspace").map(
        (entry) => entry.id,
      ),
    ).toContain("workspace.sqlite");
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
        args: [
          "--exclude-newer=2026-07-28T00:00:00Z",
          "--from",
          "mcp-grafana==0.17.2",
          "mcp-grafana",
        ],
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
    expect(chrome.mcp).toEqual({
      transport: "stdio",
      command: "npx",
      args: [
        "-y",
        "--before=2026-07-28T00:00:00Z",
        "chrome-devtools-mcp@1.6.0",
        "--no-usage-statistics",
        "--no-performance-crux",
      ],
      headers: [],
    });
    expect(chrome.setupPreview).toBe(
      "npx -y chrome-devtools-mcp@1.6.0 --no-usage-statistics --no-performance-crux",
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

  test("github entry declares all backend-required secrets", () => {
    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.secrets).toEqual([
      expect.objectContaining({ key: "GITHUB_MCP_PAT" }),
    ]);
    expect(github.secrets[0].optional).not.toBe(true);
  });

  // The stdio bot-token Slack (toolkitId mcp.productivity.slack) was a
  // pre-launch, never-circulated entry that never shipped in any release
  // (absent from every tag v0.0.1..v0.1.6). Under the toolkitId-stability
  // ADR's recorded "pre-launch un-circulated toolkitId may be hard-deleted"
  // exception, it was hard-removed in favour of mcp.productivity.slack-remote,
  // which becomes the only Slack. The id must now resolve to nothing.
  test("hard-deleted stdio slack entry is absent from the store", () => {
    expect(getMcpStoreEntry("productivity.slack")).toBeNull();
    expect(
      MCP_STORE_ENTRIES.some(
        (entry) => entry.toolkitId === "mcp.productivity.slack",
      ),
    ).toBe(false);
  });

  test("oauth-capable entries declare generic oauth recipes", () => {
    const notion = getMcpStoreEntry("productivity.notion-remote");
    expect(notion.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "notion",
        clientRegistration: "dynamic",
        releaseStatus: "ready",
        transport: "streamable_http",
      }),
    );

    const github = getMcpStoreEntry("dev.github-remote");
    expect(github.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "github",
        clientRegistration: "user_credentials",
        releaseStatus: "app_required",
      }),
    );

    const slackRemote = getMcpStoreEntry("productivity.slack-remote");
    expect(slackRemote.toolkitId).toBe("mcp.productivity.slack-remote");
    expect(slackRemote.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "slack",
        clientRegistration: "user_credentials",
        releaseStatus: "app_required",
        mcpUrl: "https://mcp.slack.com/mcp",
      }),
    );
    const sentry = getMcpStoreEntry("devops.sentry-remote");
    expect(sentry.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "sentry",
        clientRegistration: "dynamic",
        releaseStatus: "ready",
      }),
    );

    const vercel = getMcpStoreEntry("devops.vercel-remote");
    expect(vercel.auth.oauth).toEqual(
      expect.objectContaining({
        provider: "vercel",
        clientRegistration: "dynamic",
        releaseStatus: "approval_required",
      }),
    );

    const figma = getMcpStoreEntry("dev.figma-remote");
    expect(figma).toEqual(
      expect.objectContaining({
        toolkitId: "mcp.dev.figma-remote",
        toolkitName: "Figma",
        category: "dev",
        status: "coming_soon",
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
        releaseStatus: "approval_required",
        mcpUrl: "https://mcp.figma.com/mcp",
        protectedResourceMetadataUrl: "https://mcp.figma.com/.well-known/oauth-protected-resource",
        authorizationServerMetadataUrl: "https://api.figma.com/.well-known/oauth-authorization-server",
        scopes: ["mcp:connect"],
      }),
    );
  });
});
