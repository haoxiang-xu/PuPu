import { lazy, Suspense, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";

const AgentsModalContent = lazy(() =>
  import("./agents_modal_content").then((m) => ({
    default: m.AgentsModalContent,
  })),
);

const AgentsModalLoading = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ArcSpinner size={24} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
    </div>
  );
};

export const AgentsModal = ({
  open,
  onClose,
  isAgentsEnabled = true,
  isCharactersEnabled = true,
}) => {
  useModalLifecycle("agents-modal", open);
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const defaultSection = isAgentsEnabled ? "agents" : "characters";
  const [selectedSection, setSelectedSection] = useState(defaultSection);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedSection(defaultSection);
      setSelectedNodeId(null);
      setFullscreen(false);
    }
  }, [open, defaultSection]);

  const handleClose = () => {
    if (selectedSection === "agents" && selectedNodeId) {
      setSelectedNodeId(null);
      return;
    }
    onClose();
  };

  const panelBg = isDark ? "#141414" : "#ffffff";

  return (
    <Modal
      open={open}
      onClose={handleClose}
      fullscreen={fullscreen}
      style={{
        width: 920,
        maxWidth: "92vw",
        height: 600,
        maxHeight: "88vh",
        padding: 0,
        backgroundColor: panelBg,
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon={fullscreen ? "fullscreen_exit" : "fullscreen"}
        onClick={() => setFullscreen((f) => !f)}
        style={{
          position: "absolute",
          top: 12,
          right: 44,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 4,
          WebkitAppRegion: "no-drag",
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
      <Button
        prefix_icon="close"
        onClick={handleClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 4,
          WebkitAppRegion: "no-drag",
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

      <Suspense fallback={<AgentsModalLoading />}>
        <AgentsModalContent
          isAgentsEnabled={isAgentsEnabled}
          isCharactersEnabled={isCharactersEnabled}
          selectedSection={selectedSection}
          onSectionChange={setSelectedSection}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          fullscreen={fullscreen}
          onClose={onClose}
        />
      </Suspense>
    </Modal>
  );
};
