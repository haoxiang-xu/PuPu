import { useContext } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import { ConfigContext } from "../../CONTAINERs/config/context";
import MessageJumpControls from "./components/message_jump_controls";
import { useMessageWindowScroll } from "./hooks/use_message_window_scroll";

const ChatMessages = ({
  chatId,
  messages = [],
  isStreaming = false,
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  className = "scrollable",
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const attachPanelBg = isDark ? "rgb(30, 30, 30)" : "rgb(255, 255, 255)";

  const {
    messagesRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    isAtBottom,
    isAtTop,
    handleScroll,
    handleBackToBottom,
    handleSkipToTop,
    handleJumpToPreviousMessage,
  } = useMessageWindowScroll({
    chat_id: chatId,
    messages,
    is_streaming: isStreaming,
    initial_visible_count: initialVisibleCount,
    load_batch_size: loadBatchSize,
    top_load_threshold: topLoadThreshold,
  });

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
      }}
    >
      <div
        ref={messagesRef}
        className={className}
        onScroll={handleScroll}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: messages.length === 0 ? "0" : "20px 0 8px",
          position: "relative",
          boxSizing: "border-box",
          scrollBehavior: "auto",
        }}
      >
        <div
          style={{
            width: "100%",
            minHeight: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {visibleMessages.map((msg, index) => {
            const messageIndex = safeVisibleStart + index;
            return (
              <div
                key={msg.id}
                ref={(node) => {
                  if (node) {
                    messageNodeRefs.current.set(messageIndex, node);
                  } else {
                    messageNodeRefs.current.delete(messageIndex);
                  }
                }}
                style={{
                  width: "100%",
                  maxWidth: 680,
                  margin: "0 auto",
                  padding: "0 20px",
                  boxSizing: "border-box",
                }}
              >
                <ChatBubble
                  message={msg}
                  onDeleteMessage={onDeleteMessage}
                  onResendMessage={onResendMessage}
                  onEditMessage={onEditMessage}
                  disableActionButtons={isStreaming}
                  traceFrames={
                    Array.isArray(msg.traceFrames) ? msg.traceFrames : []
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <MessageJumpControls
        messagesCount={messages.length}
        isAtBottom={isAtBottom}
        isAtTop={isAtTop}
        onSkipToTop={handleSkipToTop}
        onJumpToPreviousMessage={handleJumpToPreviousMessage}
        onBackToBottom={handleBackToBottom}
        attachPanelBg={attachPanelBg}
        isDark={isDark}
        color={color}
      />
    </div>
  );
};

export default ChatMessages;
