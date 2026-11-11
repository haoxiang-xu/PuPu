import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const HEIGHT = 32;
const SEGMENT = {
  position: "relative", minWidth: 0, display: "flex", alignItems: "center", height: HEIGHT,
};
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const trackFill = (isDark) => isDark ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.045)";
const mutedColor = (isDark) => isDark ? "#a6a6af" : "#686870";

export const variablePillField = {
  width: "100%", minWidth: 0, border: 0, height: 24,
  paddingVertical: 0, paddingHorizontal: 3, fontSize: 12,
  "--pupu-overlay-hover": "transparent",
  "--pupu-overlay-active": "transparent",
};

export function VariablePillValue({ label, detail, isDark, style }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, ...style }}>
      <span style={{ ...ELLIPSIS, color: mutedColor(isDark) }}>{label}</span>
      {detail !== undefined && <span style={{
        ...ELLIPSIS, display: "inline-block", padding: "2px 7px", borderRadius: 999,
        background: trackFill(isDark), fontFamily: "ui-monospace, Menlo, monospace",
      }}>{detail}</span>}
    </span>
  );
}

export default function VariablePill({
  name, onNameChange, onRemove, removeLabel, isDark, testid, sourceRef, children,
}) {
  const { t } = useTranslation();
  const color = isDark ? "#eeeef1" : "#26262c";
  const track = trackFill(isDark);

  return (
    /* One surface per row: name, what it is given, and the way to drop it. */
    <div data-testid={`${testid}-header`} style={{ display: "flex", alignItems: "center", minWidth: 0,
      borderRadius: 8, overflow: "hidden", background: track }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 5fr) 18px minmax(0, 6fr)",
        flex: 1, minWidth: 0, color, fontSize: 12,
      }}>
        <div style={{ ...SEGMENT, padding: "0 0 0 8px" }}>
          <Input aria_label={t("agents.io.name_placeholder")} placeholder={t("agents.io.name_placeholder")}
            value={name} set_value={onNameChange}
            style={{ ...variablePillField, color, fontFamily: "ui-monospace, Menlo, monospace" }} />
        </div>
        <span aria-hidden="true" style={{ alignSelf: "center", textAlign: "center", fontSize: 13, fontWeight: 500,
          lineHeight: 1, color: mutedColor(isDark), opacity: 0.7, userSelect: "none", pointerEvents: "none" }}>=</span>
        <div ref={sourceRef} data-testid={`${testid}-source`} style={{ ...SEGMENT, padding: "0 4px 0 6px" }}>
          {children}
        </div>
      </div>
      <Button prefix_icon="close" ariaLabel={removeLabel} onClick={onRemove}
        style={{ flexShrink: 0, width: 22, height: 22, marginRight: 5, borderRadius: 6, backgroundColor: "transparent", color: mutedColor(isDark), opacity: 0.75,
          iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0,
          content: { icon: { width: 13, height: 13 } } }} />
    </div>
  );
}
