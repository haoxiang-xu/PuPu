import React, { useState } from "react";
import { render, fireEvent, screen, waitFor, within } from "@testing-library/react";
import RecipesPage from "./recipes_page";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
    },
  },
}));

jest.mock("../../side-menu/side_menu_utils", () => ({
  getRuntimePlatform: () => "darwin",
}));

jest.mock("../../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    onWindowStateChange: () => () => {},
  },
}));

/* A fake editor that still renders the real nodes, so a pool row is the same
 * component the user double-clicks, and that exposes both ends of the viewport
 * contract the drill-in depends on. */
let mockLiveViewport = { x: 0, y: 0, zoom: 1 };
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: ({
    nodes,
    render_node,
    viewport_out_ref,
    restore_viewport,
    on_nodes_change,
    on_select,
  }) => {
    if (viewport_out_ref) viewport_out_ref.current = mockLiveViewport;
    return (
      <div
        data-testid="flow-editor"
        data-restored={
          restore_viewport
            ? `${restore_viewport.x},${restore_viewport.y},${restore_viewport.zoom}`
            : ""
        }
      >
        <button
          type="button"
          onClick={() =>
            on_nodes_change(
              (nodes || []).map((n) => (n.id === "sp" ? { ...n, x: 999 } : n)),
            )
          }
        >
          move-pool
        </button>
        <button
          type="button"
          onClick={() =>
            on_nodes_change(
              (nodes || []).map((n, i) => (i === 0 ? { ...n, x: 777 } : n)),
            )
          }
        >
          move-first
        </button>
        <button type="button" onClick={() => on_select("sp")}>
          select-pool
        </button>
        {(nodes || []).map((n) => (
          <div key={n.id} data-testid={`node-${n.id}`} data-x={n.x}>
            {render_node(n)}
          </div>
        ))}
      </div>
    );
  },
}));

const { api } = require("../../../SERVICEs/api");

const flow = (id, from, to) => ({
  id,
  kind: "flow",
  source_node_id: from,
  source_port_id: "out",
  target_node_id: to,
  target_port_id: "in",
});

const parent = {
  name: "Reviewer",
  nodes: [
    { id: "start", type: "start", outputs: [{ name: "text", type: "string" }], x: 0, y: 0 },
    {
      id: "a0",
      type: "agent",
      override: { model: "gpt", prompt: "hi" },
      outputs: [{ name: "output", type: "string" }],
      x: 0,
      y: 0,
    },
    {
      id: "sp",
      type: "subagent_pool",
      x: 0,
      y: 0,
      subagents: [{ kind: "recipe_ref", recipe_name: "Summarizer" }],
    },
    { id: "end", type: "end", x: 0, y: 0 },
  ],
  edges: [
    flow("e1", "start", "a0"),
    flow("e2", "a0", "end"),
    {
      id: "a0sp",
      kind: "attach",
      source_node_id: "a0",
      source_port_id: "attach_bot",
      target_node_id: "sp",
      target_port_id: "attach_top",
    },
  ],
};

const child = {
  name: "Summarizer",
  nodes: [
    { id: "s2", type: "start", outputs: [{ name: "text", type: "string" }], x: 0, y: 0 },
    {
      id: "a1",
      type: "agent",
      override: { model: "gpt", prompt: "summarize" },
      outputs: [{ name: "output", type: "string" }],
      x: 0,
      y: 0,
    },
    {
      id: "sp2",
      type: "subagent_pool",
      x: 0,
      y: 0,
      subagents: [{ kind: "recipe_ref", recipe_name: "Reviewer" }],
    },
    { id: "e2n", type: "end", x: 0, y: 0 },
  ],
  edges: [
    flow("c1", "s2", "a1"),
    flow("c2", "a1", "e2n"),
    {
      id: "a1sp2",
      kind: "attach",
      source_node_id: "a1",
      source_port_id: "attach_bot",
      target_node_id: "sp2",
      target_port_id: "attach_top",
    },
  ],
};

const library = [{ name: "Reviewer" }, { name: "Summarizer" }];

function Harness() {
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  return (
    <RecipesPage
      isDark={false}
      selectedNodeId={selectedNodeId}
      onSelectNode={setSelectedNodeId}
      fullscreen={false}
    />
  );
}

const show = async () => {
  const out = render(<Harness />);
  await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
  return out;
};

const poolRow = (i = 0) => screen.getByTestId(`pool-node-row-${i}`);
const undoButton = () => {
  const wrap = document.querySelector('[title*="Undo"]');
  return wrap ? within(wrap).getByRole("button") : null;
};
const crumbLabels = () =>
  within(screen.getByTestId("recipe-drill-breadcrumb"))
    .getAllByText(/./)
    .map((n) => n.textContent)
    .filter((t) => t !== "›");

