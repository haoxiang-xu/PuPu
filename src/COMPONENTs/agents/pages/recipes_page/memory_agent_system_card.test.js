import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RecipesPage from "../recipes_page";
import MemoryAgentSystemPanel from "./memory_agent_system_panel";
import { api } from "../../../../SERVICEs/api";
import { writeFeatureFlags } from "../../../../SERVICEs/feature_flags";
import { MEMORY_AGENT_SYSTEM_NODE_ID } from "../../../../SERVICEs/memory_agent_settings";
import { contextV2Bridge } from "../../../../SERVICEs/bridges/context_v2_bridge";

const mockExplorerProps = [];

jest.mock("../../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listRecipes: jest.fn(),
      getRecipe: jest.fn(),
      saveRecipe: jest.fn(),
      getStatus: jest.fn(),
      getModelCatalog: jest.fn(),
    },
  },
}));

jest.mock("../../../../SERVICEs/bridges/context_v2_bridge", () => ({
  contextV2Bridge: {
    getStatus: jest.fn(),
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

jest.mock("../../../../BUILTIN_COMPONENTs/input/input", () => ({
  Input: function MockInput({ value, set_value }) {
    return (
      <input value={value} onChange={(e) => set_value(e.target.value)} />
    );
  },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/select/select", () => {
  return function MockSelect({ options = [], value, set_value }) {
    return (
      <select value={value} onChange={(e) => set_value(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
      const node = data[id];
      if (!node) return null;
      return (
        <div key={id}>
          <button type="button" onClick={() => node.on_click?.(node)}>
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
    return <div data-testid="recipe-canvas">Canvas {recipe?.name || ""}</div>;
  };
});

jest.mock("./detail_panel/detail_panel", () => {
  return function MockDetailPanel() {
    return <div data-testid="recipe-detail-panel-mock" />;
  };
});

const renderPage = () =>
  render(
    <RecipesPage
      isDark={false}
      selectedNodeId={null}
      onSelectNode={() => {}}
      fullscreen={false}
    />,
  );

beforeEach(() => {
  window.localStorage.clear();
  mockExplorerProps.length = 0;
  jest.clearAllMocks();
  api.unchain.listRecipes.mockResolvedValue({
    recipes: [{ name: "Default" }, { name: "Explore" }],
  });
  api.unchain.getRecipe.mockImplementation(async (name) => ({
    name,
    nodes: [],
    edges: [],
  }));
  api.unchain.getStatus.mockResolvedValue({ ready: true, status: "running" });
  contextV2Bridge.getStatus.mockResolvedValue({
    available: true,
    rolloutMode: "shadow",
    readOnlyDegraded: false,
  });
  api.unchain.getModelCatalog.mockResolvedValue({
    activeModel: "openai:gpt-4.1",
    providers: { ollama: [], openai: ["gpt-4.1"], anthropic: [] },
  });
});

test("flag off: no System Agents group, no memory agent card", async () => {
  renderPage();

  expect(await screen.findByText("Default")).toBeInTheDocument();
  expect(screen.queryByText("System Agents")).not.toBeInTheDocument();
  expect(screen.queryByText("Memory Agent")).not.toBeInTheDocument();
});

test("flag on: system card sits above the agents tree; selecting it opens the panel without fetching a recipe", async () => {
  writeFeatureFlags({ enable_memory_v2: true });
  renderPage();

  expect(await screen.findByText("Memory Agent")).toBeInTheDocument();
  expect(screen.getByText("System Agents")).toBeInTheDocument();

  /* group renders above the user tree */
  const group = screen.getByTestId("system-agents-group");
  const defaultRow = await screen.findByText("Default");
  // eslint-disable-next-line no-bitwise
  expect(
    group.compareDocumentPosition(defaultRow) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  const getRecipeCallsBefore = api.unchain.getRecipe.mock.calls.length;
  fireEvent.click(screen.getByText("Memory Agent"));

  expect(
    await screen.findByTestId("memory-agent-system-panel"),
  ).toBeInTheDocument();
  expect(screen.getByText("System · Managed by PuPu")).toBeInTheDocument();

  /* no recipe fetch for the system node; graph + detail are not rendered */
  expect(api.unchain.getRecipe.mock.calls.length).toBe(getRecipeCallsBefore);
  expect(api.unchain.getRecipe).not.toHaveBeenCalledWith(
    MEMORY_AGENT_SYSTEM_NODE_ID,
  );
  expect(screen.queryByTestId("recipe-canvas")).not.toBeInTheDocument();
  expect(
    screen.queryByTestId("recipe-detail-panel-mock"),
  ).not.toBeInTheDocument();

  await waitFor(() =>
    expect(screen.getByTestId("memory-agent-status-badge")).toHaveAttribute(
      "data-status",
      "shadow",
    ),
  );
});

test("system node is isolated: non-draggable explorer, no context menu, absent from the user tree", async () => {
  writeFeatureFlags({ enable_memory_v2: true });
  renderPage();
  await screen.findByText("Memory Agent");

  const systemInstances = mockExplorerProps.filter(
    (p) => p.data && p.data[MEMORY_AGENT_SYSTEM_NODE_ID],
  );
  expect(systemInstances.length).toBeGreaterThan(0);
  systemInstances.forEach((props) => {
    expect(Boolean(props.draggable)).toBe(false);
    expect(props.on_reorder).toBeUndefined();
    const node = props.data[MEMORY_AGENT_SYSTEM_NODE_ID];
    expect(node.on_context_menu).toBeUndefined();
  });

  /* the draggable user tree never contains the system node */
  const treeInstances = mockExplorerProps.filter((p) => p.draggable === true);
  expect(treeInstances.length).toBeGreaterThan(0);
  treeInstances.forEach((props) => {
    expect(props.data[MEMORY_AGENT_SYSTEM_NODE_ID]).toBeUndefined();
  });
});

test("panel edits persist to the memory_agent_v2 namespace and update the list row", async () => {
  writeFeatureFlags({ enable_memory_v2: true });
  renderPage();

  fireEvent.click(await screen.findByText("Memory Agent"));
  await screen.findByTestId("memory-agent-system-panel");

  const nameInput = screen
    .getByTestId("memory-agent-display-name")
    .querySelector("input");
  fireEvent.change(nameInput, { target: { value: "Archivist" } });

  await waitFor(() => {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.memory_agent_v2).toMatchObject({ displayName: "Archivist" });
  });
  /* list row + panel header follow the rename via subscription */
  expect((await screen.findAllByText("Archivist")).length).toBeGreaterThan(0);

  const textarea = screen.getByTestId("memory-agent-additional-instructions");
  fireEvent.change(textarea, { target: { value: "Prefer terse notes." } });
  await waitFor(() => {
    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.memory_agent_v2).toMatchObject({
      additionalInstructions: "Prefer terse notes.",
    });
  });
});

test("status degrades visibly when the runtime status call fails", async () => {
  contextV2Bridge.getStatus.mockRejectedValue(new Error("boom"));
  render(<MemoryAgentSystemPanel isDark={false} />);

  await waitFor(() =>
    expect(screen.getByTestId("memory-agent-status-badge")).toHaveAttribute(
      "data-status",
      "degraded",
    ),
  );
  expect(screen.getByText("Degraded")).toBeInTheDocument();
  expect(
    screen.getByTestId("memory-agent-status-detail"),
  ).toBeInTheDocument();
});

test("status exposes active, canary, and read-only degraded rollout modes", async () => {
  contextV2Bridge.getStatus.mockResolvedValueOnce({
    available: true,
    rolloutMode: "all",
    readOnlyDegraded: false,
  });
  const active = render(<MemoryAgentSystemPanel isDark={false} />);
  await waitFor(() =>
    expect(active.getByTestId("memory-agent-status-badge")).toHaveAttribute(
      "data-status",
      "active",
    ),
  );
  active.unmount();

  contextV2Bridge.getStatus.mockResolvedValueOnce({
    available: true,
    rolloutMode: "canary",
    readOnlyDegraded: false,
  });
  const canary = render(<MemoryAgentSystemPanel isDark={false} />);
  await waitFor(() =>
    expect(canary.getByTestId("memory-agent-status-badge")).toHaveAttribute(
      "data-status",
      "canary",
    ),
  );
  canary.unmount();

  contextV2Bridge.getStatus.mockResolvedValueOnce({
    available: true,
    rolloutMode: "all",
    readOnlyDegraded: true,
  });
  render(<MemoryAgentSystemPanel isDark={false} />);
  await waitFor(() =>
    expect(screen.getByTestId("memory-agent-status-badge")).toHaveAttribute(
      "data-status",
      "degraded",
    ),
  );
  expect(screen.getByText(/Read-only degraded mode/)).toBeInTheDocument();
});

test("status badge uses distinct light and dark palettes", async () => {
  const light = render(<MemoryAgentSystemPanel isDark={false} />);
  await waitFor(() =>
    expect(
      light.getByTestId("memory-agent-status-badge"),
    ).toHaveAttribute("data-status", "shadow"),
  );
  const lightBg =
    light.getByTestId("memory-agent-status-badge").style.backgroundColor;
  light.unmount();

  const dark = render(<MemoryAgentSystemPanel isDark />);
  await waitFor(() =>
    expect(
      dark.getByTestId("memory-agent-status-badge"),
    ).toHaveAttribute("data-status", "shadow"),
  );
  const darkBg =
    dark.getByTestId("memory-agent-status-badge").style.backgroundColor;

  expect(lightBg).toBeTruthy();
  expect(darkBg).toBeTruthy();
  expect(lightBg).not.toBe(darkBg);
});
