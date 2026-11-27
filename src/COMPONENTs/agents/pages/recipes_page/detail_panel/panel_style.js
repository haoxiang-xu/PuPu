import React from "react";

/* The detail panel's one vocabulary, for the parts drawn outside the Agent
   timeline. A background means a region: one soft surface per group of rows,
   barely off the panel. A white,
   borderless field means a control you type into or pick from. Rows inside a region
   are split by a hairline, never by a block of their own; a label on the left
   with its value on the right; red only for what is wrong. The captions
   themselves are `Block` in process_timeline. */

/* A region's surface. The panel is see-through glass, so in the light an
   opaque surface colour is the brighter of the two; in the dark a faint lift
   is enough. The panel's own background is the shell's and is never tinted
   from here. */
export const fill = (isDark) => (isDark ? "rgba(255,255,255,0.035)" : "var(--pupu-surface, #ffffff)");
/* What is chosen inside a region or a control. */
export const fillStrong = (isDark) => (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.07)");
/* Between the rows of one region. */
export const hairline = (isDark) => (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)");
/* Around a control. */
export const fieldBorder = (isDark) => (isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.13)");
export const muted = (isDark) => (isDark ? "#a6a6af" : "#686870");
export const text = (isDark) => (isDark ? "#eeeef1" : "#26262c");
export const errorColor = (isDark) => (isDark ? "#ff8c8c" : "#b02020");
/* A state's colour, for a dot or a word beside it: done, needs you, busy,
   wrong, and nothing yet. */
export const statusColor = (tone, isDark) => ({
  good: isDark ? "#4ade80" : "#16a34a",
  wait: isDark ? "#fbbf24" : "#c27a05",
  busy: isDark ? "#60a5fa" : "#3b63d8",
  bad: errorColor(isDark),
}[tone] || muted(isDark));

/* The panel's switches: Settings' SemiSwitch at 0.85 of its 56×28, themed by
   the switch itself — no colours passed. Size goes through width/height
   because the switch derives its geometry from them. */
export const PANEL_SWITCH = Object.freeze({ width: 48, height: 24 });

/* The panel's corners, in named steps — use these, not a number.
   - CONTROL_RADIUS: anything you type into, pick from or press inside a
     region (inputs, selects, small buttons, tags). The same corner as the
     canvas tags, so a select beside a node tag reads as one family.
   - REGION_RADIUS: a soft surface that groups rows, and a multi-line box.
   A pill (a help dot, a chip) is fully round, 999. */
export const CONTROL_RADIUS = 6;
export const REGION_RADIUS = 10;
export const FIELD_RADIUS = CONTROL_RADIUS;
/* One height for every single-line control, so a select and the box beside
   it share a row line. */
export const CONTROL_HEIGHT = 26;
/* A picker that chooses what a node is about — the Agent's Model, a Workflow
   Call's Workflow, a Skill Read's skill: one measure for all of them, a
   200px field 34 high (it still shrinks in a narrow panel), the icon and
   name at the start, the arrow at the end. Spread into a PanelSelect. */
export const PICKER_WIDTH = 200;
export const PICKER_HEIGHT = 34;
export const pickerSelectProps = Object.freeze({
  align: "left",
  trigger_wrapper_style: { display: "inline-flex", width: "100%", minWidth: 0 },
  trigger_label_style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textAlign: "left" },
  style: { width: "100%", maxWidth: "100%", height: PICKER_HEIGHT, fontSize: 12.5, paddingVertical: 0, paddingHorizontal: 12 },
});
export const pickerSlotStyle = Object.freeze({ display: "inline-flex", width: PICKER_WIDTH, minWidth: 0, maxWidth: "100%" });

/* Inside a control: white in the light (the theme's surface), a faint lift in
   the dark — only a step above a region's 3.5%, so it does not glare. */
export const fieldBackground = (isDark) => (isDark ? "rgba(255,255,255,0.045)" : "var(--pupu-surface, #ffffff)");

/* A control: the selects, inputs and boxes of the panel. One white field, no
   border (a transparent 1px keeps every size where it was), the regions'
   corners, and nothing that changes on hover or focus — no fill, no shadow,
   no border; the caret marks focus. The hover/active keys are read by
   Button, Select and the model picker; the overlay variables by Input. */
export const fieldFill = (isDark) => ({
  backgroundColor: fieldBackground(isDark),
  border: "1px solid transparent",
  borderRadius: FIELD_RADIUS,
  boxShadow: "none",
  hoverBackgroundColor: fieldBackground(isDark),
  activeBackgroundColor: fieldBackground(isDark),
  "--pupu-overlay-hover": "transparent",
  "--pupu-overlay-active": "transparent",
});
/* The same field for the multi-line TextField (a prompt, the code, JSON),
   which takes its fill and outline through its own opt-in keys. A box that
   tall is a surface the size of a region, so it wears a region's corners. */
export const textFieldFill = (isDark) => ({
  borderRadius: REGION_RADIUS,
  restFill: fieldBackground(isDark),
  restBorder: "1px solid transparent",
});

/* One region: its rows share a single soft surface and a hairline between
   them. A row brings its own padding and no background. */
export function Region({ isDark, children, testid, style }) {
  const rows = React.Children.toArray(children);
  if (rows.length === 0) return null;
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0, borderRadius: REGION_RADIUS,
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
  alignSelf: "flex-start", fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: CONTROL_RADIUS, color: muted(isDark),
});

/* The one thing a panel is for, when it has one (Run, Send): filled in the
   text colour, so it is the darkest thing in the panel in the light and the
   brightest in the dark, at a control's corners. */
export const primaryButtonStyle = (isDark) => ({
  fontSize: 12.5, fontWeight: 500, paddingVertical: 7, paddingHorizontal: 14, borderRadius: CONTROL_RADIUS,
  color: isDark ? "#1b1b1f" : "#ffffff", backgroundColor: text(isDark),
  hoverBackgroundColor: isDark ? "#ffffff" : "#000000", activeBackgroundColor: isDark ? "#d6d6dc" : "#3a3a40",
  content: { icon: { color: isDark ? "#1b1b1f" : "#ffffff" } },
});

/* The in-row way out, the same as a variable row's. */
export const removeButtonStyle = (isDark) => ({
  flexShrink: 0, width: 22, height: 22, borderRadius: CONTROL_RADIUS, backgroundColor: "transparent", color: muted(isDark), opacity: 0.75,
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
