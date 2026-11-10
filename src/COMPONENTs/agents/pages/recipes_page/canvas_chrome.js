import ShadowSurface from "../../../../BUILTIN_COMPONENTs/material/shadow_surface";
import { useSurfaceComposite } from "../../../../BUILTIN_COMPONENTs/material/surface_composite";
import React, { useContext } from "react";
import { createPortal } from "react-dom";
import { NavigationContext } from "../../../../CONTAINERs/config/context";
import { SURFACE_DITHER_STYLE } from "../../../../BUILTIN_COMPONENTs/material/surface_dither";
import { SIDEBAR_GLASS_FILTER } from "../../../../CONTAINERs/config/theme_semantic";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import usePresentationPlatform from "../../../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import { AGENTS_MODAL_Z } from "../../top_strip";
import PanelResizeHandle from "./panel_resize_handle";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { renderAgentMessage } from "./agents_i18n";
import { TOP_BAR_HEIGHT } from "../../../../BUILTIN_COMPONENTs/electron/title_bar";
import WindowControls, { windowControlsInset } from "../../../../BUILTIN_COMPONENTs/electron/window_controls";
import { windowStateBridge } from "../../../../SERVICEs/bridges/window_state_bridge";

const hasWindowControls = () =>
  typeof window !== "undefined" &&
  window.runtime?.isElectron === true &&
  windowStateBridge.isActionAvailable();

/* The docked detail panel's width while its edge is dragged, set on the
   window's right-edge anchor (see RecipesPage). */
export const DETAIL_WIDTH_VAR = "--pupu-agents-detail-width";

/* Where the docked panel's close button sits in the title bar band: clear
   of the Windows / Linux window buttons, at the edge on macOS. */
const detailCloseRight = (platform) => {
  if (platform === "win32") return windowControlsInset(false) + 3 * 40 + 8;
  if (platform === "linux") return windowControlsInset(true) + 3 * 24 + 2 * 8 + 8;
  return TOP_BAR_HEIGHT / 2;
};

/* The builder's chrome, shared by both canvases.
 *
 * The unified design has exactly these pieces floating over a full-bleed
 * canvas: the library on the left, the detail panel on the right, one small
 * control center at the bottom middle (undo / redo / home · Run · Save), and a
 * breadcrumb at the top left while a subagent's graph is open. They were drawn
 * once for the legacy Recipe canvas; the native Skeleton page grew its own bar
 * and buttons instead. Both canvases now take them from here, so the two stay
 * the same picture and neither can grow a third. */

// Floating panels sit PANEL_INSET px from the page edge; each resize pill's
// hit area starts HANDLE_GAP px past the panel's inner edge (the pill itself
// is centered inside that hit area, so it clears the panel visibly).
export const PANEL_INSET = 6;
export const HANDLE_GAP = 2;

/* Where the strip of messages and the control center's popovers sit: just
   above the control center, centered on it. */
export const ABOVE_CONTROLS = 62;

export function overlay_tokens(isDark) {
  return {
    background: isDark ? "rgba(20, 20, 20, 0.72)" : "rgba(255, 255, 255, 0.78)",
    border: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
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
  content: { icon: { width: 13, height: 13 } },
});

