import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import ToolPoolPanel, {
  is_all_on,
  enabled_tool_set,
  enabled_count,
  next_enabled_tools,
} from "./toolpool_panel";

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

jest.mock("../../../../toolkit/components/toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon }) => (
    <span
      data-testid="toolkit-icon"
      data-name={icon?.name || ""}
      data-bg={icon?.backgroundColor || ""}
    />
  ),
  ToolkitIconFrame: ({
    icon,
    size,
    iconSize,
    transparentIconSize,
    fallbackColor,
  }) => (
    <span
      data-testid="toolkit-icon-frame"
      data-name={icon?.name || ""}
      data-bg={icon?.backgroundColor || ""}
      data-size={String(size)}
      data-icon-size={String(iconSize)}
      data-transparent-icon-size={String(transparentIconSize || "")}
      data-fallback-color={fallbackColor}
    />
  ),
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
        toolkitIcon: {
          type: "builtin",
          name: "link",
          color: "#ffffff",
          backgroundColor: "#2563eb",
        },
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
  test("bleeds the internal scrollbar into the inspector right edge", async () => {
    const { node, recipe } = makeRecipe();
    const { container } = render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("Core")).toBeInTheDocument();
    });

    const panel = container.querySelector(".scrollable");
    expect(panel).toHaveAttribute("data-sb-edge", "2");
    expect(panel).toHaveStyle({
      marginRight: "-16px",
      paddingRight: "18px",
    });
  });

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
    expect(screen.getByText("2/2")).toBeInTheDocument();
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

  test("全开下点掉一个 tool tag → 写入 catalog 顺序白名单", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Core")); // 展开
    fireEvent.click(screen.getByText("write_file"));
    expect(onChange).toHaveBeenCalled();
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits[0].enabled_tools).toEqual(["read_file"]);
  });

  test("白名单下点亮一个禁用 tool tag → 更新白名单", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
    });
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Core"));
    fireEvent.click(screen.getByText("write_file"));
    const call = onChange.mock.calls[0][0];
    // 凑齐 read_file + write_file = 全集 → 删 key（全开）
    expect("enabled_tools" in call.nodes[0].toolkits[0]).toBe(false);
  });

  test("全开时显示 None，点击 → enabled_tools:[]", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {} }],
    });
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
    fireEvent.click(screen.getByText("None"));
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits[0].enabled_tools).toEqual([]);
  });

  test("非全开时显示 All，点击 → 删 key(全开)", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
    });
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
    fireEvent.click(screen.getByText("All"));
    const call = onChange.mock.calls[0][0];
    expect("enabled_tools" in call.nodes[0].toolkits[0]).toBe(false);
  });

  test("点掉最后一个 tool → enabled_tools:[] 且 toolkit 保留", async () => {
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "core", config: {}, enabled_tools: ["read_file"] }],
    });
    const onChange = jest.fn();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={onChange} />),
    );
    await waitFor(() => expect(screen.getByText("Core")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Core"));
    fireEvent.click(screen.getByText("read_file"));
    const call = onChange.mock.calls[0][0];
    expect(call.nodes[0].toolkits[0].enabled_tools).toEqual([]);
    expect(call.nodes[0].toolkits).toHaveLength(1);
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

  test("renders default mcp icon when catalog mcp toolkit omits toolkitIcon", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.custom.local",
          toolkitName: "Local MCP",
          source: "mcp",
          toolkitDescription: "Local MCP server",
          tools: [{ name: "ping" }],
        },
      ],
    });
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("Local MCP")).toBeInTheDocument();
    });

    const icon = screen.getByTestId("toolkit-icon-frame");
    expect(icon).toHaveAttribute("data-name", "mcp");
    expect(icon).toHaveAttribute("data-bg", "transparent");
    expect(icon).toHaveAttribute("data-size", "24");
    expect(icon).toHaveAttribute("data-transparent-icon-size", "16");
  });

  test("renders External API and GitHub with compact framed icons", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "external_api",
          toolkitName: "External API",
          source: "builtin",
          toolkitIcon: {
            type: "builtin",
            name: "link",
            color: "#ffffff",
            backgroundColor: "#2563eb",
          },
          toolkitDescription: "HTTP fetch",
          tools: [{ name: "fetch" }],
        },
        {
          toolkitId: "mcp.dev.github-remote",
          toolkitName: "GitHub",
          source: "mcp",
          toolkitIcon: {
            type: "builtin",
            name: "github",
            color: "#ffffff",
            backgroundColor: "#1f2328",
          },
          toolkitDescription: "GitHub MCP",
          tools: [{ name: "search_repositories" }],
        },
      ],
    });
    const { node, recipe } = makeRecipe();
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    const frames = screen.getAllByTestId("toolkit-icon-frame");
    const external = frames.find((node) => node.getAttribute("data-name") === "link");
    const github = frames.find((node) => node.getAttribute("data-name") === "github");
    expect(external).toHaveAttribute("data-bg", "#2563eb");
    expect(external).toHaveAttribute("data-size", "24");
    expect(external).toHaveAttribute("data-icon-size", "13");
    expect(github).toHaveAttribute("data-bg", "#1f2328");
    expect(github).toHaveAttribute("data-size", "24");
    expect(github).toHaveAttribute("data-icon-size", "13");
  });

  test("renders selected pool toolkit with smaller compact framed icon", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.dev.github-remote",
          toolkitName: "GitHub",
          source: "mcp",
          toolkitIcon: {
            type: "builtin",
            name: "github",
            color: "#ffffff",
            backgroundColor: "#1f2328",
          },
          toolkitDescription: "GitHub MCP",
          tools: [{ name: "search_repositories" }],
        },
      ],
    });
    const { node, recipe } = makeRecipe({
      toolkits: [{ id: "mcp.dev.github-remote", config: {} }],
    });
    render(
      wrap(<ToolPoolPanel node={node} recipe={recipe} onChange={() => {}} />),
    );

    await waitFor(() => {
      expect(screen.getByText("GitHub")).toBeInTheDocument();
    });

    const icon = screen.getByTestId("toolkit-icon-frame");
    expect(icon).toHaveAttribute("data-name", "github");
    expect(icon).toHaveAttribute("data-bg", "#1f2328");
    expect(icon).toHaveAttribute("data-size", "20");
    expect(icon).toHaveAttribute("data-icon-size", "12");
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

