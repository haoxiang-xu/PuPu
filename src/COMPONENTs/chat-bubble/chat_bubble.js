import { memo, useState, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import UserMessageBody from "./components/user_message_body";
import AssistantMessageBody from "./components/assistant_message_body";
import MessageActionBar from "./components/message_action_bar";
import { useEditableMessage } from "./hooks/use_editable_message";

const ChatBubble = ({
  message,
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
  disableActionButtons = false,
  traceFrames = [],
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [hovered, setHovered] = useState(false);
  const [assistantRenderMode, setAssistantRenderMode] = useState("markdown");

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isRawTextMode = assistantRenderMode === "raw_text";
  const hasAssistantText =
    isAssistant &&
    typeof message.content === "string" &&
    message.content.length > 0;
  const showAssistantRenderToggle = !isUser && hasAssistantText;
  const canResendMessage =
    isUser &&
    typeof onResendMessage === "function" &&
    typeof message?.content === "string" &&
    message.content.trim().length > 0;
  const canDeleteMessage =
    typeof onDeleteMessage === "function" &&
    typeof message?.id === "string" &&
    message.id.length > 0;
  const canEditMessage =
    isUser &&
    typeof onEditMessage === "function" &&
    typeof message?.id === "string" &&
    message.id.length > 0 &&
    typeof message?.content === "string";

  const {
    isEditing,
    editDraft,
    setEditDraft,
    editTextareaRef,
    isSubmitDisabled,
    handleStartEdit,
    handleCancelEdit,
    handleSubmitEdit,
    handleEditKeyDown,
  } = useEditableMessage({
    message,
    can_edit_message: canEditMessage,
    disable_action_buttons: disableActionButtons,
    on_edit_message: onEditMessage,
  });

  const showActionBar =
    !isEditing &&
    (showAssistantRenderToggle ||
      canEditMessage ||
      canResendMessage ||
      canDeleteMessage);
  const userAttachments =
    isUser && Array.isArray(message?.attachments) ? message.attachments : [];
  const color = theme?.color || "#222";

  // Only consider tool / reasoning activity as worthy of the full trace
  // chain UI.  Infrastructure frames like stream_started, final_message,
  // done etc. should NOT cause the trace chain to take over the bubble.
  const hasToolActivity = traceFrames.some(
    (f) =>
      f.type === "tool_call" ||
      f.type === "tool_confirmation_request" ||
      f.type === "tool_result" ||
      f.type === "reasoning" ||
      f.type === "observation",
  );

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
      {isAssistant && hasToolActivity && (
        <TraceChain
          frames={traceFrames}
          status={message.status}
          onToolConfirmationDecision={onToolConfirmationDecision}
          toolConfirmationUiStateById={toolConfirmationUiStateById}
          streamingContent={
            message.status === "streaming" ? message.content : ""
          }
        />
      )}
      {isAssistant && !hasToolActivity && message.status === "streaming" && (
        <TraceChain frames={[]} status={message.status} />
      )}

      {/* Hide the assistant bubble body entirely when streaming with
          an active trace timeline (intermediate + streaming content shows
          in the timeline; the bubble only shows the final result). */}
      {!(isAssistant && hasToolActivity && message.status === "streaming") && (
        <div
          style={{
            maxWidth: isUser ? "75%" : "100%",
            width: isUser && isEditing ? "100%" : undefined,
            padding: isUser ? (isEditing ? 0 : "10px 16px") : "0 2px",
            borderRadius: isUser ? (isEditing ? 0 : 16) : 0,
            ...(isUser && !isEditing
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
            <UserMessageBody
              message={message}
              isDark={isDark}
              isEditing={isEditing}
              userAttachments={userAttachments}
              editTextareaRef={editTextareaRef}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              handleEditKeyDown={handleEditKeyDown}
              handleCancelEdit={handleCancelEdit}
              handleSubmitEdit={handleSubmitEdit}
              isSubmitDisabled={isSubmitDisabled}
              disableActionButtons={disableActionButtons}
              color={color}
            />
          ) : (
            <AssistantMessageBody
              message={message}
              isRawTextMode={isRawTextMode}
              theme={theme}
              hasTraceFrames={hasToolActivity}
            />
          )}
        </div>
      )}

      <MessageActionBar
        showActionBar={showActionBar}
        hovered={hovered}
        isUser={isUser}
        showAssistantRenderToggle={showAssistantRenderToggle}
        isRawTextMode={isRawTextMode}
        disableActionButtons={disableActionButtons}
        setAssistantRenderMode={setAssistantRenderMode}
        canEditMessage={canEditMessage}
        handleStartEdit={handleStartEdit}
        canResendMessage={canResendMessage}
        onResendMessage={onResendMessage}
        message={message}
        canDeleteMessage={canDeleteMessage}
        onDeleteMessage={onDeleteMessage}
        color={color}
      />
    </div>
  );
};

const areChatBubblePropsEqual = (previousProps, nextProps) =>
  previousProps.message === nextProps.message &&
  previousProps.onDeleteMessage === nextProps.onDeleteMessage &&
  previousProps.onResendMessage === nextProps.onResendMessage &&
  previousProps.onEditMessage === nextProps.onEditMessage &&
  previousProps.onToolConfirmationDecision ===
    nextProps.onToolConfirmationDecision &&
  previousProps.toolConfirmationUiStateById ===
    nextProps.toolConfirmationUiStateById &&
  previousProps.disableActionButtons === nextProps.disableActionButtons &&
  previousProps.traceFrames === nextProps.traceFrames;

export default memo(ChatBubble, areChatBubblePropsEqual);
