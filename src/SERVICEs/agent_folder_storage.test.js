import {
  applyAgentExplorerReorder,
  getFolderState,
  setFolderState,
  createFolder,
  renameFolder,
  deleteFolder,
  toggleFolderExpanded,
  assignRecipeToFolder,
  renameRecipeKey,
  forgetRecipe,
  resetAgentFolderStorageForTests,
} from "./agent_folder_storage";
import {
  flushSettingsWrites,
  getSettingsPersistenceStatus,
  resetSettingsRepositoryForTests,
} from "./settings_repository";

const STORAGE_KEY = "agent_folder_tree_v1";

// --- shared SQL-mode harness (mirrors settings_repository.test.js) ---------

const sqlBootstrap = (overrides = {}) => ({
  available: true,
  degraded: false,
  schemaVersion: 2,
  // "complete" keeps the Phase 1B settings-root migration out of these tests:
  // SQL is authoritative from the first repository init.
  migration: { state: "complete", version: 1, digest: "d", migratedAt: 1 },
  namespaces: {},
  revisions: {},
  ...overrides,
});

const installBridge = (overrides = {}) => {
  const api = {
    bootstrap: jest.fn(() => sqlBootstrap()),
    migrateLegacy: jest.fn(() =>
      Promise.resolve({ status: "complete", digest: "d", migratedAt: 1 }),
    ),
    setNamespace: jest.fn((namespace) =>
      Promise.resolve({ ok: true, namespace, revision: 0, updatedAt: 1 }),
    ),
    deleteNamespace: jest.fn((namespace) =>
      Promise.resolve({ ok: true, namespace, deleted: true }),
    ),
    ...overrides,
  };
  window.settingsStorageAPI = api;
  return api;
};

const sampleTree = () => ({
  folders: {
    f_parent: {
      id: "f_parent",
      name: "Parent",
      parentId: null,
      childFolderIds: ["f_child"],
      expanded: true,
    },
    f_child: {
      id: "f_child",
      name: "Child",
      parentId: "f_parent",
      childFolderIds: [],
      expanded: false,
    },
  },
  recipeFolder: { "Agent Beta": "f_parent", "Agent Gamma": "f_child" },
  folderOrder: ["f_parent"],
});

let warnSpy;

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
  resetAgentFolderStorageForTests();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete window.settingsStorageAPI;
  resetSettingsRepositoryForTests();
  resetAgentFolderStorageForTests();
  warnSpy.mockRestore();
});

