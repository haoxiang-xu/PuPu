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
  TOP_STRIP_LEADING_ICON,
  TOP_STRIP_LEADING_PADDING,
  useTopStripCenter,
} from "../top_strip";
import RecipeList from "./recipes_page/recipe_list";
import SkeletonResourceList from "./recipes_page/skeleton_resource_list";
import SkeletonResourcePage from "./skeleton_resource_page";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import PanelResizeHandle from "./recipes_page/panel_resize_handle";
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

// Floating panels sit PANEL_INSET px from the page edge; each resize pill's
// hit area starts HANDLE_GAP px past the panel's inner edge (the pill itself
// is centered inside that hit area, so it clears the panel visibly).
const PANEL_INSET = 6;
const HANDLE_GAP = 2;

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
  const headerTopPad = clearsTrafficLights ? 28 : 0;
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
        if (known.length > 0) setActiveName(known[0].name);
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
    if (!activeRecipe) return undefined;
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
  }, [activeRecipe, undo, redo]);

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
          <SkeletonResourcePage
            resourceId={skeletonResourceId}
            onDrilledChange={setSkeletonDrilled}
          />
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
        <SkeletonResourceList
          activeId={skeletonResourceId}
          onSelect={(id) => setSkeletonResourceId(id)}
          isDark={isDark}
        />
        <RecipeList
          recipes={recipes}
          activeName={activeName}
          onSelect={(name) => {
            setSkeletonResourceId(null);
            handleSelectRecipe(name);
          }}
          onListChange={setRecipes}
          onCollapse={() => setListCollapsed(true)}
          isDark={isDark}
          headerTopPad={headerTopPad}
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
          ariaLabel="Show workflows"
          style={{
            position: "absolute",
            top: topStripCenter,
            transform: "translateY(-50%)",
            left: topStripLeft,
            zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
            paddingVertical: TOP_STRIP_LEADING_PADDING,
            paddingHorizontal: TOP_STRIP_LEADING_PADDING,
            borderRadius: 6,
            opacity: 0.55,
            WebkitAppRegion: "no-drag",
            content: {
              prefixIconWrap: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
              },
              icon: {
                width: TOP_STRIP_LEADING_ICON,
                height: TOP_STRIP_LEADING_ICON,
              },
            },
          }}
        />
      )}

      {/* ── Drill breadcrumb ── */}
      {drilled && (
        <div
          data-testid="recipe-drill-breadcrumb"
          style={{
            position: "absolute",
            top: topStripCenter,
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: AGENTS_MODAL_Z.PANEL_CONTROL,
            display: "flex",
            alignItems: "center",
            gap: 4,
            maxWidth: "min(560px, 60%)",
            padding: "5px 10px",
            borderRadius: 8,
            backgroundColor: overlayBg,
            border: overlayBorder,
            backdropFilter: overlayBackdrop,
            WebkitBackdropFilter: overlayBackdrop,
            boxShadow: overlayShadow,
            fontSize: 11.5,
            WebkitAppRegion: "no-drag",
          }}
        >
          {crumbs.map((crumb, i) => (
            <span
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
            >
              {i > 0 && (
                <span
                  aria-hidden="true"
                  style={{ opacity: 0.4, fontSize: 10 }}
                >
                  ›
                </span>
              )}
              {crumb.navigable ? (
                <Button
                  label={crumb.label}
                  onClick={() => handleDrillTo(crumb.depth)}
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
                    opacity: i === crumbs.length - 1 ? 1 : 0.55,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div
          data-testid="recipe-message-banner"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 62,
            transform: "translateX(-50%)",
            zIndex: AGENTS_MODAL_Z.PANEL_MESSAGE,
            maxWidth: 520,
            padding: "8px 12px",
            borderRadius: 8,
            background: isDark ? "rgba(90, 30, 30, 0.92)" : "#fff2f0",
            border: isDark
              ? "1px solid rgba(255,120,120,0.28)"
              : "1px solid rgba(220,70,70,0.22)",
            color: isDark ? "#ffd6d6" : "#9f1d1d",
            fontSize: 12,
            lineHeight: 1.5,
            boxShadow: overlayShadow,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {messages.map((message, i) => (
            <div key={i}>{message}</div>
          ))}
        </div>
      )}

      {/* ── Floating inspector (right detail panel) ── */}
      {/* The legacy inspector belongs to the recipe canvas. With a Skeleton
          Agent open it was still mounted and still editable behind the new
          page, so a click there wrote to a recipe the author had left. */}
      {!skeletonResourceId && (
      <div
        data-testid="recipe-detail-panel-shell"
        style={{
          ...overlayPanel,
          top: PANEL_INSET,
          right: PANEL_INSET,
          bottom: PANEL_INSET,
          width: panelWidths.detail,
          minWidth: RECIPE_PANEL_LIMITS.detail.min,
          opacity: selectedNodeId ? 1 : 0,
          transform: selectedNodeId ? "translateX(0)" : "translateX(12px)",
          transition:
            resizingPanel === "detail"
              ? "none"
              : "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: selectedNodeId ? "auto" : "none",
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
      </div>
      )}

      {/* ── Detail resize pill (floats just outside the panel's left edge) ── */}
      {!skeletonResourceId && (
      <PanelResizeHandle
        testId="recipe-detail-resize-handle"
        isDark={isDark}
        pillTestId="recipe-detail-resize-pill"
        visible={Boolean(selectedNodeId)}
        style={{
          top: PANEL_INSET,
          bottom: PANEL_INSET,
          right: PANEL_INSET + panelWidths.detail + HANDLE_GAP,
        }}
        onDragStart={() => beginResize("detail")}
        onDrag={handleDetailResize}
        onDragEnd={() => endResize("detail")}
      />
      )}
    </div>
  );
}
