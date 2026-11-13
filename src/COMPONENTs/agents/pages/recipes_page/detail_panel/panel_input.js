import React, { useContext } from "react";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { fill } from "./panel_style";

/* The detail panel's text box: the same quiet fill and 8px corners as every
   other control in it, with no outline. A call site may still choose its own
   fill or border; the corners are the panel's. */
export default function PanelInput({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Input {...props} style={{
    ...style,
    backgroundColor: style?.backgroundColor ?? fill(isDark),
    border: style?.border ?? "1px solid transparent",
    borderRadius: 8,
  }} />;
}
