import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import AgentAvatar from "./agent_avatar";
import AgentIconPicker from "./agent_icon_picker";
import { PRESENTATION_SUPPORTED, usePresentationCapability } from "./use_presentation_capability";

/* An Agent's avatar that opens the icon picker: where an Agent's identity is
   shown and can be edited (the detail panel header of an Agent resource, an
   embedded subagent's settings). Without `onChange` it is the plain avatar,
   and so it is while the runtime does not accept an Agent's presentation, or
   has not said yet: the icon is then simply not editable, with no message —
   the cause is a developer's concern, reported by the capability check. */
export default function AgentIconButton({
  presentation,
  onChange,
  size = 26,
  radius,
  glyphScale,
  /* "tile" (canvas/header) or "glyph" (a list row: no background). */
  variant = "tile",
  defaultTint,
  isDark,
  testid = "agent-icon-button",
  ariaLabel,
}) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [anchor, setAnchor] = useState(null);
  /* What the open picker is trying, shown on this avatar; gone on close, so
     a dismissed picker leaves the avatar as it was. */
  const [preview, setPreview] = useState(undefined);
  const close = useCallback(() => {
    setAnchor(null);
    setPreview(undefined);
  }, []);
  const shown = preview === undefined ? presentation : preview;
  const capability = usePresentationCapability(typeof onChange === "function");

  if (typeof onChange !== "function" || capability !== PRESENTATION_SUPPORTED) {
    return <AgentAvatar variant={variant} defaultTint={defaultTint} presentation={presentation} size={size} radius={radius} glyphScale={glyphScale} testid={testid} />;
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={ariaLabel || t("agents.icon_picker.change")}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        data-testid={testid}
        onClick={() => {
          if (anchor) {
            close();
            return;
          }
          const rect = ref.current ? ref.current.getBoundingClientRect() : { left: 0, bottom: 0 };
          setAnchor({ x: rect.left, y: rect.bottom + 6 });
        }}
        /* A press on the trigger while the picker is open is outside the
           picker; without this it would close and then reopen on click. */
        onMouseDown={(event) => {
          if (anchor) event.nativeEvent.stopImmediatePropagation();
        }}
        style={{
          padding: 0,
          border: "none",
          background: "none",
          cursor: "pointer",
          display: "inline-flex",
          flexShrink: 0,
          borderRadius: radius !== undefined ? radius : Math.round(size * 0.28),
          WebkitAppRegion: "no-drag",
        }}
      >
        <AgentAvatar variant={variant} defaultTint={defaultTint} presentation={shown} size={size} radius={radius} glyphScale={glyphScale} testid={`${testid}-avatar`} />
      </button>
      <AgentIconPicker
        open={anchor !== null}
        anchor={anchor || undefined}
        value={presentation}
        onChange={onChange}
        onPreview={setPreview}
        onClose={close}
        isDark={isDark}
        testid={`${testid}-picker`}
      />
    </>
  );
}
