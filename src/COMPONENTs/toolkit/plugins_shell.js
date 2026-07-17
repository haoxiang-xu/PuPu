import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import PluginsDiscoverPage from "./pages/plugins_discover_page";
import PluginsCategoriesPage from "./pages/plugins_categories_page";
import PluginsInstalledPage from "./pages/plugins_installed_page";
import PluginDetailPage from "./pages/plugin_detail_page";
import CustomMcpPage from "./pages/custom_mcp_page";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { isBuiltinToolkit } from "./utils/toolkit_helpers";
import { deletePluginToolkit } from "./utils/plugin_actions";
import api from "../../SERVICEs/api";
import { toPluginPresentation } from "../../SERVICEs/plugin_presentation";
import {
  getMcpStoreEntry,
  setMcpStoreEntriesCache,
  setMcpStoreMetadataCache,
} from "../../SERVICEs/mcp_toolkit_store";
import {
  connectMcpOAuthEntry,
  ensureWorkspaceForEntry,
  getInstalledMcpIds,
  installMcpEntry,
} from "../../SERVICEs/mcp_install";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
} from "../../SERVICEs/default_toolkit_store";
import { emitToolkitCatalogRefresh } from "../../SERVICEs/toolkit_catalog_refresh";
import { toast } from "../../SERVICEs/toast";

const SLIDE_DURATION = 260;

const installErrorMessage = (error) => {
  const raw = typeof error?.message === "string" ? error.message.trim() : "";
  if (!raw) return "";
  const code = typeof error?.code === "string" ? error.code.trim() : "";
  if (code && raw.startsWith(`${code}:`)) {
    return raw.slice(code.length + 1).trim();
  }
  return raw;
};

/* Nav item icons verified against icon_manifest.js — no literal "sparkle"
   key exists, "shapes" is the nearest existing App-Store-ish glyph for
   Discover; "folder"/"download" match the mockup exactly. */
const NAV_ITEMS = [
  { id: "discover", icon: "shapes", labelKey: "toolkit.nav_discover" },
  { id: "categories", icon: "folder", labelKey: "toolkit.nav_categories" },
  { id: "installed", icon: "download", labelKey: "toolkit.nav_installed" },
];

/**
 * PluginsShell — settings-isomorphic shell (T1): a 140px settings-modal-clone
 * sidebar (uppercase eyebrow title + opacity-selected Button nav items, no
 * search box) and a content slot routed by `activePage`.
 *
 * `activePage` / `onNavigate` are controlled from the outside (toolkit_modal.js
 * owns the page state, mirroring how agents_modal.js owns `selectedSection`).
 *
 * Discover and Categories each own their own data fetch (curation + catalog
 * for Discover, the MCP store registry for Categories) but both funnel
 * install/OAuth actions and detail navigation back through this shell, which
 * inherits the install/OAuth/detail-slide-over state machine from
 * `toolkits_page.js` (which it replaces as the modal's content) unchanged —
 * only the outer chrome and the two page components are new.
 */
