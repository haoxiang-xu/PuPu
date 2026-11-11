import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { fill } from "./panel_style";

// The Attach Panel's palette menu, on the detail panel's one quiet filled
// surface: no outline, 8px corners, text and arrow grouped on the right.
export default function PanelSelect({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    backgroundColor: fill(isDark),
    border: "1px solid transparent",
    boxSizing: "border-box",
    ...style,
    borderRadius: 8,
    justifyContent: "flex-end",
    textAlign: "right",
  }} />;
}
