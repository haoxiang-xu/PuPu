import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import ToolkitStorePage from "./toolkit_store_page";
import ToolkitInstalledPage from "./toolkit_installed_page";
import CustomMcpPage from "./custom_mcp_page";
import ToolkitDetailPanel from "../components/toolkit_detail_panel";
import StoreToolkitDetailPanel from "../components/store_toolkit_detail_panel";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";
import { getMcpStoreEntry } from "../../../SERVICEs/mcp_toolkit_store";
import {
  connectMcpOAuthEntry,
  getInstalledMcpIds,
  installMcpEntry,
} from "../../../SERVICEs/mcp_install";
import { readWorkspaceRoot } from "../../settings/runtime";

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
      const entry = getMcpStoreEntry(entryId);
      if (!entry) return;
      openDetail({ kind: "store", entry });
    },
    [openDetail],
  );

  /* ── Installed MCP set + install flow ── */
  const [installedMcpIds, setInstalledMcpIds] = useState(() => new Set());
  const [installingId, setInstallingId] = useState(null);
  const [installError, setInstallError] = useState(null);

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
                installing={installingId === selectedToolkit.entry?.id}
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
