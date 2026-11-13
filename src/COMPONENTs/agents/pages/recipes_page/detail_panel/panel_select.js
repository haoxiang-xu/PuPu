import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { FIELD_RADIUS, fieldFill } from "./panel_style";

// The Attach Panel's palette menu, as a detail panel control: the panel's
// white field (no hover highlight), its corners, text and arrow grouped on
// the right.
export default function PanelSelect({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    ...fieldFill(isDark),
    boxSizing: "border-box",
    ...style,
    borderRadius: FIELD_RADIUS,
    justifyContent: "flex-end",
    textAlign: "right",
  }} />;
}
