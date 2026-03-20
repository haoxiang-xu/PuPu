import { useCallback, useEffect, useRef, useState } from "react";
import { MCP_SUB_PAGES } from "./constants";
import CatalogPage from "./pages/catalog_page";
import InstalledPage from "./pages/installed_page";
import ClaudeImportPage from "./pages/claude_import_page";
import GitHubImportPage from "./pages/github_import_page";
import ManualPage from "./pages/manual_page";
import InstallDrawer from "./components/install_drawer";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const SLIDE_DURATION = 260;

const McpPage = ({ isDark }) => {
  const [activeTab, setActiveTab] = useState("catalog");
  const [drawerEntry, setDrawerEntry] = useState(null);

  /* ── Slide-in state for install drawer ── */
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const slideTimer = useRef(null);

  const openDrawer = useCallback((catalogEntry) => {
    setDrawerEntry(catalogEntry);
    setDrawerMounted(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setDrawerVisible(true)),
    );
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    clearTimeout(slideTimer.current);
    slideTimer.current = setTimeout(() => {
      setDrawerMounted(false);
      setDrawerEntry(null);
    }, SLIDE_DURATION);
  }, []);

  useEffect(() => () => clearTimeout(slideTimer.current), []);

  /* ── Tab item ── */
  const TabItem = ({ item }) => {
    const isActive = activeTab === item.key;
    const activeColor = "#5b9cf4";
    const inactiveColor = isDark
      ? "rgba(255,255,255,0.38)"
      : "rgba(0,0,0,0.35)";

    return (
      <button
        onClick={() => setActiveTab(item.key)}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 10px",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "Jost",
          fontWeight: isActive ? 500 : 400,
          color: isActive ? activeColor : inactiveColor,
          background: isActive
            ? isDark
              ? "rgba(91,156,244,0.1)"
              : "rgba(91,156,244,0.06)"
            : "transparent",
          transition: "all 0.15s ease",
        }}
      >
        <Icon
          src={item.icon}
          style={{ width: 14, height: 14 }}
          color={isActive ? activeColor : inactiveColor}
        />
        {item.label}
      </button>
    );
  };

  /* ── Page content ── */
  const renderPage = () => {
    switch (activeTab) {
      case "catalog":
        return <CatalogPage isDark={isDark} onInstall={openDrawer} />;
      case "installed":
        return <InstalledPage isDark={isDark} />;
      case "claude_import":
        return <ClaudeImportPage isDark={isDark} />;
      case "github_import":
        return <GitHubImportPage isDark={isDark} />;
      case "manual":
        return <ManualPage isDark={isDark} />;
      default:
        return null;
    }
  };

  const panelBg = isDark ? "#141414" : "#ffffff";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Sub-nav bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          padding: "0 0 8px",
          borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"}`,
          flexShrink: 0,
        }}
      >
        {MCP_SUB_PAGES.map((item) => (
          <TabItem key={item.key} item={item} />
        ))}
      </div>

      {/* ── Page content area (with drawer overlay) ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Scrolling content */}
        <div
          className="scrollable"
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            padding: "12px 0 0",
          }}
        >
          {renderPage()}
        </div>

        {/* ── Install drawer slide-in ── */}
        {drawerMounted && drawerEntry && (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              backgroundColor: panelBg,
              zIndex: 3,
              transform: drawerVisible ? "translateX(0)" : "translateX(100%)",
              transition: `transform ${SLIDE_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <InstallDrawer
              catalogEntry={drawerEntry}
              isDark={isDark}
              onBack={closeDrawer}
              onComplete={() => {
                closeDrawer();
                setActiveTab("installed");
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default McpPage;
