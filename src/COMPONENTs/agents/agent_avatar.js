import React, { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { render_agent_icon } from "./agent_icons";
import { DEFAULT_AGENT_PRESENTATION, normalize_presentation, resolve_presentation } from "../../SERVICEs/agent_resource_icons";

/* An Agent's mark: its glyph on its colour, a flat rounded square like every
   node icon. The glyph is white, or near-black on a light colour, so a pale
   custom colour stays readable. */

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
   - "tile" (default): the glyph on its colour, a flat rounded square — the
     canvas node and the detail header.
   - "glyph": no background at all; the glyph itself takes the chosen colour,
     or the surrounding text colour when none is chosen — list rows (the
     Agents explorer, the Subagent Pool), where it sits like any other row
     icon. */
/* For a glyph drawn straight on the panel: the chosen colour, lightened (dark
   theme) or darkened (light theme) just enough to reach about 3:1 against
   the list background. Rendering only — the stored colour never changes. */
const LIST_BACKGROUND = { dark: "#1e1e1e", light: "#f5f5f5" };
const contrast = (a, b) => {
  const [x, y] = [relative_luminance(a), relative_luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mix = (hex, toward, t) => {
  const parse = (h, o) => parseInt(h.slice(o, o + 2), 16);
  const part = (o) => Math.round(parse(hex, o) + (parse(toward, o) - parse(hex, o)) * t).toString(16).padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
};
export function legible_glyph_color(hex, isDark, minimum = 3) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const background = isDark ? LIST_BACKGROUND.dark : LIST_BACKGROUND.light;
  if (contrast(hex, background) >= minimum) return hex.toLowerCase();
  const toward = isDark ? "#ffffff" : "#000000";
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(hex.toLowerCase(), toward, step / 20);
    if (contrast(candidate, background) >= minimum) return candidate;
  }
  return toward;
}

export default function AgentAvatar({
  presentation,
  size = 20,
  radius,
  glyphScale = 0.6,
  variant = "tile",
  /* glyph variant only: the colour when none is chosen ("currentColor" =
     the row's own text colour). */
  defaultTint = "currentColor",
  testid,
  title,
  style,
}) {
  const config = useContext(ConfigContext);
  const isDark = config?.onThemeMode === "dark_mode";
  const { icon, color } = resolve_presentation(presentation);
  const glyphSize = Math.max(6, Math.round(size * glyphScale));
  if (variant === "glyph") {
    const stored = normalize_presentation(presentation);
    const chosen = stored && stored.color ? stored.color : defaultTint;
    const tint = chosen === "currentColor" ? chosen : legible_glyph_color(chosen, isDark);
    return (
      <span
        aria-hidden={title ? undefined : "true"}
        role={title ? "img" : undefined}
        aria-label={title || undefined}
        data-testid={testid}
        data-agent-icon={icon}
        data-agent-color={stored && stored.color ? stored.color : ""}
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
