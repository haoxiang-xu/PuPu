import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * CommandTag — the inline chip a slash command renders as inside the chat
 * input (e.g. "/btw"). Purely presentational: the command itself still lives
 * as the `"/btw "` prefix of the input's value string; chat_input strips it
 * from the textarea display and mounts this chip via FloatingTextField's
 * `leading_component` slot instead.
 */
const CommandTag = ({ name, icon, onRemove = () => {}, isDark = false }) => {
  const bg = isDark ? "rgba(120,200,150,0.16)" : "rgba(40,150,80,0.12)";
  const border = isDark
    ? "1px solid rgba(120,210,150,0.35)"
    : "1px solid rgba(35,150,85,0.3)";
  const color = isDark ? "rgba(160,230,180,0.95)" : "rgba(25,125,65,0.95)";

  return (
    <span
      data-command-tag={name}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "1px 4px 1px 7px",
        borderRadius: 7,
        backgroundColor: bg,
        border,
        color,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {icon ? (
        <span
          style={{
            width: 12,
            height: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon src={icon} color={color} style={{ width: 12, height: 12 }} />
        </span>
      ) : null}
      {name}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          padding: 0,
          margin: 0,
          border: "none",
          borderRadius: 4,
          background: "transparent",
          color,
          fontSize: 11,
          lineHeight: 1,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </span>
  );
};

export default CommandTag;
