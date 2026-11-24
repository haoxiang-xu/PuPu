import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import ShadowSurface from "../../../BUILTIN_COMPONENTs/material/shadow_surface";
import { useSurfaceComposite } from "../../../BUILTIN_COMPONENTs/material/surface_composite";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { NavigationContext } from "../../../CONTAINERs/config/context";
import { SIDE_MENU_WIDTH, agentsSidebarWidthCss, clampSideMenuWidth } from "../../../SERVICEs/side_menu_width";
import { createLiveResizeWidth } from "../../../SERVICEs/live_resize_width";
import { createPortal } from "react-dom";
import {
  RECIPE_PANEL_LIMITS,
  clampPanelWidth,
  readRecipePanelWidths,
  writeRecipePanelWidth,
} from "../../../SERVICEs/recipe_panel_widths";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import {
  AGENTS_MODAL_Z,
  useTopStripCenter,
} from "../top_strip";
import AgentExplorer from "./recipes_page/agent_explorer";
import { RECIPE_PANEL_HEADER } from "./recipes_page/recipe_list";
import SkeletonResourcePage from "./skeleton_resource_page";
import { FlowEditor } from "../../../BUILTIN_COMPONENTs/flow_editor";
import PanelResizeHandle from "./recipes_page/panel_resize_handle";
import {
  DETAIL_WIDTH_VAR,
  HANDLE_GAP,
  PANEL_INSET,
} from "./recipes_page/canvas_chrome";

const LIST_WIDTH_VAR = "--pupu-agents-list-drag-width";

/* Nothing open yet (the explorer is still choosing the default Agent, or the
   open one was deleted): the bare canvas, without a graph or its controls. */
function EmptyCanvas({ isDark }) {
  return (
    <div data-testid="agents-empty-canvas" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <FlowEditor
        style={{ width: "100%", height: "100%", borderRadius: 0 }}
        theme={{
          canvasBackground: isDark ? "var(--pupu-background, #1a1a1a)" : "var(--pupu-background, #fafafb)",
          gridColor: "var(--pupu-overlay-ghost)",
        }}
        nodes={[]}
        edges={[]}
      />
    </div>
  );
}

