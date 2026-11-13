import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "../../BUILTIN_COMPONENTs/layer/z_layers";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { AGENT_ICON_GROUPS, agent_icons_in, render_agent_icon } from "./agent_icons";
import { avatar_glyph_color } from "./agent_avatar";
import { presentation_to_store, resolve_presentation } from "../../SERVICEs/agent_resource_icons";
import { PRESENTATION_SUPPORTED, usePresentationCapability } from "./use_presentation_capability";

/* Choose an Agent resource's icon — icons only, there is no colour. It is
 * opened only from the Agents explorer's "Change icon…".
 *
 * A small anchored popover rather than the shared ContextMenu (rows of items
 * only) or Tooltip (needs a trigger element, and the Explorer opens this from
 * a menu at the pointer). It follows ContextMenu's behaviour: a body portal on
 * Z.POPOVER, Escape closes without reaching a modal underneath, a press outside
 * closes.
 *
 * Choosing is a preview: the picker holds a pending selection (and reports it
 * through `onPreview`, so a trigger can show it), and nothing is committed
 * until Save, which hands the pending value to `onChange` — `{ icon }`, or
 * null meaning "remove it, use the default" (also what choosing the default
 * icon is) — and closes. A colour stored by an older build is not carried:
 * Save writes the icon alone. "Reset to default" only changes
 * the pending selection. Closing without Save (Escape, a press outside)
 * discards it. Enter inside the picker is Save. */

const WIDTH = 284;
const CELL = 28;
const GAP = 4;
const EDGE = 8;

const CAPTION = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "1.5px",
  opacity: 0.4,
  userSelect: "none",
  margin: "2px 2px 6px",
};

const same = (a, b) => JSON.stringify(presentation_to_store(a)) === JSON.stringify(presentation_to_store(b));

export default function AgentIconPicker({ open, anchor, value, onChange, onPreview, onClose, isDark, testid = "agent-icon-picker" }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  /* The selection being tried, as the value Save would store (`{ icon }`, or
     null = default). Taken from `value` each time the picker opens. */
  const [pending, setPending] = useState(() => presentation_to_store(value));
  useEffect(() => {
    if (open) setPending(presentation_to_store(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const shown = resolve_presentation(pending);
  const dirty = !same(pending, value);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const x = Number.isFinite(anchor?.x) ? anchor.x : EDGE;
    const y = Number.isFinite(anchor?.y) ? anchor.y : EDGE;
    const height = ref.current ? ref.current.getBoundingClientRect().height : 0;
    const vw = typeof window !== "undefined" ? window.innerWidth : WIDTH;
    const vh = typeof window !== "undefined" ? window.innerHeight : 0;
    setPosition({
      left: Math.max(EDGE, Math.min(x, vw - WIDTH - EDGE)),
      top: height && vh ? Math.max(EDGE, Math.min(y, vh - height - EDGE)) : y,
    });
  }, [open, anchor?.x, anchor?.y]);

  /* A safety net: the entry points do not open the picker unless the
     runtime accepts `document.presentation` (an older one refuses the
     document on Save and on the Explorer's write). Should it be open anyway,
     nothing in it can be chosen or saved. */
  const capability = usePresentationCapability(Boolean(open));
  const locked = capability !== PRESENTATION_SUPPORTED;
  const canSave = !locked && dirty;

  const preview = useCallback((next) => {
    setPending(next);
    if (typeof onPreview === "function") onPreview(next);
  }, [onPreview]);

  const save = useCallback(() => {
    if (!canSave) return;
    onChange(pending);
    onClose();
  }, [canSave, onChange, pending, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (event) => {
      if (ref.current && ref.current.contains(event.target)) return;
      onClose();
    };
    const onKey = (event) => {
      if (event.key === "Enter" && ref.current && ref.current.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
        save();
        return;
      }
      if (event.key !== "Escape") return;
      /* Not on the modal stack: stop here so the Escape does not also close
         the Agents modal underneath (ContextMenu does the same). */
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, save]);

  const choose = useCallback((icon) => {
    if (locked) return;
    preview(presentation_to_store({ icon }));
  }, [preview, locked]);

  if (!open || typeof document === "undefined") return null;

  const text = isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)";
  const surfaceColor = isDark
    ? "color-mix(in srgb, var(--pupu-surface, rgb(30, 30, 30)) 92%, transparent)"
    : "color-mix(in srgb, var(--pupu-surface, rgb(255, 255, 255)) 96%, transparent)";

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={t("agents.icon_picker.title")}
      data-testid={testid}
      /* The project's own scrollbar, never the native one; normally the
         whole picker fits and nothing scrolls. */
      className="scrollable"
      data-sb-wall="4"
      data-sb-edge="2"
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: "fixed",
        top: position ? position.top : -9999,
        left: position ? position.left : -9999,
        zIndex: Z.POPOVER,
        width: WIDTH,
        boxSizing: "border-box",
        maxHeight: "min(640px, calc(100vh - 16px))",
        overflowY: "auto",
        padding: 12,
        borderRadius: 10,
        backgroundColor: surfaceColor,
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        border: "1px solid var(--pupu-border-mid)",
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
          : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
        color: text,
        fontFamily: "Jost, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div role="group" aria-label={t("agents.icon_picker.icon")} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {AGENT_ICON_GROUPS.map((group) => (
          <div key={group} data-testid={`${testid}-group-${group}`}>
            <div style={CAPTION}>{t(`agents.icon_picker.groups.${group}`)}</div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(8, ${CELL}px)`, gap: GAP }}>
              {agent_icons_in(group).map((entry) => {
                const selected = entry.id === shown.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    aria-label={entry.label}
                    aria-pressed={selected}
                    data-testid={`${testid}-icon-${entry.id}`}
                    disabled={locked}
                    onClick={() => choose(entry.id)}
                    style={{
                      width: CELL,
                      height: CELL,
                      padding: 0,
                      border: "none",
                      borderRadius: 7,
                      cursor: locked ? "default" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: selected ? shown.color : "transparent",
                      color: selected ? avatar_glyph_color(shown.color) : text,
                      opacity: selected ? 1 : locked ? 0.5 : 0.78,
                    }}
                  >
                    {render_agent_icon(entry.id, 16)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Button
          label={t("agents.icon_picker.reset")}
          ariaLabel={t("agents.icon_picker.reset")}
          disabled={locked || pending === null}
          onClick={() => {
            if (!locked) preview(null);
          }}
          style={{ fontSize: 12, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 7 }}
        />
        {/* The Builder's own Save: the accent only while there is something
            to save (canvas_chrome's control center). */}
        <Button
          label={t("agents.save.save")}
          ariaLabel={t("agents.save.save")}
          disabled={!canSave}
          onClick={save}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 14,
            borderRadius: 7,
            backgroundColor: canSave ? "var(--pupu-accent)" : "transparent",
            color: canSave ? "#fff" : "var(--pupu-text)",
            opacity: canSave ? 1 : 0.5,
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
