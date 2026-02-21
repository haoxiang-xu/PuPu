import { useState, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";

const ChatBubble = ({ message, isLast, onEdit, onCopy, onRegenerate }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [hovered, setHovered] = useState(false);

  const isUser = message.role === "user";
  const color = theme?.color || "#222";
  const avatarIconColor = isDark ? "rgba(255,255,255,0.85)" : undefined;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        gap: 0,
        position: "relative",
      }}
    >
      {/* ── role label ──────────────────────────────────── */}
      {!isUser && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            paddingBottom: 6,
            paddingLeft: 2,
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              src="mini_ui"
              color={avatarIconColor}
              style={{
                width: 12,
                height: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              opacity: 0.45,
            }}
          >
            Assistant
          </span>
        </div>
      )}

      {/* ── message content ─────────────────────────────── */}
      <div
        style={{
          maxWidth: isUser ? "75%" : "100%",
          padding: isUser ? "10px 16px" : "0 2px",
          borderRadius: isUser ? 16 : 0,
          ...(isUser
            ? {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.05)",
              }
            : {}),
          fontSize: 14,
          fontFamily: theme?.font?.fontFamily || "inherit",
          color: theme?.color || "#222",
          lineHeight: 1.6,
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          <span>{message.content}</span>
        ) : (
          <Markdown
            markdown={message.content}
            options={{
              fontSize: 14,
              lineHeight: 1.6,
            }}
          />
        )}
      </div>

      {/* ── hover action bar ────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: isUser ? "flex-end" : "flex-start",
          gap: 2,
          paddingTop: 4,
          opacity: hovered ? 1 : 0,
          transform: hovered ? "translateY(0)" : "translateY(-4px)",
          transition:
            "opacity 0.18s ease, transform 0.18s cubic-bezier(0.25, 1, 0.5, 1)",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {!isUser && (
          <>
            {onCopy && (
              <Button
                prefix_icon="draft"
                onClick={() => onCopy(message)}
                style={{ color, fontSize: 12, opacity: 0.4 }}
              />
            )}
            {onEdit && (
              <Button
                prefix_icon="edit"
                onClick={() => onEdit(message)}
                style={{ color, fontSize: 12, opacity: 0.4 }}
              />
            )}
            {isLast && onRegenerate && (
              <Button
                prefix_icon="marker"
                onClick={() => onRegenerate(message)}
                style={{ color, fontSize: 12, opacity: 0.4 }}
              />
            )}
          </>
        )}
        {isUser && onEdit && (
          <Button
            prefix_icon="edit"
            onClick={() => onEdit(message)}
            style={{ color, fontSize: 12, opacity: 0.4 }}
          />
        )}
      </div>
    </div>
  );
};

export default ChatBubble;
