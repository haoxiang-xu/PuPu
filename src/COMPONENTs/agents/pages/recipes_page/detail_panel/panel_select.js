import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { CONTROL_HEIGHT, FIELD_RADIUS, fieldFill } from "./panel_style";

// The Attach Panel's palette menu, as a detail panel control: the panel's
// white field (no hover highlight), its corners, text and arrow grouped on
// the right.
// One height (CONTROL_HEIGHT) and the panel's control corners unless a call
// site says otherwise. A select in a column of fields reads from the left
// (`align`), as the If / Else and Parameters rows do; a setting row's value
// stays on the right, under its label's line.
export default function PanelSelect({ style, radius = FIELD_RADIUS, align = "right", ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    ...fieldFill(isDark),
    boxSizing: "border-box",
    height: CONTROL_HEIGHT,
    ...style,
    borderRadius: radius,
    justifyContent: align === "left" ? "flex-start" : "flex-end",
    textAlign: align,
  }} />;
}
