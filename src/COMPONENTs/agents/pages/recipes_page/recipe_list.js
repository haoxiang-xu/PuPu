import { useEffect, useRef } from "react";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";

/* What is left of the legacy recipe list: the panel header's geometry and
   the inline rename row, both shared by the Agents explorer and the side
   menu. */

/* Header row geometry (list toggle, New). The row sits HEADER_INSET from the
   panel's outer edge (its 1px border plus the padding) on top and left, and
   its controls are HEADER_GAP apart. Every corner in the row is concentric with the
   panel's 10px corner: inner radius = outer radius − inset. */
const PANEL_RADIUS = 10;
const PANEL_BORDER = 1;
const HEADER_INSET = 5;
const HEADER_GAP = 4;
/* 28 puts the row's centerline at the modal's top-strip centerline (6 + 5 +
   14 = 25), so the fullscreen / close buttons line up with it. */
const HEADER_HEIGHT = 28;
const HEADER_ICON = 14;
const HEADER_RADIUS = PANEL_RADIUS - HEADER_INSET;

export const RECIPE_PANEL_HEADER = Object.freeze({
  INSET: HEADER_INSET,
  BORDER: PANEL_BORDER,
  GAP: HEADER_GAP,
  HEIGHT: HEADER_HEIGHT,
  ICON: HEADER_ICON,
  RADIUS: HEADER_RADIUS,
});

/* A section title's action button (the Agents list's import / new, the side
   menu's new chat): icon only, quiet until hovered. */
export const HEADER_ICON_BUTTON = {
  paddingVertical: (HEADER_HEIGHT - HEADER_ICON) / 2,
  paddingHorizontal: (HEADER_HEIGHT - HEADER_ICON) / 2,
  borderRadius: HEADER_RADIUS,
  opacity: 0.55,
  WebkitAppRegion: "no-drag",
  content: {
    prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
    icon: { width: HEADER_ICON, height: HEADER_ICON },
  },
};

export const RenameRow = ({ isDark, prefixIcon, initialValue, onConfirm, onCancel }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const commit = () => onConfirm(inputRef.current?.value ?? "");

  return (
    <div
      data-explorer-drag-disabled="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flex: 1,
        minWidth: 0,
      }}
    >
      {prefixIcon && (
        <Icon
          src={prefixIcon}
          style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.75 }}
        />
      )}
      <input
        ref={inputRef}
        defaultValue={initialValue}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => commit()}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "1px 4px",
          border: "none",
          borderBottom: `1.5px solid ${
            isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.25)"
          }`,
          outline: "none",
          background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.04)",
          color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
          fontSize: 13,
          lineHeight: 1.2,
          borderRadius: "3px 3px 0 0",
        }}
      />
    </div>
  );
};
