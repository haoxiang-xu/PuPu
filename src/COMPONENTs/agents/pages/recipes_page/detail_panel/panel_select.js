import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { FIELD_RADIUS, fieldFill } from "./panel_style";

// The Attach Panel's palette menu, as a detail panel control: the panel's
// white field (no hover highlight), its corners, text and arrow grouped on
// the right.
// A call site may ask for smaller corners (`radius`) or its text read from
// the left (`align`), as the If / Else rows do; the default is unchanged.
export default function PanelSelect({ style, radius = FIELD_RADIUS, align = "right", ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    ...fieldFill(isDark),
    boxSizing: "border-box",
    ...style,
    borderRadius: radius,
    justifyContent: align === "left" ? "flex-start" : "flex-end",
    textAlign: align,
  }} />;
}
