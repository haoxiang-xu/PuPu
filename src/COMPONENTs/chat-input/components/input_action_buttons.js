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
  return (
    <div
      style={{
        margin: -6,
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      {value.length > 0 && !isStreaming && (
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
      {isStreaming ? (
        <Button
          prefix_icon="stop_mini_filled"
          onClick={onStop}
          style={{
            root: {
              background: isDark
                ? "rgba(255,255,255,0.88)"
                : "rgba(28,28,28,0.86)",
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
          }}
        />
      ) : (
        <Button
          prefix_icon="arrow_up"
          onClick={onSend}
          disabled={sendDisabled}
          style={{
            root: {
              background: isDark
                ? "rgba(255,255,255,0.88)"
                : "rgba(28,28,28,0.86)",
              color: isDark ? "#111" : "#eee",
              padding: 6,
              fontSize: 18,
              borderRadius: 22,
              opacity: sendDisabled ? 0.35 : 1,
              iconOnlyPaddingVertical: 4,
              iconOnlyPaddingHorizontal: 4,
            },
            hoverBackgroundColor: isDark
              ? "rgba(0,0,0,0.07)"
              : "rgba(255,255,255,0.09)",
            activeBackgroundColor: isDark
              ? "rgba(0,0,0,0.14)"
              : "rgba(255,255,255,0.18)",
          }}
        />
      )}
    </div>
  );
};

export default InputActionButtons;
