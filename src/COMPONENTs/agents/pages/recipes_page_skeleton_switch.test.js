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

/* Rows of the Agents explorer, found by their label. Legacy recipes are not
   listed there (owner decision: no "Not migrated" group), so the switch from a
   legacy recipe to a Skeleton Agent is no longer reachable from it. */
const agentRow = (label) => within(screen.getByTestId("agent-explorer")).getByText(label);

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
