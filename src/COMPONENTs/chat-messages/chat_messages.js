import { memo, useContext, useMemo, useState } from "react";
import ChatBubble from "../chat-bubble/chat_bubble";
import CharacterChatBubble from "../chat-bubble/character_chat_bubble";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import MessageJumpControls from "./components/message_jump_controls";
import { useMessageWindowScroll } from "./hooks/use_message_window_scroll";

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
  planDocs = [],
  className = "scrollable",
  initialVisibleCount = 12,
  loadBatchSize = 6,
  topLoadThreshold = 80,
  bootVisibleCount = 3,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "#222";
  const attachPanelBg = isDark ? "rgb(30, 30, 30)" : "rgb(255, 255, 255)";
  const borderColor = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.10)";
  const mutedColor = isDark ? "rgba(255,255,255,0.58)" : "rgba(0,0,0,0.55)";
  const [openPlanDocId, setOpenPlanDocId] = useState("");
  const visiblePlanDocs = useMemo(
    () =>
      Array.isArray(planDocs)
        ? planDocs.filter(
            (doc) => typeof doc?.plan_id === "string" && doc.plan_id,
          )
        : [],
    [planDocs],
  );
  const openPlanDoc = useMemo(
    () =>
      visiblePlanDocs.find((doc) => doc.plan_id === openPlanDocId) || null,
    [visiblePlanDocs, openPlanDocId],
  );
  const fallbackPlanMessageId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (
        message?.role === "assistant" &&
        typeof message.id === "string" &&
        message.id
      ) {
        return message.id;
      }
    }
    return "";
  }, [messages]);
  const planDocsByMessageId = useMemo(() => {
    const messageIds = new Set(
      messages
        .map((message) => (typeof message?.id === "string" ? message.id : ""))
        .filter(Boolean),
    );
    const byMessageId = new Map();
    visiblePlanDocs.forEach((doc) => {
      const explicitMessageId =
        typeof doc.message_id === "string" && doc.message_id
          ? doc.message_id
          : typeof doc.messageId === "string" && doc.messageId
            ? doc.messageId
            : "";
      const messageId =
        explicitMessageId && messageIds.has(explicitMessageId)
          ? explicitMessageId
          : fallbackPlanMessageId;
      if (!messageId) {
        return;
      }
      const docs = byMessageId.get(messageId) || [];
      docs.push(doc);
      byMessageId.set(messageId, docs);
    });
    return byMessageId;
  }, [fallbackPlanMessageId, messages, visiblePlanDocs]);

  const renderPlanDocChips = (docs) => {
    if (!Array.isArray(docs) || docs.length === 0) {
      return null;
    }
    return (
      <div
        data-plan-doc-row="true"
        style={{
          marginTop: 8,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {docs.map((doc) => (
          <button
            key={doc.plan_id}
            type="button"
            title={doc.title || doc.plan_id}
            onClick={() => setOpenPlanDocId(doc.plan_id)}
            style={{
              height: 30,
              maxWidth: 260,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0 10px",
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
              background: isDark
                ? "rgba(255,255,255,0.06)"
                : "rgba(0,0,0,0.035)",
              color,
              fontSize: 12,
              lineHeight: "30px",
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontWeight: 700, flex: "0 0 auto" }}>Plan</span>
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {doc.title || doc.plan_id}
            </span>
            {doc.revision ? (
              <span style={{ color: mutedColor, flex: "0 0 auto" }}>
                r{doc.revision}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    );
  };

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
    boot_visible_count: bootVisibleCount,
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
          {visibleMessages.map((msg, index) => {
            const messageIndex = safeVisibleStart + index;
            const messagePlanDocs = planDocsByMessageId.get(msg.id) || [];
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
                {renderPlanDocChips(messagePlanDocs)}
              </div>
            );
          })}
        </div>
      </div>

      {openPlanDoc && (
        <div
          role="dialog"
          aria-label={openPlanDoc.title || "Plan document"}
          style={{
            position: "absolute",
            top: 18,
            right: 18,
            bottom: 18,
            width: "min(520px, calc(100% - 36px))",
            display: "flex",
            flexDirection: "column",
            borderRadius: 8,
            border: `1px solid ${borderColor}`,
            background: attachPanelBg,
            color,
            boxShadow: isDark
              ? "0 24px 60px rgba(0,0,0,0.45)"
              : "0 24px 60px rgba(0,0,0,0.14)",
            zIndex: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              minHeight: 54,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderBottom: `1px solid ${borderColor}`,
              boxSizing: "border-box",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {openPlanDoc.title || openPlanDoc.plan_id}
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: mutedColor }}>
                {openPlanDoc.status || "draft"} / r{openPlanDoc.revision || 1}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close plan document"
              onClick={() => setOpenPlanDocId("")}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: `1px solid ${borderColor}`,
                background: "transparent",
                color,
                cursor: "pointer",
                fontSize: 14,
                lineHeight: "28px",
              }}
            >
              X
            </button>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              padding: "14px 18px 24px",
              boxSizing: "border-box",
            }}
          >
            <Markdown
              markdown={openPlanDoc.markdown || ""}
              style={{
                fontSize: 14,
                lineHeight: 1.58,
                color,
              }}
            />
          </div>
        </div>
      )}

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

export default memo(ChatMessages);