const Divider = ({ isDark }) => (
  <span
    aria-hidden="true"
    style={{
      width: 1,
      height: 18,
      margin: "0 2px",
      backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)",
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
      }}
    >
      <span title={undoHint} style={{ display: "inline-flex" }}>
        <Button prefix_icon="arrow_left" onClick={onUndo} disabled={!canUndo} style={ICON_CONTROL(canUndo)} />
      </span>
      <span title={redoHint} style={{ display: "inline-flex" }}>
        <Button prefix_icon="arrow_right" onClick={onRedo} disabled={!canRedo} style={ICON_CONTROL(canRedo)} />
      </span>
      <span title={t("agents.canvas.center")} style={{ display: "inline-flex" }}>
        <Button
          prefix_icon="home"
          onClick={onHome}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 8,
            borderRadius: 7,
            opacity: 0.7,
            content: { icon: { width: 13, height: 13 } },
          }}
        />
      </span>
      {run && (
        <>
          <Divider isDark={isDark} />
          {run}
          <Divider isDark={isDark} />
        </>
      )}
      <Button
        label={saveLabel === undefined ? t("agents.save.save") : saveLabel}
        onClick={onSave}
        disabled={saveDisabled}
        style={{
          fontSize: 12,
          paddingVertical: 5,
          paddingHorizontal: 14,
          borderRadius: 7,
          backgroundColor: saveActive ? "#4a5bd8" : "transparent",
          color: saveActive ? "#fff" : isDark ? "#ddd" : "#333",
          opacity: saveActive ? 1 : 0.5,
        }}
      />
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
        color: isDark ? "#e6e6ea" : "#222",
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

/* `Reviewer › Subagent Pool › Summarizer`, at the top left.
 *
 * Only the graphs left behind are navigable: the pool crumb names where the
 * step happened rather than a place to go, and the last crumb is the graph on
 * screen. `testId` names the crumbs themselves; the hint beside them is not a
 * crumb. */
