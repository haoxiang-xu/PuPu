import React from "react";

/* The detail panel's one vocabulary, for the parts drawn outside the Agent
   timeline: one quiet fill for every control and row, 8px corners, no
   outlines; a label on the left with its value on the right; red only for
   what is wrong. The captions themselves are `Block` in process_timeline. */

export const fill = (isDark) => (isDark ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.045)");
/* A step stronger, for what is chosen inside a filled row. */
export const fillStrong = (isDark) => (isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.085)");
export const muted = (isDark) => (isDark ? "#a6a6af" : "#686870");
export const text = (isDark) => (isDark ? "#eeeef1" : "#26262c");
export const errorColor = (isDark) => (isDark ? "#ff8c8c" : "#b02020");

/* The panel's switches: Settings' SemiSwitch at 0.85 of its 56×28, themed by
   the switch itself — no colours passed. Size goes through width/height
   because the switch derives its geometry from them. */
export const PANEL_SWITCH = Object.freeze({ width: 48, height: 24 });

/* A filled control: the selects, inputs and boxes of the panel. */
export const fieldFill = (isDark) => ({ backgroundColor: fill(isDark), border: "1px solid transparent" });

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
