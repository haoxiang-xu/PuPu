import React from "react";
import { render_agent_icon } from "./agent_icons";
import { DEFAULT_AGENT_PRESENTATION, resolve_presentation } from "../../SERVICEs/agent_resource_icons";

/* An Agent resource's mark: its chosen icon. The colours are fixed — a
   stored `color` from an older build is never drawn. */

export const AVATAR_LIGHT_GLYPH = "#ffffff";
export const AVATAR_DARK_GLYPH = "#1d1d1f";

/* WCAG relative luminance of "#rrggbb". */
export function relative_luminance(hex) {
  const value = typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : DEFAULT_AGENT_PRESENTATION.color;
  const channel = (offset) => {
    const c = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/* Whichever of the two glyph colours contrasts more with the background. */
export function avatar_glyph_color(background) {
  const l = relative_luminance(background);
  const onWhite = 1.05 / (l + 0.05);
  const onDark = (l + 0.05) / (relative_luminance(AVATAR_DARK_GLYPH) + 0.05);
  return onDark > onWhite ? AVATAR_DARK_GLYPH : AVATAR_LIGHT_GLYPH;
}

/* `variant`:
   - "tile" (default): the glyph in white on the Agent blue, a flat rounded
     square.
   - "glyph": no background at all; the glyph takes the surrounding text
     colour — list rows (the Agents explorer, the Subagent Pool), where it
     sits like any other row icon. */
export default function AgentAvatar({
  presentation,
  size = 20,
  radius,
  glyphScale = 0.6,
  variant = "tile",
  /* glyph variant only: the glyph's colour ("currentColor" = the row's own
     text colour). */
  defaultTint = "currentColor",
  testid,
  title,
  style,
}) {
  const { icon, color } = resolve_presentation(presentation);
  const glyphSize = Math.max(6, Math.round(size * glyphScale));
  if (variant === "glyph") {
    const tint = defaultTint;
    return (
      <span
        aria-hidden={title ? undefined : "true"}
        role={title ? "img" : undefined}
        aria-label={title || undefined}
        data-testid={testid}
        data-agent-icon={icon}
        data-agent-tint={tint}
        data-agent-variant="glyph"
        style={{
          width: size, height: size, flexShrink: 0, color: tint,
          display: "inline-flex", alignItems: "center", justifyContent: "center", ...style,
        }}
      >
        {render_agent_icon(icon, glyphSize)}
      </span>
    );
  }
  return (
    <span
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      aria-label={title || undefined}
      data-testid={testid}
      data-agent-icon={icon}
      data-agent-color={color}
      style={{
        width: size,
        height: size,
        borderRadius: radius !== undefined ? radius : Math.round(size * 0.28),
        flexShrink: 0,
        background: color,
        color: avatar_glyph_color(color),
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {render_agent_icon(icon, glyphSize)}
    </span>
  );
}
