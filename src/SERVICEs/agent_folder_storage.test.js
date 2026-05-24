import {
  applyAgentExplorerReorder,
  getFolderState,
} from "./agent_folder_storage";

const STORAGE_KEY = "agent_folder_tree_v1";

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
});
