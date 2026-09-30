/** @jest-environment jsdom */

// Ticket #291 P4: toolkit-declared skills used to be registered as
// slash-commands directly from the toolkit catalog, in parallel with the
// backend-authoritative skill inventory (`GET /skills/inventory`, schema
// `pupu.skill_inventory.v1`).
//
// Ticket #291 P1 audit fix: that was TWO competing registration authorities
// for the same command names — both `plugin:*` and `skill-inventory` carry
// command_registry rank 2, so whichever fetch resolved first "won" a
// duplicate command, and the outcome depended on request completion order.
// The inventory is now the SINGLE authority: syncPluginSkills only cleans up
// stale `plugin:<toolkitId>` sources and never registers a command; every
// skill command comes from syncSkillInventory.
//
// This file also covers the "refresh gap" fix: startSkillInventorySync keeps
// the inventory fresh across workspace/settings/chat-selection changes, not
// only the next composer send's stale-revision 409.

const mockGetToolkitCatalog = jest.fn();
const mockListToolModalCatalog = jest.fn();
const mockGetSkillInventory = jest.fn();

jest.mock("./api", () => ({
  api: {
    unchain: {
      getToolkitCatalog: (...args) => mockGetToolkitCatalog(...args),
      listToolModalCatalog: (...args) => mockListToolModalCatalog(...args),
      getSkillInventory: (...args) => mockGetSkillInventory(...args),
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

// Ticket #291 P1/"refresh gap": fetchAndSyncSkillInventory reads the active
// chat's selected toolkit ids from the chats store, and startSkillInventorySync
// re-fetches when that selection (or the active chat itself) changes. The
// real store is a large, IPC-backed module — mock it so tests can drive its
// shape directly.
let mockChatsStoreState;
let mockChatStoreSubscribers;
jest.mock("./chat_storage/chat_storage_store", () => ({
  getChatsStore: jest.fn(() => mockChatsStoreState),
  subscribeChatsStore: jest.fn((listener) => {
    mockChatStoreSubscribers.push(listener);
    return () => {
      mockChatStoreSubscribers = mockChatStoreSubscribers.filter((l) => l !== listener);
    };
  }),
}));

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// The debounce window is 150ms (SKILL_INVENTORY_REFRESH_DEBOUNCE_MS) — wait
// comfortably past it with real timers rather than fighting fake-timer/
// microtask interleaving.
const DEBOUNCE_SETTLE_MS = 260;

const EMPTY_INVENTORY = {
  schema: "pupu.skill_inventory.v1",
  revision: `sha256:${"0".repeat(64)}`,
  skills: [],
  diagnostics: [],
};

const setActiveChat = (chatId, selectedToolkits = []) => {
  mockChatsStoreState = {
    activeChatId: chatId,
    chatsById: chatId ? { [chatId]: { id: chatId, selectedToolkits } } : {},
  };
};

const emitChatsStoreChange = () => {
  mockChatStoreSubscribers.forEach((listener) => listener(mockChatsStoreState, { type: "put" }));
};

const loadModules = () => {
  jest.resetModules();
  window.localStorage.clear();
  mockSubscribers = [];
  mockChatsStoreState = { activeChatId: null, chatsById: {} };
  mockChatStoreSubscribers = [];
  mockGetToolkitCatalog.mockReset();
  mockListToolModalCatalog.mockReset();
  mockGetSkillInventory.mockReset();
  // Safe default so tests that don't care about the skill inventory never
  // see an unconfigured mock resolve to undefined (still schema-invalid,
  // but noisy) or fall through the reserved/aliases paths unexpectedly.
  mockGetSkillInventory.mockResolvedValue(EMPTY_INVENTORY);
  const commandRegistry = require("./command_registry");
  const pluginSkillSync = require("./plugin_skill_sync");
  const settingsRepository = require("./settings_repository");
  const runtimeSettings = require("../COMPONENTs/settings/runtime");
  settingsRepository.resetSettingsRepositoryForTests();
  return { commandRegistry, pluginSkillSync, settingsRepository, runtimeSettings };
};

const makeToolkit = (toolkitId, toolkitName, skills) => ({
  toolkitId,
  toolkitName,
  skills,
});

const makeInventoryEntry = (overrides = {}) => ({
  id: "skillpack.demo::skill-a",
  name: "skill-a",
  description: "desc",
  source: "skillpack",
  source_id: "skillpack.demo",
  aliases: [],
  model_invocable: true,
  user_invocable: true,
  reserved: false,
  ...overrides,
});

describe("plugin_skill_sync: syncPluginSkills — P1: cleanup only, never registers", () => {
  test("never registers a command from the toolkit catalog, however shaped", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills([
      makeToolkit("notion", "Notion", [
        {
          name: "summarize",
          title: "Summarize",
          description: "Summarize the page",
          body: "Use these tools: {tools} to summarize.",
          tools: ["a", "b"],
          phase: "composer",
          user_invocable: true,
        },
      ]),
    ]);

    expect(commandRegistry.getCommand("/summarize")).toBeNull();
    // nothing at all got registered under any plugin: source — the composer
    // menu only ever shows what skill-inventory registers now
    expect(
      commandRegistry.listCommands({ phase: "composer" }, "/summarize"),
    ).toEqual([]);
  });

  test("unregisters an existing plugin:<toolkitId> source (cleanup of a pre-fix/stray registration)", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // simulate a leftover registration made by something other than
    // syncPluginSkills (which no longer registers anything itself)
    commandRegistry.registerCommand({
      name: "/legacy-plugin-skill",
      source: "plugin:notion",
      availability: () => true,
    });
    expect(commandRegistry.getCommand("/legacy-plugin-skill")).not.toBeNull();

    pluginSkillSync.syncPluginSkills([makeToolkit("notion", "Notion", [])]);

    expect(commandRegistry.getCommand("/legacy-plugin-skill")).toBeNull();
  });

  test("unregisters a stale plugin:<toolkitId> source when the toolkit drops out of a LATER call entirely (previouslySyncedToolkitIds tracking)", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // establish "jira" as a tracked toolkit from a first call...
    pluginSkillSync.syncPluginSkills([makeToolkit("jira", "Jira", [])]);
    // ...then something else registers a stray command under its source
    // between calls (e.g. a caller that has not migrated off the old API)
    commandRegistry.registerCommand({
      name: "/jira-leftover",
      source: "plugin:jira",
      availability: () => true,
    });
    expect(commandRegistry.getCommand("/jira-leftover")).not.toBeNull();

    // jira drops out of the catalog entirely on the next call
    pluginSkillSync.syncPluginSkills([]);

    expect(commandRegistry.getCommand("/jira-leftover")).toBeNull();
  });

  test("tolerates null/garbage catalog input", () => {
    const { pluginSkillSync } = loadModules();
    expect(() => pluginSkillSync.syncPluginSkills(null)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills(undefined)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills("garbage")).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills(42)).not.toThrow();
    expect(() => pluginSkillSync.syncPluginSkills([null, "x", 1])).not.toThrow();
    expect(() =>
      pluginSkillSync.syncPluginSkills([{ toolkitId: "tk", skills: "not-array" }]),
    ).not.toThrow();
  });
});

describe("plugin_skill_sync: syncSkillInventory (backend skill inventory — the single authority)", () => {
  test("registers a user-invocable, non-reserved entry with expandsTo '' and composer-only availability", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "sha256:abc",
      skills: [makeInventoryEntry({ name: "summarize", description: "Summarize text" })],
    });

    const cmd = commandRegistry.getCommand("/summarize");
    expect(cmd).not.toBeNull();
    expect(cmd.source).toBe("skill-inventory");
    expect(cmd.description).toBe("Summarize text");
    expect(cmd.expandsTo).toBe("");
    expect(cmd.icon).toBe("command");

    expect(
      commandRegistry.listCommands({ phase: "streaming" }, "/summarize"),
    ).toEqual([]);
    expect(
      commandRegistry
        .listCommands({ phase: "composer" }, "/summarize")
        .map((c) => c.name),
    ).toEqual(["/summarize"]);
  });

  test("skillpack source: sourceLabel and sourceToolkitId are derived from source_id", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({
          name: "packed",
          source: "skillpack",
          source_id: "skillpack.demo-pack",
        }),
      ],
    });

    const cmd = commandRegistry.getCommand("/packed");
    expect(cmd.sourceLabel).toBe("skillpack.demo-pack");
    expect(cmd.sourceToolkitId).toBe("skillpack.demo-pack");
  });

  // Ticket #291 P1: a selected executable toolkit's embedded [[skills]] now
  // arrive through the inventory as source: "toolkit" entries — these must
  // carry sourceToolkitId the same way a skillpack entry does, since the
  // toolkit catalog itself no longer registers them.
  test("toolkit source (selected executable toolkit's embedded skill): sourceLabel and sourceToolkitId are derived from source_id", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({
          name: "review",
          source: "toolkit",
          source_id: "notion",
        }),
      ],
    });

    const cmd = commandRegistry.getCommand("/review");
    expect(cmd).not.toBeNull();
    expect(cmd.source).toBe("skill-inventory");
    expect(cmd.sourceLabel).toBe("notion");
    expect(cmd.sourceToolkitId).toBe("notion");
  });

  test("toolkit source's sourceToolkitId is normalized through normalizeToolkitIdAlias, same as skillpack", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({
          name: "compose",
          source: "toolkit",
          // "workspace" aliases to "core" (toolkit_id_aliases.js)
          source_id: "workspace",
        }),
      ],
    });

    expect(commandRegistry.getCommand("/compose").sourceToolkitId).toBe("core");
  });

  test("non-toolkit-identified source (e.g. a workspace/user skill directory): sourceLabel = entry.source, sourceToolkitId is empty", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({
          name: "wsskill",
          source: "workspace",
          source_id: "",
        }),
      ],
    });

    const cmd = commandRegistry.getCommand("/wsskill");
    expect(cmd.sourceLabel).toBe("workspace");
    expect(cmd.sourceToolkitId).toBe("");
  });

  test("registers every alias too, so a legacy /name spelling keeps resolving", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({
          name: "canonical-name",
          aliases: ["legacy_name", "OldSpelling"],
        }),
      ],
    });

    expect(commandRegistry.getCommand("/canonical-name")).not.toBeNull();
    expect(commandRegistry.getCommand("/legacy_name")).not.toBeNull();
    expect(commandRegistry.getCommand("/OldSpelling")).not.toBeNull();
    expect(commandRegistry.getCommand("/legacy_name").source).toBe(
      "skill-inventory",
    );
  });

  test("skips an entry whose user_invocable is not true", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [
        makeInventoryEntry({ name: "model-only", user_invocable: false }),
        makeInventoryEntry({ name: "missing-flag", user_invocable: undefined }),
      ],
    });

    expect(commandRegistry.getCommand("/model-only")).toBeNull();
    expect(commandRegistry.getCommand("/missing-flag")).toBeNull();
  });

  test("skips an entry marked reserved", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [makeInventoryEntry({ name: "queue", reserved: true })],
    });

    // /queue stays owned by the interject builtin — never overridden, and no
    // skill-inventory entry gets registered for it either
    expect(commandRegistry.getCommand("/queue").source).toBe("interject");
  });

  test("builtin/interject precedence: an entry colliding with an interject command name is skipped", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // /btw is registered by command_registry's own builtin seed at module load
    expect(commandRegistry.getCommand("/btw").source).toBe("interject");

    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [makeInventoryEntry({ name: "btw" })],
    });

    expect(commandRegistry.getCommand("/btw").source).toBe("interject");
  });

  // Ticket #291 P1 audit finding: a shadowed/ambiguous toolkit skill is
  // reported ONLY in diagnostics — the backend excludes it from skills[]
  // entirely — so it must never become a command, regardless of what its
  // diagnostic entry says.
  test("a shadowed toolkit skill listed only in diagnostics never becomes a command", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [makeInventoryEntry({ name: "review", source: "toolkit", source_id: "notion" })],
      diagnostics: [
        {
          kind: "shadowed",
          name: "review",
          source: "toolkit",
          source_id: "github",
          message: "shadowed by notion's higher-ranked entry",
        },
      ],
    });

    // the winner (notion) registers...
    const cmd = commandRegistry.getCommand("/review");
    expect(cmd).not.toBeNull();
    expect(cmd.sourceToolkitId).toBe("notion");

    // ...but the shadowed one (github) never does — there is only ever one
    // "/review" command, and it is not attributed to the shadowed toolkit
    expect(cmd.sourceToolkitId).not.toBe("github");
  });

  test("an entry present ONLY in diagnostics (no matching skills[] row at all) never registers", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [],
      diagnostics: [
        {
          kind: "shadowed",
          name: "ambiguous-skill",
          source: "toolkit",
          source_id: "github",
          message: "shadowed",
        },
      ],
    });

    expect(commandRegistry.getCommand("/ambiguous-skill")).toBeNull();
  });

  // Defensive-only per the P1 comment in isReservedByHigherPrecedenceSource:
  // syncPluginSkills no longer registers anything, so a live "plugin:*"
  // registration should not normally exist — but if one somehow does (a
  // stray direct registerCommand call), the inventory still defers to it
  // rather than silently winning the equal-rank collision.
  test("defers to a stray plugin:*-owned command rather than overriding it (defensive, not the normal path anymore)", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    commandRegistry.registerCommand({
      name: "/shared",
      source: "plugin:notion",
      sourceLabel: "Notion",
      availability: () => true,
    });
    expect(commandRegistry.getCommand("/shared").source).toBe("plugin:notion");

    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [makeInventoryEntry({ name: "shared", source: "skillpack" })],
    });

    expect(commandRegistry.getCommand("/shared").source).toBe("plugin:notion");
  });

  test("re-sync unregisters every stale skill-inventory entry, even across a wholesale payload change", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r1",
      skills: [makeInventoryEntry({ name: "old-inv-skill" })],
    });
    expect(commandRegistry.getCommand("/old-inv-skill")).not.toBeNull();

    pluginSkillSync.syncSkillInventory({
      schema: "pupu.skill_inventory.v1",
      revision: "r2",
      skills: [makeInventoryEntry({ name: "new-inv-skill" })],
    });

    expect(commandRegistry.getCommand("/old-inv-skill")).toBeNull();
    expect(commandRegistry.getCommand("/new-inv-skill")).not.toBeNull();
  });

  test("null/garbage payload is tolerated", () => {
    const { pluginSkillSync } = loadModules();
    expect(() => pluginSkillSync.syncSkillInventory(null)).not.toThrow();
    expect(() => pluginSkillSync.syncSkillInventory(undefined)).not.toThrow();
    expect(() => pluginSkillSync.syncSkillInventory({})).not.toThrow();
    expect(() =>
      pluginSkillSync.syncSkillInventory({ skills: "not-an-array" }),
    ).not.toThrow();
    expect(() =>
      pluginSkillSync.syncSkillInventory({ skills: [null, "x", 1, {}] }),
    ).not.toThrow();
  });
});

