import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import WorkspaceEditor from "./workspace_editor";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";

export const WorkspaceModal = ({ open, onClose }) => {
  const { onThemeMode, theme } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 560,
        maxWidth: "92vw",
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
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "20px 28px 12px",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
            color: isDark ? "#fff" : "#222",
            letterSpacing: "-0.01em",
          }}
        >
          {t("workspace.title")}
        </div>
      </div>

      {/* Close — aligned with Settings/Tools modal */}
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

      {/* Scrollable body */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 28px 28px",
        }}
      >
        <WorkspaceEditor isDark={isDark} />
      </div>
    </Modal>
  );
};
