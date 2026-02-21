import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../BUILTIN_COMPONENTs/input/button";

const ChatHeader = ({ title = "Mini UI Chat", onNewChat, onSettings }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: isDark
          ? "1px solid rgba(255,255,255,0.06)"
          : "1px solid rgba(0,0,0,0.06)",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.06)"
              : "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon
            src="mini_ui"
            color={isDark ? "rgba(255,255,255,0.85)" : undefined}
            style={{
              width: 16,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 15,
            fontFamily: theme?.font?.fontFamily || "inherit",
            color: theme?.color || "#222",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {onNewChat && (
          <Button
            prefix_icon="edit"
            onClick={onNewChat}
            style={{ color, fontSize: 14, opacity: 0.4 }}
          />
        )}
        {onSettings && (
          <Button
            prefix_icon="more"
            onClick={onSettings}
            style={{ color, fontSize: 14, opacity: 0.4 }}
          />
        )}
      </div>
    </div>
  );
};

export default ChatHeader;
