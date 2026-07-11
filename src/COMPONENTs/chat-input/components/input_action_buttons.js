import Button from "../../../BUILTIN_COMPONENTs/input/button";

const InputActionButtons = ({
  value,
  color,
  isDark,
  isStreaming,
  sendDisabled,
  onClear,
  onSend,
  onStop,
}) => {
  const hasText = value.length > 0;
  // During streaming the send button interjects the typed text; it only
  // appears once there is something to send, and Stop stays available.
  const showSend = !isStreaming || hasText;
  const primaryStyle = {
    root: {
      background: isDark ? "rgba(255,255,255,0.88)" : "rgba(28,28,28,0.86)",
      color: isDark ? "#111" : "#eee",
      padding: 6,
      fontSize: 18,
      borderRadius: 22,
      iconOnlyPaddingVertical: 4,
      iconOnlyPaddingHorizontal: 4,
    },
    hoverBackgroundColor: isDark
      ? "rgba(0,0,0,0.07)"
      : "rgba(255,255,255,0.09)",
    activeBackgroundColor: isDark
      ? "rgba(0,0,0,0.14)"
      : "rgba(255,255,255,0.18)",
  };
  // Stop is a quieter secondary control when it sits next to Send.
  const stopStyle = {
    root: {
      color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.75)",
      padding: 6,
      fontSize: 18,
      borderRadius: 22,
      iconOnlyPaddingVertical: 4,
      iconOnlyPaddingHorizontal: 4,
    },
    hoverBackgroundColor: isDark
      ? "rgba(255,255,255,0.18)"
      : "rgba(0,0,0,0.14)",
    activeBackgroundColor: isDark
      ? "rgba(255,255,255,0.24)"
      : "rgba(0,0,0,0.2)",
  };

  return (
    <div
      style={{
        margin: -6,
        display: "flex",
        alignItems: "center",
        /* VISUALLY even spacing: the clear/stop glyphs sit ~10px inside
           their hit boxes while the send circle fills its box to the edge.
           gap 10 + a -10 pull on stop (when clear is present) lands every
           visible glyph-edge gap at ~21px. */
        gap: 10,
      }}
    >
      {hasText && (
        <Button
          prefix_icon="close"
          style={{
            color,
            padding: 6,
            fontSize: 18,
            borderRadius: 22,
            iconOnlyPaddingVertical: 4,
            iconOnlyPaddingHorizontal: 4,
          }}
          onClick={onClear}
        />
      )}
      {isStreaming && (
        <Button
          prefix_icon="stop_mini_filled"
          onClick={onStop}
          style={
            showSend
              ? {
                  ...stopStyle,
                  root: {
                    ...stopStyle.root,
                    marginLeft: hasText ? -10 : 0,
                  },
                }
              : primaryStyle
          }
        />
      )}
      {showSend && (
        <Button
          prefix_icon="arrow_up"
          onClick={onSend}
          disabled={sendDisabled}
          style={{
            ...primaryStyle,
            root: { ...primaryStyle.root, opacity: sendDisabled ? 0.35 : 1 },
          }}
        />
      )}
    </div>
  );
};

export default InputActionButtons;
