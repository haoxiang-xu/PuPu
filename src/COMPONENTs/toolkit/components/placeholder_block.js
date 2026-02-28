import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const PlaceholderBlock = ({ icon, title, subtitle, isDark }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      gap: 12,
      textAlign: "center",
    }}
  >
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
      }}
    >
      <Icon
        src={icon}
        style={{ width: 22, height: 22 }}
        color={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
      />
    </div>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "NunitoSans, sans-serif",
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
      }}
    >
      {title}
    </div>
    {subtitle && (
      <div
        style={{
          fontSize: 12,
          fontFamily: "Jost, sans-serif",
          color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
          maxWidth: 280,
          lineHeight: 1.55,
        }}
      >
        {subtitle}
      </div>
    )}
  </div>
);

export default PlaceholderBlock;
