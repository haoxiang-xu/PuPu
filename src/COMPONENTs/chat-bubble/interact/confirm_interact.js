/**
 * ConfirmInteract – Allow / Don't ask again / Deny buttons.
 *
 * onSubmit payload:
 *   { approved: boolean, scope: "once" | "session" }
 *   - "once"    → single approval / denial
 *   - "session" → approve and remember for the current chat session
 */

import { useContext } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

const FONT = "Menlo, Monaco, Consolas, monospace";

const hexToRgba = (hex, a) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const ACTION_BUTTON_WIDTH = 128;

const buildActionStyle = (accent) => ({
  width: ACTION_BUTTON_WIDTH,
  color: accent,
  backgroundColor: hexToRgba(accent, 0.14),
  fontSize: 11.5,
  fontFamily: FONT,
  borderRadius: 6,
  paddingVertical: 6,
  paddingHorizontal: 10,
  hoverBackgroundColor: hexToRgba(accent, 0.18),
  activeBackgroundColor: hexToRgba(accent, 0.28),
});

const ConfirmInteract = ({ onSubmit, disabled }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const mt = theme?.modal || {};
  const successAccent = mt.successAccent || (isDark ? "#4ADE80" : "#22C55E");
  const errorAccent = mt.errorAccent || (isDark ? "#F87171" : "#DC3545");
  const warningAccent = mt.warningAccent || (isDark ? "#FBBF24" : "#F59E0B");

  if (disabled) return null;

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <Button
        label="Allow once"
        onClick={() => onSubmit({ approved: true, scope: "once" })}
        style={buildActionStyle(successAccent)}
      />
      <Button
        label="Always allow"
        onClick={() => onSubmit({ approved: true, scope: "session" })}
        style={buildActionStyle(warningAccent)}
      />
      <Button
        label="Deny"
        onClick={() => onSubmit({ approved: false, scope: "once" })}
        style={buildActionStyle(errorAccent)}
      />
    </div>
  );
};

export default ConfirmInteract;