describe("toolpool_panel helpers", () => {
  const names = ["read_file", "write_file", "list_dir"];

  test("is_all_on: 缺省/null/无 entry 都算全开", () => {
    expect(is_all_on(undefined)).toBe(true);
    expect(is_all_on({ id: "x" })).toBe(true);
    expect(is_all_on({ id: "x", enabled_tools: null })).toBe(true);
    expect(is_all_on({ id: "x", enabled_tools: [] })).toBe(false);
    expect(is_all_on({ id: "x", enabled_tools: ["read_file"] })).toBe(false);
  });

  test("enabled_tool_set: 全开返回全集，白名单返回数组集合", () => {
    expect(enabled_tool_set({ id: "x" }, names)).toEqual(new Set(names));
    expect(enabled_tool_set({ id: "x", enabled_tools: ["read_file"] }, names)).toEqual(
      new Set(["read_file"]),
    );
    expect(enabled_tool_set({ id: "x", enabled_tools: [] }, names)).toEqual(new Set());
  });

  test("enabled_count: 全开=总数，白名单=数组长度", () => {
    expect(enabled_count({ id: "x" }, names)).toBe(3);
    expect(enabled_count({ id: "x", enabled_tools: ["read_file"] }, names)).toBe(1);
    expect(enabled_count({ id: "x", enabled_tools: [] }, names)).toBe(0);
  });

  test("next_enabled_tools: 全开下关一个 → 按 catalog 顺序的白名单", () => {
    expect(next_enabled_tools({ id: "x" }, names, "write_file")).toEqual([
      "read_file",
      "list_dir",
    ]);
  });

  test("next_enabled_tools: 白名单下开一个 → 凑齐全集返回 undefined(全开)", () => {
    expect(
      next_enabled_tools({ id: "x", enabled_tools: ["read_file", "list_dir"] }, names, "write_file"),
    ).toBeUndefined();
  });

  test("next_enabled_tools: 关掉最后一个 → 空数组", () => {
    expect(
      next_enabled_tools({ id: "x", enabled_tools: ["read_file"] }, names, "read_file"),
    ).toEqual([]);
  });

  test("next_enabled_tools: 全关下开一个 → 单元素白名单", () => {
    expect(next_enabled_tools({ id: "x", enabled_tools: [] }, names, "list_dir")).toEqual([
      "list_dir",
    ]);
  });
});
