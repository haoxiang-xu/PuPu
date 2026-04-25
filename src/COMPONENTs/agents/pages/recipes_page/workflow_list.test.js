import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipesPage from "../recipes_page";
import { api } from "../../../../SERVICEs/api";

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
  return function MockExplorer({ data, root }) {
    const renderNode = (id) => {
      const node = data[id];
      if (!node) return null;
      return (
        <div key={id}>
          <button type="button" onClick={node.on_click}>
            {node.custom_label || node.label}
          </button>
          {(node.children || []).map(renderNode)}
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

test("recipe list shows Explore as a workflow", async () => {
  api.unchain.listRecipes.mockResolvedValue({
    recipes: [{ name: "Default" }, { name: "Explore", description: "scout" }],
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

  fireEvent.click(await screen.findByText("Explore"));

  await waitFor(() =>
    expect(api.unchain.getRecipe).toHaveBeenLastCalledWith("Explore"),
  );
  expect(screen.queryByText("Agent Templates")).not.toBeInTheDocument();
});
