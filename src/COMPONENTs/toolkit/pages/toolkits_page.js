import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import ToolkitStorePage from "./toolkit_store_page";
import ToolkitInstalledPage from "./toolkit_installed_page";
import CustomMcpPage from "./custom_mcp_page";
import ToolkitDetailPanel from "../components/toolkit_detail_panel";
import StoreToolkitDetailPanel from "../components/store_toolkit_detail_panel";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";
import api from "../../../SERVICEs/api";
import {
  getMcpStoreEntry,
  setMcpStoreEntriesCache,
  setMcpStoreMetadataCache,
} from "../../../SERVICEs/mcp_toolkit_store";
import {
  connectMcpOAuthEntry,
  getInstalledMcpIds,
  installMcpEntry,
} from "../../../SERVICEs/mcp_install";
import { readWorkspaceRoot } from "../../settings/runtime";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";

const SLIDE_DURATION = 260;

const TOOLKIT_SUB_PAGES = [
  { key: "store", icon: "search", labelKey: "toolkit.store" },
  { key: "custom", icon: "mcp", labelKey: "toolkit.custom_mcp" },
  { key: "installed", icon: "tool", labelKey: "toolkit.installed" },
];

const ToolkitsPage = ({ isDark }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("installed");

  /* ── Handlers from ToolkitInstalledPage ── */
  const installedHandlersRef = useRef(null);
  const handleHandlersReady = useCallback((handlers) => {
    installedHandlersRef.current = handlers;
  }, []);

  /* ── Detail slide-in state ── */
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

  const handleToolClick = useCallback(
    (toolkitId, toolName, toolkit) => {
      openDetail({ kind: "installed", toolkitId, toolName, toolkit });
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

  /* ── Installed MCP set + install flow ── */
  const [installedMcpIds, setInstalledMcpIds] = useState(() => new Set());
  const [installingId, setInstallingId] = useState(null);
  const [installError, setInstallError] = useState(null);
  const [metadataRevision, setMetadataRevision] = useState(0);
  const [metadataRefreshing, setMetadataRefreshing] = useState(false);
  const [metadataError, setMetadataError] = useState(null);
  const [registryImporting, setRegistryImporting] = useState(false);
  const [registryError, setRegistryError] = useState(null);
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

  const handleImportRegistry = useCallback(
    async (payload) => {
      setRegistryImporting(true);
      setRegistryError(null);
      try {
        await api.unchain.importMcpStoreRegistry(payload);
        await refreshStoreEntries();
      } catch (error) {
        setRegistryError(error?.code || "mcp_registry_import_failed");
        throw error;
      } finally {
        setRegistryImporting(false);
      }
    },
    [refreshStoreEntries],
  );

  const handleValidateRegistry = useCallback(async (payload) => {
    return api.unchain.validateMcpStoreRegistry(payload);
  }, []);

  const handleInstall = useCallback(
    async (entry, setupOptions = {}) => {
      setInstallingId(entry.id);
      setInstallError(null);
      try {
        await installMcpEntry(entry, {
          workspaceRoot: readWorkspaceRoot(),
          ...setupOptions,
        });
        await loadInstalledMcpIds();
        installedHandlersRef.current?.reload?.();
      } catch (e) {
        setInstallError({
          entryId: entry.id,
          code: e?.code || "mcp_install_failed",
        });
      } finally {
        setInstallingId(null);
      }
    },
    [loadInstalledMcpIds],
  );

  const handleOAuthConnect = useCallback(
    async (entry) => {
      setInstallingId(entry.id);
      setInstallError(null);
      try {
        await connectMcpOAuthEntry(entry);
        await loadInstalledMcpIds();
        installedHandlersRef.current?.reload?.();
      } catch (e) {
        setInstallError({
          entryId: entry.id,
          code: e?.code || "mcp_oauth_start_failed",
        });
      } finally {
        setInstallingId(null);
      }
    },
    [loadInstalledMcpIds],
  );

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
        });
      } finally {
        setApprovalBusyId(null);
      }
    },
    [refreshStoreEntries, updateSelectedStoreEntry],
  );

  const panelBg = isDark ? "#141414" : "#ffffff";

  /* ── Tab item ── */
  const TabItem = ({ item }) => {
    const isActive = activeTab === item.key;

    return (
      <Button
        prefix_icon={item.icon}
        label={t(item.labelKey)}
        onClick={() => {
          setActiveTab(item.key);
          if (detailMounted) closeDetail();
        }}
        style={{
          fontSize: 12,
          fontWeight: 500,
          opacity: isActive ? 1 : 0.5,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: 8,
          gap: 5,
          content: {
            icon: { width: 14, height: 14 },
          },
        }}
      />
    );
  };

  /* ── Page content ── */
  const renderPage = () => {
    switch (activeTab) {
      case "store":
        return (
          <ToolkitStorePage
            isDark={isDark}
            onEntryClick={handleStoreEntryClick}
            installedIds={installedMcpIds}
            onInstall={handleInstall}
            onOAuthConnect={handleOAuthConnect}
            installingId={installingId}
            installError={installError}
            metadataRevision={metadataRevision}
            metadataRefreshing={metadataRefreshing}
            metadataError={metadataError}
            onRefreshMetadata={handleRefreshMetadata}
            registryImporting={registryImporting}
            registryError={registryError}
            onImportRegistry={handleImportRegistry}
            onValidateRegistry={handleValidateRegistry}
          />
        );
      case "installed":
        return (
          <ToolkitInstalledPage
            isDark={isDark}
            onToolClick={handleToolClick}
            onHandlersReady={handleHandlersReady}
          />
        );
      case "custom":
        return (
          <CustomMcpPage
            isDark={isDark}
            onInstall={handleInstall}
            installing={installingId === "custom"}
            installError={
              installError?.entryId === "custom" ? installError : null
            }
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Sub-nav bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 16px 8px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
          flexShrink: 0,
        }}
      >
        {TOOLKIT_SUB_PAGES.map((item) => (
          <TabItem key={item.key} item={item} />
        ))}
      </div>

      {/* ── Page content ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div
          className="scrollable"
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            padding: "12px 16px 0",
          }}
        >
          {renderPage()}
        </div>

        {/* ── Detail panel overlay ── */}
        {detailMounted && selectedToolkit && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              backgroundColor: panelBg,
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
              <StoreToolkitDetailPanel
                entry={selectedToolkit.entry}
                isDark={isDark}
                installedIds={installedMcpIds}
                onInstall={handleInstall}
                onOAuthConnect={handleOAuthConnect}
                onApproveEntry={handleApproveStoreEntry}
                onRevokeApproval={handleRevokeStoreEntryApproval}
                installing={installingId === selectedToolkit.entry?.id}
                approvalBusy={approvalBusyId === selectedToolkit.entry?.id}
                installError={
                  installError?.entryId === selectedToolkit.entry?.id
                    ? installError
                    : null
                }
                onBack={closeDetail}
              />
            ) : (
              <ToolkitDetailPanel
                toolkitId={selectedToolkit.toolkitId}
                toolName={selectedToolkit.toolName}
                tools={selectedToolkit.toolkit?.tools}
                isDark={isDark}
                isBuiltin={isBuiltinToolkit(selectedToolkit.toolkit)}
                defaultEnabled={Boolean(
                  selectedToolkit.toolkit?.defaultEnabled,
                )}
                onToggleEnabled={(id, val) => {
                  installedHandlersRef.current?.handleToggleEnabled?.(id, val);
                  setSelectedToolkit((prev) =>
                    prev
                      ? {
                          ...prev,
                          toolkit: {
                            ...prev.toolkit,
                            defaultEnabled: val,
                          },
                        }
                      : prev,
                  );
                }}
                onDelete={(id) => {
                  installedHandlersRef.current?.handleDelete?.(id);
                  closeDetail();
                }}
                onBack={closeDetail}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolkitsPage;
