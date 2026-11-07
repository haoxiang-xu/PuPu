import React, { useState } from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";
import { pressCanvasNode } from "./recipes_page/skeleton_canvas_test_helpers";
import { install_legacy_store_bridge } from "./recipes_page/legacy_store_test_bridge";

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
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(require("../../../SERVICEs/api").api.unchain);

jest.mock("../../side-menu/side_menu_utils", () => ({ getRuntimePlatform: () => "darwin" }));
jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: { isListenerAvailable: () => false, onWindowStateChange: () => () => {} },
}));
/* Draws each node and answers a press on it with `on_select`, the way the real
   editor reports a click. */
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => (
    <div data-testid="flow-editor">
      {(props.nodes || []).map((node) => (
        <div key={node.id} data-testid={`flow-node-${node.id}`} onMouseDown={() => props.on_select?.(node.id)}>
          {props.render_node ? props.render_node(node) : null}
        </div>
      ))}
    </div>
  ),
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

/* Rows of the Agents explorer, found by their label. This store has no legacy
   resolver, so the recipe cannot be proven migrated and stays under "Not
   migrated", where it opens in the old editor. */
const agentRow = (label) => within(screen.getByTestId("agent-explorer")).getByText(label);

describe("switching from a legacy Recipe to a Skeleton Agent", () => {
  const openSkeleton = async () => {
    render(<Harness />);
    await waitFor(() => expect(agentRow("OldRecipe")).toBeInTheDocument());
    fireEvent.click(agentRow("OldRecipe"));
    await waitFor(() => expect(screen.getByTestId("recipe-detail-panel")).toBeInTheDocument());
    await waitFor(() => expect(agentRow("Reviewer")).toBeInTheDocument());
    fireEvent.click(agentRow("Reviewer"));
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
    fireEvent.click(agentRow("OldRecipe"));
    await waitFor(() =>
      expect(screen.getByTestId("recipe-detail-panel-shell")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("skeleton-resource-page")).not.toBeInTheDocument();
  });
});

describe("undo while a Skeleton Agent is open", () => {
  test("the keys step the open editor, never the legacy recipe left behind", async () => {
    /* The legacy history kept listening while the native page was on screen,
       so ⌘Z there also stepped a recipe nobody was looking at. */
    render(<Harness />);
    await waitFor(() => expect(agentRow("OldRecipe")).toBeInTheDocument());
    fireEvent.click(agentRow("OldRecipe"));
    /* Open the legacy agent on its own canvas, once the recipe is read. */
    fireEvent.mouseDown(await screen.findByTestId("flow-node-a1"));
    await waitFor(() => expect(within(screen.getByTestId("recipe-detail-panel")).getByText("Prompt")).toBeInTheDocument());
    const fields = () => within(screen.getByTestId("recipe-detail-panel")).queryAllByRole("textbox").length;
    const before = fields();
    fireEvent.click(screen.getByText("+ Add field"));
    const edited = fields();
    expect(edited).toBeGreaterThan(before);

    fireEvent.click(agentRow("Reviewer"));
    expect(await screen.findByTestId("skeleton-resource-page")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "z", metaKey: true });

    fireEvent.click(agentRow("OldRecipe"));
    await waitFor(() => expect(within(screen.getByTestId("recipe-detail-panel")).getByText("Prompt")).toBeInTheDocument());
    expect(fields()).toBe(edited);
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
    await waitFor(() => expect(agentRow("Reviewer")).toBeInTheDocument());
    fireEvent.click(agentRow("Reviewer"));
    await waitFor(() => expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument());
    const shell = screen.getByTestId("recipe-list-panel-shell");
    expect(shell.style.opacity).toBe("1");

    pressCanvasNode("pool");
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
