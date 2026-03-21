import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ToolkitStorePage from "./toolkit_store_page";
import ToolkitInstalledPage from "./toolkit_installed_page";
import ToolkitDetailPanel from "../components/toolkit_detail_panel";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";

const SLIDE_DURATION = 260;

const TOOLKIT_SUB_PAGES = [
  { key: "store", icon: "search", label: "Store" },
  { key: "installed", icon: "tool", label: "Installed" },
];

const ToolkitsPage = ({ isDark }) => {
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

  const openDetail = useCallback((toolkitId, toolName, toolkit) => {
    setSelectedToolkit({ toolkitId, toolName, toolkit });
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
      openDetail(toolkitId, toolName, toolkit);
    },
    [openDetail],
  );

  const panelBg = isDark ? "#141414" : "#ffffff";

  /* ── Tab item ── */
  const TabItem = ({ item }) => {
    const isActive = activeTab === item.key;
    const activeColor = "rgba(10,186,181,1)";
    const inactiveColor = isDark
      ? "rgba(255,255,255,0.38)"
      : "rgba(0,0,0,0.35)";

    return (
      <Button
        prefix_icon={item.icon}
        label={item.label}
        onClick={() => {
          setActiveTab(item.key);
          if (detailVisible) closeDetail();
        }}
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: isActive ? activeColor : inactiveColor,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: 8,
          gap: 5,
          root: {
            background: isActive
              ? isDark
                ? "rgba(10,186,181,0.1)"
                : "rgba(10,186,181,0.06)"
              : "transparent",
          },
          hoverBackgroundColor: isDark
            ? "rgba(10,186,181,0.12)"
            : "rgba(10,186,181,0.08)",
          activeBackgroundColor: isDark
            ? "rgba(10,186,181,0.18)"
            : "rgba(10,186,181,0.12)",
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
        return <ToolkitStorePage isDark={isDark} />;
      case "installed":
        return (
          <ToolkitInstalledPage
            isDark={isDark}
            onToolClick={handleToolClick}
            onHandlersReady={handleHandlersReady}
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ToolkitsPage;
