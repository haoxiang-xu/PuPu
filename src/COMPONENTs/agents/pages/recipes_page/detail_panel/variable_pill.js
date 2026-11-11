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
    <div data-testid={`${testid}-header`} style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 20px minmax(0, 1fr)",
        flex: 1, minWidth: 0, color, fontSize: 12,
        borderRadius: 8, overflow: "hidden", background: track,
      }}>
        <div style={{ ...SEGMENT, padding: "0 0 0 9px" }}>
          <Input aria_label={t("agents.io.name_placeholder")} placeholder={t("agents.io.name_placeholder")}
            value={name} set_value={onNameChange}
            style={{ ...variablePillField, color, fontFamily: "ui-monospace, Menlo, monospace" }} />
        </div>
        <span aria-hidden="true" style={{ alignSelf: "center", textAlign: "center", fontSize: 15, fontWeight: 700,
          lineHeight: 1, color: mutedColor(isDark), userSelect: "none", pointerEvents: "none" }}>=</span>
        <div ref={sourceRef} data-testid={`${testid}-source`} style={{ ...SEGMENT, padding: "0 12px 0 8px" }}>
          {children}
        </div>
      </div>
      <Button prefix_icon="close" ariaLabel={removeLabel} onClick={onRemove}
        style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 10, backgroundColor: track, color: mutedColor(isDark),
          iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0,
          content: { icon: { width: 13, height: 13 } } }} />
    </div>
  );
}
