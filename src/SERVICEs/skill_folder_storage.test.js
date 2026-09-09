import {
  applySkillExplorerReorder,
  assignCommandToFolder,
  buildCommandTree,
  createSkillFolder,
  deleteSkillFolder,
  getSkillFolderState,
  renameSkillFolder,
  resetSkillFolderStorageForTests,
  setSkillFolderState,
  toggleSkillFolderExpanded,
} from "./skill_folder_storage";
import {
  flushSettingsWrites,
  getSettingsPersistenceStatus,
  resetSettingsRepositoryForTests,
} from "./settings_repository";

const STORAGE_KEY = "skill_folder_tree_v1";

/* --- SQL-mode harness (mirrors agent_folder_storage.test.js) ------------- */

const sqlBootstrap = (overrides = {}) => ({
  available: true,
  degraded: false,
  schemaVersion: 2,
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

const cmd = (name, extra = {}) => ({
  name,
  description: `${name} description`,
  ...extra,
});

const WRITING = "f_writing";
const CODE = "f_code";

const folder = (id, name, overrides = {}) => ({
  id,
  name,
  parentId: null,
  childFolderIds: [],
  expanded: true,
  ...overrides,
});

const sampleTree = () => ({
  folders: {
    [WRITING]: folder(WRITING, "Daily writing"),
    [CODE]: folder(CODE, "Code"),
  },
  commandFolder: {
    "/polish": WRITING,
    "/translate": WRITING,
    "/review": CODE,
  },
  folderOrder: [WRITING, CODE],
  itemOrder: {
    __root__: [`folder:${WRITING}`, `folder:${CODE}`, "/btw"],
    [WRITING]: ["/polish", "/translate"],
    [CODE]: ["/review"],
  },
});

let warnSpy;

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsRepositoryForTests();
  resetSkillFolderStorageForTests();
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete window.settingsStorageAPI;
  resetSettingsRepositoryForTests();
  resetSkillFolderStorageForTests();
  warnSpy.mockRestore();
});

/* ======================================================================== */
/*  buildCommandTree — the pure projection both the palette and the         */
/*  organizer render from                                                   */
/* ======================================================================== */

