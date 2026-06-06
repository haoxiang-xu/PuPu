import { render, screen, fireEvent } from "@testing-library/react";
import ToolkitInspector from "./toolkit_inspector";
import { api } from "../../../../../SERVICEs/api";

jest.mock("../../../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  default: ({ on, set_on }) => (
    <button data-testid="switch" onClick={() => set_on(!on)}>
      {String(on)}
    </button>
  ),
}));

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span />,
}));

describe("ToolkitInspector MCP", () => {
  beforeEach(() => {
    jest.spyOn(api.unchain, "getToolkitCatalog").mockResolvedValue({
      toolkits: [
        {
          id: "mcp.memory.memory",
          toolkitName: "Memory",
          source: "mcp",
          tools: [{ name: "search_nodes" }],
        },
      ],
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("renders installed mcp toolkit by name and toggling adds {id, enabled_tools}", async () => {
    const onRecipeChange = jest.fn();
    render(
      <ToolkitInspector
        recipe={{ toolkits: [] }}
        onRecipeChange={onRecipeChange}
        isDark={false}
      />,
    );

    await screen.findByText("Memory");
    fireEvent.click(screen.getAllByTestId("switch")[0]);

    expect(onRecipeChange).toHaveBeenCalledWith(
      expect.objectContaining({
        toolkits: [{ id: "mcp.memory.memory", enabled_tools: null }],
      }),
    );
  });
});
