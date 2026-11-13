import ShadowSurface from "../../../../BUILTIN_COMPONENTs/material/shadow_surface";
import { useSurfaceComposite } from "../../../../BUILTIN_COMPONENTs/material/surface_composite";
import React, { useContext } from "react";
import { createPortal } from "react-dom";
import { NavigationContext } from "../../../../CONTAINERs/config/context";
import { SURFACE_DITHER_STYLE } from "../../../../BUILTIN_COMPONENTs/material/surface_dither";
import { SIDEBAR_GLASS_FILTER } from "../../../../CONTAINERs/config/theme_semantic";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Tooltip from "../../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import usePresentationPlatform from "../../../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import { AGENTS_MODAL_Z } from "../../top_strip";
import PanelResizeHandle from "./panel_resize_handle";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { renderAgentMessage } from "./agents_i18n";
import useReducedMotion from "../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { TOP_BAR_HEIGHT } from "../../../../BUILTIN_COMPONENTs/electron/title_bar";
import WindowControls, { windowControlsInset } from "../../../../BUILTIN_COMPONENTs/electron/window_controls";
import { windowStateBridge } from "../../../../SERVICEs/bridges/window_state_bridge";

const hasWindowControls = () =>
  typeof window !== "undefined" &&
  window.runtime?.isElectron === true &&
  windowStateBridge.isActionAvailable();

/* Live width shared by the floating and docked detail panels. */
export const DETAIL_WIDTH_VAR = "--pupu-agents-detail-drag-width";

/* The builder's chrome, shared by both canvases.
 *
 * The unified design has exactly these pieces floating over a full-bleed
 * canvas: the library on the left, the detail panel on the right, one small
 * control center at the bottom middle (undo / redo / home · Run · Save). The
 * drill path is not here: the canvas's top edge is the window's drag region,
 * so it is shown in the side menu's breadcrumb instead. They were drawn
 * once for the legacy Recipe canvas; the native Skeleton page grew its own bar
 * and buttons instead. Both canvases now take them from here, so the two stay
 * the same picture and neither can grow a third. */

// Floating panels sit PANEL_INSET px from the page edge; each resize pill's
// hit area starts HANDLE_GAP px past the panel's inner edge (the pill itself
// is centered inside that hit area, so it clears the panel visibly).
export const PANEL_INSET = 6;
export const HANDLE_GAP = 2;
/* The docked right side menu floats one ring inside the window: this far
   from the window's top, right and bottom edges, with these corners. */
export const DETAIL_INSET = 8;
export const DETAIL_RADIUS = 14;
/* The docked panel's toggle: the same icon at the same centre as the left
   side menu's, on a smaller backing (24px instead of 31px) so it reads as
   sitting inside the rounded panel. */
const DETAIL_TOGGLE_PADDING = 4.5;
/* Its corners follow the panel's: the panel's 14px less the ~5px between
   them, so the two curves run side by side. */
const DETAIL_TOGGLE_RADIUS = DETAIL_RADIUS - 5;
/* Its grab bar, hovered or dragged: nearly the panel's full height, but
   stopping short of the rounded corners — the corner radius plus 10px clear
   at each end. The hit strip stays along the whole edge. */
const DETAIL_HANDLE_END_CLEARANCE = DETAIL_RADIUS + 10;
export const DETAIL_HANDLE_ACTIVE_HEIGHT = `calc(100% - ${DETAIL_HANDLE_END_CLEARANCE * 2}px)`;

/* What the docked panel tells the detail panel inside it. On macOS the node
   header shares the title bar's row with the pinned toggle: centred on the
   toggle's line, its text kept clear of it, and it drags the window. */
export const DetailChromeContext = React.createContext(null);
export const DETAIL_HEADER_TOGGLE_RESERVE = 44;
const HEADER_IN_TITLE_ROW = Object.freeze({ headerInTitleRow: true, toggleReserve: DETAIL_HEADER_TOGGLE_RESERVE });

/* Where the strip of messages and the control center's popovers sit: just
   above the control center, centered on it. */
export const ABOVE_CONTROLS = 62;