describe("buildCommandTree", () => {
  test("SEQ-001 #1 — with no stored organization every command sits at root", () => {
    const { data, root, unfiled } = buildCommandTree({
      commands: [cmd("/polish"), cmd("/review"), cmd("/btw")],
      state: undefined,
    });

    expect(root).toEqual(["/polish", "/review", "/btw"]);
    expect(unfiled).toEqual(["/polish", "/review", "/btw"]);
    expect(Object.values(data).every((node) => node.kind === "command")).toBe(
      true,
    );
  });

  test("renders folders with their commands in the stored order", () => {
    const { data, root, unfiled } = buildCommandTree({
      commands: [
        cmd("/translate"),
        cmd("/polish"),
        cmd("/review"),
        cmd("/btw"),
      ],
      state: sampleTree(),
    });

    expect(root).toEqual([`folder:${WRITING}`, `folder:${CODE}`, "/btw"]);
    expect(data[`folder:${WRITING}`].children).toEqual([
      "/polish",
      "/translate",
    ]);
    expect(data[`folder:${CODE}`].children).toEqual(["/review"]);
    expect(data[`folder:${WRITING}`].label).toBe("Daily writing");
    // unfiled is the root-level command set, in render order
    expect(unfiled).toEqual(["/btw"]);
  });

  test("SEQ-001 #7 — a newly installed skill appends without reshuffling", () => {
    const { root, unfiled } = buildCommandTree({
      commands: [
        cmd("/polish"),
        cmd("/translate"),
        cmd("/review"),
        cmd("/btw"),
        cmd("/brand-new"),
      ],
      state: sampleTree(),
    });

    expect(root).toEqual([
      `folder:${WRITING}`,
      `folder:${CODE}`,
      "/btw",
      "/brand-new",
    ]);
    expect(unfiled).toEqual(["/btw", "/brand-new"]);
  });

  test("SEQ-001 #5 — a skill removed by a pack update simply stops rendering", () => {
    const state = sampleTree();
    const { data, root } = buildCommandTree({
      // /polish is gone: its pack was updated and dropped it
      commands: [cmd("/translate"), cmd("/review"), cmd("/btw")],
      state,
    });

    expect(data["/polish"]).toBeUndefined();
    expect(data[`folder:${WRITING}`].children).toEqual(["/translate"]);
    expect(root).toEqual([`folder:${WRITING}`, `folder:${CODE}`, "/btw"]);
    // the assignment itself is untouched — that is what makes #6 work
    expect(state.commandFolder["/polish"]).toBe(WRITING);
  });

  test("SEQ-001 #6 — reinstalling the pack restores the original position", () => {
    const state = sampleTree();
    const { data } = buildCommandTree({
      commands: [
        cmd("/polish"),
        cmd("/translate"),
        cmd("/review"),
        cmd("/btw"),
      ],
      state,
    });

    expect(data[`folder:${WRITING}`].children).toEqual([
      "/polish",
      "/translate",
    ]);
  });

  test("a command filed into a folder that no longer exists falls back to root", () => {
    const state = sampleTree();
    delete state.folders[CODE];
    state.folderOrder = [WRITING];

    const { root, unfiled } = buildCommandTree({
      commands: [cmd("/polish"), cmd("/translate"), cmd("/review")],
      state,
    });

    expect(root).toEqual([`folder:${WRITING}`, "/review"]);
    expect(unfiled).toEqual(["/review"]);
  });

  test("nested folders keep their parentage", () => {
    const state = {
      folders: {
        [CODE]: folder(CODE, "Code", { childFolderIds: ["f_debug"] }),
        f_debug: folder("f_debug", "Debug", { parentId: CODE }),
      },
      commandFolder: { "/review": CODE, "/tdd": "f_debug" },
      folderOrder: [CODE],
      itemOrder: {},
    };

    const { data, root } = buildCommandTree({
      commands: [cmd("/review"), cmd("/tdd")],
      state,
    });

    expect(root).toEqual([`folder:${CODE}`]);
    expect(data[`folder:${CODE}`].children).toEqual([
      "folder:f_debug",
      "/review",
    ]);
    expect(data["folder:f_debug"].children).toEqual(["/tdd"]);
  });

  test("a cycle in stored folder parentage terminates instead of recursing forever", () => {
    const state = {
      folders: {
        a: folder("a", "A", { childFolderIds: ["b"] }),
        b: folder("b", "B", { parentId: "a", childFolderIds: ["a"] }),
      },
      commandFolder: {},
      folderOrder: ["a"],
      itemOrder: {},
    };

    const { data, root } = buildCommandTree({ commands: [], state });
    expect(root).toEqual(["folder:a"]);
    expect(data["folder:a"].children).toEqual(["folder:b"]);
    expect(data["folder:b"].children).toEqual([]);
  });

  test("is pure — it neither reads nor writes storage", () => {
    installBridge();
    buildCommandTree({ commands: [cmd("/polish")], state: sampleTree() });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getSkillFolderState()).toEqual({
      folders: {},
      commandFolder: {},
      folderOrder: [],
      itemOrder: {},
    });
  });
});

/* ======================================================================== */
/*  applySkillExplorerReorder — Explorer drop result -> persisted state      */
/* ======================================================================== */

