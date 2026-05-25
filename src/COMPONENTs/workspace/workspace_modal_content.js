import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import WorkspaceEditor from "./workspace_editor";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";

export const WorkspaceModalContent = ({ onClose }) => {
  const { onThemeMode, theme } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const { t } = useTranslation();

  return (
    <>
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
    </>
  );
};
