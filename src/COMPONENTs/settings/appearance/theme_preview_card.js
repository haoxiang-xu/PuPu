/* Mini chat mock painted directly from a resolved semantic palette.
   Inline colors only — never writes global CSS vars, so editing the
   non-active mode previews here without touching the real app shell. */
const ThemePreviewCard = ({ palette }) => {
  if (!palette) return null;
  const p = palette;
  return (
    <div
      data-testid="theme-preview-card"
      style={{
        display: "flex",
        width: "100%",
        height: 120,
        borderRadius: 10,
        overflow: "hidden",
        border: `1px solid ${p.border}`,
        backgroundColor: p.background,
        marginBottom: 12,
      }}
    >
      <div
        data-testid="theme-preview-sidebar"
        style={{
          width: 72,
          flexShrink: 0,
          backgroundColor: p.sidebar,
          borderRight: `1px solid ${p.border}`,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ height: 8, borderRadius: 4, backgroundColor: p.accent, opacity: 0.9 }} />
        <div style={{ height: 8, borderRadius: 4, backgroundColor: p.textMuted, opacity: 0.35 }} />
        <div style={{ height: 8, borderRadius: 4, backgroundColor: p.textMuted, opacity: 0.35 }} />
      </div>
      <div style={{ flex: 1, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          data-testid="theme-preview-bubble"
          style={{
            backgroundColor: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: 8,
            padding: "6px 10px",
            maxWidth: "85%",
          }}
        >
          <div style={{ fontSize: 11, color: p.text, lineHeight: 1.5 }}>The quick brown fox</div>
          <div style={{ fontSize: 10, color: p.textMuted, lineHeight: 1.5 }}>muted caption text</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            data-testid="theme-preview-accent"
            style={{
              backgroundColor: p.accent,
              color: p.background,
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 6,
              padding: "3px 10px",
            }}
          >
            Action
          </span>
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: p.success }} />
          <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: p.danger }} />
        </div>
      </div>
    </div>
  );
};

export default ThemePreviewCard;