describe("applySkillExplorerReorder", () => {
  const reorderFixture = () => ({
    data: {
      [`folder:${WRITING}`]: {
        id: `folder:${WRITING}`,
        kind: "folder",
        children: ["/translate", "/polish"],
      },
      [`folder:${CODE}`]: {
        id: `folder:${CODE}`,
        kind: "folder",
        children: ["/review"],
      },
      "/polish": { id: "/polish", kind: "command", commandName: "/polish" },
      "/translate": {
        id: "/translate",
        kind: "command",
        commandName: "/translate",
      },
      "/review": { id: "/review", kind: "command", commandName: "/review" },
      "/btw": { id: "/btw", kind: "command", commandName: "/btw" },
    },
    root: [`folder:${CODE}`, `folder:${WRITING}`, "/btw"],
  });

  test("AC-001/AC-002 — folder order, in-folder order and assignments all persist", () => {
    setSkillFolderState(sampleTree());

    const next = applySkillExplorerReorder(reorderFixture());

    expect(next.folderOrder).toEqual([CODE, WRITING]);
    expect(next.itemOrder.__root__).toEqual([
      `folder:${CODE}`,
      `folder:${WRITING}`,
      "/btw",
    ]);
    expect(next.itemOrder[WRITING]).toEqual(["/translate", "/polish"]);
    expect(next.commandFolder).toEqual({
      "/polish": WRITING,
      "/translate": WRITING,
      "/review": CODE,
    });
    expect(getSkillFolderState()).toEqual(next);
  });

  test("dragging a command out to root unfiles it", () => {
    setSkillFolderState(sampleTree());
    const fixture = reorderFixture();
    fixture.data[`folder:${WRITING}`].children = ["/translate"];
    fixture.root = [`folder:${CODE}`, `folder:${WRITING}`, "/btw", "/polish"];

    const next = applySkillExplorerReorder(fixture);

    expect(next.commandFolder["/polish"]).toBeUndefined();
    expect(next.itemOrder.__root__).toContain("/polish");
  });

  test("a command that is not currently registered keeps its assignment", () => {
    const state = sampleTree();
    state.commandFolder["/uninstalled"] = CODE;
    setSkillFolderState(state);

    const next = applySkillExplorerReorder(reorderFixture());

    expect(next.commandFolder["/uninstalled"]).toBe(CODE);
  });

  test("nesting a folder by dropping it inside another is recorded", () => {
    setSkillFolderState(sampleTree());
    const fixture = reorderFixture();
    fixture.data[`folder:${CODE}`].children = [
      "/review",
      `folder:${WRITING}`,
    ];
    fixture.root = [`folder:${CODE}`, "/btw"];

    const next = applySkillExplorerReorder(fixture);

    expect(next.folderOrder).toEqual([CODE]);
    expect(next.folders[WRITING].parentId).toBe(CODE);
    expect(next.folders[CODE].childFolderIds).toEqual([WRITING]);
  });
});

/* ======================================================================== */
/*  BC-001 — CLOSED admission                                               */
/* ======================================================================== */

describe("BC-001 CLOSED admission", () => {
  test("AC-007 — a stored tree with an unknown top-level key is rejected whole", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          namespaces: {
            [STORAGE_KEY]: { ...sampleTree(), somethingNewer: { a: 1 } },
          },
        }),
      ),
    });

    // rejected, not partially applied: no folders leak through
    expect(getSkillFolderState()).toEqual({
      folders: {},
      commandFolder: {},
      folderOrder: [],
      itemOrder: {},
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[skill-folder-storage] rejecting stored tree: unknown key",
      "somethingNewer",
    );
  });

  test("a known key with the wrong type is rejected", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          namespaces: { [STORAGE_KEY]: { ...sampleTree(), folderOrder: {} } },
        }),
      ),
    });

    expect(getSkillFolderState().folders).toEqual({});
  });

  test("a tree missing optional keys is admitted and defaulted", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({
          namespaces: {
            [STORAGE_KEY]: { commandFolder: { "/polish": WRITING } },
          },
        }),
      ),
    });

    expect(getSkillFolderState()).toEqual({
      folders: {},
      commandFolder: { "/polish": WRITING },
      folderOrder: [],
      itemOrder: {},
    });
  });

  test("a non-object namespace value is tolerated as the empty tree", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: "not-a-tree" } }),
      ),
    });

    expect(getSkillFolderState()).toEqual({
      folders: {},
      commandFolder: {},
      folderOrder: [],
      itemOrder: {},
    });
  });

  test("the same admission runs in localStorage fallback mode", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...sampleTree(), somethingNewer: 1 }),
    );
    expect(getSettingsPersistenceStatus().mode).toBe("localStorage");
    expect(getSkillFolderState().folders).toEqual({});
  });
});

/* ======================================================================== */
/*  Persistence                                                             */
/* ======================================================================== */

