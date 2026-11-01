import {
  createFolder,
  getFolderState,
  setFolderState,
  resetAgentFolderStorageForTests,
} from "./agent_folder_storage";
import {
  RECIPE_SOURCE_SCOPE,
  applyResourceExplorerReorder,
  assignResourceToFolder,
  deleteFolderKeepingResources,
  forgetResource,
  migrateRecipeFoldersToResources,
  resourcePlacement,
} from "./agent_resource_folders";

/* Native Agents share the user's folder tree with the legacy recipes, but
   they are placed by resource id, never by name. These run in the storage's
   fallback mode (no settings bridge), which reads and writes the same tree. */

const STORAGE_KEY = "agent_folder_tree_v1";
const legacyTree = () => ({
  folders: {
    f_work: { id: "f_work", name: "Work", parentId: null, childFolderIds: ["f_deep"], expanded: true },
    f_deep: { id: "f_deep", name: "Deep", parentId: "f_work", childFolderIds: [], expanded: false },
  },
  folderOrder: ["f_work"],
  recipeFolder: { Default: "f_work", Writer: "f_deep", Ghost: "f_work" },
  itemOrder: { __root__: ["folder:f_work", "Loose"], f_work: ["Ghost", "Default"], f_deep: ["Writer"] },
});

beforeEach(() => {
  localStorage.clear();
  delete window.settingsStorageAPI;
  resetAgentFolderStorageForTests();
});

describe("placing a native Agent", () => {
  test("by id, beside and never inside the legacy name-keyed placement", () => {
    setFolderState(legacyTree());
    assignResourceToFolder("legacy-abc", "f_work");
    assignResourceToFolder("constructor", "f_deep");
    const state = getFolderState();
    expect(state.recipeFolder).toStrictEqual(legacyTree().recipeFolder);
    expect(state.resourceFolder).toStrictEqual({ "legacy-abc": "f_work", constructor: "f_deep" });
    const placement = resourcePlacement(state);
    expect(placement.resourceFolder.constructor).toBe("f_deep"); // an own key, not Object's constructor
    expect(placement.resourceFolder.toString).toBeUndefined();
    assignResourceToFolder("legacy-abc", null);
    forgetResource("constructor");
    expect(getFolderState().resourceFolder).toStrictEqual({});
  });

  test("legacy writers keep the native fields they do not know", () => {
    setFolderState(legacyTree());
    assignResourceToFolder("agent-1", "f_work");
    createFolder({ name: "Later" });
    expect(getFolderState().resourceFolder).toStrictEqual({ "agent-1": "f_work" });
  });
});

describe("reordering the native tree", () => {
  test("rewrites folder nesting and native placement, leaving legacy placement untouched", () => {
    setFolderState(legacyTree());
    const data = {
      "folder:f_deep": { id: "folder:f_deep", kind: "folder", children: ["agent-2"] },
      "folder:f_work": { id: "folder:f_work", kind: "folder", children: ["folder:f_deep", "agent-1"] },
      "agent-1": { id: "agent-1", kind: "resource", resource_id: "agent-1" },
      "agent-2": { id: "agent-2", kind: "resource", resource_id: "agent-2" },
      "draft:agent-3": { id: "draft:agent-3", kind: "draft", resource_id: "agent-3" },
      "__pending_agent__": { id: "__pending_agent__", kind: "pending" },
    };
    applyResourceExplorerReorder({ data, root: ["folder:f_work", "draft:agent-3", "__pending_agent__"] });
    const state = getFolderState();
    expect(state.folders.f_work.childFolderIds).toEqual(["f_deep"]);
    expect(state.folders.f_deep.parentId).toBe("f_work");
    expect(state.folderOrder).toEqual(["f_work"]);
    expect(state.resourceFolder).toStrictEqual({ "agent-1": "f_work", "agent-2": "f_deep" });
    expect(state.resourceOrder).toStrictEqual({ __root__: ["folder:f_work", "agent-3"], f_work: ["folder:f_deep", "agent-1"], f_deep: ["agent-2"] });
    expect(state.recipeFolder).toStrictEqual(legacyTree().recipeFolder);
    expect(state.itemOrder).toStrictEqual(legacyTree().itemOrder);
  });
});

