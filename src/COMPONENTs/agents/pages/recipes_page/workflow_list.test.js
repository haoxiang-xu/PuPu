import React from "react";
import { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import RecipesPage from "../recipes_page";
import { api } from "../../../../SERVICEs/api";
import { writeFeatureFlags } from "../../../../SERVICEs/feature_flags";

const STORAGE_KEY = "agent_folder_tree_v1";
const mockExplorerProps = [];

jest.mock("../../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
    },
  },
}));

jest.mock("../../../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "linux",
}));

jest.mock("../../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
  },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, prefix_icon, onClick }) {
    return (
      <button type="button" onClick={onClick}>
        {label || prefix_icon || "button"}
      </button>
    );
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => {
  return function MockIcon({ src }) {
    return <span>{src}</span>;
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/context_menu/context_menu", () => {
  return function MockContextMenu() {
    return null;
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => {
  return function MockModal({ children }) {
    return <div>{children}</div>;
  };
});

jest.mock("../../../../BUILTIN_COMPONENTs/explorer/explorer", () => {
  return function MockExplorer(props) {
    const { data, root } = props;
    mockExplorerProps.push(props);
    const renderNode = (id) => {
      const explorerItem = data[id];
      if (!explorerItem) return null;
      const { children: childIds = [] } = explorerItem;
      return (
        <div key={id}>
          <button type="button" onClick={explorerItem.on_click}>
            {explorerItem.custom_label || explorerItem.label}
          </button>
          {childIds.map(renderNode)}
        </div>
      );
    };
    return <div>{(root || []).map(renderNode)}</div>;
  };
});

jest.mock("./recipe_canvas", () => {
  return function MockRecipeCanvas({ recipe }) {
    return <div>Canvas {recipe?.name || ""}</div>;
  };
});

jest.mock("./detail_panel/detail_panel", () => {
  return function MockDetailPanel() {
    return null;
  };
});

test("Memory V2 stays off the Agent Builder surface when enabled", async () => {
  window.localStorage.clear();
  mockExplorerProps.length = 0;
  writeFeatureFlags({ enable_memory_v2: true });
  api.unchain.listRecipes.mockResolvedValue({
    recipes: [{ name: "Default" }, { name: "Explore" }],
  });
  api.unchain.getRecipe.mockImplementation(async (name) => ({
    name,
    nodes: [],
    edges: [],
  }));

  render(
    <RecipesPage
      isDark={false}
      selectedNodeId={null}
      onSelectNode={() => {}}
      fullscreen={false}
    />,
  );

  await waitFor(() => expect(mockExplorerProps.length).toBeGreaterThan(0));
  expect(screen.queryByText("Memory Agent")).not.toBeInTheDocument();
  expect(screen.queryByText("System Agents")).not.toBeInTheDocument();
  /* Legacy recipes are not listed in the Agents explorer at all. */
  mockExplorerProps.forEach((props) => {
    expect(Object.keys(props.data).filter((id) => id.startsWith("legacy:") || id === "group:not-migrated")).toEqual([]);
  });
});

test("native resource list uses Explorer drag reorder and keeps legacy placement separate", async () => {
  window.localStorage.clear();
  mockExplorerProps.length = 0;
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      folders: {
        f_team: {
          id: "f_team",
          name: "Team",
          parentId: null,
          childFolderIds: [],
          expanded: true,
        },
      },
      recipeFolder: {},
      folderOrder: ["f_team"],
    }),
  );
  api.unchain.listRecipes.mockResolvedValue({ recipes: [] });
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [
    { id: "Alpha", name: "Alpha", kind: "agent", archived: false },
    { id: "Beta", name: "Beta", kind: "agent", archived: false },
  ] });
  api.unchain.getRecipe.mockImplementation(async (name) => ({
    name,
    nodes: [],
    edges: [],
  }));

  render(
    <RecipesPage
      isDark={false}
      selectedNodeId={null}
      onSelectNode={() => {}}
      fullscreen={false}
    />,
  );

  expect(await screen.findByText("Alpha")).toBeInTheDocument();
  expect(screen.getByText("add")).toBeInTheDocument();
  expect(screen.queryByText("chat_new")).not.toBeInTheDocument();

  const explorerProps = mockExplorerProps.filter((props) => props.draggable).at(-1);
  expect(explorerProps.draggable).toBe(true);
  expect(typeof explorerProps.on_reorder).toBe("function");

  await act(async () => {
    explorerProps.on_reorder(
      {
        ...explorerProps.data,
        "folder:f_team": {
          ...explorerProps.data["folder:f_team"],
          children: ["resource:Alpha"],
        },
      },
      ["folder:f_team", "resource:Beta"],
    );
  });

  expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toMatchObject({
    recipeFolder: {},
    resourceFolder: { Alpha: "f_team" },
    resourceOrder: {
      __root__: ["folder:f_team", "Beta"],
      f_team: ["Alpha"],
    },
  });
});