beforeEach(() => {
  mockLiveViewport = { x: 0, y: 0, zoom: 1 };
  api.unchain.listRecipes.mockReset();
  api.unchain.getRecipe.mockReset();
  api.unchain.saveRecipe.mockReset();
  api.unchain.listRecipes.mockResolvedValue({ recipes: library });
  api.unchain.getRecipe.mockImplementation(async (name) =>
    name === "Summarizer" ? child : parent,
  );
  api.unchain.saveRecipe.mockResolvedValue({});
});

describe("drilling into a referenced Agent", () => {
  test("a pool row opens the referenced Agent's own graph", async () => {
    await show();
    expect(screen.queryByTestId("node-a1")).toBeNull();

    fireEvent.doubleClick(poolRow());

    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    /* The real resource, read by identity — not a sub-graph lifted out of the
     * parent, which has no such node in it. */
    expect(api.unchain.getRecipe).toHaveBeenCalledWith("Summarizer");
    expect(screen.queryByTestId("node-sp")).toBeNull();
  });

  test("the breadcrumb names the graph, the pool and where you are", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    expect(crumbLabels()).toEqual(["Reviewer", "Subagent Pool", "Summarizer"]);
  });

  test("the workflow list is out of the way while drilled in", async () => {
    const { container } = await show();
    const shell = () =>
      container.querySelector('[data-testid="recipe-list-panel-shell"]');
    expect(shell().style.pointerEvents).toBe("auto");

    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    /* Reachable, it would offer a switch that drops the parent frame. */
    expect(shell().style.pointerEvents).toBe("none");
  });

  test("saving while drilled writes the Agent being edited", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());

    fireEvent.click(screen.getByText("move-first"));
    fireEvent.click(screen.getByText("Save").closest("button"));

    await waitFor(() => expect(api.unchain.saveRecipe).toHaveBeenCalled());
    expect(api.unchain.saveRecipe.mock.calls[0][0].name).toBe("Summarizer");
  });
});

describe("coming back up", () => {
  test("the breadcrumb returns to the parent", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());

    fireEvent.click(
      within(screen.getByTestId("recipe-drill-breadcrumb"))
        .getByText("Reviewer")
        .closest("button"),
    );

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
    expect(screen.queryByTestId("recipe-drill-breadcrumb")).toBeNull();
  });

  test("Escape goes up one level", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
  });

  test("Escape is consumed by the drill, and left alone when there is none", async () => {
    /* The Agents modal closes on Escape from a window listener. Drilled in,
       Escape must go up one level instead — which works by stopping the event
       at `document`, before it reaches window. Asserted on the mechanism
       rather than on a modal, so it cannot pass by accident. */
    await show();
    const reachedWindow = jest.fn();
    window.addEventListener("keydown", reachedWindow);
    try {
      fireEvent.keyDown(document, { key: "Escape" });
      expect(reachedWindow).toHaveBeenCalledTimes(1);

      fireEvent.doubleClick(poolRow());
      await waitFor(() =>
        expect(screen.getByTestId("node-a1")).toBeInTheDocument(),
      );
      reachedWindow.mockClear();

      fireEvent.keyDown(document, { key: "Escape" });
      expect(reachedWindow).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("keydown", reachedWindow);
    }
  });

  test("the parent's unsaved edits survive the round trip", async () => {
    await show();
    /* Move the pool node, then leave and come back. Re-reading the parent here
     * would silently discard this, and going back is not a save. */
    fireEvent.click(screen.getByText("move-pool"));
    expect(screen.getByTestId("node-sp").getAttribute("data-x")).toBe("999");

    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
    expect(screen.getByTestId("node-sp").getAttribute("data-x")).toBe("999");
    expect(api.unchain.saveRecipe).not.toHaveBeenCalled();
    const reads = api.unchain.getRecipe.mock.calls.filter(
      (c) => c[0] === "Reviewer",
    );
    expect(reads).toHaveLength(1);
  });

  test("the selection you left behind is still selected on return", async () => {
    await show();
    fireEvent.click(screen.getByText("select-pool"));
    await waitFor(() =>
      expect(screen.getByTestId("recipe-detail-panel-header").textContent).toMatch(
        /subagent pool/i,
      ),
    );

    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    /* A graph you have just opened has nothing selected yet. */
    expect(screen.queryByTestId("recipe-detail-panel-header")).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
    expect(screen.getByTestId("recipe-detail-panel-header").textContent).toMatch(
      /subagent pool/i,
    );
  });

  test("the parent's viewport is put back exactly", async () => {
    /* Where the user had panned the parent graph to. */
    mockLiveViewport = { x: 40, y: -25, zoom: 1.75 };
    await show();

    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    /* A graph opened for the first time starts at the origin. */
    expect(screen.getByTestId("flow-editor").dataset.restored).toBe("0,0,1");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.getByTestId("flow-editor").dataset.restored).toBe(
        "40,-25,1.75",
      ),
    );
  });
});

