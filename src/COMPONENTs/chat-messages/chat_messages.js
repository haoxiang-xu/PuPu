import { useRef, useEffect, useContext } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import { ConfigContext } from "../../CONTAINERs/config/context";
import logoDark from "./logo_dark_theme.png";
import logoLight from "./logo_light_theme.png";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  EmptyChat — shown when there are no messages                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const EmptyChat = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      <img
        src={isDark ? logoDark : logoLight}
        alt="PuPu"
        draggable={false}
        style={{
          width: 160,
          opacity: 1,
        }}
      />
      <span
        style={{
          fontSize: 18,
          fontFamily: "Jost",
          fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.3)",
          letterSpacing: "0.5px",
        }}
      >
        How can I help you today?
      </span>
    </div>
  );
};

const ChatMessages = ({
  messages = [],
  onEdit,
  onCopy,
  onRegenerate,
  className = "scrollable",
}) => {
  const messagesRef = useRef(null);

  /* auto-scroll to bottom on new message */
  useEffect(() => {
    const el = messagesRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={messagesRef}
      className={className}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 0 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
      }}
    >
      {messages.length === 0 ? (
        <EmptyChat />
      ) : (
        messages.map((msg, i) => {
          /* determine if this is the last assistant message */
          const isLast =
            msg.role === "assistant" &&
            i ===
              messages.length -
                1 -
                [...messages]
                  .slice(i + 1)
                  .reverse()
                  .findIndex((m) => m.role === "assistant");

          return (
            <div
              key={msg.id}
              style={{
                width: "70%",
                maxWidth: 800,
                margin: "0 auto",
                padding: "0 20px",
                boxSizing: "border-box",
              }}
            >
              <ChatBubble
                message={msg}
                isLast={isLast}
                onEdit={onEdit}
                onCopy={onCopy}
                onRegenerate={onRegenerate}
              />
            </div>
          );
        })
      )}
    </div>
  );
};

export default ChatMessages;