export default function RecipesPage({
  isDark,
  onSelectNode,
  fullscreen,
  /* Docked: the agent list renders into `explorerSlot` (the side menu's
     Agents pane) instead of floating over the canvas, and the side menu's own
     toggle stands in for the list's collapse button. */
  explorerSlot = null,
  explorerDocked = false,
  /* Docked: the way back out of the Agents pane, shown under its search. */
  onExplorerBack,
}) {
  /* One centerline for every control on the modal's top strip (#339). */
  const { t } = useTranslation();
  const {
    center: topStripCenter,
    left: topStripLeft,
    clearsTrafficLights,
  } = useTopStripCenter(fullscreen);
  /* Docked, the canvas runs under the open side menu, so the hint pinned to
     the top-left starts past it. */
  const nav = useContext(NavigationContext) || {};
  const crumbLeft =
    explorerDocked && nav.onFragment === "side_menu"
      ? `calc(${agentsSidebarWidthCss(nav.sideMenuWidth || SIDE_MENU_WIDTH.DEFAULT)} + 14px)`
      : topStripLeft;
  /* Where the list's own toggle sits inside the open panel, so the floating
     one shown while it is collapsed lands on the same spot. Next to the
     traffic lights it steps right, staying on the top line. */
  const headerLeft = clearsTrafficLights
    ? topStripLeft
    : PANEL_INSET + RECIPE_PANEL_HEADER.INSET;
  const headerLeadingPad =
    headerLeft - (PANEL_INSET + RECIPE_PANEL_HEADER.INSET);
  const [listCollapsed, setListCollapsed] = useState(false);

  /* The open Agent, addressed by its resource id (a name is a label: it is
     renamed and may repeat). */
  const [skeletonResourceId, setSkeletonResourceId] = useState(null);
  const skeletonResourceIdRef = useRef(skeletonResourceId);
  skeletonResourceIdRef.current = skeletonResourceId;
  const [newSkeletonDraft, setNewSkeletonDraft] = useState(null);
  /* Whether the open Skeleton resource has unsaved work, and a counter that
     re-opens it from the store after the explorer renamed it (the stored
     version moved; a clean editor simply re-reads). */
  const [skeletonDirty, setSkeletonDirty] = useState(false);
  const [skeletonReload, setSkeletonReload] = useState(0);
  /* A Skeleton Agent drilled into one of its subagents: the resource list is
     not the graph being edited, and offering a switch from there would drop
     the drill stack's unsaved parent. The Skeleton page owns that stack and
     says when it is open. */
  const [skeletonDrilled, setSkeletonDrilled] = useState(false);


  // Panel widths: the original fixed 200 / 300 are now the minimums; the user
  // drags the inner edge to widen either panel. Live width is React state so
  // the panel re-lays out as the pointer moves; the value is persisted once on
  // release, and the enter/leave transition is suppressed while dragging so
  // the edge follows the pointer without lag.
  /* Each panel's ceiling is a share of the canvas, so it has to be measured.
     jsdom and a first paint report 0, where the window's own width is a better
     guess than collapsing every panel to its minimum. */
  const canvasRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  const [panelWidths, setPanelWidths] = useState(() =>
    readRecipePanelWidths(
      typeof window === "undefined" ? undefined : window.innerWidth,
    ),
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      const measured = el.getBoundingClientRect().width;
      setContainerWidth(
        measured > 0
          ? measured
          : typeof window === "undefined"
            ? 0
            : window.innerWidth,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* A window that shrank must pull the panels back inside their new share. */
  useEffect(() => {
    setPanelWidths((prev) => {
      const next = {
        list: clampPanelWidth("list", prev.list, containerWidth),
        detail: clampPanelWidth("detail", prev.detail, containerWidth),
      };
      return next.list === prev.list && next.detail === prev.detail
        ? prev
        : next;
    });
  }, [containerWidth]);
  const [resizingPanel, setResizingPanel] = useState(null);
  const panelDrag = useRef(null);
  const containerWidthRef = useRef(containerWidth);
  useEffect(() => {
    containerWidthRef.current = containerWidth;
  }, [containerWidth]);

  const panelWidthsRef = useRef(panelWidths);
  useEffect(() => {
    panelWidthsRef.current = panelWidths;
  }, [panelWidths]);

  const beginResize = (panel) => {
    panelDrag.current?.live.dispose();
    const startWidth = panelWidthsRef.current[panel];
    panelDrag.current = {
      panel,
      startWidth,
      live: createLiveResizeWidth(panel === "list" ? LIST_WIDTH_VAR : DETAIL_WIDTH_VAR, startWidth),
    };
    setResizingPanel(panel);
  };
  useEffect(() => () => panelDrag.current?.live.dispose(), []);
  const moveResize = useCallback((dx) => {
    const drag = panelDrag.current;
    if (!drag) return;
    const { panel, startWidth, live } = drag;
    live.update(clampPanelWidth(
      panel,
      startWidth + (panel === "list" ? dx : -dx),
      containerWidthRef.current,
    ));
  }, []);
  const endResize = useCallback((panel) => {
    const drag = panelDrag.current;
    if (drag?.panel !== panel) return;
    panelDrag.current = null;
    const width = clampPanelWidth(panel, drag.live.width, containerWidthRef.current);
    drag.live.dispose();
    setPanelWidths((prev) => prev[panel] === width ? prev : { ...prev, [panel]: width });
    setResizingPanel(null);
    writeRecipePanelWidth(panel, width);
  }, []);
  const listWidth = resizingPanel === "list"
    ? `var(${LIST_WIDTH_VAR}, ${panelWidths.list}px)`
    : panelWidths.list;

  const headerButtonStyle = {
    paddingVertical:
      (RECIPE_PANEL_HEADER.HEIGHT - RECIPE_PANEL_HEADER.ICON) / 2,
    paddingHorizontal:
      (RECIPE_PANEL_HEADER.HEIGHT - RECIPE_PANEL_HEADER.ICON) / 2,
    borderRadius: RECIPE_PANEL_HEADER.RADIUS,
    opacity: 0.55,
    flexShrink: 0,
    WebkitAppRegion: "no-drag",
    content: {
      prefixIconWrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 0,
      },
      icon: {
        width: RECIPE_PANEL_HEADER.ICON,
        height: RECIPE_PANEL_HEADER.ICON,
      },
    },
  };
  /* Drilled in, the workflow list is not the graph you are editing — it would
     offer a switch that silently drops the parent frame's unsaved edits. */
  const listHidden = listCollapsed || skeletonDrilled;
  /* The left side menu's inner edge in window x, as it is once settled
     (null: closed), for the canvas to center things right of it. Docked it
     is the app's side menu from the window's left edge; floating, the list
     PANEL_INSET inside this page. Committed widths only: a live drag is not
     a moment anything is centered in. */
  const leftEdgeInputs = useRef(null);
  leftEdgeInputs.current = {
    docked: explorerDocked,
    open: explorerDocked ? nav.onFragment === "side_menu" : !listHidden,
    sideMenuWidth: nav.sideMenuWidth,
    listWidth: panelWidths.list,
  };
  const leftEdge = useCallback(() => {
    const inputs = leftEdgeInputs.current;
    if (!inputs || !inputs.open) return null;
    if (inputs.docked) return clampSideMenuWidth(inputs.sideMenuWidth || SIDE_MENU_WIDTH.DEFAULT);
    const page = canvasRef.current?.getBoundingClientRect();
    return page ? page.left + PANEL_INSET + inputs.listWidth : null;
  }, []);

  const overlayBg = isDark
    ? "rgba(var(--pupu-surface-rgb, 20, 20, 20), 0.72)"
    : "rgba(var(--pupu-surface-rgb, 255, 255, 255), 0.78)";
  const overlayBorder = "1px solid var(--pupu-border-subtle)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";
  const resizingList = resizingPanel === "list";
  const listSurface = useSurfaceComposite({
    backgroundColor: overlayBg,
    backdropFilter: overlayBackdrop,
    enabled: !explorerDocked && !listHidden && !resizingList,
  });
  const overlayShadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)";

  const overlayPanel = {
    position: "absolute",
    zIndex: AGENTS_MODAL_Z.PANEL,
    borderRadius: 10,
    backgroundColor: resizingList ? "var(--pupu-surface)" : overlayBg,
    border: overlayBorder,
    backdropFilter: resizingList ? "none" : overlayBackdrop,
    WebkitBackdropFilter: resizingList ? "none" : overlayBackdrop,
    boxShadow: resizingList ? "none" : overlayShadow,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  const explorerElement = (
    <AgentExplorer
      activeId={skeletonResourceId}
      newDraft={newSkeletonDraft}
      activeDirty={skeletonDirty}
      autoSelectDefault={!skeletonResourceId}
      onSelect={(id) => {
        setNewSkeletonDraft(null);
        setSkeletonResourceId(id);
      }}
      onCreate={(args) => {
        setNewSkeletonDraft(args);
        setSkeletonResourceId(args.id);
      }}
      onActiveChanged={(event) => {
        if (event?.type === "deleted") {
          if (event.id === skeletonResourceIdRef.current) {
            setSkeletonResourceId(null);
            setNewSkeletonDraft(null);
            setSkeletonDirty(false);
            onSelectNode(null);
          }
          return;
        }
        setSkeletonReload((n) => n + 1);
      }}
      onCollapse={explorerDocked ? undefined : () => setListCollapsed(true)}
      isDark={isDark}
      headerLeadingPad={explorerDocked ? 0 : headerLeadingPad}
      docked={explorerDocked}
      onBack={explorerDocked ? onExplorerBack : undefined}
      locked={explorerDocked && skeletonDrilled}
    />
  );

  /* Docked, the list renders in the side menu's Agents pane. Drilled in, it
     stays mounted (its folders keep their open state) and locks itself. */
  const dockedExplorer =
    explorerDocked && explorerSlot
      ? createPortal(
          <div
            data-testid="recipe-list-docked"
            style={{
              /* Portalled into the side menu: carry the workspace's text
                 colour instead of the page default. */
              color: "var(--pupu-text)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            {explorerElement}
          </div>,
          explorerSlot,
        )
      : null;

  return (
    <div
      ref={canvasRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      {/* ── Full-bleed node graph canvas ── */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
        }}
      >
        {skeletonResourceId ? (
          /* Full-bleed: the library, the detail panel and the control center
             float over the graph, and nothing of the native page sits outside
             them. */
          <div data-testid="skeleton-workspace" style={{ position: "absolute", inset: 0 }}>
          <SkeletonResourcePage
            key={skeletonReload}
            resourceId={skeletonResourceId}
            newDraft={newSkeletonDraft}
            onDrilledChange={setSkeletonDrilled}
            onDirtyChange={setSkeletonDirty}
            chrome={{
              crumbTop: topStripCenter,
              crumbLeft,
              leftEdge,
              detail: {
                width: panelWidths.detail,
                minWidth: RECIPE_PANEL_LIMITS.detail.min,
                resizing: resizingPanel === "detail",
                onDragStart: () => beginResize("detail"),
                onDrag: moveResize,
                onDragEnd: () => endResize("detail"),
              },
            }}
          />
          </div>
        ) : (
        <EmptyCanvas isDark={isDark} />
        )}
      </div>

      {dockedExplorer}

      {/* ── Floating recipe list (left side menu) ── */}
      {!explorerDocked && (
        <ShadowSurface
          data-testid="recipe-list-panel-shell"
          style={{
            ...overlayPanel,
            ...listSurface.style,
            top: PANEL_INSET,
            left: PANEL_INSET,
            bottom: PANEL_INSET,
            width: listWidth,
            minWidth: RECIPE_PANEL_LIMITS.list.min,
            opacity: listHidden ? 0 : 1,
            transform: listHidden ? "translateX(-12px)" : "translateX(0)",
            transition:
              resizingList
                ? "none"
                : "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
            pointerEvents: listHidden ? "none" : "auto",
          }}
        >
          {listSurface.definition}
          {explorerElement}
        </ShadowSurface>
      )}

      {/* ── List resize pill (floats just outside the list's right edge) ── */}
      {!explorerDocked && (
        <PanelResizeHandle
          testId="recipe-list-resize-handle"
          isDark={isDark}
          pillTestId="recipe-list-resize-pill"
          visible={!listHidden}
          style={{
            top: PANEL_INSET,
            bottom: PANEL_INSET,
            left: resizingList
              ? `calc(${listWidth} + ${PANEL_INSET + HANDLE_GAP}px)`
              : PANEL_INSET + panelWidths.list + HANDLE_GAP,
          }}
          onDragStart={() => beginResize("list")}
          onDrag={moveResize}
          onDragEnd={() => endResize("list")}
        />
      )}

      {/* ── Expand button (only when list is collapsed) ── */}
      {!explorerDocked && listCollapsed && !skeletonDrilled && (
        <Button
          prefix_icon="side_menu_left"
          onClick={() => setListCollapsed(false)}
          ariaLabel={t("agents.editor.show_agents")}
          style={{
            ...headerButtonStyle,
            position: "absolute",
            top: topStripCenter,
            transform: "translateY(-50%)",
            left: headerLeft,
            zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
          }}
        />
      )}

    </div>
  );
}
