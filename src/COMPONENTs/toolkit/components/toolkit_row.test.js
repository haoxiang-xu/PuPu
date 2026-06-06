import { render, screen, fireEvent } from "@testing-library/react";
import ToolkitRow from "./toolkit_row";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
  isBuiltinToolkitIcon: (i) => i?.type === "builtin",
  isFileToolkitIcon: () => false,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/switch", () => ({
  __esModule: true,
  SemiSwitch: () => <span data-testid="switch" />,
}));

jest.mock("../../../BUILTIN_COMPONENTs/tooltip/tooltip", () => ({
  __esModule: true,
  default: ({ children }) => children,
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ prefix_icon, onClick, disabled }) => (
    <button
      data-testid={`btn-${prefix_icon}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {prefix_icon}
    </button>
  ),
}));

const mcpToolkit = {
  toolkitId: "mcp.memory.memory",
  toolkitName: "Memory",
  source: "mcp",
  tools: [],
};

const localToolkit = {
  toolkitId: "local.demo",
  toolkitName: "Local Demo",
  source: "local",
  tools: [],
};

describe("ToolkitRow actions", () => {
  test("mcp row delete is enabled and calls onDelete with the toolkit id", () => {
    const onDelete = jest.fn();
    render(
      <ToolkitRow
        toolkit={mcpToolkit}
        isDark={false}
        isBuiltin={false}
        onDelete={onDelete}
      />,
    );

    const del = screen.getByTestId("btn-delete");
    expect(del).not.toBeDisabled();
    fireEvent.click(del);
    expect(onDelete).toHaveBeenCalledWith("mcp.memory.memory");
  });

  test("non-mcp (local) row renders delete as a disabled placeholder", () => {
    render(
      <ToolkitRow
        toolkit={localToolkit}
        isDark={false}
        isBuiltin={false}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByTestId("switch")).toBeInTheDocument();
    expect(screen.getByTestId("btn-delete")).toBeDisabled();
  });

  test("builtin row shows the auto-enable switch and a disabled delete", () => {
    render(
      <ToolkitRow
        toolkit={{ ...mcpToolkit, source: "builtin" }}
        isDark={false}
        isBuiltin
        onDelete={() => {}}
      />,
    );

    expect(screen.getByTestId("switch")).toBeInTheDocument();
    expect(screen.getByTestId("btn-delete")).toBeDisabled();
  });
});
