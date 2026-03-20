import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import {
  STATUS_CONFIG,
  SOURCE_KIND_CONFIG,
  RUNTIME_CONFIG,
} from "../constants";

/* ── Small pill badge ── */
export const Badge = ({ label, color, bg, style }) => (
  <span
    style={{
      fontSize: 10,
      fontFamily: "Jost",
      fontWeight: 500,
      letterSpacing: "0.4px",
      textTransform: "lowercase",
      padding: "1px 7px",
      borderRadius: 999,
      backgroundColor: bg,
      color: color,
      lineHeight: 1.8,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {label}
  </span>
);

/* ── Status badge ── */
export const StatusBadge = ({ status, style }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} style={style} />
  );
};

/* ── Source kind badge ── */
export const SourceBadge = ({ sourceKind, style }) => {
  const cfg = SOURCE_KIND_CONFIG[sourceKind] || SOURCE_KIND_CONFIG.manual;
  return (
    <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} style={style} />
  );
};

/* ── Runtime badge ── */
export const RuntimeBadge = ({ runtime, style }) => {
  const cfg = RUNTIME_CONFIG[runtime] || RUNTIME_CONFIG.local;
  return (
    <Badge label={cfg.label} color={cfg.color} bg={cfg.bg} style={style} />
  );
};

/* ── Verification badge with icon ── */
export const VerificationBadge = ({ verification, isDark }) => {
  if (verification === "verified") {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          fontSize: 10,
          fontFamily: "Jost",
          fontWeight: 500,
          color: "#34d399",
        }}
      >
        <Icon
          src="verified"
          style={{ width: 12, height: 12 }}
          color="#34d399"
        />
        Verified
      </span>
    );
  }
  return null;
};

/* ── Action button (small, borderless) ── */
export const ActionButton = ({
  icon,
  label,
  onClick,
  isDark,
  disabled,
  color,
  style,
}) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "5px 11px",
      borderRadius: 7,
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "Jost, sans-serif",
      fontSize: 12,
      fontWeight: 500,
      color: disabled
        ? isDark
          ? "rgba(255,255,255,0.2)"
          : "rgba(0,0,0,0.2)"
        : color || (isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.65)"),
      background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      opacity: disabled ? 0.5 : 1,
      transition: "background 0.15s ease",
      outline: "none",
      ...style,
    }}
  >
    {icon && (
      <Icon
        src={icon}
        style={{ width: 13, height: 13 }}
        color={
          disabled
            ? isDark
              ? "rgba(255,255,255,0.2)"
              : "rgba(0,0,0,0.2)"
            : color || (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)")
        }
      />
    )}
    {label}
  </button>
);

/* ── Primary action button ── */
export const PrimaryButton = ({
  icon,
  label,
  onClick,
  disabled,
  loading,
  style,
}) => (
  <button
    onClick={disabled || loading ? undefined : onClick}
    disabled={disabled || loading}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "8px 18px",
      borderRadius: 8,
      border: "none",
      cursor: disabled || loading ? "not-allowed" : "pointer",
      fontFamily: "Jost, sans-serif",
      fontSize: 13,
      fontWeight: 600,
      color: "#fff",
      background: disabled ? "rgba(96,165,250,0.35)" : "rgba(96,165,250,0.85)",
      transition: "background 0.15s ease, opacity 0.15s ease",
      outline: "none",
      opacity: loading ? 0.7 : 1,
      ...style,
    }}
  >
    {loading ? (
      <span
        style={{
          width: 14,
          height: 14,
          border: "2px solid rgba(255,255,255,0.3)",
          borderTopColor: "#fff",
          borderRadius: "50%",
          animation: "mcp-spin 0.7s linear infinite",
          display: "inline-block",
        }}
      />
    ) : icon ? (
      <Icon src={icon} style={{ width: 14, height: 14 }} color="#fff" />
    ) : null}
    {label}
    <style>{`
      @keyframes mcp-spin {
        to { transform: rotate(360deg); }
      }
    `}</style>
  </button>
);

/* ── Section label / divider ── */
export const SectionLabel = ({ children, isDark, style }) => (
  <div
    style={{
      fontSize: 11,
      fontFamily: "Jost, sans-serif",
      fontWeight: 600,
      letterSpacing: "0.5px",
      textTransform: "uppercase",
      color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
      padding: "4px 0",
      ...style,
    }}
  >
    {children}
  </div>
);

/* ── Form field wrapper ── */
export const FormField = ({ label, required, hint, children, isDark }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span
        style={{
          fontSize: 12,
          fontFamily: "Jost, sans-serif",
          fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </span>
      {required && (
        <span style={{ color: "#f87171", fontSize: 12, lineHeight: 1 }}>*</span>
      )}
    </div>
    {children}
    {hint && (
      <span
        style={{
          fontSize: 11,
          fontFamily: "Jost, sans-serif",
          color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
        }}
      >
        {hint}
      </span>
    )}
  </div>
);

/* ── Text input for forms ── */
export const FormInput = ({
  value,
  onChange,
  placeholder,
  type,
  isDark,
  disabled,
  style,
}) => (
  <input
    type={type || "text"}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    style={{
      width: "100%",
      padding: "7px 10px",
      fontSize: 13,
      fontFamily: "Jost",
      border: `1px solid ${
        isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
      }`,
      borderRadius: 7,
      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      color: isDark ? "#fff" : "#222",
      outline: "none",
      boxSizing: "border-box",
      ...style,
    }}
  />
);

/* ── Textarea for forms ── */
export const FormTextarea = ({
  value,
  onChange,
  placeholder,
  isDark,
  rows,
  style,
}) => (
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows || 4}
    style={{
      width: "100%",
      padding: "7px 10px",
      fontSize: 13,
      fontFamily: "JetBrains Mono, monospace",
      border: `1px solid ${
        isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
      }`,
      borderRadius: 7,
      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      color: isDark ? "#fff" : "#222",
      outline: "none",
      boxSizing: "border-box",
      resize: "vertical",
      lineHeight: 1.55,
      ...style,
    }}
  />
);
