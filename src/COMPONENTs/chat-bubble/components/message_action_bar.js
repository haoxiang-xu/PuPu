import Button from "../../../BUILTIN_COMPONENTs/input/button";

const MessageActionBar = ({
  showActionBar,
  hovered,
  isUser,
  showAssistantRenderToggle,
  isRawTextMode,
  disableActionButtons,
  setAssistantRenderMode,
  canEditMessage,
  handleStartEdit,
  canResendMessage,
  onResendMessage,
  message,
  canDeleteMessage,
  onDeleteMessage,
  color,
}) => {
  if (!showActionBar) {
    return null;
  }

  return (
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
          prefix_icon="edit_pen"
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
  );
};

export default MessageActionBar;
