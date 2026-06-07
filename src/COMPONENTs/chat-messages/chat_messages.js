import { memo, useContext } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import CharacterChatBubble from "../chat-bubble/character_chat_bubble";
import { ConfigContext } from "../../CONTAINERs/config/context";
import MessageMinimap from "./components/message_minimap";
import { useMessageMinimap } from "./hooks/use_message_minimap";
import { useMessageWindowScroll } from "./hooks/use_message_window_scroll";
import { StreamingMessageStoreContext } from "../chat-bubble/components/streaming_message_store_context";

const ChatMessages = ({
  chatId,
  messages = [],
  isStreaming = false,
  isCharacterChat = false,
  characterName = "",
  characterAvatar = null,
  characterAvailability = "",
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
  pendingToolConfirmationRequests = {},
  pendingContinuationRequest,
  onContinuationDecision,
  streamingMessageStore,
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
  bootVisibleCount = 3,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const {
    messagesRef,
    bottomSentinelRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    handleScroll,
    handleUserScrollIntent,
    notifyStreamingContentCommitted,
    scrollToMessageIndex,
  } = useMessageWindowScroll({
    chat_id: chatId,
    messages,
    is_streaming: isStreaming,
    initial_visible_count: initialVisibleCount,
    load_batch_size: loadBatchSize,
    top_load_threshold: topLoadThreshold,
    boot_visible_count: bootVisibleCount,
  });

  const minimapMessages = isStreaming ? [] : messages;
  const { segments, total, measure } = useMessageMinimap({
    chatId,
    messages: minimapMessages,
    messageNodeRefs,
    safeVisibleStart,
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
        className="chat-scroll-host"
        onScroll={handleScroll}
        onWheel={handleUserScrollIntent}
        onTouchMove={handleUserScrollIntent}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            handleUserScrollIntent();
          }
        }}
        style={{
          height: "100%",
          overflowY: "auto",
          padding: messages.length === 0 ? "0" : "28px 0 64px",
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
          <StreamingMessageStoreContext.Provider
            value={{
              chatId,
              store: streamingMessageStore,
              notifyStreamingContentCommitted,
            }}
          >
            {visibleMessages.map((msg, index) => {
              const messageIndex = safeVisibleStart + index;
              return (
                <div
                  key={msg.id}
                  data-message-id={msg.id}
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
                  {isCharacterChat ? (
                    <CharacterChatBubble
                      message={msg}
                      characterName={characterName}
                      characterAvatar={characterAvatar}
                      characterAvailability={characterAvailability}
                      onDeleteMessage={onDeleteMessage}
                      onResendMessage={onResendMessage}
                      onEditMessage={onEditMessage}
                      onToolConfirmationDecision={onToolConfirmationDecision}
                      toolConfirmationUiStateById={toolConfirmationUiStateById}
                      pendingToolConfirmationRequests={
                        pendingToolConfirmationRequests
                      }
                      disableActionButtons={isStreaming}
                      traceFrames={msg.traceFrames}
                      pendingContinuationRequest={
                        messageIndex === messages.length - 1
                          ? pendingContinuationRequest
                          : undefined
                      }
                      onContinuationDecision={
                        messageIndex === messages.length - 1
                          ? onContinuationDecision
                          : undefined
                      }
                    />
                  ) : (
                    <ChatBubble
                      message={msg}
                      onDeleteMessage={onDeleteMessage}
                      onResendMessage={onResendMessage}
                      onEditMessage={onEditMessage}
                      onToolConfirmationDecision={onToolConfirmationDecision}
                      toolConfirmationUiStateById={toolConfirmationUiStateById}
                      pendingToolConfirmationRequests={
                        pendingToolConfirmationRequests
                      }
                      disableActionButtons={isStreaming}
                      traceFrames={msg.traceFrames}
                      pendingContinuationRequest={
                        messageIndex === messages.length - 1
                          ? pendingContinuationRequest
                          : undefined
                      }
                      onContinuationDecision={
                        messageIndex === messages.length - 1
                          ? onContinuationDecision
                          : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </StreamingMessageStoreContext.Provider>
          <div ref={bottomSentinelRef} aria-hidden="true" style={{ height: 1 }} />
        </div>
      </div>

      {!isStreaming ? (
        <MessageMinimap
          messagesRef={messagesRef}
          messageNodeRefs={messageNodeRefs}
          segments={segments}
          total={total}
          safeVisibleStart={safeVisibleStart}
          measure={measure}
          scrollToMessageIndex={scrollToMessageIndex}
          isDark={isDark}
        />
      ) : null}
    </div>
  );
};

export default memo(ChatMessages);
