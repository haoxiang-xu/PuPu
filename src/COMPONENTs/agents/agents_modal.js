import { lazy, Suspense, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import WindowControls, {
  useWindowControlButtonStyle,
  windowControlsInset,
} from "../../BUILTIN_COMPONENTs/electron/window_controls";
import usePresentationPlatform from "../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import { AGENTS_MODAL_Z, useTopStripCenter } from "./top_strip";

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
  const defaultSection = isAgentsEnabled ? "agents" : "characters";
  const [selectedSection, setSelectedSection] = useState(defaultSection);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  /* One centerline for everything on the top strip (#339). */
  const { center } = useTopStripCenter(fullscreen);
  /* macOS draws native traffic lights over the modal, so only Windows and
     Linux lose their window controls to a fullscreen modal and need the
     cluster back here. */
  const presentedPlatform = usePresentationPlatform();
  const windowControlStyle = useWindowControlButtonStyle();
  const showWindowControls = fullscreen && presentedPlatform !== "darwin";

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
        color: "var(--pupu-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* The top strip's right end. While a fullscreen modal covers the title
          bar on Windows and Linux, the window's own controls come along and the
          modal drops its close button — the window's close takes over. Laying
          the group out as one flex row keeps the spacing right on both, instead
          of an offset tuned to the width of one platform's cluster. */}
      {showWindowControls ? (
        <div
          style={{
            position: "absolute",
            top: center,
            /* Same inset as the title bar's cluster, so covering it with a
               fullscreen modal does not shift the buttons sideways. */
            right: windowControlsInset(presentedPlatform === "linux"),
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
            WebkitAppRegion: "no-drag",
          }}
        >
          {/* Drawn with the cluster's own button style so the four read as one
              group: a bare glyph next to buttons that carry a background looks
              detached, because its padding doubles the apparent gap. */}
          <Button
            prefix_icon="fullscreen_exit"
            ariaLabel="Exit fullscreen"
            onClick={() => setFullscreen(false)}
            style={windowControlStyle("fullscreen_exit")}
          />
          <WindowControls />
        </div>
      ) : (
        <>
          <Button
            prefix_icon={fullscreen ? "fullscreen_exit" : "fullscreen"}
            ariaLabel={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            onClick={() => setFullscreen((f) => !f)}
            style={{
              position: "absolute",
              top: center,
              transform: "translateY(-50%)",
              right: 44,
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRadius: 6,
              opacity: 0.45,
              zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
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
            ariaLabel="Close builder"
            onClick={handleClose}
            style={{
              position: "absolute",
              top: center,
              transform: "translateY(-50%)",
              right: 12,
              paddingVertical: 6,
              paddingHorizontal: 6,
              borderRadius: 6,
              opacity: 0.45,
              zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
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
        </>
      )}

      <Suspense fallback={<AgentsModalLoading />}>
        <AgentsModalContent
          isAgentsEnabled={isAgentsEnabled}
          isCharactersEnabled={isCharactersEnabled}
          selectedSection={selectedSection}
          onSectionChange={setSelectedSection}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          fullscreen={fullscreen}
          topStripCenter={center}
          onClose={onClose}
        />
      </Suspense>
    </Modal>
  );
};
