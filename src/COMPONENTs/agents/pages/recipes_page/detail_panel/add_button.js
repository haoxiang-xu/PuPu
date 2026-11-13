import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import { addButtonStyle } from "./panel_style";

/* The detail panel's one "add" control, at the end of a list: a + glyph and
   the words, quiet, left aligned. Toolkit Pool's workflow tools and Subagent
   Pool's "New embedded Agent" both use it, so the two panels add alike. */
export default function AddButton({ label, ariaLabel, title, disabled, onClick, isDark, testid, style }) {
  return (
    <Button
      prefix_icon="add"
      label={label}
      ariaLabel={ariaLabel ?? label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      dom_props={testid ? { "data-testid": testid } : undefined}
      style={{ ...addButtonStyle(isDark), gap: 3, content: { icon: { width: 11, height: 11 } }, ...style }}
    />
  );
}
