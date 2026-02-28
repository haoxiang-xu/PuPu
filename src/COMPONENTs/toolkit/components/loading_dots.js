const LoadingDots = ({ isDark }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "56px 0",
      gap: 6,
    }}
  >
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)",
          animation: "toolkit-dot-pulse 1.1s ease-in-out infinite",
          animationDelay: `${i * 0.18}s`,
        }}
      />
    ))}
    <style>{`
      @keyframes toolkit-dot-pulse {
        0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
    `}</style>
  </div>
);

export default LoadingDots;
