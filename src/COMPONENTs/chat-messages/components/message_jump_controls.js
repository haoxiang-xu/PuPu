import Button from "../../../BUILTIN_COMPONENTs/input/button";

const MessageJumpControls = ({
  messagesCount,
  isAtBottom,
  isAtTop,
  onSkipToTop,
  onJumpToPreviousMessage,
  onBackToBottom,
  attachPanelBg,
  isDark,
  color,
}) => {
  if (!messagesCount || messagesCount <= 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        right: "max(40px, calc(50% - 370px))",
        bottom: 12,
        zIndex: 2,
        opacity: !isAtBottom ? 1 : 0,
        transform: !isAtBottom ? "translateY(0)" : "translateY(8px)",
        transition:
          "opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: !isAtBottom ? "auto" : "none",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "3px",
          borderRadius: 16,
          backgroundColor: attachPanelBg,
          boxShadow: isDark
            ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
            : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
          transition: "background-color 0.22s ease, box-shadow 0.22s ease",
        }}
      >
        {!isAtTop && (
          <>
            <Button
              prefix_icon="skip_up"
              onClick={onSkipToTop}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
            <Button
              prefix_icon="arrow_up"
              onClick={onJumpToPreviousMessage}
              style={{
                color,
                fontSize: 12,
                iconSize: 12,
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 6,
              }}
            />
          </>
        )}
        <Button
          prefix_icon="skip_down"
          onClick={onBackToBottom}
          style={{
            color,
            fontSize: 12,
            iconSize: 12,
            borderRadius: 14,
            paddingVertical: 6,
            paddingHorizontal: 6,
          }}
        />
      </div>
    </div>
  );
};

export default MessageJumpControls;
