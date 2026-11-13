import React, { useContext } from "react";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { FIELD_RADIUS, fieldFill } from "./panel_style";

/* The detail panel's text box: the same white field, outline and corners as
   every other control in it, with no hover highlight. A call site may still
   choose its own fill or border; the corners are the panel's. */
export default function PanelInput({ style, ...props }) {
  const { onThemeMode } = useContext(ConfigContext) || {};
  const isDark = onThemeMode === "dark_mode";
  return <Input {...props} style={{
    ...fieldFill(isDark),
    ...style,
    borderRadius: FIELD_RADIUS,
  }} />;
}
