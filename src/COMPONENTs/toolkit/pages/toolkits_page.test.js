import { act, fireEvent, render, screen } from "@testing-library/react";
import ToolkitsPage from "./toolkits_page";
import api from "../../../SERVICEs/api";
import {
  getInstalledMcpIds,
  installMcpEntry,
  connectMcpOAuthEntry,
} from "../../../SERVICEs/mcp_install";
import {
  clearMcpStoreMetadataCache,
  setMcpStoreEntriesCache,
  setMcpStoreMetadataCache,
} from "../../../SERVICEs/mcp_toolkit_store";

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

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listMcpStoreMetadata: jest.fn(() =>
        Promise.resolve({ entries: [], byEntryId: {}, status: "ok" }),
      ),
      listMcpStoreEntries: jest.fn(() =>
        Promise.resolve({
          entries: [
            {
              id: "browser.playwright",
              toolkitId: "mcp.browser.playwright",
              toolkitName: "Playwright Browser",
              toolkitDescription: "Browser automation",
              source: "mcp",
              status: "available",
              installable: true,
              mcp: { transport: "stdio" },
              tools: [],
            },
          ],
          count: 1,
          status: "ok",
        }),
      ),
      reloadMcpStoreMetadata: jest.fn(() =>
        Promise.resolve({
          entries: [
            {
              entryId: "browser.playwright",
              toolkitId: "mcp.browser.playwright",
              metadata: { stars: 1234 },
            },
          ],
          byEntryId: {},
          status: "ok",
        }),
      ),
      importMcpStoreRegistry: jest.fn(() =>
        Promise.resolve({ registry: { registryId: "registry.inline.test" } }),
      ),
      approveMcpStoreEntry: jest.fn(() =>
        Promise.resolve({ entry: { id: "external.sample", approvalStatus: "approved" } }),
      ),
      revokeMcpStoreEntryApproval: jest.fn(() =>
        Promise.resolve({ ok: true, entryId: "external.sample" }),
      ),
    },
  },
}));

jest.mock("../../../SERVICEs/mcp_toolkit_store", () => {
  const actual = jest.requireActual("../../../SERVICEs/mcp_toolkit_store");
  let testEntries = null;
  return {
    __esModule: true,
    ...actual,
    getMcpStoreEntry: jest.fn((id) => {
      if (Array.isArray(testEntries)) {
        const entry = testEntries.find((item) => item.id === id);
        if (entry) return entry;
      }
      return (
        actual.getMcpStoreEntry(id) ||
        actual.MCP_STORE_ENTRIES.find((entry) => entry.id === id) ||
        (id === "browser.playwright"
          ? {
              id: "browser.playwright",
              toolkitId: "mcp.browser.playwright",
              toolkitName: "Playwright Browser",
              toolkitDescription: "Browser automation",
              source: "mcp",
              status: "available",
              installable: true,
              mcp: { transport: "stdio" },
              tools: [],
            }
          : null) ||
        null
      );
    }),
    setMcpStoreEntriesCache: jest.fn((payload) => {
      const entries = Array.isArray(payload?.entries) ? payload.entries : [];
      testEntries = entries.length ? entries : null;
      actual.setMcpStoreEntriesCache(payload);
    }),
    setMcpStoreMetadataCache: jest.fn((payload) =>
      actual.setMcpStoreMetadataCache(payload),
    ),
    clearMcpStoreMetadataCache: jest.fn(() =>
      actual.clearMcpStoreMetadataCache(),
    ),
  };
});

