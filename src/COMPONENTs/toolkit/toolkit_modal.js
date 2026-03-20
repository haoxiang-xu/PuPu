import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SECTIONS } from "./constants";
import SegmentedControl from "./components/segmented_control";
import ToolkitsPage from "./pages/toolkits_page";
import ToolkitDetailPanel from "./components/toolkit_detail_panel";
import ComingSoonPage from "./pages/coming_soon_page";
import McpPage from "./mcp/mcp_page";

const SLIDE_DURATION = 260; // ms

export const ToolkitModal = ({ open, onClose }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("toolkits");
  const [selectedToolkit, setSelectedToolkit] = useState(null);

  /* ── Slide-in animation state ── */
  const [detailMounted, setDetailMounted] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const slideTimer = useRef(null);

  const openDetail = useCallback((toolkitId, toolName, toolkit) => {
    setSelectedToolkit({ toolkitId, toolName, toolkit });
    setDetailMounted(true);
    // next frame → trigger slide-in
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

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(slideTimer.current), []);

  // Reset detail when modal closes
  useEffect(() => {
    if (!open) {
      setDetailMounted(false);
      setDetailVisible(false);
      setSelectedToolkit(null);
    }
  }, [open]);

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);

  const handleToolClick = useCallback(
    (toolkitId, toolName, toolkit) => {
      openDetail(toolkitId, toolName, toolkit);
    },
    [openDetail],
  );

  const renderContent = () => {
    if (selectedSection === "toolkits") {
      return <ToolkitsPage isDark={isDark} onToolClick={handleToolClick} />;
    }
    if (selectedSection === "mcp") {
      return <McpPage isDark={isDark} />;
    }
    return (
      <ComingSoonPage icon={activeSection?.icon || "tool"} isDark={isDark} />
    );
  };

  const panelBg = isDark ? "#141414" : "#ffffff";

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: panelBg,
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon="close"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 4,
          content: {
            prefixIconWrap: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            },
            icon: { width: 14, height: 14 },
          },
        }}
      />

      <div style={{ padding: "12px 16px 8px", flexShrink: 0 }}>
        <SegmentedControl
          sections={SECTIONS}
          selected={selectedSection}
          onChange={(key) => {
            setSelectedSection(key);
            closeDetail();
          }}
          isDark={isDark}
        />
      </div>

      {/* ── Content area with slide-in overlay ── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Grid / list content — always rendered */}
        <div
          className="scrollable"
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            padding: "4px 16px 16px",
          }}
        >
          {renderContent()}
        </div>

        {/* ── Detail panel overlay — slides in from right ── */}
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
              padding: "8px 16px 16px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <ToolkitDetailPanel
              toolkitId={selectedToolkit.toolkitId}
              toolName={selectedToolkit.toolName}
              tools={selectedToolkit.toolkit?.tools}
              isDark={isDark}
              onBack={closeDetail}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};
