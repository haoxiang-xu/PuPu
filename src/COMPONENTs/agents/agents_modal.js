import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SegmentedControl from "../toolkit/components/segmented_control";
import CharactersPage from "./pages/characters_page";

const SECTIONS = [
  { key: "agents", icon: "bot", label: "Agents" },
  { key: "characters", icon: "user", label: "Characters" },
];

/* ── Coming-soon placeholder ─────────────────────────────── */
const ComingSoonPlaceholder = ({ icon, isDark }) => (
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
        fontFamily: "NunitoSans, sans-serif",
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
      }}
    >
      Coming soon
    </div>
    <div
      style={{
        fontSize: 12,
        fontFamily: "Jost, sans-serif",
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
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("agents");

  useEffect(() => {
    if (!open) setSelectedSection("agents");
  }, [open]);

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);
  const panelBg = isDark ? "#141414" : "#ffffff";

  return (
    <Modal
      open={open}
      onClose={onClose}
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
          sections={SECTIONS}
          selected={selectedSection}
          onChange={setSelectedSection}
          isDark={isDark}
        />
      </div>

      {/* ── Content area ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <div
          className="scrollable"
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            padding: selectedSection === "characters" ? 0 : "4px 0 16px",
            display: "flex",
            flexDirection: "column",
            ...(selectedSection !== "characters" && {
              alignItems: "center",
              justifyContent: "center",
            }),
          }}
        >
          {selectedSection === "characters" ? (
            <CharactersPage isDark={isDark} />
          ) : (
            <ComingSoonPlaceholder
              icon={activeSection?.icon || "bot"}
              isDark={isDark}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};
