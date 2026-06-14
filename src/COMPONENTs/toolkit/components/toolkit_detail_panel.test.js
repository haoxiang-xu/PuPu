import { render, screen, waitFor } from "@testing-library/react";
import ToolkitDetailPanel from "./toolkit_detail_panel";
import api from "../../../SERVICEs/api";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      getToolkitDetail: jest.fn(),
    },
  },
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ onClick }) => <button onClick={onClick}>Back</button>,
}));

jest.mock("./toolkit_icon", () => ({
  __esModule: true,
  default: ({ icon, size }) => (
    <span data-testid="toolkit-icon" data-name={icon?.name || ""} data-size={String(size)}>
      {icon?.type || "fallback"}
    </span>
  ),
  hasTransparentToolkitIconBackground: (backgroundColor) =>
    !backgroundColor || backgroundColor === "transparent",
  isBuiltinToolkitIcon: (icon) => icon?.type === "builtin",
  isFileToolkitIcon: (icon) => icon?.type === "file",
}));

jest.mock("./loading_dots", () => ({
  __esModule: true,
  default: () => <div>Loading</div>,
}));

jest.mock("./placeholder_block", () => ({
  __esModule: true,
  default: ({ title }) => <div>{title}</div>,
}));

jest.mock("../../../BUILTIN_COMPONENTs/markdown/markdown", () => ({
  __esModule: true,
  default: ({ content }) => <div>{content}</div>,
}));

describe("ToolkitDetailPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses builtin icon background color in the detail header", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "demo_toolkit",
      toolkitName: "Demo Toolkit",
      toolkitDescription: "Toolkit description",
      toolkitIcon: {
        type: "builtin",
        name: "terminal",
        color: "#0f172a",
        backgroundColor: "#bae6fd",
      },
      readmeMarkdown: "# Demo Toolkit",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="demo_toolkit"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Demo Toolkit")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "#bae6fd",
      width: "48px",
      height: "48px",
      borderRadius: "12px",
    });
  });

  test("renders default mcp detail icon smaller when it has no background", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "mcp.memory.memory",
      toolkitName: "Memory",
      toolkitDescription: "MCP memory",
      toolkitIcon: {},
      readmeMarkdown: "# Memory",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="mcp.memory.memory"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Memory")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "transparent",
      width: "48px",
      height: "48px",
    });
    expect(screen.getByTestId("toolkit-icon")).toHaveAttribute(
      "data-name",
      "mcp",
    );
    expect(screen.getByTestId("toolkit-icon")).toHaveAttribute(
      "data-size",
      "24",
    );
  });

  test("renders default mcp detail icon for custom MCP ids missing a registry icon", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "mcp.custom.empty",
      toolkitName: "Custom MCP",
      toolkitDescription: "Custom MCP server",
      toolkitIcon: {},
      readmeMarkdown: "# Custom MCP",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="mcp.custom.empty"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Custom MCP")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "transparent",
      width: "48px",
      height: "48px",
    });
    expect(screen.getByTestId("toolkit-icon")).toHaveAttribute(
      "data-name",
      "mcp",
    );
  });

  test("renders default mcp detail icon when backend returns the generic tool icon", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "mcp.custom.tool-default",
      toolkitName: "Tool Default MCP",
      toolkitDescription: "Custom MCP server",
      toolkitIcon: {
        type: "builtin",
        name: "tool",
        color: "#ffffff",
        backgroundColor: "#111827",
      },
      readmeMarkdown: "# Tool Default MCP",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="mcp.custom.tool-default"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Tool Default MCP")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "transparent",
    });
    expect(screen.getByTestId("toolkit-icon")).toHaveAttribute(
      "data-name",
      "mcp",
    );
  });

  test("preserves an explicit MCP detail icon when one is provided", async () => {
    api.unchain.getToolkitDetail.mockResolvedValue({
      toolkitId: "mcp.custom.branded",
      toolkitName: "Branded MCP",
      toolkitDescription: "Custom MCP with icon",
      toolkitIcon: {
        type: "builtin",
        name: "github",
        color: "#ffffff",
        backgroundColor: "#1f2328",
      },
      readmeMarkdown: "# Branded MCP",
      selectedToolName: null,
    });

    render(
      <ToolkitDetailPanel
        toolkitId="mcp.custom.branded"
        toolName={null}
        isDark={false}
        onBack={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Branded MCP")).toBeInTheDocument();
    });

    expect(screen.getByTestId("toolkit-detail-icon-wrap")).toHaveStyle({
      backgroundColor: "#1f2328",
    });
    expect(screen.getByTestId("toolkit-icon")).toHaveAttribute(
      "data-name",
      "github",
    );
  });
});
