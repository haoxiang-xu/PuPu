import { memo, useState, useContext, useEffect, useRef } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import Markdown from "../../BUILTIN_COMPONENTs/markdown/markdown";
import CellSplitSpinner from "../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";

const ChatBubble = ({
  message,
  onDeleteMessage,
  onResendMessage,
  onEditMessage,
  disableActionButtons = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [hovered, setHovered] = useState(false);
  const [assistantRenderMode, setAssistantRenderMode] = useState("markdown");
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    typeof message?.content === "string" ? message.content : "",
  );
  const editTextareaRef = useRef(null);

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
  const showActionBar =
    !isEditing &&
    (showAssistantRenderToggle ||
      canEditMessage ||
      canResendMessage ||
      canDeleteMessage);
  const color = theme?.color || "#222";
  const isSubmitDisabled = disableActionButtons || editDraft.trim().length === 0;

  useEffect(() => {
    if (!isEditing) {
      setEditDraft(typeof message?.content === "string" ? message.content : "");
    }
  }, [isEditing, message?.content, message?.id]);

  useEffect(() => {
    if (!isEditing || !editTextareaRef.current) {
      return;
    }

    editTextareaRef.current.focus();
    const cursorPosition = editTextareaRef.current.value?.length || 0;
    editTextareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
  }, [isEditing]);

  const handleStartEdit = () => {
    if (!canEditMessage || disableActionButtons) {
      return;
    }

    setEditDraft(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditDraft(typeof message?.content === "string" ? message.content : "");
    setIsEditing(false);
  };

  const handleSubmitEdit = () => {
    const nextContent = typeof editDraft === "string" ? editDraft.trim() : "";
    if (!canEditMessage || disableActionButtons || !nextContent) {
      return;
    }

    onEditMessage(message, nextContent);
    setIsEditing(false);
  };

  const handleEditKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // During IME composition (e.g. Chinese/Japanese input), Enter confirms
      // the candidate word — do not submit yet.
      if (e.nativeEvent?.isComposing || e.isComposing) return;
      e.preventDefault();
      handleSubmitEdit();
    }
  };

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
      {/* ── message content ─────────────────────────────── */}
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
          isEditing ? (
            <FloatingTextField
              textarea_ref={editTextareaRef}
              value={editDraft}
              min_rows={2}
              max_display_rows={8}
              set_value={setEditDraft}
              placeholder="Edit message..."
              on_key_down={handleEditKeyDown}
              functional_section={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    marginRight: -6,
                    marginBottom: -6,
                  }}
                >
                  <Button
                    label="Cancel"
                    disabled={disableActionButtons}
                    onClick={handleCancelEdit}
                    style={{ color, fontSize: 12, opacity: 0.75 }}
                  />
                  <Button
                    label="Submit"
                    postfix_icon="arrow_right"
                    disabled={isSubmitDisabled}
                    onClick={handleSubmitEdit}
                    style={{
                      color,
                      fontSize: 12,
                      opacity: isSubmitDisabled ? 0.35 : 0.9,
                    }}
                  />
                </div>
              }
              style={{ width: "100%", margin: 0, borderRadius: 14 }}
            />
          ) : (
            <span>{message.content}</span>
          )
        ) : message.status === "streaming" && !message.content ? (
          <div style={{ padding: "8px 0" }}>
            <CellSplitSpinner
              size={28}
              cells={5}
              speed={0.9}
              spread={1}
              stagger={120}
              spin={true}
              spinSpeed={0.6}
            />
          </div>
        ) : isRawTextMode ? (
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontFamily: theme?.font?.fontFamily || "inherit",
              fontSize: 14,
              lineHeight: 1.6,
              color: theme?.color || "#222",
            }}
          >
            {message.content}
          </pre>
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
      {showActionBar && (
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
          {showAssistantRenderToggle && (
            <Button
              prefix_icon={isRawTextMode ? "markdown" : "text"}
              disabled={disableActionButtons}
              onClick={() =>
                setAssistantRenderMode((previousMode) =>
                  previousMode === "markdown" ? "raw_text" : "markdown",
                )
              }
              style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}
            />
          )}
          {canEditMessage && (
            <Button
              prefix_icon="edit"
              disabled={disableActionButtons}
              onClick={handleStartEdit}
              style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}
            />
          )}
          {canResendMessage && (
            <Button
              prefix_icon="update"
              disabled={disableActionButtons}
              onClick={() => onResendMessage(message)}
              style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}
            />
          )}
          {canDeleteMessage && (
            <Button
              prefix_icon="delete"
              disabled={disableActionButtons}
              onClick={() => onDeleteMessage(message)}
              style={{ color, fontSize: 14, iconSize: 14, opacity: 0.5 }}
            />
          )}
        </div>
      )}
    </div>
  );
};

const areChatBubblePropsEqual = (previousProps, nextProps) =>
  previousProps.message === nextProps.message &&
  previousProps.onDeleteMessage === nextProps.onDeleteMessage &&
  previousProps.onResendMessage === nextProps.onResendMessage &&
  previousProps.onEditMessage === nextProps.onEditMessage &&
  previousProps.disableActionButtons === nextProps.disableActionButtons;

export default memo(ChatBubble, areChatBubblePropsEqual);
