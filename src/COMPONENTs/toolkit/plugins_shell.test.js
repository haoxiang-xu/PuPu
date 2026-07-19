import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PluginsShell } from "./plugins_shell";
import api from "../../SERVICEs/api";
import {
  ensureWorkspaceForEntry,
  getInstalledMcpIds,
  deleteMcpEntry,
} from "../../SERVICEs/mcp_install";
import { getMcpStoreEntry } from "../../SERVICEs/mcp_toolkit_store";
import { getPluginSettingsEntry } from "./plugin_settings_registry";

jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("./pages/plugins_discover_page", () => ({
  __esModule: true,
  default: () => <div>Discover Page</div>,
}));

jest.mock("./pages/plugins_categories_page", () => ({
  __esModule: true,
  default: ({ onOpenDetail, onOpenCustomMcp }) => (
    <div>
      <span>Categories Page</span>
      <button onClick={() => onOpenDetail?.("external.sample")}>
        Open External Entry
      </button>
      <button onClick={() => onOpenDetail?.("installed-ready.sample")}>
        Open Installed-Ready Entry
      </button>
      <button onClick={() => onOpenCustomMcp?.()}>Add a custom plugin</button>
    </div>
  ),
}));

jest.mock("./pages/plugins_installed_page", () => ({
  __esModule: true,
  default: ({ onOpenPluginSettings }) => (
    <div>
      <span>Installed Page</span>
      <button onClick={() => onOpenPluginSettings?.("builtin.computer")}>
        Open Computer Settings
      </button>
    </div>
  ),
}));

/* Stub the plugin-settings registry so the overlay-branch test mounts a tiny
   stand-in instead of the real ComputerUseSettings (its cross-domain mount is
   covered separately in plugin_settings_registry.real.test.js). */
jest.mock("./plugin_settings_registry", () => ({
  __esModule: true,
  getPluginSettingsEntry: jest.fn((id) =>
    id === "builtin.computer"
      ? {
          Component: ({ toolkitId }) => (
            <div>Computer Settings Panel: {toolkitId}</div>
          ),
          labelKey: "toolkit.builtin_computer_name",
          icon: "mouse",
        }
      : null,
  ),
}));

jest.mock("./pages/plugin_detail_page", () => ({
  __esModule: true,
  default: ({
    presentation,
    entry,
    onApproveEntry,
    onRevokeApproval,
    approvalBusy,
    onDelete,
    onToggleAutoEnable,
    defaultEnabled,
    installError,
  }) => (
    <div>
      <div>Plugin Detail Page: {presentation?.name}</div>
      <span>Store Detail Trust: {entry?.trustLevel}</span>
      {approvalBusy && <span>approval-busy</span>}
      <span>Auto Enabled: {String(Boolean(defaultEnabled))}</span>
      <span>Install Error: {installError?.message || "none"}</span>
      <button
        onClick={() => onApproveEntry?.(entry, { acknowledgedRisk: true })}
      >
        Approve From Detail
      </button>
      <button onClick={() => onRevokeApproval?.(entry)}>Revoke From Detail</button>
      <button onClick={() => onDelete?.(entry?.toolkitId)}>Delete From Detail</button>
      <button onClick={() => onToggleAutoEnable?.(entry?.toolkitId, true)}>
        Enable Auto Enable From Detail
      </button>
    </div>
  ),
}));

jest.mock("./pages/custom_mcp_page", () => ({
  __esModule: true,
  default: ({ onInstall, installing }) => (
    <div>
      <span>Custom MCP Page{installing ? " (installing)" : ""}</span>
      <button
        onClick={() =>
          onInstall?.({ id: "custom", toolkitId: "mcp.custom.sample", toolkitName: "Sample" })
        }
      >
        Install Custom
      </button>
    </div>
  ),
}));

jest.mock("../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  ensureWorkspaceForEntry: jest.fn(() => Promise.resolve({ ok: true, workspaceRoot: "" })),
  getInstalledMcpIds: jest.fn(() => Promise.resolve(new Set())),
  installMcpEntry: jest.fn(() => Promise.resolve({ ok: true })),
  connectMcpOAuthEntry: jest.fn(() => Promise.resolve({ ok: true })),
  deleteMcpEntry: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listMcpStoreMetadata: jest.fn(() => Promise.resolve({ entries: [], byEntryId: {}, status: "ok" })),
      listMcpStoreEntries: jest.fn(() => Promise.resolve({ entries: [], count: 0, status: "ok" })),
      reloadMcpStoreMetadata: jest.fn(() => Promise.resolve({ entries: [], byEntryId: {}, status: "ok" })),
      approveMcpStoreEntry: jest.fn(() =>
        Promise.resolve({ entry: { id: "external.sample", approvalStatus: "approved" } }),
      ),
      revokeMcpStoreEntryApproval: jest.fn(() =>
        Promise.resolve({ ok: true, entryId: "external.sample" }),
      ),
      listToolModalCatalog: jest.fn(() => Promise.resolve({ toolkits: [] })),
    },
  },
}));

