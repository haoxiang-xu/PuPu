import { useRef, useEffect } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";

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
      {messages.map((msg, i) => {
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
      })}
    </div>
  );
};

export default ChatMessages;
