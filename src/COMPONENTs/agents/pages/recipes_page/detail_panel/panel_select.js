import React, { useContext } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";

// The Attach Panel's palette menu, with the detail fields' outlined trigger.
export default function PanelSelect({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  return <Select {...props} variant="palette" style={{
    border: `1px solid var(--pupu-border, ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.16)"})`,
    boxSizing: "border-box",
    ...style,
    justifyContent: "flex-end",
    textAlign: "right",
  }} />;
}
