import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { NodeRefTag } from "./node_tag";
import { node_identity } from "./node_identity";

const HEIGHT = 32;
const SEGMENT = {
  position: "relative", minWidth: 0, display: "flex", alignItems: "center", height: HEIGHT,
};
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const mutedColor = (isDark) => isDark ? "#a6a6af" : "#686870";

export const variablePillField = {
  width: "100%", minWidth: 0, border: 0, height: 24,
  paddingVertical: 0, paddingHorizontal: 3, fontSize: 12,
  boxShadow: "none",
  /* No fill on hover or press, for the Input (its overlay variables) and the
     Button (its own background colours) alike. */
  "--pupu-overlay-hover": "transparent",
  "--pupu-overlay-active": "transparent",
  hoverBackgroundColor: "transparent",
  activeBackgroundColor: "transparent",
};

/* What a row is given. A value read from somewhere is one tag: the step it
   comes from (`node`) in the step's
   colour, joined to the field it reads. A source that is not a step — or a
   step that is gone — is the same tag in neutral. Without a field it is the
   plain muted label. */
export function VariablePillValue({ label, detail, node, isDark, testid, style }) {
  if (detail === undefined) {
    return (
      <span data-testid={testid} style={{ display: "flex", alignItems: "center", minWidth: 0, ...style }}>
        <span style={{ ...ELLIPSIS, color: mutedColor(isDark) }}>{label}</span>
      </span>
    );
  }
  const known = node && node_identity(node);
  return (
    <span style={{ display: "flex", alignItems: "center", minWidth: 0, ...style }}>
      <NodeRefTag testid={testid} isDark={isDark} detail={detail}
        name={label} {...(known ? { node } : {})} />
    </span>
  );
}

export default function VariablePill({
  name, onNameChange, onRemove, removeLabel, isDark, testid, sourceRef, children,
  /* Optional controls between the value and the way out (a row's own
     settings toggle); absent, the row is exactly name = value ×. */
  actions,
}) {
  const { t } = useTranslation();
  const color = isDark ? "#eeeef1" : "#26262c";

  return (
    /* One row of its region: name, what it is given, and the way to drop it.
       The surface is the region's; neither the name nor the value draws a
       border or a hover fill. */
    <div data-testid={`${testid}-header`} style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
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
          <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 0, height: 26, boxSizing: "border-box",
            borderRadius: 6, border: "1px solid transparent" }}>{children}</div>
        </div>
      </div>
      {actions}
      <Button prefix_icon="close" ariaLabel={removeLabel} onClick={onRemove}
        style={{ flexShrink: 0, width: 22, height: 22, marginRight: 5, borderRadius: 6, backgroundColor: "transparent", color: mutedColor(isDark), opacity: 0.75,
          iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0,
          content: { icon: { width: 13, height: 13 } } }} />
    </div>
  );
}
