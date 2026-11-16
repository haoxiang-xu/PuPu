import React, { useContext } from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { DETAIL_INSET, DetailChromeContext } from "../canvas_chrome";
import { TOP_BAR_HEIGHT } from "../../../../../BUILTIN_COMPONENTs/electron/title_bar";

/* From the toggle's centre to the next button's, the left side menu's step. */
const TOGGLE_ROW_STEP = 30;

/* The detail panel's fixed header: a coloured tile with the icon of what is
   open, its name, one line under it, and a hairline where the scrolling body
   begins. A node's panel and the Test panel wear the same one, so the right
   side always says what it is showing in the same place.

   `actions` sit at the end of the row, before the docked toggle's reserve.
   `toggleRowAction` sits on the panel toggle's own row, beside it: in the
   title bar on macOS (left of the pinned toggle), and in the band above the
   header elsewhere (right of its close button). */
export default function PanelHeader({ icon, tint, title, subtitle, actions, toggleRowAction, isDark, testid = "recipe-detail-panel-header" }) {
  /* Set by the docked panel on macOS: the header shares the title bar's row. */
  const titleRow = useContext(DetailChromeContext);
  const rule = `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`;
  return (
    <div
      data-testid={testid}
      style={titleRow ? {
        position: "relative",
        /* At the top of the rounded panel, beside the pinned toggle: the icon
           sits as far from the panel's top as from its left (16px; the 36px
           title block centres the 26px icon 5px down, hence 11), the text
           stops short of the toggle, and the row drags the window as the
           title bar did. */
        flexShrink: 0, display: "flex", alignItems: "center", gap: 10,
        /* A button beside the toggle widens the room kept clear for it. */
        padding: `11px ${titleRow.toggleReserve + (toggleRowAction ? TOGGLE_ROW_STEP : 0)}px 12px 16px`, borderBottom: rule, WebkitAppRegion: "drag",
      } : {
        position: "relative", flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 12px", borderBottom: rule,
      }}
    >
      <div style={{ width: 26, height: 26, borderRadius: 7, background: tint, display: "flex",
        alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon src={icon} color="#fff" style={{ width: 14, height: 14 }} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "#e6e6e6" : "#222",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "#86868b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {subtitle}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, WebkitAppRegion: "no-drag" }}>
          {actions}
        </div>
      )}
      {toggleRowAction && (
        <div data-testid={`${testid}-toggle-row-action`} style={{ position: "absolute", WebkitAppRegion: "no-drag", display: "flex",
          ...(titleRow
            ? { top: TOP_BAR_HEIGHT / 2 - DETAIL_INSET, right: TOP_BAR_HEIGHT / 2 - DETAIL_INSET + TOGGLE_ROW_STEP, transform: "translate(50%, -50%)" }
            : { top: -(TOP_BAR_HEIGHT - DETAIL_INSET) / 2, left: TOP_BAR_HEIGHT / 2 + TOGGLE_ROW_STEP, transform: "translate(-50%, -50%)" }) }}>
          {toggleRowAction}
        </div>
      )}
    </div>
  );
}
