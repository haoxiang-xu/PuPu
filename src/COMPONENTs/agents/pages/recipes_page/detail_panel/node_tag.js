import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { avatar_glyph_color } from "../../../agent_avatar";
import { render_agent_icon } from "../../../agent_icons";
import { normalize_presentation, resolve_presentation } from "../../../../../SERVICEs/agent_resource_icons";
import { node_identity } from "./node_identity";
import { fillStrong, muted, text } from "./panel_style";

/* A step of the graph, named where a panel points at it: a small rounded
   rectangle filled with the step's flat colour — the colour the canvas node
   wears — with its icon and name in the one ink that reads on that fill
   (white on a dark or saturated colour, near-black on a light one).
 *
 * Give it the `node` (its identity is read from node_identity, and an Agent
 * node of an Agent document may bring that Agent's `presentation`), or the
 * three parts directly: `{ icon, color, name }` (a `name` beside a `node`
 * keeps the caller's words). Without a colour it is a neutral tag. */

export const NODE_TAG_ICON = 13;
export const NODE_TAG_RADIUS = 6;
export const NODE_TAG_HEIGHT = 22;
export const NODE_TAG_NAME_MAX = 180;
const HEX = /^#[0-9a-fA-F]{6}$/;
const ELLIPSIS = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

/* "#rrggbb" at `alpha`, for the light wash of a reference's field half. */
export function tint_of(hex, alpha) {
  if (typeof hex !== "string" || !HEX.test(hex)) return undefined;
  const part = (offset) => parseInt(hex.slice(offset, offset + 2), 16);
  return `rgba(${part(1)}, ${part(3)}, ${part(5)}, ${alpha})`;
}
export const nodeRefTint = (isDark) => (isDark ? 0.22 : 0.18);

/* Who a tag names: its glyph, its fill, its words, and whether the glyph is
   an Agent's own. */
export function node_tag_parts({ node, icon, color, name, presentation }, t) {
  const identity = node ? node_identity(node, t) : null;
  const agent = Boolean(node && node.type === "agent" && normalize_presentation(presentation));
  const resolved = agent ? resolve_presentation(presentation) : null;
  const fill = agent ? resolved.color : identity ? identity.gradient : color;
  return {
    glyph: agent ? resolved.icon : identity ? identity.icon : icon,
    fill: typeof fill === "string" && HEX.test(fill) ? fill.toLowerCase() : null,
    /* A caller that already names the step (the words its own list uses)
       keeps them; otherwise the step is named as the canvas names it. */
    label: name !== undefined ? name : identity ? identity.title : undefined,
    agent,
  };
}

export const nodeTagStyle = (isDark, fill) => ({
  display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%",
  height: NODE_TAG_HEIGHT, padding: "0 8px 0 6px", borderRadius: NODE_TAG_RADIUS, boxSizing: "border-box",
  fontSize: 11.5, fontWeight: 500, lineHeight: "16px",
  color: fill ? avatar_glyph_color(fill) : muted(isDark),
  background: fill || fillStrong(isDark),
  whiteSpace: "nowrap", userSelect: "none", WebkitUserSelect: "none",
});

function TagGlyph({ parts, ink, testid, presentation }) {
  if (parts.agent) {
    const stored = normalize_presentation(presentation);
    return (
      <span data-testid={testid ? `${testid}-avatar` : undefined} aria-hidden="true"
        data-agent-icon={parts.glyph} data-agent-color={stored && stored.color ? stored.color : ""}
        style={{ width: NODE_TAG_ICON, height: NODE_TAG_ICON, flexShrink: 0, color: ink,
          display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {render_agent_icon(parts.glyph, NODE_TAG_ICON)}
      </span>
    );
  }
  if (!parts.glyph) return null;
  return (
    <span data-testid={testid ? `${testid}-icon` : undefined} aria-hidden="true"
      style={{ width: NODE_TAG_ICON, height: NODE_TAG_ICON, flexShrink: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <Icon src={parts.glyph} color={ink} style={{ width: NODE_TAG_ICON, height: NODE_TAG_ICON }} />
    </span>
  );
}

export default function NodeTag({ node, icon, color, name, presentation, isDark, testid, title, style }) {
  const { t } = useTranslation();
  const parts = node_tag_parts({ node, icon, color, name, presentation }, t);
  const look = nodeTagStyle(isDark, parts.fill);
  return (
    <span data-testid={testid} data-node-fill={parts.fill || ""} title={title || parts.label || undefined}
      style={{ ...look, ...style }}>
      <TagGlyph parts={parts} ink={look.color} testid={testid} presentation={presentation} />
      <span style={{ ...ELLIPSIS, maxWidth: NODE_TAG_NAME_MAX }}>{parts.label}</span>
    </span>
  );
}

/* A value read from a step: one tag in two halves joined edge to edge — the
   step's own tag, then the field it reads on a light wash of the same colour,
   in the panel's text colour. One rounded outline holds both. With no step
   (it was removed, or the value is not a step's) both halves are neutral. */
export function NodeRefTag({ node, icon, color, name, presentation, detail, isDark, testid, title, style }) {
  const { t } = useTranslation();
  const parts = node_tag_parts({ node, icon, color, name, presentation }, t);
  const edge = parts.fill ? tint_of(parts.fill, isDark ? 0.5 : 0.4) : fillStrong(isDark);
  const label = parts.label;
  return (
    <span data-testid={testid} data-node-fill={parts.fill || ""}
      title={title || [label, detail].filter((part) => part !== undefined && part !== "").join(" · ") || undefined}
      style={{
        display: "inline-flex", alignItems: "stretch", minWidth: 0, maxWidth: "100%", height: NODE_TAG_HEIGHT,
        borderRadius: NODE_TAG_RADIUS, overflow: "hidden", boxSizing: "border-box",
        background: parts.fill ? tint_of(parts.fill, nodeRefTint(isDark)) : (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)"),
        boxShadow: `inset 0 0 0 1px ${edge}`,
        ...style,
      }}>
      <NodeTag node={node} icon={icon} color={color} name={name} presentation={presentation} isDark={isDark}
        testid={testid ? `${testid}-node` : undefined} title={label}
        style={{ borderRadius: 0, maxWidth: "62%", flexShrink: 1, height: "100%" }} />
      <span data-testid={testid ? `${testid}-field` : undefined}
        style={{ ...ELLIPSIS, flexShrink: 1, display: "inline-flex", alignItems: "center", padding: "0 8px 0 6px",
          fontSize: 11.5, lineHeight: "16px", color: text(isDark), fontFamily: "ui-monospace, Menlo, monospace" }}>
        <span style={ELLIPSIS}>{detail}</span>
      </span>
    </span>
  );
}