describe("plugin_skill_sync: P1 — the inventory is the single authority regardless of fetch/call order", () => {
  // Regression lock for the exact audit finding: "both plugin:* and
  // skill-inventory commands have rank 2; whichever registers first owns a
  // duplicate /review". With syncPluginSkills never registering anything,
  // both call orders below MUST converge on the identical registry.
  const inventoryPayload = {
    schema: "pupu.skill_inventory.v1",
    revision: `sha256:${"1".repeat(64)}`,
    skills: [makeInventoryEntry({ name: "review", source: "toolkit", source_id: "notion" })],
    diagnostics: [],
  };
  const catalog = [
    makeToolkit("notion", "Notion", [
      { name: "review", body: "b", phase: "composer", user_invocable: true },
    ]),
  ];

  test("catalog sync first, then inventory sync", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncPluginSkills(catalog);
    pluginSkillSync.syncSkillInventory(inventoryPayload);

    const cmd = commandRegistry.getCommand("/review");
    expect(cmd.source).toBe("skill-inventory");
    expect(cmd.sourceToolkitId).toBe("notion");
  });

  test("inventory sync first, then catalog sync — identical outcome", () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    pluginSkillSync.syncSkillInventory(inventoryPayload);
    pluginSkillSync.syncPluginSkills(catalog);

    const cmd = commandRegistry.getCommand("/review");
    expect(cmd.source).toBe("skill-inventory");
    expect(cmd.sourceToolkitId).toBe("notion");
  });

  test("both async fetch completion orders converge on the same registered command", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    mockListToolModalCatalog.mockResolvedValue({ toolkits: catalog });
    mockGetSkillInventory.mockResolvedValue(inventoryPayload);

    // order A: catalog resolves first
    let resolveCatalog;
    let resolveInventory;
    mockListToolModalCatalog.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCatalog = resolve; }),
    );
    mockGetSkillInventory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInventory = resolve; }),
    );

    const catalogPromise = pluginSkillSync.resyncPluginSkills();
    const inventoryPromise = pluginSkillSync.fetchAndSyncSkillInventory();

    resolveCatalog({ toolkits: catalog });
    await catalogPromise;
    resolveInventory(inventoryPayload);
    await inventoryPromise;

    expect(commandRegistry.getCommand("/review").source).toBe("skill-inventory");
  });

  test("both async fetch completion orders converge on the same registered command — reversed order", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();

    let resolveCatalog;
    let resolveInventory;
    mockListToolModalCatalog.mockImplementationOnce(
      () => new Promise((resolve) => { resolveCatalog = resolve; }),
    );
    mockGetSkillInventory.mockImplementationOnce(
      () => new Promise((resolve) => { resolveInventory = resolve; }),
    );

    const catalogPromise = pluginSkillSync.resyncPluginSkills();
    const inventoryPromise = pluginSkillSync.fetchAndSyncSkillInventory();

    // order B: inventory resolves first this time
    resolveInventory(inventoryPayload);
    await inventoryPromise;
    resolveCatalog({ toolkits: catalog });
    await catalogPromise;

    expect(commandRegistry.getCommand("/review").source).toBe("skill-inventory");
  });
});

