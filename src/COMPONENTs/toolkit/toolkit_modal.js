import { useCallback, useContext, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SECTIONS } from "./constants";
import SegmentedControl from "./components/segmented_control";
import ToolkitsPage from "./pages/toolkits_page";
import ToolkitDetailPanel from "./components/toolkit_detail_panel";
import ComingSoonPage from "./pages/coming_soon_page";

export const ToolkitModal = ({ open, onClose }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("toolkits");
  const [selectedToolkit, setSelectedToolkit] = useState(null);

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);

  const handleToolClick = useCallback((toolkitId, toolName) => {
    setSelectedToolkit({ toolkitId, toolName });
  }, []);

  const handleDetailBack = useCallback(() => {
    setSelectedToolkit(null);
  }, []);

  const renderContent = () => {
    if (selectedSection === "toolkits") {
      if (selectedToolkit) {
        return (
          <ToolkitDetailPanel
            toolkitId={selectedToolkit.toolkitId}
            toolName={selectedToolkit.toolName}
            isDark={isDark}
            onBack={handleDetailBack}
          />
        );
      }
      return <ToolkitsPage isDark={isDark} onToolClick={handleToolClick} />;
    }
    return (
      <ComingSoonPage icon={activeSection?.icon || "tool"} isDark={isDark} />
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
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
          zIndex: 2,
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
            setSelectedToolkit(null);
          }}
          isDark={isDark}
        />
      </div>

      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 16px 16px",
        }}
      >
        {renderContent()}
      </div>
    </Modal>
  );
};
