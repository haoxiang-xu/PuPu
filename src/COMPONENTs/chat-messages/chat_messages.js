import { memo, useContext, useId, useMemo } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import CharacterChatBubble from "../chat-bubble/character_chat_bubble";
import { ConfigContext } from "../../CONTAINERs/config/context";
import MessageMinimap from "./components/message_minimap";
import { useMessageWindowScroll } from "./hooks/use_message_window_scroll";
import { StreamingMessageStoreContext } from "../chat-bubble/components/streaming_message_store_context";

const EMPTY_CONFIRMATION_STATE = Object.freeze({});

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
  onClarifyResolve,
  pendingToolConfirmationRequests = {},
  pendingContinuationRequest,
  onContinuationDecision,
  streamingMessageStore,
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
  bootVisibleCount = 3,
  bottomViewportInset = 0,
  maxMountedCount = 40,
}) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const scrollHostId = useId();
  const safeBottomViewportInset =
    Number.isFinite(bottomViewportInset) && bottomViewportInset > 0
      ? bottomViewportInset
      : 0;

  const {
    messagesRef,
    bottomSentinelRef,
    messageNodeRefs,
    safeVisibleStart,
    visibleMessages,
    handleScroll,
    handlePointerInteraction,
    handleUserScrollIntent,
    handleWheel,
    notifyStreamingContentCommitted,
    handleBackToBottom,
    scrollToMessageIndex,
    scrollViewportByPage,
  } = useMessageWindowScroll({
    chat_id: chatId,
    messages,
    is_streaming: isStreaming,
    initial_visible_count: initialVisibleCount,
    load_batch_size: loadBatchSize,
    top_load_threshold: topLoadThreshold,
    boot_visible_count: bootVisibleCount,
    bottom_viewport_inset: safeBottomViewportInset,
    max_mounted_count: maxMountedCount,
  });

  // Provider value memo(2026-07 C 批性能):此前每次重渲染新建对象,所有订阅
  // StreamingMessageStoreContext 的 bubble 都被迫重渲染。依赖不变则引用稳定。
  const streamingStoreContextValue = useMemo(
    () => ({
      chatId,
      store: streamingMessageStore,
      notifyStreamingContentCommitted,
    }),
    [chatId, streamingMessageStore, notifyStreamingContentCommitted],
  );

  const confirmationStateByMessageId = useMemo(() => {
    const assistantMessageIds = new Set();
    const ownerMessageIdByConfirmationId = new Map();
    let fallbackOwnerMessageId = "";

    const rememberFrameOwners = (messageId, frames) => {
      if (!Array.isArray(frames)) {
        return;
      }
      frames.forEach((frame) => {
        const confirmationId =
          typeof frame?.payload?.confirmation_id === "string"
            ? frame.payload.confirmation_id.trim()
            : "";
        if (confirmationId && !ownerMessageIdByConfirmationId.has(confirmationId)) {
          ownerMessageIdByConfirmationId.set(confirmationId, messageId);
        }
      });
    };

    messages.forEach((message) => {
      const messageId =
        typeof message?.id === "string" ? message.id.trim() : "";
      if (!messageId || message?.role !== "assistant") {
        return;
      }
      assistantMessageIds.add(messageId);
      fallbackOwnerMessageId = messageId;
      rememberFrameOwners(messageId, message.traceFrames);
      const subagentFrames =
        message?.subagentFrames && typeof message.subagentFrames === "object"
          ? message.subagentFrames
          : {};
      Object.values(subagentFrames).forEach((frames) => {
        rememberFrameOwners(messageId, frames);
      });
    });

    const pendingByMessageId = {};
    Object.entries(pendingToolConfirmationRequests || {}).forEach(
      ([confirmationKey, request]) => {
        if (!request || typeof request !== "object") {
          return;
        }
        const confirmationId =
          typeof request.confirmationId === "string" &&
          request.confirmationId.trim()
            ? request.confirmationId.trim()
            : confirmationKey;
        const explicitOwnerMessageId =
          typeof request.ownerMessageId === "string" &&
          assistantMessageIds.has(request.ownerMessageId.trim())
            ? request.ownerMessageId.trim()
            : "";
        const ownerMessageId =
          explicitOwnerMessageId ||
          ownerMessageIdByConfirmationId.get(confirmationId) ||
          fallbackOwnerMessageId;
        if (!ownerMessageId) {
          return;
        }
        ownerMessageIdByConfirmationId.set(confirmationId, ownerMessageId);
        pendingByMessageId[ownerMessageId] = {
          ...(pendingByMessageId[ownerMessageId] || {}),
          [confirmationKey]: request,
        };
      },
    );

    const uiStateByMessageId = {};
    Object.entries(toolConfirmationUiStateById || {}).forEach(
      ([confirmationId, uiState]) => {
        const ownerMessageId =
          ownerMessageIdByConfirmationId.get(confirmationId) ||
          fallbackOwnerMessageId;
        if (!ownerMessageId) {
          return;
        }
        uiStateByMessageId[ownerMessageId] = {
          ...(uiStateByMessageId[ownerMessageId] || {}),
          [confirmationId]: uiState,
        };
      },
    );

    return { pendingByMessageId, uiStateByMessageId };
  }, [messages, pendingToolConfirmationRequests, toolConfirmationUiStateById]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        /* own stacking context: content z-indexes (e.g. the custom
           scrollbar overlay at 9999) must not escape and paint over
           the floating input, which sits at zIndex 5 beside us */
        isolation: "isolate",
      }}
    >
      <div
        id={scrollHostId}
        ref={messagesRef}
        className="chat-scroll-host"
        onScroll={handleScroll}
        onWheel={handleWheel}
        onTouchMove={handleUserScrollIntent}
        onPointerDown={handlePointerInteraction}
        style={{
          height: "100%",
          overflowY: "auto",
          padding:
            messages.length === 0
              ? "0"
              : `28px 0 ${64 + safeBottomViewportInset}px`,
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
            value={streamingStoreContextValue}
          >
            {visibleMessages.map((msg, index) => {
              const messageIndex = safeVisibleStart + index;
              const messagePendingToolConfirmationRequests =
                confirmationStateByMessageId.pendingByMessageId[msg.id] ||
                EMPTY_CONFIRMATION_STATE;
              const messageToolConfirmationUiStateById =
                confirmationStateByMessageId.uiStateByMessageId[msg.id] ||
                EMPTY_CONFIRMATION_STATE;
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
                      toolConfirmationUiStateById={
                        messageToolConfirmationUiStateById
                      }
                      onClarifyResolve={onClarifyResolve}
                      pendingToolConfirmationRequests={
                        messagePendingToolConfirmationRequests
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
                      toolConfirmationUiStateById={
                        messageToolConfirmationUiStateById
                      }
                      onClarifyResolve={onClarifyResolve}
                      pendingToolConfirmationRequests={
                        messagePendingToolConfirmationRequests
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

      <MessageMinimap
        scrollHostId={scrollHostId}
        messagesRef={messagesRef}
        messageNodeRefs={messageNodeRefs}
        messages={messages}
        safeVisibleStart={safeVisibleStart}
        scrollToMessageIndex={scrollToMessageIndex}
        scrollViewportByPage={scrollViewportByPage}
        onBackToBottom={handleBackToBottom}
        bottomViewportInset={safeBottomViewportInset}
        isDark={isDark}
        isStreaming={isStreaming}
      />
    </div>
  );
};

export default memo(ChatMessages);