jest.mock("../../settings/runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));

jest.mock("./toolkit_store_page", () => ({
  __esModule: true,
  default: ({
    onEntryClick,
    onInstall,
    onOAuthConnect,
    onRefreshMetadata,
    onImportRegistry,
  }) => (
    <div>
      <span>Store Page</span>
      <button onClick={() => onRefreshMetadata?.()}>Refresh Metadata</button>
      <button
        onClick={() =>
          onImportRegistry?.({ registry: { version: 1, entries: [] } })
        }
      >
        Import Registry
      </button>
      <button onClick={() => onEntryClick?.("browser.playwright")}>
        Open Store Entry
      </button>
      <button onClick={() => onEntryClick?.("external.sample")}>
        Open External Entry
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
  default: ({ entry, onInstall, onApproveEntry, onRevokeApproval }) => (
    <div>
      <span>Store Detail Panel: {entry?.id}</span>
      <span>Store Detail Trust: {entry?.trustLevel}</span>
      <button
        onClick={() =>
          onInstall?.(entry, {
            secrets: { OPENAI_API_KEY: "sk-test" },
          })
        }
      >
        Install From Detail
      </button>
      <button
        onClick={() => onApproveEntry?.(entry, { acknowledgedRisk: true })}
      >
        Approve From Detail
      </button>
      <button onClick={() => onRevokeApproval?.(entry)}>Revoke From Detail</button>
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
    api.unchain.listMcpStoreMetadata.mockClear();
    api.unchain.listMcpStoreEntries.mockClear();
    api.unchain.reloadMcpStoreMetadata.mockClear();
    api.unchain.importMcpStoreRegistry.mockClear();
    api.unchain.approveMcpStoreEntry.mockClear();
    api.unchain.revokeMcpStoreEntryApproval.mockClear();
    api.unchain.listMcpStoreMetadata.mockResolvedValue({
      entries: [],
      byEntryId: {},
      status: "ok",
    });
    api.unchain.reloadMcpStoreMetadata.mockResolvedValue({
      entries: [
        {
          entryId: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          metadata: { stars: 1234 },
        },
      ],
      byEntryId: {},
      status: "ok",
    });
    api.unchain.listMcpStoreEntries.mockResolvedValue({
      entries: [
        {
          id: "browser.playwright",
          toolkitId: "mcp.browser.playwright",
          toolkitName: "Playwright Browser",
          toolkitDescription: "Browser automation",
          source: "mcp",
          status: "available",
          installable: true,
          mcp: { transport: "stdio" },
          tools: [],
        },
      ],
      count: 1,
      status: "ok",
    });
    api.unchain.importMcpStoreRegistry.mockResolvedValue({
      registry: { registryId: "registry.inline.test" },
    });
    api.unchain.approveMcpStoreEntry.mockResolvedValue({
      entry: { id: "external.sample", approvalStatus: "approved" },
    });
    api.unchain.revokeMcpStoreEntryApproval.mockResolvedValue({
      ok: true,
      entryId: "external.sample",
    });
    setMcpStoreEntriesCache.mockClear();
    setMcpStoreEntriesCache({ entries: [] });
    setMcpStoreEntriesCache.mockClear();
    setMcpStoreMetadataCache.mockClear();
    clearMcpStoreMetadataCache.mockClear();
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

  test("loads cached store metadata on mount", async () => {
    await renderToolkitsPage();

    expect(api.unchain.listMcpStoreEntries).toHaveBeenCalledTimes(1);
    expect(api.unchain.listMcpStoreMetadata).toHaveBeenCalledTimes(1);
    expect(setMcpStoreMetadataCache).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [] }),
    );
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

  test("store metadata refresh reloads cache", async () => {
    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    await act(async () => {
      fireEvent.click(screen.getByText("Refresh Metadata"));
    });

    expect(api.unchain.reloadMcpStoreMetadata).toHaveBeenCalledWith({});
    expect(setMcpStoreMetadataCache).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            entryId: "browser.playwright",
          }),
        ],
      }),
    );
  });

  test("store detail approval and revoke refresh entries and update selected detail", async () => {
    const reviewEntry = {
      id: "external.sample",
      toolkitId: "mcp.external.sample",
      toolkitName: "External Sample",
      toolkitDescription: "External review entry",
      category: "dev",
      source: "mcp_registry",
      trustLevel: "external_review",
      status: "needs_review",
      installable: false,
      registryId: "registry.inline.test",
      registryName: "Sample Registry",
      mcp: { transport: "stdio", command: "node", args: ["server.js"] },
      tools: [],
      policySummary: { reviewed: false },
    };
    const approvedEntry = {
      ...reviewEntry,
      trustLevel: "external_approved",
      status: "available",
      installable: true,
      approvalStatus: "approved",
    };
    api.unchain.listMcpStoreEntries
      .mockResolvedValueOnce({ entries: [reviewEntry], count: 1, status: "ok" })
      .mockResolvedValueOnce({ entries: [approvedEntry], count: 1, status: "ok" })
      .mockResolvedValueOnce({ entries: [reviewEntry], count: 1, status: "ok" });
    setMcpStoreEntriesCache({ entries: [reviewEntry], count: 1, status: "ok" });

    await renderToolkitsPage();

    fireEvent.click(screen.getByText("toolkit.store"));
    await act(async () => {
      fireEvent.click(screen.getByText("Open External Entry"));
    });
    expect(screen.getByText("Store Detail Trust: external_review")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Approve From Detail"));
    });

    expect(api.unchain.approveMcpStoreEntry).toHaveBeenCalledWith(
      "external.sample",
      { registryId: "registry.inline.test", acknowledgedRisk: true },
    );
    expect(screen.getByText("Store Detail Trust: external_approved")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Revoke From Detail"));
    });

    expect(api.unchain.revokeMcpStoreEntryApproval).toHaveBeenCalledWith(
      "external.sample",
      { registryId: "registry.inline.test" },
    );
    expect(screen.getByText("Store Detail Trust: external_review")).toBeInTheDocument();
  });
});