export function FloatingBreadcrumb({
  isDark,
  crumbs,
  onNavigate,
  top,
  left,
  testId,
  crumbsTestId,
  crumbAriaLabel,
  hint,
}) {
  const { t } = useTranslation();
  const hintCaption = hint === undefined ? t("agents.canvas.escape_up") : hint;
  const list = Array.isArray(crumbs) ? crumbs : [];
  if (list.length === 0) return null;
  const tokens = overlay_tokens(isDark);
  const items = list.map((crumb, index) => (
    <span key={index} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      {index > 0 && (
        <span aria-hidden="true" style={{ opacity: 0.4, fontSize: 10 }}>
          ›
        </span>
      )}
      {crumb.navigable ? (
        <Button
          label={crumb.label}
          ariaLabel={crumbAriaLabel ? crumbAriaLabel(crumb) : undefined}
          onClick={() => onNavigate(crumb.depth)}
          style={{
            fontSize: 11.5,
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 5,
            color: isDark ? "#c9c9d1" : "#55555d",
          }}
        />
      ) : (
        <span
          style={{
            padding: "2px 6px",
            color: isDark ? "#f0f0f3" : "#1d1d22",
            opacity: index === list.length - 1 ? 1 : 0.55,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {crumb.label}
        </span>
      )}
    </span>
  ));
  return (
    <ShadowSurface
      style={{
        position: "absolute",
        top,
        left,
        transform: "translateY(-50%)",
        zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
        display: "flex",
        alignItems: "center",
        gap: 4,
        maxWidth: "min(620px, 70%)",
        padding: "5px 10px",
        borderRadius: 8,
        ...glass(tokens),
        boxShadow: tokens.shadow,
        fontSize: 11.5,
        WebkitAppRegion: "no-drag",
      }}
    >
      <div data-testid={testId} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
        {crumbsTestId ? (
          <div data-testid={crumbsTestId} style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {items}
          </div>
        ) : (
          items
        )}
      </div>
      {hintCaption && (
        <span
          style={{
            marginLeft: 6,
            paddingLeft: 10,
            borderLeft: tokens.border,
            fontSize: 11,
            color: "#86868b",
            whiteSpace: "nowrap",
          }}
        >
          {hintCaption}
        </span>
      )}
    </ShadowSurface>
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
  children,
}) {
  /* In the Agents workspace the panel is the window's right side menu: full
     height, one flat colour like the left one, rendered into the anchor the
     app shell keeps at the window's right edge. Anywhere else (no anchor) it
     stays the floating glass card. */
  const dockSlot = useContext(NavigationContext)?.agentsDetailSlot || null;
  if (dockSlot) {
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
  children,
}) {
  const { t } = useTranslation();
  const platform = usePresentationPlatform();
  /* Live while dragged (the anchor carries the variable), else the state. */
  const liveWidth = `var(${DETAIL_WIDTH_VAR}, ${width}px)`;
  const backgroundColor = isDark
    ? "var(--pupu-sidebar-glass, #151515)"
    : "var(--pupu-sidebar-glass, rgb(245, 245, 245))";
  /* The left side menu's frost, through the same compositing pass. */
  const surface = useSurfaceComposite({ backgroundColor, backdropFilter: SIDEBAR_GLASS_FILTER });
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
          /* The colour runs the full height, like the left side menu; the
             content starts below the title bar band, which keeps this
             panel's close button (and on Windows / Linux the window
             buttons) on every platform alike. */
          top: 0,
          right: 0,
          bottom: 0,
          width: liveWidth,
          minWidth,
          /* The same see-through sidebar colour as the left side menu,
             calibrated to land on the theme's sidebar colour. */
          /* Portalled out of the workspace, it no longer inherits the
             workspace's text colour: anything without its own colour fell
             back to the page default, black even in dark mode. */
          color: "var(--pupu-text)",
          backgroundColor,
          ...SURFACE_DITHER_STYLE,
          backdropFilter: SIDEBAR_GLASS_FILTER,
          WebkitBackdropFilter: SIDEBAR_GLASS_FILTER,
          ...surface.style,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: resizing ? "none" : `transform ${SLIDE}`,
          pointerEvents: open ? "auto" : "none",
          WebkitAppRegion: "no-drag",
        }}
      >
        <div
          data-testid={`${testId}-band`}
          style={{
            position: "relative",
            height: TOP_BAR_HEIGHT,
            flexShrink: 0,
            /* Still the window's title bar: it drags the window. */
            WebkitAppRegion: "drag",
          }}
        >
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
        {children}
      </div>
      {handle && (
        <PanelResizeHandle
          testId={handle.testId}
          isDark={isDark}
          pillTestId={handle.pillTestId}
          visible={Boolean(open)}
          style={{
            top: TOP_BAR_HEIGHT,
            bottom: 0,
            /* Centred on the panel's inner edge. */
            right: `calc(${liveWidth} - 6px)`,
          }}
          onDragStart={handle.onDragStart}
          onDrag={handle.onDrag}
          onDragEnd={handle.onDragEnd}
        />
      )}
      {typeof onClose === "function" && (
        <div
          style={{
            position: "absolute",
            top: TOP_BAR_HEIGHT / 2,
            right: detailCloseRight(platform),
            /* On macOS the button's centre sits as far from the right edge
               as from the top: tucked into the corner. */
            transform:
              platform === "win32" || platform === "linux"
                ? "translateY(-50%)"
                : "translate(50%, -50%)",
            opacity: open ? 1 : 0,
            pointerEvents: open ? "auto" : "none",
            transition: `opacity ${SLIDE}`,
            WebkitAppRegion: "no-drag",
          }}
        >
          {/* The left side menu's open-state glyph, mirrored for the right. */}
          <div style={{ transform: "scaleX(-1)", display: "flex" }}>
            <Button
              prefix_icon="side_menu_close"
              ariaLabel={t("common.close")}
              disabled={!open}
              onClick={onClose}
              dom_props={{ "data-testid": `${testId}-close` }}
              style={{ fontSize: 14, color: "var(--pupu-text)", WebkitAppRegion: "no-drag" }}
            />
          </div>
        </div>
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
  const surface = useSurfaceComposite({
    backgroundColor: tokens.background,
    backdropFilter: tokens.backdrop,
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
          ...surface.style,
          boxShadow: tokens.shadow,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          top: PANEL_INSET,
          right: PANEL_INSET,
          bottom: PANEL_INSET,
          width,
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
            right: PANEL_INSET + width + HANDLE_GAP,
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
