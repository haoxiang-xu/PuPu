import { memo, useState, useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";
import UserMessageBody from "./components/user_message_body";
import AssistantMessageBody from "./components/assistant_message_body";
import MessageActionBar from "./components/message_action_bar";
import { useEditableMessage } from "./hooks/use_editable_message";
import { buildPendingConfirmationTraceFrames } from "./pending_confirmation_trace_frames";

const resolveAvatarSrc = (avatar) => {
  const rawUrl = typeof avatar?.url === "string" ? avatar.url.trim() : "";
  if (rawUrl) return rawUrl;
  const rawPath =
    typeof avatar?.absolute_path === "string"
      ? avatar.absolute_path.trim()
      : "";
  if (!rawPath) return "";
  if (/^(https?:|data:|file:)/i.test(rawPath)) return rawPath;
  const normalized = rawPath.replace(/\\/g, "/");
  return normalized.startsWith("/")
    ? encodeURI(`file://${normalized}`)
    : encodeURI(`file:///${normalized}`);
};

const formatTimestamp = (ms) => {
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const AVAILABILITY_DOT_COLOR = {
  available: "#92c353",
  limited: "#ffaa44",
  busy: "#d74654",
  offline: "#93999e",
};

const CharacterChatBubble = ({
  message,
  characterName = "",
  characterAvatar = null,
  characterAvailability = "",
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  onToolConfirmationDecision,
  toolConfirmationUiStateById = {},
  pendingToolConfirmationRequests = {},
  disableActionButtons = false,
  traceFrames = [],
  pendingContinuationRequest,
  onContinuationDecision,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [hovered, setHovered] = useState(false);
  const [assistantRenderMode, setAssistantRenderMode] = useState("markdown");
  const [imageBroken, setImageBroken] = useState(false);

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

  const hasToolActivity = traceFrames.some(
    (f) =>
      f.type === "tool_call" ||
      f.type === "tool_result" ||
      f.type === "reasoning" ||
      f.type === "observation",
  );
  const pendingToolConfirmationFrames = hasToolActivity
    ? []
    : buildPendingConfirmationTraceFrames(pendingToolConfirmationRequests);
  const hasVisibleTraceActivity =
    hasToolActivity || pendingToolConfirmationFrames.length > 0;
  const traceChainFrames = hasToolActivity
    ? traceFrames
    : pendingToolConfirmationFrames;

  const avatarSrc = resolveAvatarSrc(characterAvatar);
  const showImage = Boolean(avatarSrc) && !imageBroken;
  const fallbackInitial = (characterName || "C").charAt(0).toUpperCase();
  const timestamp = formatTimestamp(message.createdAt);

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
      {isAssistant && hasVisibleTraceActivity && (
        <TraceChain
          frames={traceChainFrames}
          status={message.status}
          onToolConfirmationDecision={onToolConfirmationDecision}
          toolConfirmationUiStateById={toolConfirmationUiStateById}
          streamingContent={
            message.status === "streaming" ? message.content : ""
          }
          pendingContinuationRequest={pendingContinuationRequest}
          onContinuationDecision={onContinuationDecision}
        />
      )}
      {isAssistant &&
        !hasVisibleTraceActivity &&
        message.status === "streaming" && (
        <TraceChain
          frames={[]}
          status={message.status}
          onToolConfirmationDecision={onToolConfirmationDecision}
          toolConfirmationUiStateById={toolConfirmationUiStateById}
          pendingContinuationRequest={pendingContinuationRequest}
          onContinuationDecision={onContinuationDecision}
        />
      )}

      {!(isAssistant && hasVisibleTraceActivity && message.status === "streaming") && (
        <div
          style={{
            display: "flex",
            flexDirection: isUser ? "row-reverse" : "row",
            alignItems: "flex-end",
            gap: 8,
            maxWidth: "85%",
          }}
        >
          {isAssistant && (
            <div
              style={{
                position: "relative",
                width: 28,
                height: 28,
                flexShrink: 0,
                alignSelf: "flex-end",
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.04)",
                  border: isDark
                    ? "1px solid rgba(255,255,255,0.10)"
                    : "1px solid rgba(0,0,0,0.08)",
                  color: isDark
                    ? "rgba(255,255,255,0.86)"
                    : "rgba(0,0,0,0.72)",
                  fontSize: 12,
                  fontWeight: 700,
                  fontFamily: "NunitoSans, sans-serif",
                }}
              >
                {showImage ? (
                  <img
                    src={avatarSrc}
                    alt={`${characterName || "character"} avatar`}
                    onError={() => setImageBroken(true)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  fallbackInitial
                )}
              </div>
              {AVAILABILITY_DOT_COLOR[characterAvailability] && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -4,
                    right: -4,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor:
                      AVAILABILITY_DOT_COLOR[characterAvailability],
                    border: `2px solid ${isDark ? "rgb(30,30,30)" : "rgb(255,255,255)"}`,
                    boxSizing: "content-box",
                  }}
                />
              )}
            </div>
          )}

          <div
            style={{
              padding: isUser ? (isEditing ? 0 : "10px 16px") : "10px 14px",
              borderRadius: isUser
                ? "16px 16px 4px 16px"
                : "16px 16px 16px 4px",
              ...(isUser && !isEditing
                ? {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.05)",
                  }
                : {}),
              ...(isAssistant
                ? {
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.04)"
                      : "rgba(0,0,0,0.02)",
                  }
                : {}),
              fontSize: 14,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              lineHeight: 1.6,
              wordBreak: "break-word",
              minWidth: 0,
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

          {timestamp && (
            <span
              style={{
                fontSize: 10.5,
                flexShrink: 0,
                alignSelf: "flex-end",
                color: isDark
                  ? "rgba(255,255,255,0.30)"
                  : "rgba(0,0,0,0.28)",
                fontFamily: "Jost, sans-serif",
                lineHeight: 1,
                paddingBottom: 2,
              }}
            >
              {timestamp}
            </span>
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

const areCharacterChatBubblePropsEqual = (previousProps, nextProps) =>
  previousProps.message === nextProps.message &&
  previousProps.characterName === nextProps.characterName &&
  previousProps.characterAvatar === nextProps.characterAvatar &&
  previousProps.characterAvailability === nextProps.characterAvailability &&
  previousProps.onDeleteMessage === nextProps.onDeleteMessage &&
  previousProps.onResendMessage === nextProps.onResendMessage &&
  previousProps.onEditMessage === nextProps.onEditMessage &&
  previousProps.onToolConfirmationDecision ===
    nextProps.onToolConfirmationDecision &&
  previousProps.toolConfirmationUiStateById ===
    nextProps.toolConfirmationUiStateById &&
  previousProps.pendingToolConfirmationRequests ===
    nextProps.pendingToolConfirmationRequests &&
  previousProps.disableActionButtons === nextProps.disableActionButtons &&
  previousProps.traceFrames === nextProps.traceFrames &&
  previousProps.pendingContinuationRequest ===
    nextProps.pendingContinuationRequest &&
  previousProps.onContinuationDecision === nextProps.onContinuationDecision;

export default memo(CharacterChatBubble, areCharacterChatBubblePropsEqual);
