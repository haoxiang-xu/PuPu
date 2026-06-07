import { act, fireEvent, render, screen } from "@testing-library/react";
import ToolkitsPage from "./toolkits_page";
import {
  getInstalledMcpIds,
  installMcpEntry,
  connectMcpOAuthEntry,
} from "../../../SERVICEs/mcp_install";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick, disabled }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

jest.mock("../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  getInstalledMcpIds: jest.fn(() => Promise.resolve(new Set())),
  installMcpEntry: jest.fn(() =>
    Promise.resolve({ ok: true, toolkitId: "mcp.browser.playwright" }),
  ),
  connectMcpOAuthEntry: jest.fn(() =>
    Promise.resolve({ ok: true, toolkitId: "mcp.productivity.notion-remote" }),
  ),
}));

jest.mock("../../settings/runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));

jest.mock("./toolkit_store_page", () => ({
  __esModule: true,
  default: ({ onEntryClick, onInstall, onOAuthConnect }) => (
    <div>
      <span>Store Page</span>
      <button onClick={() => onEntryClick?.("browser.playwright")}>
        Open Store Entry
      </button>
      <button
        onClick={() =>
          onInstall?.({
            id: "browser.playwright",
            toolkitId: "mcp.browser.playwright",
          })
        }
      >
        Install Store Entry
      </button>
      <button
        onClick={() =>
          onOAuthConnect?.({
            id: "productivity.notion-remote",
            toolkitId: "mcp.productivity.notion-remote",
            mcp: { transport: "http" },
          })
        }
      >
        Connect OAuth Entry
      </button>
    </div>
  ),
}));

jest.mock("./toolkit_installed_page", () => ({
  __esModule: true,
  default: ({ onToolClick }) => (
    <div>
      <span>Installed Page</span>
      <button
        onClick={() =>
          onToolClick?.("builtin.demo", null, {
            toolkitId: "builtin.demo",
            toolkitName: "Installed Demo",
            tools: [],
          })
        }
      >
        Open Installed Toolkit
      </button>
    </div>
  ),
}));

jest.mock("./custom_mcp_page", () => ({
  __esModule: true,
  default: ({ onInstall }) => (
    <div>
      <span>Custom MCP Page</span>
      <button
        onClick={() =>
          onInstall?.(
            {
              id: "custom",
              toolkitId: "mcp.custom.local-test",
              status: "available",
            },
            {
              customRecipe: {
                toolkit_id: "mcp.custom.local-test",
                toolkit_name: "Local Test",
                mcp: { transport: "stdio", command: "echo", args: ["ok"] },
              },
              secrets: { TOKEN: "secret" },
            },
          )
        }
      >
        Install Custom MCP
      </button>
    </div>
  ),
}));

jest.mock("../components/toolkit_detail_panel", () => ({
  __esModule: true,
  default: () => <div>Installed Detail Panel</div>,
}));

jest.mock("../components/store_toolkit_detail_panel", () => ({
  __esModule: true,
  default: ({ entry, onInstall }) => (
    <div>
      <span>Store Detail Panel: {entry?.id}</span>
      <button
        onClick={() =>
          onInstall?.(entry, {
            secrets: { OPENAI_API_KEY: "sk-test" },
          })
        }
      >
        Install From Detail
      </button>
    </div>
  ),
}));

describe("ToolkitsPage", () => {
  const renderToolkitsPage = async () => {
    let rendered;
    await act(async () => {
      rendered = render(<ToolkitsPage isDark={false} />);
    });
    return rendered;
  };

  beforeEach(() => {
    getInstalledMcpIds.mockClear();
    installMcpEntry.mockClear();
    connectMcpOAuthEntry.mockClear();
    jest.useFakeTimers();
    jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback();
        return 1;
      });
  });

  afterEach(() => {
    window.requestAnimationFrame.mockRestore();
    jest.useRealTimers();
  });

  test("keeps installed as the default tab and opens installed detail", async () => {
    await renderToolkitsPage();

    expect(screen.getByText("Installed Page")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Open Installed Toolkit"));

    expect(screen.getByText("Installed Detail Panel")).toBeInTheDocument();
    expect(screen.queryByText(/Store Detail Panel/)).toBeNull();
  });

  test("store card click opens store detail instead of installed detail", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    fireEvent.click(screen.getByText("Open Store Entry"));

    expect(
      screen.getByText("Store Detail Panel: browser.playwright"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Installed Detail Panel")).toBeNull();
  });

  test("switching sub tabs closes an open detail panel", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    fireEvent.click(screen.getByText("Open Store Entry"));
    expect(screen.getByText(/Store Detail Panel/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("toolkit.installed"));
    act(() => {
      jest.advanceTimersByTime(260);
    });

    expect(screen.queryByText(/Store Detail Panel/)).toBeNull();
  });

  test("installing a store entry calls installMcpEntry and refreshes installed set", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    await act(async () => {
      fireEvent.click(screen.getByText("Install Store Entry"));
    });

    expect(installMcpEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "browser.playwright" }),
      expect.objectContaining({ workspaceRoot: "" }),
    );
    // getInstalledMcpIds runs on mount and again after a successful install
    expect(getInstalledMcpIds.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("custom MCP tab installs through the shared MCP install flow", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.custom_mcp"));
    expect(screen.getByText("Custom MCP Page")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Install Custom MCP"));
    });

    expect(installMcpEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom",
        toolkitId: "mcp.custom.local-test",
      }),
      expect.objectContaining({
        workspaceRoot: "",
        customRecipe: {
          toolkit_id: "mcp.custom.local-test",
          toolkit_name: "Local Test",
          mcp: { transport: "stdio", command: "echo", args: ["ok"] },
        },
        secrets: { TOKEN: "secret" },
      }),
    );
  });

  test("detail install forwards setup options to installMcpEntry", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    fireEvent.click(screen.getByText("Open Store Entry"));
    await act(async () => {
      fireEvent.click(screen.getByText("Install From Detail"));
    });

    expect(installMcpEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "browser.playwright" }),
      expect.objectContaining({
        workspaceRoot: "",
        secrets: { OPENAI_API_KEY: "sk-test" },
      }),
    );
  });

  test("connecting an OAuth store entry calls connectMcpOAuthEntry and refreshes installed set", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    await act(async () => {
      fireEvent.click(screen.getByText("Connect OAuth Entry"));
    });

    expect(connectMcpOAuthEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: "productivity.notion-remote" }),
    );
    expect(getInstalledMcpIds.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