export function overlay_tokens(isDark) {
  return {
    background: isDark
      ? "rgba(var(--pupu-surface-rgb, 20, 20, 20), 0.72)"
      : "rgba(var(--pupu-surface-rgb, 255, 255, 255), 0.78)",
    border: "1px solid var(--pupu-border-subtle, transparent)",
    backdrop: "blur(16px) saturate(1.4)",
    shadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.1)",
    controlShadow: isDark ? "0 4px 24px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.08)",
  };
}

const glass = (tokens) => ({
  backgroundColor: tokens.background,
  border: tokens.border,
  backdropFilter: tokens.backdrop,
  WebkitBackdropFilter: tokens.backdrop,
});

const ICON_CONTROL = (enabled) => ({
  fontSize: 12,
  paddingVertical: 5,
  paddingHorizontal: 8,
  borderRadius: 7,
  opacity: enabled ? 0.85 : 0.35,
  /* A disabled button keeps the pointer to itself; letting it through to
     the hint's wrapper is what keeps the hint on a control that is off. */
  ...(enabled ? null : { pointerEvents: "none" }),
  content: { icon: { width: 13, height: 13 } },
});

const HINT_TRIGGER = ["hover", "focus"];

/* A control's name, in the app's own tooltip, over the control. `blocked`
   marks a disabled control: the wrapper takes the pointer (and shows it is
   not allowed) so the hint still answers. `testId` names the bubble. */
export function ControlHint({ label, testId, position = "top", blocked = false, children }) {
  return (
    <Tooltip
      tooltip_component={<span data-testid={testId}>{label}</span>}
      position={position}
      trigger={HINT_TRIGGER}
      close_delay={0}
      style={{ whiteSpace: "nowrap" }}
      wrapper_style={{ display: "inline-flex", cursor: blocked ? "not-allowed" : undefined }}
    >
      {children}
    </Tooltip>
  );
}

const Divider = ({ isDark }) => (
  <span
    aria-hidden="true"
    style={{
      width: 1,
      height: 18,
      margin: "0 2px",
      backgroundColor: "var(--pupu-border-subtle)",
    }}
  />
);

/* undo / redo / home · Run · Save. `run` is the Run control, when the canvas
   has one; Save takes the accent only while there is something to save. */
export function CanvasControlCenter({
  isDark,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onHome,
  onSave,
  saveLabel,
  saveDisabled,
  saveActive,
  run,
  testId,
}) {
  const { t } = useTranslation();
  const isMac = usePresentationPlatform() === "darwin";
  const tokens = overlay_tokens(isDark);
  const undoHint = t("agents.canvas.undo", { shortcut: isMac ? "⌘Z" : "Ctrl+Z" });
  const redoHint = t("agents.canvas.redo", { shortcut: isMac ? "⌘⇧Z" : "Ctrl+Y" });
  /* The canvas centres this graph's own Start node (skeleton_canvas.js). */
  const startHint = t("agents.canvas.go_to_start");
  const part = (name) => (testId ? `${testId}-${name}` : undefined);
  return (
    <ShadowSurface
      data-testid={testId}
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: 6,
        borderRadius: 12,
        ...glass(tokens),
        boxShadow: tokens.controlShadow,
        color: "var(--pupu-text)",
      }}
    >
      <ControlHint label={undoHint} testId={part("undo-hint")} blocked={!canUndo}>
        <Button
          prefix_icon="arrow_left"
          ariaLabel={undoHint}
          onClick={onUndo}
          disabled={!canUndo}
          dom_props={{ "data-testid": part("undo") }}
          style={ICON_CONTROL(canUndo)}
        />
      </ControlHint>
      <ControlHint label={redoHint} testId={part("redo-hint")} blocked={!canRedo}>
        <Button
          prefix_icon="arrow_right"
          ariaLabel={redoHint}
          onClick={onRedo}
          disabled={!canRedo}
          dom_props={{ "data-testid": part("redo") }}
          style={ICON_CONTROL(canRedo)}
        />
      </ControlHint>
      <ControlHint label={startHint} testId={part("start-hint")}>
        <Button
          prefix_icon="locate_start"
          ariaLabel={startHint}
          onClick={onHome}
          dom_props={{ "data-testid": part("start") }}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 8,
            borderRadius: 7,
            opacity: 0.7,
            content: { icon: { width: 13, height: 13 } },
          }}
        />
      </ControlHint>
      {run && (
        <>
          <Divider isDark={isDark} />
          {run}
          <Divider isDark={isDark} />
        </>
      )}
      <ControlHint label={t("agents.save.save")} testId={part("save-hint")} blocked={Boolean(saveDisabled)}>
        <Button
          label={saveLabel === undefined ? t("agents.save.save") : saveLabel}
          onClick={onSave}
          disabled={saveDisabled}
          dom_props={{ "data-testid": part("save") }}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 14,
            borderRadius: 7,
            backgroundColor: saveActive ? "var(--pupu-accent)" : "transparent",
            color: saveActive ? "#fff" : "var(--pupu-text)",
            opacity: saveActive ? 1 : 0.5,
            ...(saveDisabled ? { pointerEvents: "none" } : null),
          }}
        />
      </ControlHint>
    </ShadowSurface>
  );
}