describe("deleting a folder", () => {
  test("its native Agents move to the top level instead of pointing at nothing", () => {
    setFolderState({ ...legacyTree(), resourceFolder: { a: "f_deep", b: "f_work", c: "f_other" }, resourceOrder: { f_deep: ["a"], __root__: ["c"] } });
    deleteFolderKeepingResources("f_work");
    const state = getFolderState();
    expect(Object.keys(state.folders)).toEqual([]);
    expect(state.resourceFolder).toStrictEqual({ c: "f_other" });
    expect(state.resourceOrder).toStrictEqual({ __root__: ["c"] });
  });
});

describe("carrying the legacy folders over once", () => {
  const resolver = (table) => jest.fn(async ({ legacy_name, source_scope }) => {
    expect(source_scope).toBe(RECIPE_SOURCE_SCOPE);
    if (legacy_name in table) return { id: table[legacy_name], name: legacy_name };
    const error = new Error("selected legacy resource was not found");
    error.code = "resource_missing";
    throw error;
  });

  test("maps every placed recipe name through the store's own alias, then never again", async () => {
    setFolderState(legacyTree());
    const resolve = resolver({ Default: "legacy-default", Writer: "legacy-writer", Loose: "legacy-loose" });
    const result = await migrateRecipeFoldersToResources(resolve);
    expect(result).toStrictEqual({ status: "migrated", mapped: 3, unresolved: ["Ghost"] });
    const state = getFolderState();
    expect(state.resourceFolder).toStrictEqual({ "legacy-default": "f_work", "legacy-writer": "f_deep" });
    expect(state.resourceOrder).toStrictEqual({
      __root__: ["folder:f_work", "legacy-loose"], f_work: ["legacy-default"], f_deep: ["legacy-writer"],
    });
    expect(state.resourceMigration).toStrictEqual({ version: 1, mapped: 3, unresolved: ["Ghost"] });
    expect(state.recipeFolder).toStrictEqual(legacyTree().recipeFolder); // the source stays as it was
    resolve.mockClear();
    expect(await migrateRecipeFoldersToResources(resolve)).toStrictEqual({ status: "already" });
    expect(resolve).not.toHaveBeenCalled();
  });

  test("a name the store holds more than one Agent for is not guessed, and the pass still completes", async () => {
    /* The store answers legacy_name_ambiguous (409) when one recipe name
       aliases several Agents. Picking one would misplace the others; failing
       the pass would leave every folder unmigrated on every visit. */
    setFolderState(legacyTree());
    const resolve = jest.fn(async ({ legacy_name }) => {
      if (legacy_name === "Default") return { id: "legacy-default" };
      const error = new Error(legacy_name === "Ghost" ? "selected legacy name is ambiguous" : "selected legacy resource was not found");
      error.code = legacy_name === "Ghost" ? "legacy_name_ambiguous" : "resource_missing";
      throw error;
    });
    const result = await migrateRecipeFoldersToResources(resolve);
    expect(result).toStrictEqual({ status: "migrated", mapped: 1, unresolved: ["Writer", "Ghost", "Loose"] });
    expect(getFolderState().resourceFolder).toStrictEqual({ "legacy-default": "f_work" });
  });

  test("a native placement the author already made is not overwritten", async () => {
    setFolderState({ ...legacyTree(), resourceFolder: { "legacy-default": "f_deep" } });
    await migrateRecipeFoldersToResources(resolver({ Default: "legacy-default" }));
    expect(getFolderState().resourceFolder["legacy-default"]).toBe("f_deep");
  });

  test("an unavailable or failing resolver leaves nothing marked, so the next visit retries", async () => {
    setFolderState(legacyTree());
    expect(await migrateRecipeFoldersToResources(undefined)).toStrictEqual({ status: "unavailable" });
    const broken = jest.fn(async () => { const e = new Error("sidecar down"); e.code = "unchain_unavailable"; throw e; });
    expect(await migrateRecipeFoldersToResources(broken)).toMatchObject({ status: "failed" });
    expect(getFolderState().resourceMigration).toBeUndefined();
    expect(getFolderState().resourceFolder).toBeUndefined();
  });

  test("a resolver answer without a usable id is not trusted", async () => {
    setFolderState(legacyTree());
    const result = await migrateRecipeFoldersToResources(jest.fn(async () => ({ id: { toString: null } })));
    expect(result.mapped).toBe(0);
    expect(getFolderState().resourceFolder).toStrictEqual({});
  });

  test("an empty tree is marked done without asking anything", async () => {
    const resolve = jest.fn();
    expect(await migrateRecipeFoldersToResources(resolve)).toStrictEqual({ status: "migrated", mapped: 0, unresolved: [] });
    expect(resolve).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).resourceMigration.version).toBe(1);
  });
});