export const PluginsShell = ({
  activePage,
  onNavigate,
  installedCount = 0,
  onCloseModal,
}) => {
  const { onThemeMode, theme } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const { t } = useTranslation();

  /* ── Handlers from PluginsInstalledPage ── */
  const installedHandlersRef = useRef(null);
  const handleHandlersReady = useCallback((handlers) => {
    installedHandlersRef.current = handlers;
  }, []);

  /* ── Detail slide-in state (ported from toolkits_page.js:53-77) ── */
  const [selectedToolkit, setSelectedToolkit] = useState(null);
  const [detailMounted, setDetailMounted] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const slideTimer = useRef(null);
  const storeEntriesByIdRef = useRef(new Map());

  const openDetail = useCallback((detail) => {
    setSelectedToolkit(detail);
    setDetailMounted(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setDetailVisible(true)),
    );
  }, []);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
    clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(() => {
      setDetailMounted(false);
      setSelectedToolkit(null);
    }, SLIDE_DURATION);
  }, []);

  useEffect(() => () => clearTimeout(slideTimer.current), []);

  const handleOpenInstalledDetail = useCallback(
    (presentation) => {
      const tk = presentation?.raw;
      if (!tk) return;
      openDetail({ kind: "installed", toolkitId: tk.toolkitId, toolName: null, toolkit: tk });
    },
    [openDetail],
  );

  const handleStoreEntryClick = useCallback(
    (entryId) => {
      const entry =
        getMcpStoreEntry(entryId) || storeEntriesByIdRef.current.get(entryId);
      if (!entry) return;
      openDetail({ kind: "store", entry });
    },
    [openDetail],
  );

  /* Custom MCP entry — demoted from its own store tab (legacy toolkits_page.js
     TOOLKIT_SUB_PAGES "custom" tab) to a low-key footer link on the
     Categories and Installed screens (see those pages' `onOpenCustomMcp`).
     Reuses the same slide-in overlay as the store/installed detail panes;
     CustomMcpPage itself and its install wiring are unchanged. */
  const handleOpenCustomMcp = useCallback(() => {
    openDetail({ kind: "custom" });
  }, [openDetail]);

  /* Discover mixes two plugin sources (MCP-store-installable plugins and
     already-available builtin/local plugins pulled from the catalog), so its
     tiles call onOpenDetail with either a store entry id (string) or an
     installed-shaped presentation (object, `{ ...presentation, raw: toolkit
     }` — same envelope PluginsInstalledPage already uses). Categories is
     store-only and always passes a string id. One prop, two shapes, routed
     to the two existing detail handlers above. */
  const handleUnifiedOpenDetail = useCallback(
    (arg) => {
      if (typeof arg === "string") {
        handleStoreEntryClick(arg);
      } else {
        handleOpenInstalledDetail(arg);
      }
    },
    [handleStoreEntryClick, handleOpenInstalledDetail],
  );

  /* ── Installed MCP set + install flow (ported from toolkits_page.js:97-331) ── */
  const [installedMcpIds, setInstalledMcpIds] = useState(() => new Set());
  const [installingIds, setInstallingIds] = useState(() => new Set());
  const addInstalling = useCallback(
    (id) => setInstallingIds((prev) => new Set(prev).add(id)),
    [],
  );
  const removeInstalling = useCallback(
    (id) =>
      setInstallingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }),
    [],
  );
  const [installError, setInstallError] = useState(null);
  /* Neither PluginsDiscoverPage nor PluginsCategoriesPage take a
     metadataRevision prop (same as the legacy ToolkitStorePage they
     replaced) — they call listMcpStoreEntries() fresh at render time, so
     bumping this state is enough to force the re-render that picks up new
     metadata; the value itself is never read. */
  const [, setMetadataRevision] = useState(0);
  const [metadataRefreshing, setMetadataRefreshing] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  const [approvalBusyId, setApprovalBusyId] = useState(null);

  const applyStoreMetadata = useCallback((payload) => {
    setMcpStoreMetadataCache(payload || {});
    setMetadataRevision((value) => value + 1);
    emitToolkitCatalogRefresh({ source: "mcp_store_metadata" });
  }, []);

  const applyStoreEntries = useCallback((payload) => {
    if (Array.isArray(payload?.entries) && payload.entries.length > 0) {
      storeEntriesByIdRef.current = new Map(
        payload.entries
          .filter((entry) => entry && entry.id)
          .map((entry) => [entry.id, entry]),
      );
      setMcpStoreEntriesCache(payload);
      setMetadataRevision((value) => value + 1);
      emitToolkitCatalogRefresh({ source: "mcp_store_entries" });
    }
  }, []);

  const loadInstalledMcpIds = useCallback(async () => {
    try {
      setInstalledMcpIds(await getInstalledMcpIds());
    } catch {
      /* ignore — keep previous set */
    }
  }, []);

  useEffect(() => {
    loadInstalledMcpIds();
  }, [loadInstalledMcpIds]);

  /* ── Delete / auto-enable — shell-owned direct service calls (review C1).
     These used to delegate to installedHandlersRef, which is only populated
     once PluginsInstalledPage has mounted — so a delete/toggle fired from a
     Categories- or Discover-opened detail (Discover/Categories are the
     modal's default page, not Installed) silently did nothing. Both now
     call the same services plugins_installed_page.js uses directly; the ref
     is kept only to ask that page's own list to `reload` when it happens to
     be mounted, for immediate consistency. */
  const [, setAutoEnableRevision] = useState(0);

  const handleToggleAutoEnable = useCallback((toolkitId, val) => {
    setDefaultToolkitEnabled("global", toolkitId, val);
    setAutoEnableRevision((v) => v + 1);
    setSelectedToolkit((prev) =>
      prev?.kind === "installed" && prev.toolkit?.toolkitId === toolkitId
        ? { ...prev, toolkit: { ...prev.toolkit, defaultEnabled: val } }
        : prev,
    );
    installedHandlersRef.current?.reload?.();
  }, []);

  const handleDeletePlugin = useCallback(
    async (toolkitId) => {
      const result = await deletePluginToolkit(toolkitId);
      if (!result.ok) return;
      await loadInstalledMcpIds();
      installedHandlersRef.current?.reload?.();
    },
    [loadInstalledMcpIds],
  );

  useEffect(() => {
    let cancelled = false;
    api.unchain
      .listMcpStoreEntries()
      .then((payload) => {
        if (!cancelled) applyStoreEntries(payload);
      })
      .catch(() => {
        /* ignore — static registry remains usable */
      });
    api.unchain
      .listMcpStoreMetadata()
      .then((payload) => {
        if (!cancelled) applyStoreMetadata(payload);
      })
      .catch(() => {
        /* ignore — static registry remains usable */
      });
    return () => {
      cancelled = true;
    };
  }, [applyStoreEntries, applyStoreMetadata]);

  const refreshStoreEntries = useCallback(async () => {
    const payload = await api.unchain.listMcpStoreEntries();
    applyStoreEntries(payload);
    return payload;
  }, [applyStoreEntries]);

  const updateSelectedStoreEntry = useCallback((entryId, payload, fallbackEntry = null) => {
    const updatedFromPayload = Array.isArray(payload?.entries)
      ? payload.entries.find((entry) => entry?.id === entryId)
      : null;
    const updated =
      updatedFromPayload ||
      getMcpStoreEntry(entryId) ||
      storeEntriesByIdRef.current.get(entryId) ||
      fallbackEntry;
    if (!updated) return;
    setSelectedToolkit((prev) =>
      prev?.kind === "store" && prev.entry?.id === entryId
        ? { ...prev, entry: updated }
        : prev,
    );
  }, []);

  const handleRefreshMetadata = useCallback(async () => {
    setMetadataRefreshing(true);
    setMetadataError(null);
    try {
      const payload = await api.unchain.reloadMcpStoreMetadata({});
      applyStoreMetadata(payload);
      installedHandlersRef.current?.reload?.();
    } catch (error) {
      setMetadataError(error?.code || "mcp_store_metadata_reload_failed");
    } finally {
      setMetadataRefreshing(false);
    }
  }, [applyStoreMetadata]);

  const handleInstall = useCallback(
    async (entry, setupOptions = {}) => {
      addInstalling(entry.id);
      setInstallError(null);
      try {
        const workspace = await ensureWorkspaceForEntry(entry);
        if (!workspace.ok) return; // user dismissed the picker — not an error
        await installMcpEntry(entry, {
          workspaceRoot: workspace.workspaceRoot,
          ...setupOptions,
        });
        await loadInstalledMcpIds();
        installedHandlersRef.current?.reload?.();
        toast.success(
          t("toolkit.store_install_success", {
            name: entry.toolkitName || entry.id,
          }),
        );
      } catch (e) {
        setInstallError({
          entryId: entry.id,
          code: e?.code || "mcp_install_failed",
          message: installErrorMessage(e),
        });
      } finally {
        removeInstalling(entry.id);
      }
    },
    [loadInstalledMcpIds, addInstalling, removeInstalling, t],
  );

  const oauthControllersRef = useRef(new Map());

  const handleOAuthConnect = useCallback(
    async (entry) => {
      const controller = new AbortController();
      oauthControllersRef.current.set(entry.id, controller);
      addInstalling(entry.id);
      setInstallError(null);
      try {
        await connectMcpOAuthEntry(entry, { signal: controller.signal });
        await loadInstalledMcpIds();
        installedHandlersRef.current?.reload?.();
        toast.success(
          t("toolkit.store_connect_success", {
            name: entry.toolkitName || entry.id,
          }),
        );
      } catch (e) {
        if (e?.code !== "mcp_oauth_cancelled") {
          setInstallError({
            entryId: entry.id,
            code: e?.code || "mcp_oauth_start_failed",
            message: installErrorMessage(e),
          });
        }
      } finally {
        oauthControllersRef.current.delete(entry.id);
        removeInstalling(entry.id);
      }
    },
    [loadInstalledMcpIds, addInstalling, removeInstalling, t],
  );

  const handleCancelOAuth = useCallback((entry) => {
    oauthControllersRef.current.get(entry.id)?.abort();
  }, []);

  useEffect(
    () => () => {
      for (const c of oauthControllersRef.current.values()) c.abort();
    },
    [],
  );

  /* External-registry approve/revoke — restored (T4b) after Task 3 dropped
     it as dead code when it swapped StoreToolkitDetailPanel for
     PluginDetailPage. Same api.unchain calls as
     store_toolkit_detail_panel.js / toolkits_page.js. */
  const handleApproveStoreEntry = useCallback(
    async (entry, options = {}) => {
      if (!entry?.id) return;
      setApprovalBusyId(entry.id);
      setInstallError(null);
      try {
        const result = await api.unchain.approveMcpStoreEntry(entry.id, {
          registryId: entry.registryId,
          ...(options?.acknowledgedRisk ? { acknowledgedRisk: true } : {}),
        });
        const payload = await refreshStoreEntries();
        updateSelectedStoreEntry(entry.id, payload, result?.entry || null);
      } catch (error) {
        setInstallError({
          entryId: entry.id,
          code: error?.code || "mcp_registry_entry_not_approved",
          message: installErrorMessage(error),
        });
      } finally {
        setApprovalBusyId(null);
      }
    },
    [refreshStoreEntries, updateSelectedStoreEntry],
  );

  const handleRevokeStoreEntryApproval = useCallback(
    async (entry) => {
      if (!entry?.id) return;
      setApprovalBusyId(entry.id);
      setInstallError(null);
      try {
        await api.unchain.revokeMcpStoreEntryApproval(entry.id, {
          registryId: entry.registryId,
        });
        const payload = await refreshStoreEntries();
        updateSelectedStoreEntry(entry.id, payload);
      } catch (error) {
        setInstallError({
          entryId: entry.id,
          code: error?.code || "mcp_registry_approval_not_found",
          message: installErrorMessage(error),
        });
      } finally {
        setApprovalBusyId(null);
      }
    },
    [refreshStoreEntries, updateSelectedStoreEntry],
  );

  const handleNavigate = useCallback(
    (id) => {
      if (id === activePage) return;
      onNavigate?.(id);
      setInstallError(null);
      if (detailMounted) closeDetail();
    },
    [activePage, onNavigate, detailMounted, closeDetail],
  );

  /* ── Categories search (T1: settings-isomorphic restyle) — the sidebar no
     longer carries a search box (the mockup's 140px settings-clone left rail
     has none); PluginsCategoriesPage keeps this as its own in-page search,
     still shell-owned state so it survives detail overlay open/close, just
     with no sidebar UI writing into it anymore. */
  const [sidebarSearch, setSidebarSearch] = useState("");

  /* ── Page content — Discover, Categories and Installed are each dedicated
     App-Store surfaces (Task 4 split Discover/Categories off the legacy
     store page). ── */
  const renderPage = () => {
    if (activePage === "installed") {
      return (
        <PluginsInstalledPage
          isDark={isDark}
          onOpenDetail={handleOpenInstalledDetail}
          onHandlersReady={handleHandlersReady}
          onOpenCustomMcp={handleOpenCustomMcp}
        />
      );
    }
    if (activePage === "categories") {
      return (
        <PluginsCategoriesPage
          isDark={isDark}
          onOpenDetail={handleUnifiedOpenDetail}
          installedIds={installedMcpIds}
          onInstall={handleInstall}
          onOAuthConnect={handleOAuthConnect}
          onCancelOAuth={handleCancelOAuth}
          installingIds={installingIds}
          installError={installError}
          metadataRefreshing={metadataRefreshing}
          metadataError={metadataError}
          onRefreshMetadata={handleRefreshMetadata}
          onOpenCustomMcp={handleOpenCustomMcp}
          search={sidebarSearch}
          onSearchChange={setSidebarSearch}
        />
      );
    }
    return (
      <PluginsDiscoverPage
        isDark={isDark}
        onOpenDetail={handleUnifiedOpenDetail}
        installedIds={installedMcpIds}
        onInstall={handleInstall}
        onOAuthConnect={handleOAuthConnect}
        onCancelOAuth={handleCancelOAuth}
        installingIds={installingIds}
        installError={installError}
      />
    );
  };

  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  return (
    <div style={{ display: "flex", height: "100%", fontSize: 13, fontFamily }}>
      {/* ── Sidebar — settings-modal clone (T1): 140px, bg .03/.04, hairline
         right border, uppercase eyebrow title, Button nav items whose
         selected state is opacity-only (1 vs 0.65), exactly like
         settings_modal_content.js:93-140. No sidebar search box (removed —
         Categories/Installed keep their own in-page search). */}
      <div
        style={{
          width: 140,
          flexShrink: 0,
          backgroundColor: isDark
            ? "rgba(var(--pupu-text-rgb),0.03)"
            : "rgba(var(--pupu-text-rgb),0.04)",
          borderRight: `1px solid rgba(var(--pupu-text-rgb),0.06)`,
          padding: "16px 10px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "1.5px",
            color: "var(--pupu-text)",
            opacity: 0.3,
            padding: "8px 12px 12px",
          }}
        >
          {t("toolkit.nav_title")}
        </div>

        {NAV_ITEMS.map((item) => {
          const isActive = activePage === item.id;
          const isInstalled = item.id === "installed";
          return (
            <Button
              key={item.id}
              prefix_icon={item.icon}
              label={t(item.labelKey)}
              postfix={isInstalled ? String(installedCount) : undefined}
              onClick={() => handleNavigate(item.id)}
              style={{
                width: "100%",
                justifyContent: "flex-start",
                fontSize: 13,
                opacity: isActive ? 1 : 0.65,
                padding: "8px 12px",
                borderRadius: 7,
                iconSize: 16,
                ...(isInstalled
                  ? {
                      content: {
                        postfixText: {
                          marginLeft: "auto",
                          fontSize: 10.5,
                          fontWeight: 600,
                          background: isDark
                            ? "rgba(var(--pupu-text-rgb),0.1)"
                            : "rgba(var(--pupu-text-rgb),0.08)",
                          borderRadius: 999,
                          padding: "1px 7px",
                        },
                      },
                    }
                  : {}),
              }}
            />
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* T3: the three list pages (Installed/Discover/Categories) now own
           a fixed-header + scrollable-body split internally (mirrors
           plugin_detail_page.js's own layout) so a page's title/search/pills
           can stay pinned while its list scrolls — see mockup screen ③. This
           wrapper used to own the scroll + padding for all of them; it now
           just bounds the height and lets each page manage its own. */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {renderPage()}
        </div>

        {/* ── Detail panel overlay (ported from toolkits_page.js:441-511) ── */}
        {detailMounted && selectedToolkit && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              backgroundColor: "var(--pupu-background)",
              zIndex: 3,
              transform: detailVisible ? "translateX(0)" : "translateX(100%)",
              transition: `transform ${SLIDE_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
              padding: "16px 0 0 24px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {selectedToolkit.kind === "store" ? (
              (() => {
                const entry = selectedToolkit.entry;
                /* Store registry entries carry a singular `category` string,
                   not the `tags` array toPluginPresentation expects (that
                   shape belongs to catalog v2 toolkit entries) — adapt
                   locally rather than reaching into plugin_presentation.js,
                   which Task 1 already froze. */
                const presentationEntry = {
                  ...entry,
                  tags: Array.isArray(entry?.tags)
                    ? entry.tags
                    : entry?.category
                      ? [entry.category]
                      : [],
                };
                const storeInstalled = installedMcpIds.has(entry?.toolkitId);
                /* I6: an installed store entry's auto-enable state lives in
                   the same default-toolkit selection PluginsInstalledPage
                   reads — derive it directly rather than assuming a
                   `defaultEnabled` field on the store entry itself (store
                   registry entries never carry one). */
                const storeDefaultEnabled =
                  storeInstalled &&
                  getDefaultToolkitSelection("global").includes(entry?.toolkitId);
                return (
                  <PluginDetailPage
                    presentation={toPluginPresentation(presentationEntry)}
                    entry={entry}
                    isDark={isDark}
                    isBuiltin={!storeInstalled}
                    installedIds={installedMcpIds}
                    installing={installingIds.has(entry?.id)}
                    installError={installError?.entryId === entry?.id ? installError : null}
                    onInstall={handleInstall}
                    onOAuthConnect={handleOAuthConnect}
                    onCancelOAuth={handleCancelOAuth}
                    onApproveEntry={handleApproveStoreEntry}
                    onRevokeApproval={handleRevokeStoreEntryApproval}
                    approvalBusy={approvalBusyId === entry?.id}
                    defaultEnabled={storeDefaultEnabled}
                    onToggleAutoEnable={handleToggleAutoEnable}
                    onDelete={(id) => {
                      if (!storeInstalled) return;
                      handleDeletePlugin(id);
                      closeDetail();
                    }}
                    onBack={closeDetail}
                    onCloseModal={onCloseModal}
                  />
                );
              })()
            ) : selectedToolkit.kind === "custom" ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", paddingRight: 24 }}>
                <div style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  <Button
                    prefix_icon="arrow_left"
                    onClick={closeDetail}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: isDark ? "rgba(var(--pupu-text-rgb),0.72)" : "rgba(var(--pupu-text-rgb),0.68)",
                      paddingVertical: 5,
                      paddingHorizontal: 5,
                      borderRadius: 8,
                      root: { background: isDark ? "rgba(var(--pupu-text-rgb),0.05)" : "rgba(var(--pupu-text-rgb),0.04)" },
                      hoverBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.07)",
                      activeBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.12)" : "rgba(var(--pupu-text-rgb),0.1)",
                      content: {
                        prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
                        icon: { width: 14, height: 14 },
                      },
                    }}
                  />
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "var(--pupu-text)",
                    }}
                  >
                    {t("toolkit.custom_mcp")}
                  </span>
                </div>
                <div className="scrollable" style={{ flex: 1, overflowY: "auto", paddingBottom: 20 }}>
                  <CustomMcpPage
                    isDark={isDark}
                    onInstall={handleInstall}
                    installing={installingIds.has("custom")}
                    installError={installError?.entryId === "custom" ? installError : null}
                  />
                </div>
              </div>
            ) : (
              <PluginDetailPage
                presentation={toPluginPresentation(selectedToolkit.toolkit || {})}
                entry={selectedToolkit.toolkit}
                isDark={isDark}
                isBuiltin={isBuiltinToolkit(selectedToolkit.toolkit)}
                forceInstalled
                installError={
                  installError?.entryId === selectedToolkit.toolkit?.toolkitId
                    ? installError
                    : null
                }
                defaultEnabled={Boolean(selectedToolkit.toolkit?.defaultEnabled)}
                onToggleAutoEnable={handleToggleAutoEnable}
                onDelete={(id) => {
                  handleDeletePlugin(id);
                  closeDetail();
                }}
                onBack={closeDetail}
                onCloseModal={onCloseModal}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginsShell;
