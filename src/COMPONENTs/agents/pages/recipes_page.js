import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
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
import RecipeCanvas from "./recipes_page/recipe_canvas";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import PanelResizeHandle from "./recipes_page/panel_resize_handle";
import {
  CanvasMessageStrip,
  FloatingBreadcrumb,
  FloatingDetailShell,
  HANDLE_GAP,
  PANEL_INSET,
} from "./recipes_page/canvas_chrome";
import { to_save_payload } from "./recipes_page/recipe_save_payload";
import useRecipeHistory from "./recipes_page/use_recipe_history";
import {
  DRILL,
  drill_crumbs,
  drill_target,
  frame_is_stale,
  library_unavailable_message,
  left_behind_message,
  stale_frame_message,
  drill_unavailable_reason,
  missing_reference_message,
  push_drill_frame,
  read_failure_message,
  reference_exists,
  unwind_drill_stack,
} from "./recipes_page/subagent_drill";


export default function RecipesPage({
  isDark,
  selectedNodeId,
  onSelectNode,
  fullscreen,
}) {
  /* One centerline for every control on the modal's top strip (#339). */
  const {
    center: topStripCenter,
    left: topStripLeft,
    clearsTrafficLights,
  } = useTopStripCenter(fullscreen);
  /* Where the list's own toggle sits inside the open panel, so the floating
     one shown while it is collapsed lands on the same spot. Next to the
     traffic lights it steps right, staying on the top line. */
  const headerLeft = clearsTrafficLights
    ? topStripLeft
    : PANEL_INSET + RECIPE_PANEL_HEADER.INSET;
  const headerLeadingPad =
    headerLeft - (PANEL_INSET + RECIPE_PANEL_HEADER.INSET);
  const [recipes, setRecipes] = useState([]);
  const [activeName, setActiveName] = useState(null);
  const {
    recipe: activeRecipe,
    setRecipe: setActiveRecipe,
    setRecipeSilent: setActiveRecipeSilent,
    undo,
    redo,
    canUndo,
    canRedo,
    exportHistory,
    importHistory,
  } = useRecipeHistory(activeName);
  const [dirty, setDirty] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [saveError, setSaveError] = useState("");

  /* A Skeleton resource is addressed by id and a legacy recipe by name, so
     they are held in two different pieces of state. Selecting one clears the
     other rather than overwriting a single "current thing", which is what
     would let a name be used as an id. */
  const [skeletonResourceId, setSkeletonResourceId] = useState(null);
  const [newSkeletonDraft, setNewSkeletonDraft] = useState(null);
  /* Whether the open Skeleton resource has unsaved work, and a counter that
     re-opens it from the store after the explorer renamed, archived or
     restored it (the stored version moved; a clean editor simply re-reads). */
  const [skeletonDirty, setSkeletonDirty] = useState(false);
  const [skeletonReload, setSkeletonReload] = useState(0);
  /* A Skeleton Agent drilled into one of its subagents: the resource list is
     not the graph being edited, and offering a switch from there would drop
     the drill stack's unsaved parent. The Skeleton page owns that stack and
     says when it is open. */
  const [skeletonDrilled, setSkeletonDrilled] = useState(false);

  /* ── Drilling into a subagent ──────────────────────────────────────────
     A referenced subagent is the shared Agent resource, not a copy living in
     its parent, so drilling in switches the editor to that resource by
     identity. Undo history and the dirty flag are keyed on the resource being
     edited, so they isolate themselves; the stack carries what they cannot —
     the graph left behind, with its unsaved edits, its selection and its
     viewport. */
  const [drillStack, setDrillStack] = useState([]);
  const [notices, setNotices] = useState([]);
  const [restoreViewport, setRestoreViewport] = useState(undefined);
  const viewportOutRef = useRef({ x: 0, y: 0, zoom: 1 });
  const handedFrameRef = useRef(null);
  const restoreTokenRef = useRef(0);
  const recipesRef = useRef([]);
  /* How many times each resource has been written in this editing session.
     A frame taken before a write is holding an older copy, and its history
     describes content that is no longer what the file says. */
  const savedVersionsRef = useRef({});
  const drilled = drillStack.length > 0;

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
  const resizeStartWidthRef = useRef(0);
  const containerWidthRef = useRef(containerWidth);
  useEffect(() => {
    containerWidthRef.current = containerWidth;
  }, [containerWidth]);
  useEffect(() => {
    recipesRef.current = recipes;
  }, [recipes]);

  const panelWidthsRef = useRef(panelWidths);
  useEffect(() => {
    panelWidthsRef.current = panelWidths;
  }, [panelWidths]);

  const beginResize = (panel) => {
    resizeStartWidthRef.current = panelWidthsRef.current[panel];
    setResizingPanel(panel);
  };
  // The list is anchored left, so dragging right (+dx) widens it; the detail
  // panel is anchored right, so dragging left (−dx) widens it.
  const handleListResize = useCallback((dx) => {
    setPanelWidths((prev) => ({
      ...prev,
      list: clampPanelWidth(
        "list",
        resizeStartWidthRef.current + dx,
        containerWidthRef.current,
      ),
    }));
  }, []);
  const handleDetailResize = useCallback((dx) => {
    setPanelWidths((prev) => ({
      ...prev,
      detail: clampPanelWidth(
        "detail",
        resizeStartWidthRef.current - dx,
        containerWidthRef.current,
      ),
    }));
  }, []);
  const endResize = useCallback((panel) => {
    setResizingPanel(null);
    writeRecipePanelWidth(panel, panelWidthsRef.current[panel]);
  }, []);

  /* An unreachable bridge — the sidecar not up yet — used to throw inside this
     effect with nothing catching it, so the page stayed blank and the reason
     only existed in the console. */
  useEffect(() => {
    (async () => {
      try {
        const { recipes: list } = await api.unchain.listRecipes();
        const known = Array.isArray(list) ? list : [];
        setRecipes(known);
        /* With a native library the explorer opens the chat's default Agent;
           only a build without one falls back to the first legacy recipe. */
        const nativeLibrary = typeof api?.unchain?.listSkeletonResources === "function";
        if (known.length > 0 && !nativeLibrary) setActiveName(known[0].name);
      } catch (error) {
        setNotices([library_unavailable_message(error)]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeName) return;
    /* Entering or leaving a sub-graph hands the definition over directly. A
       drill-in already read it before navigating, so a failed read never
       strands the user on some other graph; a drill-up carries the parent's
       unsaved edits, and re-reading here would discard them — going back is
       not a save. */
    const handed = handedFrameRef.current;
    if (handed && handed.name === activeName) {
      handedFrameRef.current = null;
      setActiveRecipeSilent(handed.recipe);
      setDirty(Boolean(handed.dirty));
      onSelectNode(handed.selectedNodeId || null);
      /* An undo history is only meaningful against the content it was recorded
         on. If this resource was written while the frame was held, replaying
         that history would rewind into states the file never had, so it is
         dropped and said out loud rather than quietly applied. */
      const stale = frame_is_stale(handed, savedVersionsRef.current);
      importHistory(stale ? null : handed.history);
      if (stale) {
        setNotices((prev) => [...prev, stale_frame_message(handed.name)]);
      }
      restoreTokenRef.current += 1;
      setRestoreViewport({
        ...(handed.viewport || { x: 0, y: 0, zoom: 1 }),
        token: restoreTokenRef.current,
      });
      return;
    }
    (async () => {
      try {
        const r = await api.unchain.getRecipe(activeName);
        if (!r) throw new Error("the definition came back empty");
        setActiveRecipeSilent(r);
        onSelectNode(null);
        setDirty(false);
      } catch (error) {
        setNotices([read_failure_message(activeName, error)]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeName]);

  const handleDrillIn = useCallback(
    async (entry) => {
      setNotices([]);
      const target = drill_target(entry);
      if (target.kind !== DRILL.REFERENCE) {
        setNotices([drill_unavailable_reason(entry)].filter(Boolean));
        return;
      }
      /* Read before navigating, and say which reference broke. Landing on the
         library's first entry would read as the subagent having been replaced
         by a different one. */
      if (!reference_exists(entry, recipesRef.current)) {
        setNotices([missing_reference_message(target.name)]);
        return;
      }
      let loaded = null;
      try {
        loaded = await api.unchain.getRecipe(target.name);
      } catch (error) {
        setNotices([read_failure_message(target.name, error)]);
        return;
      }
      if (!loaded) {
        setNotices([read_failure_message(target.name, null)]);
        return;
      }
      setDrillStack((stack) =>
        push_drill_frame(stack, {
          name: activeName,
          label: activeRecipe?.name || activeName,
          via_label: "Subagent Pool",
          recipe: activeRecipe,
          dirty,
          selectedNodeId,
          viewport: { ...viewportOutRef.current },
          history: exportHistory(),
          saved_version: savedVersionsRef.current[activeName] || 0,
        }),
      );
      /* A graph opened for the first time starts at the origin; Home centers
         its own Start. */
      handedFrameRef.current = {
        name: target.name,
        recipe: loaded,
        dirty: false,
        selectedNodeId: null,
        viewport: { x: 0, y: 0, zoom: 1 },
      };
      setActiveName(target.name);
    },
    [activeName, activeRecipe, dirty, selectedNodeId, exportHistory],
  );

  const handleDrillTo = useCallback(
    (depth) => {
      /* Going up is not a save, so a dirty graph is left as it was on disk.
         That has to be visible — one keypress is a light gesture for losing
         work without a word. */
      setNotices(
        dirty && activeName ? [left_behind_message(activeName)] : [],
      );
      const { frame, stack } = unwind_drill_stack(drillStack, depth);
      if (!frame) return;
      handedFrameRef.current = frame;
      setDrillStack(stack);
      setActiveName(frame.name);
    },
    [drillStack, dirty, activeName],
  );

  /* Returns whether Escape was used, so the canvas knows to stop it before it
     closes the Agents modal. */
  const handleDrillUp = useCallback(() => {
    if (drillStack.length === 0) return false;
    handleDrillTo(drillStack.length - 1);
    return true;
  }, [drillStack, handleDrillTo]);

  const crumbs = drill_crumbs(
    drillStack,
    activeRecipe?.name || activeName || "",
  );

  const handleRecipeChange = (next) => {
    setActiveRecipe(next);
    setDirty(true);
    setSaveError("");
  };

  const handleRecipeChangeSilent = (next) => {
    setActiveRecipeSilent(next);
    setDirty(true);
    setSaveError("");
  };

  const handleSelectRecipe = (name) => {
    setActiveName(name);
  };

  useEffect(() => {
    /* The legacy history only while its canvas is the one on screen: with a
       native Agent open these keys are that editor's, and answering here too
       stepped a recipe nobody was looking at. */
    if (!activeRecipe || skeletonResourceId) return undefined;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeRecipe, skeletonResourceId, undo, redo]);

  const handleSave = async () => {
    if (!activeRecipe) return;
    try {
      setSaveError("");
      await api.unchain.saveRecipe(to_save_payload(activeRecipe));
      savedVersionsRef.current[activeName] =
        (savedVersionsRef.current[activeName] || 0) + 1;
      const { recipes: list } = await api.unchain.listRecipes();
      setRecipes(list);
      setDirty(false);
    } catch (error) {
      const message =
        error && typeof error.message === "string"
          ? error.message
          : "Recipe graph is invalid";
      setSaveError(message);
    }
  };

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
  const listHidden = listCollapsed || drilled || skeletonDrilled;

  /* Both at once rather than one masking the other: a drill-in can fail while
     an unsaved graph is still refusing to save. */
  const messages = [saveError, ...notices].filter(Boolean);

  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";
  const overlayShadow = isDark
    ? "0 8px 32px rgba(0,0,0,0.5)"
    : "0 8px 32px rgba(0,0,0,0.1)";

  const overlayPanel = {
    position: "absolute",
    zIndex: AGENTS_MODAL_Z.PANEL,
    borderRadius: 10,
    backgroundColor: overlayBg,
    border: overlayBorder,
    backdropFilter: overlayBackdrop,
    WebkitBackdropFilter: overlayBackdrop,
    boxShadow: overlayShadow,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

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
          /* Full-bleed like the legacy canvas: the library, the detail panel
             and the control center float over the graph, and nothing of the
             native page sits outside them. */
          <div data-testid="skeleton-workspace" style={{ position: "absolute", inset: 0 }}>
          <SkeletonResourcePage
            key={skeletonReload}
            resourceId={skeletonResourceId}
            newDraft={newSkeletonDraft}
            onDrilledChange={setSkeletonDrilled}
            onDirtyChange={setSkeletonDirty}
            chrome={{
              crumbTop: topStripCenter,
              crumbLeft: topStripLeft,
              detail: {
                width: panelWidths.detail,
                minWidth: RECIPE_PANEL_LIMITS.detail.min,
                resizing: resizingPanel === "detail",
                onDragStart: () => beginResize("detail"),
                onDrag: handleDetailResize,
                onDragEnd: () => endResize("detail"),
              },
            }}
          />
          </div>
        ) : (
        <RecipeCanvas
          recipe={activeRecipe}
          selectedNodeId={selectedNodeId}
          onSelectNode={onSelectNode}
          onRecipeChange={handleRecipeChange}
          onRecipeChangeSilent={handleRecipeChangeSilent}
          onSave={handleSave}
          dirty={dirty}
          isDark={isDark}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          recipes={recipes}
          onDrillIn={handleDrillIn}
          onEscape={handleDrillUp}
          viewportOutRef={viewportOutRef}
          restoreViewport={restoreViewport}
        />
        )}
      </div>

      {/* ── Floating recipe list (left side menu) ── */}
      <div
        data-testid="recipe-list-panel-shell"
        style={{
          ...overlayPanel,
          top: PANEL_INSET,
          left: PANEL_INSET,
          bottom: PANEL_INSET,
          width: panelWidths.list,
          minWidth: RECIPE_PANEL_LIMITS.list.min,
          opacity: listHidden ? 0 : 1,
          transform: listHidden ? "translateX(-12px)" : "translateX(0)",
          transition:
            resizingPanel === "list"
              ? "none"
              : "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: listHidden ? "none" : "auto",
        }}
      >
        <AgentExplorer
          recipes={recipes}
          activeId={skeletonResourceId}
          activeLegacyName={skeletonResourceId ? null : activeName}
          newDraft={newSkeletonDraft}
          activeDirty={skeletonDirty}
          autoSelectDefault={!skeletonResourceId && !activeName}
          onSelect={(id) => {
            setNewSkeletonDraft(null);
            setSkeletonResourceId(id);
          }}
          onSelectLegacy={(name) => {
            setNewSkeletonDraft(null);
            setSkeletonResourceId(null);
            handleSelectRecipe(name);
          }}
          onCreate={(args) => {
            setNewSkeletonDraft(args);
            setSkeletonResourceId(args.id);
          }}
          onActiveChanged={() => setSkeletonReload((n) => n + 1)}
          onCollapse={() => setListCollapsed(true)}
          isDark={isDark}
          headerLeadingPad={headerLeadingPad}
        />
      </div>

      {/* ── List resize pill (floats just outside the list's right edge) ── */}
      <PanelResizeHandle
        testId="recipe-list-resize-handle"
        isDark={isDark}
        pillTestId="recipe-list-resize-pill"
        visible={!listHidden}
        style={{
          top: PANEL_INSET,
          bottom: PANEL_INSET,
          left: PANEL_INSET + panelWidths.list + HANDLE_GAP,
        }}
        onDragStart={() => beginResize("list")}
        onDrag={handleListResize}
        onDragEnd={() => endResize("list")}
      />

      {/* ── Expand button (only when list is collapsed) ── */}
      {listCollapsed && !drilled && !skeletonDrilled && (
        <Button
          prefix_icon="side_menu_left"
          onClick={() => setListCollapsed(false)}
          ariaLabel="Show agents"
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

      {/* ── Drill breadcrumb (top left, where the expand button would be) ── */}
      {drilled && (
        <FloatingBreadcrumb
          isDark={isDark}
          crumbs={crumbs}
          onNavigate={handleDrillTo}
          top={topStripCenter}
          left={topStripLeft}
          testId="recipe-drill-breadcrumb"
        />
      )}

      <CanvasMessageStrip
        isDark={isDark}
        items={messages}
        testId="recipe-message-banner"
        standalone
      />

      {/* ── Floating inspector (right detail panel) ── */}
      {/* The legacy inspector belongs to the recipe canvas. With a Skeleton
          Agent open it was still mounted and still editable behind the new
          page, so a click there wrote to a recipe the author had left. */}
      {!skeletonResourceId && (
        <FloatingDetailShell
          isDark={isDark}
          open={Boolean(selectedNodeId)}
          width={panelWidths.detail}
          minWidth={RECIPE_PANEL_LIMITS.detail.min}
          resizing={resizingPanel === "detail"}
          testId="recipe-detail-panel-shell"
          handle={{
            testId: "recipe-detail-resize-handle",
            pillTestId: "recipe-detail-resize-pill",
            onDragStart: () => beginResize("detail"),
            onDrag: handleDetailResize,
            onDragEnd: () => endResize("detail"),
          }}
        >
          <DetailPanel
            recipe={activeRecipe}
            selectedNodeId={selectedNodeId}
            onChange={handleRecipeChange}
            onChangeSilent={handleRecipeChangeSilent}
            recipes={recipes}
            onDrillIn={handleDrillIn}
          />
        </FloatingDetailShell>
      )}
    </div>
  );
}
