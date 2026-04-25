import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SegmentedControl from "../toolkit/components/segmented_control";
import CharactersPage from "./pages/characters_page";
import RecipesPage from "./pages/recipes_page";

const SECTIONS = [
  { key: "agents", icon: "bot", label: "Agents" },
  { key: "characters", icon: "user", label: "Characters" },
];

/* ── Coming-soon placeholder ─────────────────────────────── */
const ComingSoonPlaceholder = ({ icon, isDark, theme }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      gap: 12,
      textAlign: "center",
      height: "100%",
    }}
  >
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
      }}
    >
      <Icon
        src={icon}
        style={{ width: 22, height: 22 }}
        color={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
      />
    </div>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
      }}
    >
      Coming soon
    </div>
    <div
      style={{
        fontSize: 12,
        fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
        color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
        maxWidth: 280,
        lineHeight: 1.55,
      }}
    >
      This section is not yet available.
    </div>
  </div>
);

/* ── Main modal ──────────────────────────────────────────── */
export const AgentsModal = ({ open, onClose }) => {
  useModalLifecycle("agents-modal", open);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("agents");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedSection("agents");
      setSelectedNodeId(null);
      setFullscreen(false);
    }
  }, [open]);

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);
  const panelBg = isDark ? "#141414" : "#ffffff";

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

      {/* ── Content area (full-bleed) ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {selectedSection === "characters" ? (
          <div
            className="scrollable"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: "56px 0 0",
            }}
          >
            <CharactersPage isDark={isDark} onOpenChat={onClose} />
          </div>
        ) : selectedSection === "agents" ? (
          <RecipesPage
            isDark={isDark}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            fullscreen={fullscreen}
          />
        ) : (
          <div
            className="scrollable"
            style={{
              position: "absolute",
              inset: 0,
              overflowY: "auto",
              padding: "56px 0 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ComingSoonPlaceholder
              icon={activeSection?.icon || "bot"}
              isDark={isDark}
              theme={theme}
            />
          </div>
        )}

        {/* ── Floating tab switcher — top-center ── */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 5,
            WebkitAppRegion: "no-drag",
          }}
        >
          <SegmentedControl
            sections={SECTIONS}
            selected={selectedSection}
            onChange={setSelectedSection}
            isDark={isDark}
          />
        </div>
      </div>
    </Modal>
  );
};