/* What sits above the control center: its popovers and the message strip,
   stacked so one never covers another. */
export function AboveControls({ children, testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        position: "absolute",
        left: "50%",
        bottom: ABOVE_CONTROLS,
        transform: "translateX(-50%)",
        zIndex: AGENTS_MODAL_Z.PANEL_MESSAGE,
        width: "max-content",
        maxWidth: "min(520px, calc(100% - 32px))",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

/* A card in the control center's glass. */
export function ControlPopover({ isDark, testId, children, width = 320 }) {
  const tokens = overlay_tokens(isDark);
  return (
    <ShadowSurface
      data-testid={testId}
      style={{
        width,
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: 12,
        borderRadius: 12,
        ...glass(tokens),
        boxShadow: tokens.shadow,
        color: "var(--pupu-text)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </ShadowSurface>
  );
}

/* Things the author has to be told: a save that failed, a graph that went
   away, an edit the graph refused. Each item is a sentence, or
   `{ text, testId }` when a caller names it. */
export function CanvasMessageStrip({ isDark, items, testId, role, standalone = false }) {
  const { t } = useTranslation();
  const list = (Array.isArray(items) ? items : []).filter(Boolean);
  if (list.length === 0) return null;
  const tokens = overlay_tokens(isDark);
  return (
    <ShadowSurface
      data-testid={testId}
      role={role}
      style={{
        ...(standalone
          ? {
              position: "absolute",
              left: "50%",
              bottom: ABOVE_CONTROLS,
              transform: "translateX(-50%)",
              zIndex: AGENTS_MODAL_Z.PANEL_MESSAGE,
              maxWidth: 520,
            }
          : {}),
        padding: "8px 12px",
        borderRadius: 8,
        background: isDark ? "rgba(90, 30, 30, 0.92)" : "#fff2f0",
        border: isDark ? "1px solid rgba(255,120,120,0.28)" : "1px solid rgba(220,70,70,0.22)",
        color: isDark ? "#ffd6d6" : "#9f1d1d",
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: tokens.shadow,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {list.map((item, index) => {
        const rendered = renderAgentMessage(item, t);
        return typeof rendered === "string" ? (
          <div key={index}>{rendered}</div>
        ) : (
          <div key={index} data-testid={item.testId}>
            {renderAgentMessage(item.text, t)}
          </div>
        );
      })}
    </ShadowSurface>
  );
}

/* "Esc to go back", at the top left while there is a level to go back to.
   Only a reminder: the way back by pointer is the side menu's breadcrumb, so
   this takes no pointer and may sit in the window's drag region. Mounted all
   along and faded, so it eases in and out as the author goes in and out. */
const ESCAPE_KEY = "Esc";
export function EscapeBackHint({ isDark, visible, top, left, testId = "canvas-escape-hint" }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  /* The sentence around the key, in the locale's own word order. */
  const marker = "\u0000";
  const sentence = String(t("agents.canvas.escape_back", { key: marker }));
  const at = sentence.indexOf(marker);
  const before = at >= 0 ? sentence.slice(0, at) : "";
  const after = at >= 0 ? sentence.slice(at + marker.length) : ` ${sentence}`;
  const muted = { color: "var(--pupu-text-muted, #86868b)", whiteSpace: "nowrap" };
  return (
    <div
      data-testid={testId}
      data-visible={visible ? "true" : "false"}
      aria-hidden={visible ? undefined : true}
      style={{
        position: "absolute",
        top,
        left,
        transform: `translateY(-50%) translateX(${visible || reducedMotion ? 0 : -4}px)`,
        zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11.5,
        lineHeight: 1,
        pointerEvents: "none",
        userSelect: "none",
        opacity: visible ? 1 : 0,
        transition: reducedMotion ? "none" : "opacity 180ms ease, transform 180ms ease",
      }}
    >
      {before && <span style={muted}>{before.trim()}</span>}
      <kbd
        data-testid={`${testId}-key`}
        style={{
          fontFamily: "inherit",
          fontSize: 10.5,
          fontWeight: 500,
          padding: "3px 6px",
          borderRadius: 6,
          color: "var(--pupu-text)",
          backgroundColor: `rgba(var(--pupu-text-rgb, ${isDark ? "255,255,255" : "0,0,0"}), ${isDark ? 0.12 : 0.07})`,
          boxShadow: `inset 0 0 0 1px rgba(var(--pupu-text-rgb, ${isDark ? "255,255,255" : "0,0,0"}), ${isDark ? 0.1 : 0.08})`,
        }}
      >
        {ESCAPE_KEY}
      </kbd>
      {after.trim() && <span style={muted}>{after.trim()}</span>}
    </div>
  );
}

/* A small note at the bottom left, for what the canvas is saved with. */
export function CanvasCaptionChip({ isDark, children, testId }) {
  const tokens = overlay_tokens(isDark);
  return (
    <ShadowSurface
      data-testid={testId}
      style={{
        position: "absolute",
        left: 14,
        bottom: 16,
        zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
        maxWidth: "min(420px, 40%)",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "6px 10px",
        borderRadius: 8,
        ...glass(tokens),
        boxShadow: tokens.shadow,
        fontSize: 11,
        lineHeight: 1.45,
        color: "#86868b",
      }}
    >
      {children}
    </ShadowSurface>
  );
}

/* The right side menu: a floating panel that slides in while a node is open,
   with the pill that drags its inner edge. The width is the page's, so both
   canvases share one remembered width. */
export function FloatingDetailShell({
  isDark,
  open,
  width,
  minWidth,
  resizing,
  testId,
  handle,
  onClose,
  onOpen,
  children,
}) {
  /* In the Agents workspace the panel is the window's right side menu: full
     height, one flat colour like the left one, rendered into the anchor the
     app shell keeps at the window's right edge. Anywhere else (no anchor) it
     stays the floating glass card. */
  const { agentsDetailSlot: dockSlot, appMode } = useContext(NavigationContext) || {};
  if (dockSlot) {
    // Popovers can portal outside the detail host, so remove the inspector
    // while Chat is active. The Builder keeps the document and selection.
    if (appMode === "chat") return null;
    return createPortal(
      <DockedDetailPanel
        isDark={isDark}
        open={open}
        width={width}
        minWidth={minWidth}
        resizing={resizing}
        testId={testId}
        handle={handle}
        onClose={onClose}
        onOpen={onOpen}
      >
        {children}
      </DockedDetailPanel>,
      dockSlot,
    );
  }
  return (
    <FloatingDetailCard
      isDark={isDark}
      open={open}
      width={width}
      minWidth={minWidth}
      resizing={resizing}
      testId={testId}
      handle={handle}
    >
      {children}
    </FloatingDetailCard>
  );
}

const SLIDE = "0.25s cubic-bezier(0.32,1,0.32,1)";

function DockedDetailPanel({
  isDark,
  open,
  width,
  minWidth,
  resizing,
  testId,
  handle,
  onClose,
  onOpen,
  children,
}) {
  const { t } = useTranslation();
  const platform = usePresentationPlatform();
  const liveWidth = `var(${DETAIL_WIDTH_VAR}, ${width}px)`;
  const sidebarFallback = isDark ? "#151515" : "rgb(245, 245, 245)";
  const backgroundColor = resizing
    ? `var(--pupu-sidebar, ${sidebarFallback})`
    : `var(--pupu-sidebar-glass, ${sidebarFallback})`;
  const backdropFilter = resizing ? "none" : SIDEBAR_GLASS_FILTER;
  /* The left side menu's frost, through the same compositing pass. */
  const surface = useSurfaceComposite({ backgroundColor, backdropFilter, enabled: !resizing });
  /* On macOS the toggle is one element pinned to the window's right edge, in
     the title bar band, outside the sliding panel, like the left side menu's
     toggle: it never moves or remounts, only its glyph changes, solid while
     the panel is open and hollow while it is closed. Elsewhere the window
     buttons own that corner, so the close button rides in the band's inner
     end and the panel reopens from the canvas. */
  const pinnedRight = platform === "darwin";
  const canClose = typeof onClose === "function";
  const canOpen = typeof onOpen === "function";
  /* `fitted`: the smaller backing that sits inside the open panel's corner.
     Without it, the button keeps the stock backing — the left side menu's —
     which is what the toggle shows while the panel is closed. */
  const glyph = (icon, label, onClick, disabled, testid, fitted = true) => (
    <ControlHint label={label} testId={`${testid}-hint`} position="bottom">
      <div style={{ transform: "scaleX(-1)", display: "flex" }}>
        <Button
          prefix_icon={icon}
          ariaLabel={label}
          disabled={disabled}
          onClick={onClick}
          dom_props={{ "data-testid": testid }}
          style={{ fontSize: 14, color: "var(--pupu-text)", WebkitAppRegion: "no-drag",
            ...(fitted ? { borderRadius: DETAIL_TOGGLE_RADIUS, iconOnlyPaddingVertical: DETAIL_TOGGLE_PADDING, iconOnlyPaddingHorizontal: DETAIL_TOGGLE_PADDING } : null) }}
        />
      </div>
    </ControlHint>
  );
  const pinnedShown = open ? canClose : canOpen;
  const pinnedToggle = pinnedRight && (canClose || canOpen) && (
    <div data-testid={`${testId}-toggle`} style={{
      position: "absolute",
      top: TOP_BAR_HEIGHT / 2,
      right: TOP_BAR_HEIGHT / 2,
      transform: "translate(50%, -50%)",
      opacity: pinnedShown ? 1 : 0,
      pointerEvents: pinnedShown ? "auto" : "none",
      WebkitAppRegion: "no-drag",
    }}>
      {open
        ? glyph("side_menu_close", t("common.close"), onClose, !canClose, `${testId}-close`)
        : glyph("side_menu_left", t("agents.editor.show_details"), onOpen, !canOpen, `${testId}-open`, false)}
    </div>
  );
  const closeButton = !pinnedRight && canClose && (
    <div style={{
      position: "absolute",
      /* Centred in the band, which is the title bar less the panel's inset. */
      top: "50%",
      left: TOP_BAR_HEIGHT / 2,
      transform: "translate(-50%, -50%)",
      opacity: open ? 1 : 0,
      pointerEvents: open ? "auto" : "none",
      transition: `opacity ${SLIDE}`,
      WebkitAppRegion: "no-drag",
    }}>
      {glyph("side_menu_close", t("common.close"), onClose, !open, `${testId}-close`)}
    </div>
  );
  return (
    <>
      {surface.definition}
      <div
        data-testid={testId}
        data-docked="true"
        /* Portalled out of the canvas, so the canvas's own inert boundary
           (run view) no longer covers it: a closed panel shuts itself. */
        inert={open ? undefined : true}
        aria-hidden={open ? undefined : true}
        style={{
          position: "absolute",
          /* A rounded panel one ring inside the window. The content still
             starts below the title bar band (shortened by the inset, so it
             starts at the same window height as before), which keeps this
             panel's close button (and on Windows / Linux the window
             buttons) on every platform alike. */
          top: DETAIL_INSET,
          right: DETAIL_INSET,
          bottom: DETAIL_INSET,
          borderRadius: DETAIL_RADIUS,
          border: "1px solid var(--pupu-border)",
          boxSizing: "border-box",
          width: liveWidth,
          minWidth,
          /* The same see-through sidebar colour as the left side menu,
             calibrated to land on the theme's sidebar colour. */
          /* Portalled out of the workspace, it no longer inherits the
             workspace's text colour: anything without its own colour fell
             back to the page default, black even in dark mode. */
          color: "var(--pupu-text)",
          backgroundColor,
          ...(!resizing && SURFACE_DITHER_STYLE),
          backdropFilter,
          WebkitBackdropFilter: backdropFilter,
          ...surface.style,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          /* Closed, it leaves the window entirely, inset included. */
          transform: open ? "translateX(0)" : `translateX(calc(100% + ${DETAIL_INSET}px))`,
          transition: resizing ? "none" : `transform ${SLIDE}`,
          pointerEvents: open ? "auto" : "none",
          WebkitAppRegion: "no-drag",
        }}
      >
        <div
          data-testid={`${testId}-band`}
          style={{
            position: "relative",
            /* On macOS the node header takes the title bar's row itself. */
            height: pinnedRight ? 0 : TOP_BAR_HEIGHT - DETAIL_INSET,
            flexShrink: 0,
            /* Still the window's title bar: it drags the window. */
            WebkitAppRegion: "drag",
          }}
        >
          {closeButton}
          {/* The panel's colour covers the title bar's window buttons, so
              it carries its own while open. */}
          {platform !== "darwin" && hasWindowControls() && (
            <WindowControls
              style={{
                position: "absolute",
                top: "50%",
                right: windowControlsInset(platform === "linux"),
                transform: "translateY(-50%)",
              }}
            />
          )}
        </div>
        <DetailChromeContext.Provider value={pinnedRight ? HEADER_IN_TITLE_ROW : null}>
          {children}
        </DetailChromeContext.Provider>
      </div>
      {pinnedToggle}
      {handle && (
        <PanelResizeHandle
          testId={handle.testId}
          isDark={isDark}
          pillTestId={handle.pillTestId}
          activeHeight={DETAIL_HANDLE_ACTIVE_HEIGHT}
          visible={Boolean(open)}
          style={{
            /* Like the left side menu's: inside the panel, against its
               inner edge, and over the panel's full height (title bar band
               included), so the pill sits at the panel's true middle. */
            top: DETAIL_INSET,
            bottom: DETAIL_INSET,
            right: `calc(${liveWidth} + ${DETAIL_INSET}px - 12px)`,
            /* Rides with the panel: the same slide, so it travels in and
               out with it instead of appearing at its place. */
            transform: open ? "translateX(0)" : `translateX(calc(${liveWidth} + ${DETAIL_INSET}px))`,
            transition: resizing ? "none" : `transform ${SLIDE}, opacity ${SLIDE}`,
          }}
          onDragStart={handle.onDragStart}
          onDrag={handle.onDrag}
          onDragEnd={handle.onDragEnd}
        />
      )}
    </>
  );
}

function FloatingDetailCard({
  isDark,
  open,
  width,
  minWidth,
  resizing,
  testId,
  handle,
  children,
}) {
  const tokens = overlay_tokens(isDark);
  const liveWidth = resizing ? `var(${DETAIL_WIDTH_VAR}, ${width}px)` : width;
  const surface = useSurfaceComposite({
    backgroundColor: tokens.background,
    backdropFilter: tokens.backdrop,
    enabled: open && !resizing,
  });
  return (
    <>
      <ShadowSurface
        data-testid={testId}
        style={{
          position: "absolute",
          zIndex: AGENTS_MODAL_Z.PANEL,
          borderRadius: 10,
          ...glass(tokens),
          ...(resizing && {
            backgroundColor: "var(--pupu-surface)",
            backdropFilter: "none",
            WebkitBackdropFilter: "none",
          }),
          ...surface.style,
          boxShadow: resizing ? "none" : tokens.shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          top: PANEL_INSET,
          right: PANEL_INSET,
          bottom: PANEL_INSET,
          width: liveWidth,
          minWidth,
          opacity: open ? 1 : 0,
          transform: open ? "translateX(0)" : "translateX(12px)",
          transition: resizing
            ? "none"
            : "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {surface.definition}
        {children}
      </ShadowSurface>
      {handle && (
        <PanelResizeHandle
          testId={handle.testId}
          isDark={isDark}
          pillTestId={handle.pillTestId}
          visible={Boolean(open)}
          style={{
            top: PANEL_INSET,
            bottom: PANEL_INSET,
            right: resizing
              ? `calc(${liveWidth} + ${PANEL_INSET + HANDLE_GAP}px)`
              : PANEL_INSET + width + HANDLE_GAP,
          }}
          onDragStart={handle.onDragStart}
          onDrag={handle.onDrag}
          onDragEnd={handle.onDragEnd}
        />
      )}
    </>
  );
}

/* Said to a screen reader, not drawn: the accent on Save is how a sighted
   author sees that there is unsaved work. */
export const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
