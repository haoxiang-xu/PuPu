import { useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SECTIONS } from "./constants";
import SegmentedControl from "./components/segmented_control";
import ToolkitsPage from "./pages/toolkits_page";
import ComingSoonPage from "./pages/coming_soon_page";

export const ToolkitModal = ({ open, onClose }) => {
  useModalLifecycle("toolkit-modal", open);
  const { onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("toolkits");

  const translatedSections = useMemo(
    () => SECTIONS.map((s) => ({ ...s, label: t(s.labelKey) })),
    [t],
  );

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedSection("toolkits");
    }
  }, [open]);

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);

  const renderContent = () => {
    if (selectedSection === "toolkits") {
      return <ToolkitsPage isDark={isDark} />;
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

      <div style={{ padding: "12px 16px 8px 16px", flexShrink: 0 }}>
        <SegmentedControl
          sections={translatedSections}
          selected={selectedSection}
          onChange={setSelectedSection}
          isDark={isDark}
        />
      </div>

      {/* ── Content area ── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          className="scrollable"
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            padding: "4px 0 16px",
          }}
        >
          {renderContent()}
        </div>
      </div>
    </Modal>
  );
};