describe("agent_folder_storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("applyAgentExplorerReorder persists mixed folder and recipe order", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        folders: {
          f_parent: {
            id: "f_parent",
            name: "Parent",
            parentId: null,
            childFolderIds: [],
            expanded: true,
          },
          f_child: {
            id: "f_child",
            name: "Child",
            parentId: null,
            childFolderIds: [],
            expanded: true,
          },
        },
        recipeFolder: {},
        folderOrder: ["f_parent", "f_child"],
      }),
    );

    const next = applyAgentExplorerReorder({
      data: {
        "folder:f_parent": {
          id: "folder:f_parent",
          kind: "folder",
          children: ["Agent Beta", "folder:f_child"],
        },
        "folder:f_child": {
          id: "folder:f_child",
          kind: "folder",
          children: ["Agent Gamma"],
        },
        "Agent Alpha": {
          id: "Agent Alpha",
          kind: "recipe",
          name: "Agent Alpha",
        },
        "Agent Beta": {
          id: "Agent Beta",
          kind: "recipe",
          name: "Agent Beta",
        },
        "Agent Gamma": {
          id: "Agent Gamma",
          kind: "recipe",
          name: "Agent Gamma",
        },
      },
      root: ["Agent Alpha", "folder:f_parent"],
    });

    expect(next.folderOrder).toEqual(["f_parent"]);
    expect(next.folders.f_parent.parentId).toBeNull();
    expect(next.folders.f_parent.childFolderIds).toEqual(["f_child"]);
    expect(next.folders.f_child.parentId).toBe("f_parent");
    expect(next.recipeFolder).toEqual({
      "Agent Beta": "f_parent",
      "Agent Gamma": "f_child",
    });
    expect(next.itemOrder).toEqual({
      __root__: ["Agent Alpha", "folder:f_parent"],
      f_parent: ["Agent Beta", "folder:f_child"],
      f_child: ["Agent Gamma"],
    });
    expect(getFolderState()).toEqual(next);
  });

  test("fallback mode never touches the settings root or the bridge", () => {
    // no bridge installed — repository stays in localStorage mode
    setFolderState(sampleTree());
    expect(getSettingsPersistenceStatus().mode).toBe("localStorage");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(
      sampleTree(),
    );
    // the standalone key must NOT leak into the settings root object
    expect(window.localStorage.getItem("settings")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SQL mode (repository namespace "agent_folder_tree_v1")
// ---------------------------------------------------------------------------

describe("agent_folder_storage SQL mode", () => {
  test("reads route through the repository snapshot and return fresh clones", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
    });

    expect(getFolderState()).toEqual(sampleTree());
    expect(getSettingsPersistenceStatus().mode).toBe("sql");

    // fresh clone per call — mutating a returned state must not corrupt the
    // snapshot (legacy JSON.parse semantics)
    const first = getFolderState();
    first.folders.f_parent.name = "MUTATED";
    delete first.recipeFolder["Agent Beta"];
    expect(getFolderState()).toEqual(sampleTree());
  });

  test("corrupt namespace value tolerated like legacy corruption (default state)", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: "not-a-tree" } }),
      ),
    });
    expect(getFolderState()).toEqual({
      folders: {},
      recipeFolder: {},
      folderOrder: [],
    });
  });

  test("mutations persist whole-tree via replaceNamespace; standalone key untouched", async () => {
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
    });

    const next = renameFolder("f_child", "Renamed");
    expect(next.folders.f_child.name).toBe("Renamed");
    // read-your-writes: optimistic snapshot serves the update synchronously
    expect(getFolderState().folders.f_child.name).toBe("Renamed");

    await flushSettingsWrites();
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    const [namespace, value] = api.setNamespace.mock.calls[0];
    expect(namespace).toBe(STORAGE_KEY);
    expect(value.folders.f_child.name).toBe("Renamed");
    // SQL mode never writes the legacy standalone key
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("createFolder / toggle / assign / renameRecipeKey / forget round-trip", async () => {
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
    });

    const { folderId } = createFolder({ name: "New", parentId: "f_parent" });
    expect(getFolderState().folders[folderId].name).toBe("New");
    expect(getFolderState().folders.f_parent.childFolderIds).toContain(folderId);

    toggleFolderExpanded("f_child");
    expect(getFolderState().folders.f_child.expanded).toBe(true);

    assignRecipeToFolder("Agent Delta", folderId);
    renameRecipeKey("Agent Delta", "Agent Delta 2");
    forgetRecipe("Agent Beta");

    const finalState = getFolderState();
    expect(finalState.recipeFolder["Agent Delta 2"]).toBe(folderId);
    expect(finalState.recipeFolder["Agent Delta"]).toBeUndefined();
    expect(finalState.recipeFolder["Agent Beta"]).toBeUndefined();

    await flushSettingsWrites();
    const lastCall = api.setNamespace.mock.calls.at(-1);
    expect(lastCall[0]).toBe(STORAGE_KEY);
    expect(lastCall[1]).toEqual(finalState);
  });

  test("deleteFolder cascade produces the same result as fallback mode", async () => {
    // Run the identical scenario twice — legacy path first, SQL path second —
    // and require identical final trees (mode equivalence, incl. quirks).
    const runScenario = () => {
      setFolderState(sampleTree());
      deleteFolder("f_parent");
      return getFolderState();
    };

    const legacyResult = runScenario();
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    resetAgentFolderStorageForTests();

    installBridge();
    const sqlResult = runScenario();
    expect(getSettingsPersistenceStatus().mode).toBe("sql");
    expect(sqlResult).toEqual(legacyResult);
    expect(sqlResult.folders.f_parent).toBeUndefined();
    expect(sqlResult.folders.f_child).toBeUndefined();
    expect(sqlResult.folderOrder).toEqual([]);
    await flushSettingsWrites();
  });

  test("applyAgentExplorerReorder persists through the repository", async () => {
    const api = installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
    });

    const next = applyAgentExplorerReorder({
      data: {
        "folder:f_parent": { id: "folder:f_parent", kind: "folder", children: [] },
        "folder:f_child": { id: "folder:f_child", kind: "folder", children: [] },
        "Agent Beta": { id: "Agent Beta", kind: "recipe", name: "Agent Beta" },
      },
      root: ["Agent Beta", "folder:f_child", "folder:f_parent"],
    });

    expect(next.folderOrder).toEqual(["f_child", "f_parent"]);
    expect(next.itemOrder.__root__).toEqual([
      "Agent Beta",
      "folder:f_child",
      "folder:f_parent",
    ]);
    expect(getFolderState()).toEqual(next);

    await flushSettingsWrites();
    expect(api.setNamespace).toHaveBeenCalledWith(STORAGE_KEY, next, undefined);
  });

  test("persist failure: never throws, rolls back, logs error code only", async () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
      setNamespace: jest.fn(() =>
        Promise.reject(new Error("[namespace_too_large] value exceeds limit")),
      ),
    });

    // synchronous optimistic result, no throw (legacy saveRaw never threw)
    const optimistic = renameFolder("f_parent", "Will Roll Back");
    expect(optimistic.folders.f_parent.name).toBe("Will Roll Back");

    await flushSettingsWrites();
    // repository rolled the namespace back to the pre-write value
    expect(getFolderState()).toEqual(sampleTree());
    // logged code only — never tree content
    const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(logged).toContain("namespace_too_large");
    expect(logged).not.toContain("Will Roll Back");
    expect(logged).not.toContain("Parent");
  });

  describe("first-use migration of the standalone legacy key", () => {
    test("seeds the namespace once from legacy; legacy key preserved read-only", async () => {
      const legacyJson = JSON.stringify(sampleTree());
      window.localStorage.setItem(STORAGE_KEY, legacyJson);
      const api = installBridge(); // empty namespaces, migration complete

      // first read serves the legacy tree immediately (optimistic seed)
      expect(getFolderState()).toEqual(sampleTree());
      await flushSettingsWrites();
      expect(api.setNamespace).toHaveBeenCalledTimes(1);
      expect(api.setNamespace).toHaveBeenCalledWith(
        STORAGE_KEY,
        sampleTree(),
        undefined,
      );

      // no re-seed on later reads
      getFolderState();
      await flushSettingsWrites();
      expect(api.setNamespace).toHaveBeenCalledTimes(1);

      // subsequent mutation writes SQL only; legacy key byte-identical
      renameFolder("f_parent", "Changed");
      await flushSettingsWrites();
      expect(api.setNamespace).toHaveBeenCalledTimes(2);
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(legacyJson);
    });

    test("existing namespace wins over the legacy key (no re-migration)", async () => {
      const sqlTree = {
        folders: {},
        recipeFolder: { "Agent Omega": "f_x" },
        folderOrder: [],
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTree()));
      const api = installBridge({
        bootstrap: jest.fn(() =>
          sqlBootstrap({ namespaces: { [STORAGE_KEY]: sqlTree } }),
        ),
      });

      expect(getFolderState()).toEqual(sqlTree);
      await flushSettingsWrites();
      expect(api.setNamespace).not.toHaveBeenCalled();
    });

    test("corrupt legacy key migrates nothing (default state, no write)", async () => {
      window.localStorage.setItem(STORAGE_KEY, "{corrupt json");
      const api = installBridge();

      expect(getFolderState()).toEqual({
        folders: {},
        recipeFolder: {},
        folderOrder: [],
      });
      await flushSettingsWrites();
      expect(api.setNamespace).not.toHaveBeenCalled();
    });

    test("seed failure degrades this store to localStorage for the session", async () => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleTree()));
      const api = installBridge({
        setNamespace: jest.fn(() =>
          Promise.reject(new Error("[settings_storage_error] io failure")),
        ),
      });

      // optimistic first read still serves the legacy tree
      expect(getFolderState()).toEqual(sampleTree());
      await flushSettingsWrites();

      // degraded: reads and writes go back to the standalone legacy key
      const next = renameFolder("f_parent", "Legacy Again");
      expect(next.folders.f_parent.name).toBe("Legacy Again");
      expect(
        JSON.parse(window.localStorage.getItem(STORAGE_KEY)).folders.f_parent
          .name,
      ).toBe("Legacy Again");
      // only the failed seed hit the bridge — no further SQL writes
      expect(api.setNamespace).toHaveBeenCalledTimes(1);
      const logged = warnSpy.mock.calls.map((call) => call.join(" ")).join("\n");
      expect(logged).toContain("settings_storage_error");
      expect(logged).toContain("using localStorage for this session");
    });
  });
});
