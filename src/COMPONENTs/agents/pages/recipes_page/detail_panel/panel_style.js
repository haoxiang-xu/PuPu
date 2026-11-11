import React from "react";

/* The detail panel's one vocabulary, for the parts drawn outside the Agent
   timeline. A background means a region: one soft surface per group of rows,
   barely off the panel in the dark and brighter than it in the light. An
   outline means a control you type into or pick from. Rows inside a region
   are split by a hairline, never by a block of their own; a label on the left
   with its value on the right; red only for what is wrong. The captions
   themselves are `Block` in process_timeline. */

/* A region's surface. The light panel is washed (`panelWash`) so the surface
   colour reads as the brighter of the two. */
export const fill = (isDark) => (isDark ? "rgba(255,255,255,0.035)" : "var(--pupu-surface, #ffffff)");
/* What is chosen inside a region or a control. */
export const fillStrong = (isDark) => (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)");
/* The wash under the whole light panel; the dark panel needs none. */
export const panelWash = (isDark) => (isDark ? "transparent" : "rgba(0,0,0,0.05)");
/* Between the rows of one region. */
export const hairline = (isDark) => (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)");
/* Around a control. */
export const fieldBorder = (isDark) => (isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)");
export const muted = (isDark) => (isDark ? "#a6a6af" : "#686870");
export const text = (isDark) => (isDark ? "#eeeef1" : "#26262c");
export const errorColor = (isDark) => (isDark ? "#ff8c8c" : "#b02020");

/* The panel's switches: Settings' SemiSwitch at 0.85 of its 56×28, themed by
   the switch itself — no colours passed. Size goes through width/height
   because the switch derives its geometry from them. */
export const PANEL_SWITCH = Object.freeze({ width: 48, height: 24 });

/* A control: the selects, inputs and boxes of the panel. Outlined, not
   filled — the name is kept for its many call sites. */
export const fieldFill = (isDark) => ({ backgroundColor: "transparent", border: `1px solid ${fieldBorder(isDark)}` });

/* One region: its rows share a single soft surface and a hairline between
   them. A row brings its own padding and no background. */
export function Region({ isDark, children, testid, style }) {
  const rows = React.Children.toArray(children);
  if (rows.length === 0) return null;
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0, borderRadius: 10,
      background: fill(isDark), ...style }}>
      {rows.map((row, index) => (
        <div key={row.key ?? index} style={{ minWidth: 0, display: "flex", flexDirection: "column",
          borderTop: index > 0 ? `1px solid ${hairline(isDark)}` : "none" }}>{row}</div>
      ))}
    </div>
  );
}

export const note = (isDark) => ({ fontSize: 11.5, lineHeight: 1.45, color: muted(isDark), overflowWrap: "anywhere" });
export const problem = (isDark) => ({ fontSize: 11.5, lineHeight: 1.45, color: errorColor(isDark), overflowWrap: "anywhere" });

/* A secondary action that sits at the end of a list, left aligned. */
export const addButtonStyle = (isDark) => ({
  alignSelf: "flex-start", fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 5, color: muted(isDark),
});

/* The in-row way out, the same as a variable row's. */
export const removeButtonStyle = (isDark) => ({
  flexShrink: 0, width: 22, height: 22, borderRadius: 6, backgroundColor: "transparent", color: muted(isDark), opacity: 0.75,
  iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, content: { icon: { width: 13, height: 13 } },
});

/* What it is on the left, its value on the right. */
export function SettingRow({ label, isDark, children, testid }) {
  return (
    <div data-testid={testid} style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 30, minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: "18px", color: isDark ? "#c9c9cf" : "#3a3a40",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {children}
    </div>
  );
}

/* The panel's one heading, as a constant for sections that style it without
   knowing the theme: small spaced capitals in the text colour, quiet. */
export const CAPTION_TEXT = Object.freeze({
  fontSize: 11, fontWeight: 400, textTransform: "uppercase", letterSpacing: "1.5px", lineHeight: "18px",
  color: "var(--pupu-text, currentColor)", opacity: 0.4,
});
