import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { fieldBorder } from "./panel_style";

// The Attach Panel's palette menu, as a detail panel control:
// outlined, no fill, 8px corners, text and arrow grouped on the right.
export default function PanelSelect({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    backgroundColor: "transparent",
    border: `1px solid ${fieldBorder(isDark)}`,
    boxSizing: "border-box",
    ...style,
    borderRadius: 8,
    justifyContent: "flex-end",
    textAlign: "right",
  }} />;
}