describe("a reference that cannot be opened says so", () => {
  test("a missing Agent names itself and leaves you where you are", async () => {
    api.unchain.listRecipes.mockResolvedValue({ recipes: [{ name: "Reviewer" }] });
    await show();

    fireEvent.doubleClick(poolRow());

    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
      /Summarizer.*no longer in the Agent library/i,
    );
    /* Not "fell back to whatever was first in the library". */
    expect(screen.getByTestId("node-sp")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-drill-breadcrumb")).toBeNull();
  });

  test("a read failure reports the error instead of navigating", async () => {
    await show();
    api.unchain.getRecipe.mockRejectedValueOnce(new Error("EACCES"));

    fireEvent.doubleClick(poolRow());

    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
        /Could not open "Summarizer" — EACCES/,
      ),
    );
    expect(screen.getByTestId("node-sp")).toBeInTheDocument();
    expect(screen.queryByTestId("recipe-drill-breadcrumb")).toBeNull();
  });

  test("a legacy entry says it has a prompt, not a graph", async () => {
    parent.nodes[2].subagents = [{ kind: "inline", name: "summarizer" }];
    await show();

    fireEvent.doubleClick(poolRow());

    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
        /convert it to an agent/i,
      ),
    );
    expect(screen.queryByTestId("recipe-drill-breadcrumb")).toBeNull();
    parent.nodes[2].subagents = [{ kind: "recipe_ref", recipe_name: "Summarizer" }];
  });

  test("an embedded graph says it is not connected yet", async () => {
    /* The other half of the design: a graph owned by this parent. It has no
       storage protocol until #356, and the entry point says so rather than
       doing nothing. */
    parent.nodes[2].subagents = [{ kind: "embedded", name: "inline-agent" }];
    await show();

    fireEvent.doubleClick(poolRow());

    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
        /not connected yet/i,
      ),
    );
    parent.nodes[2].subagents = [{ kind: "recipe_ref", recipe_name: "Summarizer" }];
  });

  test("a row whose Agent is gone is marked before anyone opens it", async () => {
    api.unchain.listRecipes.mockResolvedValue({ recipes: [{ name: "Reviewer" }] });
    await show();
    expect(within(poolRow()).getByText("missing")).toBeInTheDocument();
  });
});

describe("the undo history belongs to the graph, and travels with it", () => {
  test("the parent's history is there again after a round trip", async () => {
    await show();
    fireEvent.click(screen.getByText("move-pool"));
    expect(screen.getByTestId("node-sp").getAttribute("data-x")).toBe("999");
    expect(undoButton().disabled).toBe(false);

    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    /* A graph you have just opened has nothing of its own to undo. */
    expect(undoButton().disabled).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());

    /* Navigating in and back is navigation, not a new editing session. */
    expect(undoButton().disabled).toBe(false);
    fireEvent.click(undoButton());
    await waitFor(() =>
      expect(screen.getByTestId("node-sp").getAttribute("data-x")).toBe("0"),
    );
  });

  test("a frame whose Agent was written deeper drops its history and says so", async () => {
    await show();
    fireEvent.click(screen.getByText("move-pool"));
    expect(undoButton().disabled).toBe(false);

    /* Reviewer › Summarizer › Reviewer — the same Agent at two levels. */
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());

    fireEvent.click(screen.getByText("move-first"));
    fireEvent.click(screen.getByText("Save").closest("button"));
    await waitFor(() => expect(api.unchain.saveRecipe).toHaveBeenCalled());

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());

    /* Replaying that history would rewind into states the file never had. */
    expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
      /saved elsewhere while this copy was open/i,
    );
    expect(undoButton().disabled).toBe(true);
  });

  test("leaving a dirty graph behind is said out loud", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());

    fireEvent.click(screen.getByText("move-first"));
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
    expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
      /Unsaved changes to "Summarizer" were left behind/i,
    );
  });

  test("leaving a clean graph says nothing", async () => {
    await show();
    fireEvent.doubleClick(poolRow());
    await waitFor(() => expect(screen.getByTestId("node-a1")).toBeInTheDocument());

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.getByTestId("node-sp")).toBeInTheDocument());
    expect(screen.queryByTestId("recipe-message-banner")).toBeNull();
  });
});

describe("a page that cannot read its library says so", () => {
  test("an unreachable bridge reports instead of throwing inside an effect", async () => {
    /* This used to throw with nothing catching it: the page stayed blank and
       the reason only existed in the console. */
    api.unchain.listRecipes.mockRejectedValue(new Error("bridge_unavailable"));
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
        /Agent library could not be read — bridge_unavailable/,
      ),
    );
  });

  test("a definition that comes back empty is reported, not rendered as nothing", async () => {
    api.unchain.getRecipe.mockResolvedValue(null);
    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByTestId("recipe-message-banner").textContent).toMatch(
        /Could not open "Reviewer" — the definition came back empty/,
      ),
    );
  });
});
