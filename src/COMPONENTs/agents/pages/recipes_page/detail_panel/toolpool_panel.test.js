import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import ToolPoolPanel from "./toolpool_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

jest.mock("../../../../../SERVICEs/api", () => ({
  api: {
    unchain: {
      listToolModalCatalog: jest.fn(),
    },
  },
}));

const { api } = require("../../../../../SERVICEs/api");

beforeEach(() => {
  api.unchain.listToolModalCatalog.mockReset();
  api.unchain.listToolModalCatalog.mockResolvedValue({
    toolkits: [
      {
        toolkitId: "core",
        toolkitName: "Core",
        toolkitIcon: {},
        toolkitDescription: "Built-in tools",
        tools: [
          { name: "read_file", description: "Read content of a file." },
          { name: "write_file" },
        ],
      },
      {
        toolkitId: "external_api",
        toolkitName: "External API",
        toolkitIcon: {},
        toolkitDescription: "HTTP fetch",
        tools: [{ name: "fetch" }],
      },
    ],
  });
});

function makeRecipe(extra = {}) {
  const node = { id: "tp", type: "toolkit_pool", toolkits: [], ...extra };
  return {
    node,
    recipe: { nodes: [node], edges: [] },
  };
}

describe("ToolPoolPanel — pool", () => {
  test("renders pool entries with toolkit name and tool count", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  test("clicking a pool row expands only that toolkit", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [
        { id: "core", config: {} },
        { id: "external_api", config: {} },
      ],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Core"));
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("write_file")).toBeInTheDocument();
    expect(screen.queryByText("fetch")).not.toBeInTheDocument();
  });

  test("clicking × removes the toolkit from the pool", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    const onChange = jest.fn();
    const { container } = render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    const buttons = container.querySelectorAll("button");
    const closeBtn = Array.from(buttons).find(
      (b) => b.textContent.trim() === "" && b.querySelector("img,svg") !== null,
    );
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits).toEqual([]);
  });
});

describe("ToolPoolPanel — installed list", () => {
  test("hides toolkits already in the pool", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("External API")).toBeInTheDocument();
    });
    expect(screen.queryByText("Built-in tools")).not.toBeInTheDocument();
    expect(screen.getByText("HTTP fetch")).toBeInTheDocument();
  });

  test("clicking Add adds the toolkit", async () => {
    const { node, recipe } = makeRecipe();
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    const addButtons = screen.getAllByText("Add");
    fireEvent.click(addButtons[0]);
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits).toEqual([{ id: "core", config: {} }]);
  });

  test("search filters installed list by name and tool name", async () => {
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    const search = screen.getByPlaceholderText("Search tools...");
    fireEvent.change(search, { target: { value: "fetch" } });
    expect(screen.queryByText("Core")).not.toBeInTheDocument();
    expect(screen.getByText("External API")).toBeInTheDocument();
  });
});

describe("ToolPoolPanel — merge switch", () => {
  test("toggling the merge switch updates node.merge_with_user_selected", async () => {
    const { node, recipe } = makeRecipe({ merge_with_user_selected: true });
    const onChange = jest.fn();
    const { container } = render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Merge with user-selected")).toBeInTheDocument();
    });
    const track = container.querySelector(".mini-ui-switch-track");
    expect(track).toBeTruthy();
    fireEvent.click(track);
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].merge_with_user_selected).toBe(false);
  });
});

describe("ToolPoolPanel — Store tab", () => {
  test("shows the coming-soon placeholder", async () => {
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );
    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Store"));
    expect(screen.getByText("Tool Store coming soon.")).toBeInTheDocument();
  });
});
