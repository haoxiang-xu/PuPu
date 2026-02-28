import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

const SegmentedControl = ({ sections, selected, onChange, isDark }) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      }}
    >
      {sections.map((s) => {
        const isActive = s.key === selected;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 13px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontFamily: "Jost, sans-serif",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: "0.1px",
              color: isActive
                ? isDark
                  ? "#fff"
                  : "#111"
                : isDark
                  ? "rgba(255,255,255,0.42)"
                  : "rgba(0,0,0,0.42)",
              background: isActive
                ? isDark
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(255,255,255,0.92)"
                : "transparent",
              boxShadow: isActive
                ? isDark
                  ? "0 1px 4px rgba(0,0,0,0.45)"
                  : "0 1px 4px rgba(0,0,0,0.10)"
                : "none",
              transition:
                "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
              outline: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Icon
              src={s.icon}
              style={{ width: 13, height: 13, flexShrink: 0 }}
              color={
                isActive
                  ? isDark
                    ? "#fff"
                    : "#111"
                  : isDark
                    ? "rgba(255,255,255,0.38)"
                    : "rgba(0,0,0,0.38)"
              }
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
};

export default SegmentedControl;
