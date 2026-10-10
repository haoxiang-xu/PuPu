import React, { useState } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RecipesPage from "./recipes_page";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
      listSkeletonResources: jest.fn(),
      getSkeletonResource: jest.fn(),
    },
  },
}));

jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: () => <div data-testid="flow-editor" />,
}));

const { api } = require("../../../SERVICEs/api");

const legacy = {
  name: "OldRecipe",
  nodes: [
    { id: "start", type: "start", outputs: [{ name: "text", type: "string" }], x: 0, y: 0 },
    { id: "a1", type: "agent", override: { model: "", prompt: "" }, outputs: [], x: 0, y: 0 },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [],
};

const skeleton = {
  schema_version: 1, kind: "agent", id: "rev", name: "Reviewer",
  nodes: [{ id: "start", type: "start", config: { execution: { outputs: [] } } }],
  edges: [],
};

function Harness() {
  const [selectedNodeId, setSelectedNodeId] = useState("a1");
  return (
    <RecipesPage
      isDark={false}
      selectedNodeId={selectedNodeId}
      onSelectNode={setSelectedNodeId}
      fullscreen={false}
    />
  );
}

beforeEach(() => {
  api.unchain.listRecipes.mockResolvedValue({ recipes: [legacy] });
  api.unchain.getRecipe.mockResolvedValue(legacy);
  api.unchain.saveRecipe.mockResolvedValue({});
  api.unchain.listSkeletonResources.mockResolvedValue({
    resources: [{ id: "rev", name: "Reviewer", kind: "agent" }],
  });
  api.unchain.getSkeletonResource.mockResolvedValue({
    id: "rev", kind: "agent", name: "Reviewer", document: skeleton,
    edit_token: "t1", diagnostics: [], archived: false, description: null,
    draft_digest: null, source_identity: null,
  });
});

describe("switching from a legacy Recipe to a Skeleton Agent", () => {
  const openSkeleton = async () => {
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("recipe-detail-panel")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("skeleton-resource-rev")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-resource-rev"));
    await waitFor(() => expect(screen.getByTestId("skeleton-resource-page")).toBeInTheDocument());
  };

  test("the legacy node's detail panel is gone, not merely covered", async () => {
    /* It was still mounted and still editable: a click there would have
     * written to a recipe the author is no longer looking at. */
    await openSkeleton();
    expect(screen.queryByTestId("recipe-detail-panel-shell")).not.toBeInTheDocument();
  });

  test("its resize handle goes with it", async () => {
    await openSkeleton();
    expect(screen.queryByTestId("recipe-detail-resize-handle")).not.toBeInTheDocument();
  });

  test("the legacy panel is there again when a Recipe is chosen", async () => {
    await openSkeleton();
    fireEvent.click(screen.getByText("OldRecipe"));
    await waitFor(() =>
      expect(screen.getByTestId("recipe-detail-panel-shell")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("skeleton-resource-page")).not.toBeInTheDocument();
  });
});
