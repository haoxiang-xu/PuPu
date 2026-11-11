import React, { useContext } from "react";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { fieldBorder } from "./panel_style";

/* The detail panel's text box: the same outline and 8px corners as every
   other control in it, with no fill. A call site may still choose its own
   fill or border; the corners are the panel's. */
export default function PanelInput({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Input {...props} style={{
    ...style,
    backgroundColor: style?.backgroundColor ?? "transparent",
    border: style?.border ?? `1px solid ${fieldBorder(isDark)}`,
    borderRadius: 8,
  }} />;
}
