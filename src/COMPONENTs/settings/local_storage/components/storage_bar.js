const StorageBar = ({ ratio, isDark }) => (
  <div
    style={{
      width: 64,
      height: 3,
      borderRadius: 99,
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
      overflow: "hidden",
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: `${Math.max(ratio * 100, 3)}%`,
        height: "100%",
        borderRadius: 99,
        backgroundColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.30)",
        transition: "width 0.3s ease",
      }}
    />
  </div>
);

export default StorageBar;