describe("plugin_skill_sync: fetchAndSyncPluginSkills / startPluginSkillSync (catalog cleanup lifecycle only)", () => {
  test("startPluginSkillSync fetches the catalog and subscribes to refresh, but registers nothing and never touches the skill inventory", async () => {
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

    expect(commandRegistry.getCommand("/s1")).toBeNull();
    expect(mockSubscribers.length).toBe(1);
    // regression lock: the v1 catalog (no toolkitId/skills fields) must never
    // be the sync's data source
    expect(mockGetToolkitCatalog).not.toHaveBeenCalled();
    // ticket #291 P1: startPluginSkillSync no longer fetches the skill
    // inventory at all — that is startSkillInventorySync's job exclusively
    expect(mockGetSkillInventory).not.toHaveBeenCalled();

    cleanup();
    expect(mockSubscribers.length).toBe(0);
  });

  test("catalog fetch failure logs and changes nothing (no registrations existed to lose)", async () => {
    const { pluginSkillSync } = loadModules();
    mockListToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        makeToolkit("notion", "Notion", [
          { name: "keepme", body: "b", phase: "composer" },
        ]),
      ],
    });
    const cleanup = pluginSkillSync.startPluginSkillSync();
    await flushMicrotasks();

    mockListToolModalCatalog.mockRejectedValueOnce(new Error("network down"));
    mockSubscribers.forEach((listener) => listener({}));
    await flushMicrotasks();

    cleanup();
  });

  test("stale catalog response guard: an older fetch resolving after a newer one does not clobber it", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    // simulate a leftover plugin:notion registration so we can observe which
    // sync "wins" the cleanup ordering
    commandRegistry.registerCommand({
      name: "/old-skill",
      source: "plugin:notion",
      availability: () => true,
    });

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

    const older = pluginSkillSync.resyncPluginSkills();
    const newer = pluginSkillSync.resyncPluginSkills();

    // the newer fetch resolves first, cleaning up plugin:notion immediately
    resolveNewer({ toolkits: [makeToolkit("notion", "Notion", [])] });
    await newer;
    expect(commandRegistry.getCommand("/old-skill")).toBeNull();

    // something else registers a leftover under a DIFFERENT toolkit's
    // source after the newer response has already applied
    commandRegistry.registerCommand({
      name: "/jira-leftover",
      source: "plugin:jira",
      availability: () => true,
    });

    // the older, slower fetch resolves last — it must be discarded
    // entirely, so it must NOT reach into syncPluginSkills and clean up jira
    resolveOlder({ toolkits: [makeToolkit("jira", "Jira", [])] });
    await older;

    expect(commandRegistry.getCommand("/jira-leftover")).not.toBeNull();
  });
});