describe("persistence", () => {
  test("AC-003 — a tree written in SQL mode reads back identically", async () => {
    const api = installBridge();

    setSkillFolderState(sampleTree());
    expect(getSkillFolderState()).toEqual(sampleTree());
    expect(getSettingsPersistenceStatus().mode).toBe("sql");

    await flushSettingsWrites();
    expect(api.setNamespace).toHaveBeenCalledTimes(1);
    const [namespace, value] = api.setNamespace.mock.calls[0];
    expect(namespace).toBe(STORAGE_KEY);
    expect(value).toEqual(sampleTree());
    // SQL mode never writes a standalone localStorage key
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("each read is a fresh clone — mutating it cannot corrupt the snapshot", () => {
    installBridge({
      bootstrap: jest.fn(() =>
        sqlBootstrap({ namespaces: { [STORAGE_KEY]: sampleTree() } }),
      ),
    });

    const first = getSkillFolderState();
    first.folders[WRITING].name = "MUTATED";
    delete first.commandFolder["/polish"];

    expect(getSkillFolderState()).toEqual(sampleTree());
  });

  test("AC-008 — a persistence failure is logged, never thrown", async () => {
    installBridge({
      setNamespace: jest.fn(() =>
        Promise.reject(Object.assign(new Error("nope"), { code: "disk_full" })),
      ),
    });

    expect(() => setSkillFolderState(sampleTree())).not.toThrow();
    await flushSettingsWrites();

    expect(warnSpy).toHaveBeenCalledWith(
      "[skill-folder-storage] persist failed:",
      expect.any(String),
    );
  });

  test("fallback mode stores the tree under its own key", () => {
    // no bridge installed — repository stays in localStorage mode
    setSkillFolderState(sampleTree());
    expect(getSettingsPersistenceStatus().mode).toBe("localStorage");
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual(
      sampleTree(),
    );
  });
});

/* ======================================================================== */
/*  Folder and assignment mutations                                         */
/* ======================================================================== */

describe("folder mutations", () => {
  test("AC-004 — a user-created category is named and persists", () => {
    installBridge();

    const { folderId } = createSkillFolder({ name: "Research" });
    expect(getSkillFolderState().folders[folderId].name).toBe("Research");
    expect(getSkillFolderState().folderOrder).toContain(folderId);

    renameSkillFolder(folderId, "Deep research");
    expect(getSkillFolderState().folders[folderId].name).toBe("Deep research");
  });

  test("a category created inside another is linked to its parent", () => {
    setSkillFolderState(sampleTree());
    const { folderId } = createSkillFolder({ name: "Debug", parentId: CODE });

    const state = getSkillFolderState();
    expect(state.folders[folderId].parentId).toBe(CODE);
    expect(state.folders[CODE].childFolderIds).toContain(folderId);
    expect(state.folderOrder).not.toContain(folderId);
  });

  test("deleting a category unfiles its commands and cascades to children", () => {
    const state = sampleTree();
    state.folders[CODE].childFolderIds = ["f_debug"];
    state.folders.f_debug = folder("f_debug", "Debug", { parentId: CODE });
    state.commandFolder["/tdd"] = "f_debug";
    state.itemOrder.f_debug = ["/tdd"];
    state.itemOrder[CODE] = ["/review", "folder:f_debug"];
    setSkillFolderState(state);

    const next = deleteSkillFolder(CODE);

    expect(next.folders[CODE]).toBeUndefined();
    expect(next.folders.f_debug).toBeUndefined();
    expect(next.commandFolder["/review"]).toBeUndefined();
    expect(next.commandFolder["/tdd"]).toBeUndefined();
    // untouched assignments survive
    expect(next.commandFolder["/polish"]).toBe(WRITING);
    expect(next.folderOrder).toEqual([WRITING]);
    expect(next.itemOrder[CODE]).toBeUndefined();
    expect(next.itemOrder.f_debug).toBeUndefined();
    expect(next.itemOrder.__root__).not.toContain(`folder:${CODE}`);
  });

  test("deleting an unknown category is a no-op", () => {
    setSkillFolderState(sampleTree());
    expect(deleteSkillFolder("nope")).toEqual(sampleTree());
  });

  test("toggling expansion flips and persists", () => {
    setSkillFolderState(sampleTree());
    toggleSkillFolderExpanded(WRITING);
    expect(getSkillFolderState().folders[WRITING].expanded).toBe(false);
  });

  test("assignCommandToFolder files and unfiles", () => {
    setSkillFolderState(sampleTree());

    assignCommandToFolder("/btw", CODE);
    expect(getSkillFolderState().commandFolder["/btw"]).toBe(CODE);

    assignCommandToFolder("/btw", null);
    expect(getSkillFolderState().commandFolder["/btw"]).toBeUndefined();
  });

  test("no export prunes an assignment because its command went missing", () => {
    // Guard for BC-001: agent_folder_storage has forgetRecipe(); this module
    // must not grow an equivalent, or organization stops surviving pack
    // updates (SEQ-001 #5-6).
    // eslint-disable-next-line global-require
    const moduleExports = require("./skill_folder_storage");
    expect(
      Object.keys(moduleExports).filter((key) => /forget|prune/i.test(key)),
    ).toEqual([]);
  });
});
