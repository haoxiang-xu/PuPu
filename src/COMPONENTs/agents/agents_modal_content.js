import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SegmentedControl from "../toolkit/components/segmented_control";
import CharactersPage from "./pages/characters_page";
import RecipesPage from "./pages/recipes_page";

export const AGENT_MODAL_SECTIONS = [
  { key: "agents", icon: "bot", label: "Agents" },
  { key: "characters", icon: "user", label: "Characters" },
];

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

export const AgentsModalContent = ({
  isAgentsEnabled,
  isCharactersEnabled,
  selectedSection,
  onSectionChange,
  selectedNodeId,
  onSelectNode,
  fullscreen,
  onClose,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const activeSection = AGENT_MODAL_SECTIONS.find(
    (s) => s.key === selectedSection,
  );

  return (
    <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
      {selectedSection === "characters" && isCharactersEnabled ? (
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
      ) : selectedSection === "agents" && isAgentsEnabled ? (
        <RecipesPage
          isDark={isDark}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
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
          sections={AGENT_MODAL_SECTIONS}
          selected={selectedSection}
          onChange={onSectionChange}
          isDark={isDark}
        />
      </div>
    </div>
  );
};