const REVIEW_ENTRY = {
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

/* An already-installed, MCP-sourced store entry — used by the C1 regression
   test (delete from a Categories-opened detail without ever visiting
   Installed) and the I6 auto-enable regression test. */
const INSTALLED_READY_ENTRY = {
  id: "installed-ready.sample",
  toolkitId: "mcp.installed.ready",
  toolkitName: "Installed Ready",
  toolkitDescription: "Already-installed MCP entry.",
  category: "dev",
  source: "mcp",
  status: "available",
  installable: true,
  mcp: { transport: "stdio", command: "node", args: ["server.js"] },
  tools: [],
};

jest.mock("../../SERVICEs/mcp_toolkit_store", () => {
  const actual = jest.requireActual("../../SERVICEs/mcp_toolkit_store");
  return {
    __esModule: true,
    ...actual,
    getMcpStoreEntry: jest.fn((id) => {
      if (id === "external.sample") {
        return {
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
      }
      if (id === "installed-ready.sample") return INSTALLED_READY_ENTRY;
      return null;
    }),
    setMcpStoreEntriesCache: jest.fn(),
    setMcpStoreMetadataCache: jest.fn(),
  };
});

jest.mock("../../SERVICEs/toast", () => ({
  __esModule: true,
  toast: { success: jest.fn() },
}));

describe("PluginsShell", () => {
  /* react-scripts sets `resetMocks: true` by default — every jest.fn()'s
     implementation (including the one supplied in the jest.mock factory
     above) is wiped before EACH test. Re-establish the promise-returning
     implementations here, same pattern as toolkits_page.test.js. */
  beforeEach(() => {
    window.localStorage.clear();
    api.unchain.listMcpStoreMetadata.mockResolvedValue({ entries: [], byEntryId: {}, status: "ok" });
    api.unchain.listMcpStoreEntries.mockResolvedValue({ entries: [], count: 0, status: "ok" });
    api.unchain.reloadMcpStoreMetadata.mockResolvedValue({ entries: [], byEntryId: {}, status: "ok" });
    api.unchain.approveMcpStoreEntry.mockResolvedValue({
      entry: { id: "external.sample", approvalStatus: "approved" },
    });
    api.unchain.revokeMcpStoreEntryApproval.mockResolvedValue({
      ok: true,
      entryId: "external.sample",
    });
    ensureWorkspaceForEntry.mockResolvedValue({ ok: true, workspaceRoot: "" });
    getInstalledMcpIds.mockResolvedValue(new Set());
    deleteMcpEntry.mockResolvedValue({ ok: true });
    api.unchain.listToolModalCatalog.mockResolvedValue({ toolkits: [] });
    getMcpStoreEntry.mockImplementation((id) => {
      if (id === "external.sample") return REVIEW_ENTRY;
      if (id === "installed-ready.sample") return INSTALLED_READY_ENTRY;
      return null;
    });
    /* resetMocks wipes the jest.mock factory impl each test — re-establish the
       registry stub (Computer settings panel stand-in). */
    getPluginSettingsEntry.mockImplementation((id) =>
      id === "builtin.computer"
        ? {
            Component: ({ toolkitId }) => (
              <div>Computer Settings Panel: {toolkitId}</div>
            ),
            labelKey: "toolkit.builtin_computer_name",
            icon: "mouse",
          }
        : null,
    );
  });

  const renderShell = async (props = {}) => {
    let rendered;
    await act(async () => {
      rendered = render(
        <PluginsShell
          activePage="discover"
          onNavigate={() => {}}
          installedCount={6}
          {...props}
        />,
      );
    });
    return rendered;
  };

  /* store-final (2026-07-17): the five-item sidebar (Discover + three
     separate type-category tabs + Installed) collapsed to three — Discover /
     Store / Installed — once Store grew its own in-page segmented control
     (see plugins_categories_page.test.js for All/Toolkits/MCP/Skills
     segment coverage). */
  test("renders the settings-clone sidebar title and the three nav items as Buttons", async () => {
    await renderShell();

    expect(screen.getByText("toolkit.nav_title")).toBeInTheDocument();
    expect(screen.getByText("toolkit.nav_discover").closest("button")).not.toBeNull();
    expect(screen.getByText("toolkit.nav_store").closest("button")).not.toBeNull();
    expect(screen.getByText("toolkit.nav_installed").closest("button")).not.toBeNull();
  });

  test("renders the installedCount badge next to Installed", async () => {
    await renderShell({ installedCount: 6 });

    expect(screen.getByText("6")).toBeInTheDocument();
  });

  test("onNavigate fires with the clicked nav item id", async () => {
    const onNavigate = jest.fn();
    await renderShell({ onNavigate });

    fireEvent.click(screen.getByText("toolkit.nav_installed"));

    expect(onNavigate).toHaveBeenCalledWith("installed");
  });

  test("active nav item gets full opacity, idle items are dimmed (settings-clone selection language)", async () => {
    await renderShell({ activePage: "installed" });

    const activeItem = screen.getByText("toolkit.nav_installed").closest("button");
    const idleItem = screen.getByText("toolkit.nav_discover").closest("button");

    expect(activeItem.style.opacity).toBe("1");
    expect(idleItem.style.opacity).toBe("0.65");
  });

  test("routes content by activePage — discover, store and installed each get their own page", async () => {
    const { rerender } = await renderShell({ activePage: "discover" });
    expect(screen.getByText("Discover Page")).toBeInTheDocument();

    await act(async () => {
      rerender(
        <PluginsShell activePage="store" onNavigate={() => {}} installedCount={6} />,
      );
    });
    expect(screen.getByText("Categories Page")).toBeInTheDocument();

    await act(async () => {
      rerender(
        <PluginsShell activePage="installed" onNavigate={() => {}} installedCount={6} />,
      );
    });
    expect(screen.getByText("Installed Page")).toBeInTheDocument();
  });

  /* Restoration (T4b): Task 3 dropped handleApproveStoreEntry /
     handleRevokeStoreEntryApproval as dead code when it swapped
     StoreToolkitDetailPanel for PluginDetailPage. This verifies the shell
     still fires the exact same api.unchain calls the old panel/toolkits_page
     wiring did, and refreshes the selected store entry afterwards. */
  test("store detail approval and revoke call the same api as the old panel and refresh the selected entry", async () => {
    api.unchain.listMcpStoreEntries
      .mockResolvedValueOnce({ entries: [REVIEW_ENTRY], count: 1, status: "ok" })
      .mockResolvedValueOnce({
        entries: [{ ...REVIEW_ENTRY, trustLevel: "external_approved" }],
        count: 1,
        status: "ok",
      })
      .mockResolvedValueOnce({ entries: [REVIEW_ENTRY], count: 1, status: "ok" });

    await renderShell({ activePage: "store" });

    await act(async () => {
      fireEvent.click(screen.getByText("Open External Entry"));
    });
    expect(screen.getByText("Store Detail Trust: external_review")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Approve From Detail"));
    });

    expect(api.unchain.approveMcpStoreEntry).toHaveBeenCalledWith("external.sample", {
      registryId: "registry.inline.test",
      acknowledgedRisk: true,
    });
    await waitFor(() =>
      expect(
        screen.getByText("Store Detail Trust: external_approved"),
      ).toBeInTheDocument(),
    );

    await act(async () => {
      fireEvent.click(screen.getByText("Revoke From Detail"));
    });

    expect(api.unchain.revokeMcpStoreEntryApproval).toHaveBeenCalledWith(
      "external.sample",
      { registryId: "registry.inline.test" },
    );
    await waitFor(() =>
      expect(
        screen.getByText("Store Detail Trust: external_review"),
      ).toBeInTheDocument(),
    );
  });

  /* T5: the legacy "Custom MCP" store tab is retired — the Categories/
     Installed pages' footer link opens CustomMcpPage through the same
     slide-in overlay the store/installed detail panes already use, and its
     onInstall routes through the exact same handleInstall the store detail
     page uses (same ensureWorkspaceForEntry → installMcpEntry → reload
     chain — install logic is unchanged, only the entry point moved). */
  test("the footer's 'Add a custom plugin' entry opens CustomMcpPage, and installing routes through the shared install flow", async () => {
    await renderShell({ activePage: "store" });

    await act(async () => {
      fireEvent.click(screen.getByText("Add a custom plugin"));
    });
    expect(screen.getByText("Custom MCP Page")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Install Custom"));
    });

    expect(ensureWorkspaceForEntry).toHaveBeenCalled();
    const { installMcpEntry } = require("../../SERVICEs/mcp_install");
    expect(installMcpEntry).toHaveBeenCalledWith(
      expect.objectContaining({ toolkitId: "mcp.custom.sample" }),
      expect.any(Object),
    );
  });

  /* C1 regression (review-mandated): the detail overlay's onDelete used to
     delegate to installedHandlersRef, which is only populated once
     PluginsInstalledPage has mounted. The modal defaults to Discover, and
     this test opens the detail from Categories instead — Installed is never
     rendered — so this only passes if delete is a shell-owned direct
     service call. */
  test("delete from a Categories-opened detail works without ever visiting Installed", async () => {
    getInstalledMcpIds.mockResolvedValue(new Set(["mcp.installed.ready"]));
    api.unchain.listToolModalCatalog.mockResolvedValue({
      toolkits: [
        { toolkitId: "mcp.installed.ready", source: "mcp", hidden: false },
      ],
    });

    await renderShell({ activePage: "store" });

    await act(async () => {
      fireEvent.click(screen.getByText("Open Installed-Ready Entry"));
    });
    expect(screen.getByText("Plugin Detail Page: Installed Ready")).toBeInTheDocument();
    expect(screen.queryByText("Installed Page")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Delete From Detail"));
    });

    await waitFor(() =>
      expect(deleteMcpEntry).toHaveBeenCalledWith("mcp.installed.ready"),
    );
    /* Never visited Installed for the whole test — proves the delete path
       didn't need it. */
    expect(screen.queryByText("Installed Page")).not.toBeInTheDocument();
  });

  /* I6: a store-kind detail's auto-enable row now reads/writes the same
     default-toolkit selection PluginsInstalledPage uses, wired through the
     shell (not the ref) — this exercises it end to end without Installed
     ever mounting either. */
  test("toggling auto-enable on a store-kind detail persists through the shell's own handler", async () => {
    getInstalledMcpIds.mockResolvedValue(new Set(["mcp.installed.ready"]));

    await renderShell({ activePage: "store" });

    await act(async () => {
      fireEvent.click(screen.getByText("Open Installed-Ready Entry"));
    });
    expect(screen.getByText("Auto Enabled: false")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Enable Auto Enable From Detail"));
    });

    expect(screen.getByText("Auto Enabled: true")).toBeInTheDocument();
  });

  /* S1: the Installed page's synthetic Computer row opens the builtin
     plugin-settings overlay through the shell (kind: "plugin_settings"),
     resolving its component from plugin_settings_registry by toolkitId. The
     overlay container mirrors the custom / import_skills branches (back header
     + scrollable body). */
  test("opening plugin settings from Installed mounts the registered settings component", async () => {
    await renderShell({ activePage: "installed" });

    await act(async () => {
      fireEvent.click(screen.getByText("Open Computer Settings"));
    });

    expect(
      screen.getByText("Computer Settings Panel: builtin.computer"),
    ).toBeInTheDocument();
    // header label comes from the registry entry's labelKey
    expect(screen.getByText("toolkit.builtin_computer_name")).toBeInTheDocument();
  });

  test("plugin-settings overlay back button returns to the Installed page", async () => {
    await renderShell({ activePage: "installed" });

    await act(async () => {
      fireEvent.click(screen.getByText("Open Computer Settings"));
    });
    expect(
      screen.getByText("Computer Settings Panel: builtin.computer"),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByTestId("icon-arrow_left").closest("button"),
      );
    });

    await waitFor(() =>
      expect(
        screen.queryByText("Computer Settings Panel: builtin.computer"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Installed Page")).toBeInTheDocument();
  });

  /* T1 (settings-isomorphic restyle): the App-Store-era per-item indigo
     active color (I5) is gone — selection is opacity-only now, exactly like
     settings_modal_content.js's Button nav items, so there's no separate
     active-vs-idle color to diverge between light/dark. */
  test("nav items don't set a per-item active color — selection is opacity-only", async () => {
    await renderShell({ activePage: "installed" });

    const activeItem = screen.getByText("toolkit.nav_installed").closest("button");
    const idleItem = screen.getByText("toolkit.nav_discover").closest("button");
    expect(activeItem.style.color).toBe(idleItem.style.color);
  });
});