describe("plugin_skill_sync: fetchAndSyncSkillInventory", () => {
  test("fetches the inventory and registers commands from a valid response", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    mockGetSkillInventory.mockResolvedValueOnce({
      schema: "pupu.skill_inventory.v1",
      revision: `sha256:${"1".repeat(64)}`,
      skills: [makeInventoryEntry({ name: "s1" })],
      diagnostics: [],
    });

    await pluginSkillSync.fetchAndSyncSkillInventory({
      workspaceRoot: "/tmp/project",
      includeUserDirs: true,
    });

    expect(commandRegistry.getCommand("/s1")).not.toBeNull();
    expect(mockGetSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/project",
      includeUserDirs: true,
      toolkits: [],
    });
  });

  // Ticket #291 P1: fetchAndSyncSkillInventory sends the active chat's
  // selected executable toolkit ids, defaulting to [] when there is none.
  test("defaults toolkits to the active chat's selectedToolkits", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", ["notion", "github"]);
    mockGetSkillInventory.mockResolvedValueOnce(EMPTY_INVENTORY);

    await pluginSkillSync.fetchAndSyncSkillInventory({ workspaceRoot: "/tmp" });

    expect(mockGetSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "/tmp",
      includeUserDirs: true,
      toolkits: ["notion", "github"],
    });
  });

  test("defaults toolkits to [] when there is no active chat", async () => {
    const { pluginSkillSync } = loadModules();
    mockGetSkillInventory.mockResolvedValueOnce(EMPTY_INVENTORY);

    await pluginSkillSync.fetchAndSyncSkillInventory();

    expect(mockGetSkillInventory).toHaveBeenCalledWith(
      expect.objectContaining({ toolkits: [] }),
    );
  });

  test("an explicit toolkits argument overrides the active chat's selection", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", ["notion"]);
    mockGetSkillInventory.mockResolvedValueOnce(EMPTY_INVENTORY);

    await pluginSkillSync.fetchAndSyncSkillInventory({ toolkits: ["explicit-only"] });

    expect(mockGetSkillInventory).toHaveBeenCalledWith(
      expect.objectContaining({ toolkits: ["explicit-only"] }),
    );
  });

  test("a failed fetch logs and leaves existing registrations untouched", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    mockGetSkillInventory.mockResolvedValueOnce({
      schema: "pupu.skill_inventory.v1",
      revision: `sha256:${"1".repeat(64)}`,
      skills: [makeInventoryEntry({ name: "keepme" })],
      diagnostics: [],
    });
    await pluginSkillSync.fetchAndSyncSkillInventory();
    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();

    mockGetSkillInventory.mockRejectedValueOnce(new Error("network down"));
    await pluginSkillSync.fetchAndSyncSkillInventory();

    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();
  });

  test("a schema-invalid response is rejected by skill_inventory_store and leaves existing registrations untouched", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    mockGetSkillInventory.mockResolvedValueOnce({
      schema: "pupu.skill_inventory.v1",
      revision: `sha256:${"1".repeat(64)}`,
      skills: [makeInventoryEntry({ name: "keepme" })],
      diagnostics: [],
    });
    await pluginSkillSync.fetchAndSyncSkillInventory();
    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();

    mockGetSkillInventory.mockResolvedValueOnce({
      schema: "not.the.right.schema",
      revision: "r2",
      skills: [],
    });
    await pluginSkillSync.fetchAndSyncSkillInventory();

    // untouched — the earlier valid registration must not be wiped by an
    // invalid response
    expect(commandRegistry.getCommand("/keepme")).not.toBeNull();
  });

  test("stale response guard: an older fetch resolving after a newer one does not clobber it", async () => {
    const { commandRegistry, pluginSkillSync } = loadModules();
    let resolveOlder;
    let resolveNewer;
    const olderPromise = new Promise((resolve) => {
      resolveOlder = resolve;
    });
    const newerPromise = new Promise((resolve) => {
      resolveNewer = resolve;
    });

    mockGetSkillInventory
      .mockImplementationOnce(() => olderPromise)
      .mockImplementationOnce(() => newerPromise);

    const older = pluginSkillSync.fetchAndSyncSkillInventory();
    const newer = pluginSkillSync.fetchAndSyncSkillInventory();

    resolveNewer({
      schema: "pupu.skill_inventory.v1",
      revision: `sha256:${"2".repeat(64)}`,
      skills: [makeInventoryEntry({ name: "new-inv" })],
      diagnostics: [],
    });
    await newer;

    resolveOlder({
      schema: "pupu.skill_inventory.v1",
      revision: `sha256:${"1".repeat(64)}`,
      skills: [makeInventoryEntry({ name: "old-inv" })],
      diagnostics: [],
    });
    await older;

    expect(commandRegistry.getCommand("/new-inv")).not.toBeNull();
    expect(commandRegistry.getCommand("/old-inv")).toBeNull();
  });
});

