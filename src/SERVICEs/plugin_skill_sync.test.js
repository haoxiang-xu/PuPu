/** @jest-environment jsdom */

// Part 3, Task 1: toolkit-declared skills from the catalog get registered
// as slash-commands in command_registry, kept in sync with catalog refresh.

// The sync MUST read the v2 catalog (listToolModalCatalog → /toolkits/catalog/v2).
// The v1 getToolkitCatalog endpoint has no toolkitId/skills fields, so syncing
// from it silently registers nothing — mock both so we can assert v1 is never
// touched (regression lock for the /plan-missing bug).
const mockGetToolkitCatalog = jest.fn();
const mockListToolModalCatalog = jest.fn();

jest.mock("./api", () => ({
  api: {
    unchain: {
      getToolkitCatalog: (...args) => mockGetToolkitCatalog(...args),
      listToolModalCatalog: (...args) => mockListToolModalCatalog(...args),
    },
  },
}));

let mockSubscribers;
jest.mock("./toolkit_catalog_refresh", () => ({
  subscribeToolkitCatalogRefresh: jest.fn((listener) => {
    mockSubscribers.push(listener);
    return () => {
      mockSubscribers = mockSubscribers.filter((l) => l !== listener);
    };
  }),
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

const loadModules = () => {
  jest.resetModules();
  mockSubscribers = [];
  mockGetToolkitCatalog.mockReset();
  mockListToolModalCatalog.mockReset();
  const commandRegistry = require("./command_registry");
  const pluginSkillSync = require("./plugin_skill_sync");
  return { commandRegistry, pluginSkillSync };
};

const makeToolkit = (toolkitId, toolkitName, skills) => ({
  toolkitId,
  toolkitName,
  skills,
});

describe("plugin_skill_sync", () => {
  test("registers skills with correct name/source/sourceLabel and bakes {tools} into expandsTo", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    const toolkits = [
      makeToolkit("notion", "Notion", [
        {
          name: "summarize",
          title: "Summarize",
          description: "Summarize the page",
          body: "Use these tools: {tools} to summarize.",
          tools: ["a", "b"],
          phase: "composer",
        },
      ]),
    ];

    pluginSkillSync.syncPluginSkills(toolkits);

    const cmd = commandRegistry.getCommand("/summarize");
    expect(cmd).not.toBeNull();
    expect(cmd.source).toBe("plugin:notion");
    expect(cmd.sourceLabel).toBe("Notion");
    expect(cmd.description).toBe("Summarize the page");
    expect(cmd.icon).toBe("");
    expect(cmd.expandsTo).toBe("Use these tools: a, b to summarize.");
  });

  test("description falls back to title then name when description is missing", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("tk", "TK", [
        { name: "only-title", title: "Only Title", body: "b", phase: "composer" },
      ]),
    ]);
    expect(commandRegistry.getCommand("/only-title").description).toBe(
      "Only Title",
    );

    pluginSkillSync.syncPluginSkills([
      makeToolkit("tk", "TK", [{ name: "bare-name", body: "b", phase: "composer" }]),
    ]);
    expect(commandRegistry.getCommand("/bare-name").description).toBe(
      "bare-name",
    );
  });

  test("availability is true only when phase matches AND toolkit is selected", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("notion", "Notion", [
        {
          name: "compose",
          body: "compose body",
          tools: [],
          phase: "composer",
        },
      ]),
    ]);

    // wrong phase, right toolkit
    expect(
      commandRegistry
        .listCommands(
          { phase: "streaming", selectedToolkits: ["notion"] },
          "/compose",
        )
        .map((c) => c.name),
    ).toEqual([]);

    // right phase, wrong toolkit
    expect(
      commandRegistry
        .listCommands(
          { phase: "composer", selectedToolkits: ["other"] },
          "/compose",
        )
        .map((c) => c.name),
    ).toEqual([]);

    // right phase, right toolkit
    expect(
      commandRegistry
        .listCommands(
          { phase: "composer", selectedToolkits: ["notion"] },
          "/compose",
        )
        .map((c) => c.name),
    ).toEqual(["/compose"]);
  });

  test("skills with a non-composer phase (streaming/always) register nothing — no send path expands them yet", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("notion", "Notion", [
        { name: "streamer", body: "b", phase: "streaming" },
        { name: "anytime", body: "b", phase: "always" },
        { name: "composed", body: "b", phase: "composer" },
      ]),
    ]);

    expect(commandRegistry.getCommand("/streamer")).toBeNull();
    expect(commandRegistry.getCommand("/anytime")).toBeNull();
    expect(commandRegistry.getCommand("/composed")).not.toBeNull();
  });

  test("re-sync unregisters stale skills for a toolkit that disappeared or changed", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("notion", "Notion", [
        { name: "old-skill", body: "b", phase: "composer" },
      ]),
    ]);
    expect(commandRegistry.getCommand("/old-skill")).not.toBeNull();

    // toolkit disappears entirely from the catalog
    pluginSkillSync.syncPluginSkills([]);
    expect(commandRegistry.getCommand("/old-skill")).toBeNull();

    // toolkit reappears with a different skill set
    pluginSkillSync.syncPluginSkills([
      makeToolkit("notion", "Notion", [
        { name: "new-skill", body: "b", phase: "composer" },
      ]),
    ]);
    expect(commandRegistry.getCommand("/old-skill")).toBeNull();
    expect(commandRegistry.getCommand("/new-skill")).not.toBeNull();
  });

  test("duplicate skill name across two plugins: first wins, second rejected", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("plugin-a", "Plugin A", [
        { name: "shared", body: "from a", phase: "composer" },
      ]),
      makeToolkit("plugin-b", "Plugin B", [
        { name: "shared", body: "from b", phase: "composer" },
      ]),
    ]);

    const cmd = commandRegistry.getCommand("/shared");
    expect(cmd.source).toBe("plugin:plugin-a");
    expect(cmd.expandsTo).toBe("from a");
  });

  test("null/garbage catalog input is tolerated", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    expect(() => pluginSkillSync.syncPluginSkills(null)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills(undefined)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills("garbage")).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills(42)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills([null, "x", 1])).not.toThrow();
    expect(() =>
      pluginSkillSync.syncPluginSkills([{ toolkitId: "tk", skills: "not-array" }]),
    ).not.toThrow();
    expect(() =>
      pluginSkillSync.syncPluginSkills([
        { toolkitId: "tk", skills: [null, {}, { name: "" }, { name: "x" }] },
      ]),
    ).not.toThrow();
    // entries missing name/body are skipped silently
    expect(commandRegistry.getCommand("/x")).toBeNull();
  });

  test("startPluginSkillSync fetches the catalog, syncs, and subscribes to refresh", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    mockListToolModalCatalog.mockResolvedValue({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "s1", body: "b1", phase: "composer" },
        ]),
      ],
    });

    const cleanup = pluginSkillSync.startPluginSkillSync();
    await flushMicrotasks();

    expect(commandRegistry.getCommand("/s1")).not.toBeNull();
    expect(mockSubscribers.length).toBe(1);
    // regression lock: the v1 catalog (no toolkitId/skills fields) must never
    // be the sync's data source — syncing from it registers nothing
    expect(mockGetToolkitCatalog).not.toHaveBeenCalled();

    // simulate a catalog refresh broadcast with a different skill set
    mockListToolModalCatalog.mockResolvedValue({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "s2", body: "b2", phase: "composer" },
        ]),
      ],
    });
    mockSubscribers.forEach((listener) => listener({}));
    await flushMicrotasks();

    expect(commandRegistry.getCommand("/s1")).toBeNull();
    expect(commandRegistry.getCommand("/s2")).not.toBeNull();

    cleanup();
    expect(mockSubscribers.length).toBe(0);
  });

  test("startPluginSkillSync: catalog fetch failure logs and keeps existing registrations", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // first: a healthy fetch that registers something
    mockListToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "keepme", body: "b", phase: "composer" },
        ]),
      ],
    });
    const cleanup = pluginSkillSync.startPluginSkillSync();
    await flushMicrotasks();
    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();

    // now a refresh that fails
    mockListToolModalCatalog.mockRejectedValueOnce(new Error("network down"));
    mockSubscribers.forEach((listener) => listener({}));
    await flushMicrotasks();

    // existing registration untouched — sync([]) was NOT called
    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();

    cleanup();
  });

  test("resyncPluginSkills re-fetches and registers when the cold-start catalog was empty (Flask sidecar not ready yet)", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // cold start: the toolkit catalog handler returns {toolkits: []} as a
    // "success" while the runtime is still starting — skills silently never
    // register unless something re-fetches once the sidecar is ready.
    mockListToolModalCatalog.mockResolvedValueOnce({ toolkits: [] });

    const cleanup = pluginSkillSync.startPluginSkillSync();
    await flushMicrotasks();
    expect(commandRegistry.getCommand("/late-skill")).toBeNull();

    mockListToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "late-skill", body: "b", phase: "composer" },
        ]),
      ],
    });

    await pluginSkillSync.resyncPluginSkills();

    expect(commandRegistry.getCommand("/late-skill")).not.toBeNull();

    cleanup();
  });

  test("stale catalog response guard: an older fetch resolving after a newer one does not clobber it", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    let resolveOlder;
    let resolveNewer;
    const olderPromise = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    const newerPromise = new Promise((resolve) => {
      resolveNewer = resolve;
    });

    mockListToolModalCatalog
      .mockImplementationOnce(() => olderPromise)
      .mockImplementationOnce(() => newerPromise);

    // two overlapping refreshes, e.g. mcp_install firing the refresh bus
    // multiple times per install
    const older = pluginSkillSync.resyncPluginSkills();
    const newer = pluginSkillSync.resyncPluginSkills();

    // the newer fetch resolves first...
    resolveNewer({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "new-skill", body: "b", phase: "composer" },
        ]),
      ],
    });
    await newer;

    // ...then the older, slower fetch resolves last
    resolveOlder({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "old-skill", body: "b", phase: "composer" },
        ]),
      ],
    });
    await older;

    expect(commandRegistry.getCommand("/new-skill")).not.toBeNull();
    expect(commandRegistry.getCommand("/old-skill")).toBeNull();
  });
});
