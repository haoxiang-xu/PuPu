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

describe("drilling into a subagent of a Skeleton Agent", () => {
  /* The resource list is not the graph being edited, and switching from it
     while drilled would drop the stack's unsaved parent. The Skeleton page
     owns the stack and says when one is open. */
  const embedded = {
    schema_version: 1, kind: "agent", id: "inner", name: "Shortener",
    nodes: [{ id: "inner-start", type: "start", config: { execution: { outputs: [] } } }],
    edges: [],
  };

  const parent = {
    schema_version: 1, kind: "agent", id: "rev", name: "Reviewer",
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [] } } },
      { id: "k", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      {
        id: "pool",
        type: "subagent_pool",
        config: {
          subagents: [{
            id: "emb", name: "Shortener", description: "",
            source: { kind: "embedded", document: embedded },
            allowed_modes: ["delegate"], output_mode: "summary",
            memory_policy: "ephemeral", parallel_safe: true,
            allowed_tools: null, disabled_tools: [],
          }],
        },
      },
    ],
    edges: [{
      id: "attach", kind: "attach", source_node_id: "pool",
      source_port_id: "attach_top", target_node_id: "k",
      target_port_id: "attach_bot",
    }],
  };

  test("the resource list collapses while it is open, and comes back when it closes", async () => {
    api.unchain.getSkeletonResource.mockResolvedValue({
      id: "rev", kind: "agent", name: "Reviewer", document: parent,
      edit_token: "t1", diagnostics: [], archived: false, description: null,
      draft_digest: null, source_identity: null,
    });
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("skeleton-resource-rev")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-resource-rev"));
    await waitFor(() => expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument());
    const shell = screen.getByTestId("recipe-list-panel-shell");
    expect(shell.style.opacity).toBe("1");

    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await waitFor(() => expect(screen.getByLabelText("Open Shortener")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await waitFor(() => expect(screen.getByTestId("skeleton-drill-crumbs")).toBeInTheDocument());
    expect(shell.style.opacity).toBe("0");
    expect(shell.style.pointerEvents).toBe("none");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("skeleton-drill-crumbs")).toBeNull());
    expect(shell.style.opacity).toBe("1");
  });
});