describe("plugin_skill_sync: startSkillInventorySync (ticket #291 refresh gap)", () => {
  test("fetches once immediately with the active chat's selection and current workspace/settings", async () => {
    const { pluginSkillSync, runtimeSettings } = loadModules();
    setActiveChat("chat-1", ["github", "notion"]);
    runtimeSettings.writeWorkspaceRoot("/tmp/proj");

    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();

    expect(mockGetSkillInventory).toHaveBeenCalledWith({
      workspaceRoot: "/tmp/proj",
      includeUserDirs: true,
      toolkits: ["github", "notion"],
    });

    stop();
  });

  test("is idempotent: a second call while already running returns the same stop function and does not double-fetch", async () => {
    const { pluginSkillSync } = loadModules();

    const stop1 = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    const stop2 = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();

    expect(stop2).toBe(stop1);
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    stop1();
  });

  test("a chats-store change to the active chat's selectedToolkits triggers a debounced refetch with the new toolkits", async () => {
    const { pluginSkillSync } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolkits: [] }),
    );

    setActiveChat("chat-1", ["notion"]);
    emitChatsStoreChange();
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolkits: ["notion"] }),
    );
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);

    stop();
  });

  test("switching the active chat id (same or no toolkit selection) still triggers a refetch", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", []);
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();

    setActiveChat("chat-2", []);
    emitChatsStoreChange();
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);
    stop();
  });

  test("a chats-store event that changes nothing relevant does not trigger a refetch", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", ["notion"]);
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    // re-fire with the exact same active chat id and toolkit selection
    emitChatsStoreChange();
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);
    stop();
  });

  test("selectedToolkits comparison is order-independent (sorted before comparing)", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", ["a", "b"]);
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    // same set, different order -> not a change
    setActiveChat("chat-1", ["b", "a"]);
    emitChatsStoreChange();
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);
    stop();
  });

  test("a runtime settings change to workspace_root triggers a refetch with the new workspaceRoot", async () => {
    const { pluginSkillSync, runtimeSettings } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceRoot: "" }),
    );

    runtimeSettings.writeWorkspaceRoot("/tmp/new-root");
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ workspaceRoot: "/tmp/new-root" }),
    );
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);

    stop();
  });

  test("a runtime settings change to skills.include_user_dirs triggers a refetch with the new value", async () => {
    const { pluginSkillSync, settingsRepository } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeUserDirs: true }),
    );

    await settingsRepository.updateNamespace("runtime", (current) => ({
      ...(current && typeof current === "object" ? current : {}),
      skills: { include_user_dirs: false },
    }));
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeUserDirs: false }),
    );
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);

    stop();
  });

  test("a settings change to a namespace other than runtime does not trigger a refetch", async () => {
    const { pluginSkillSync, settingsRepository } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    await settingsRepository.updateNamespace("some_other_namespace", () => ({
      foo: 1,
    }));
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);
    stop();
  });

  test("keeps the existing catalog-refresh trigger", async () => {
    const { pluginSkillSync } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    mockSubscribers.forEach((listener) => listener({}));
    await wait(DEBOUNCE_SETTLE_MS);

    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);
    stop();
  });

  test("debounce: a burst of triggers within the window collapses into a single refetch reflecting the last value", async () => {
    const { pluginSkillSync } = loadModules();
    setActiveChat("chat-1", []);
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    setActiveChat("chat-1", ["a"]);
    emitChatsStoreChange();
    setActiveChat("chat-1", ["a", "b"]);
    emitChatsStoreChange();
    setActiveChat("chat-1", ["a", "b", "c"]);
    emitChatsStoreChange();

    await wait(DEBOUNCE_SETTLE_MS);

    // exactly one debounced refetch, not one per triggering event
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);
    expect(mockGetSkillInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolkits: ["a", "b", "c"] }),
    );

    stop();
  });

  test("stop() tears down every subscription and cancels a pending debounced fetch", async () => {
    const { pluginSkillSync } = loadModules();
    const stop = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    setActiveChat("chat-1", ["notion"]);
    emitChatsStoreChange(); // schedules a debounced refetch...
    stop(); // ...but stop cancels it before it fires

    await wait(DEBOUNCE_SETTLE_MS);
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);

    // subscriptions are gone too — further events do nothing
    emitChatsStoreChange();
    mockSubscribers.forEach((listener) => listener({}));
    await wait(DEBOUNCE_SETTLE_MS);
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(1);
  });

  test("after stop(), starting again is a fresh, independent lifecycle", async () => {
    const { pluginSkillSync } = loadModules();
    const stop1 = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();
    stop1();

    const stop2 = pluginSkillSync.startSkillInventorySync();
    await flushMicrotasks();

    expect(stop2).not.toBe(stop1);
    expect(mockGetSkillInventory).toHaveBeenCalledTimes(2);
    stop2();
  });
});
