import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../SERVICEs/api";
import {
  RECIPE_PANEL_LIMITS,
  clampPanelWidth,
  readRecipePanelWidths,
  writeRecipePanelWidth,
} from "../../../SERVICEs/recipe_panel_widths";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { AGENTS_MODAL_Z, useTopStripCenter } from "../top_strip";
import RecipeList from "./recipes_page/recipe_list";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import PanelResizeHandle from "./recipes_page/panel_resize_handle";
import { to_save_payload } from "./recipes_page/recipe_save_payload";
import useRecipeHistory from "./recipes_page/use_recipe_history";

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
  } = useRecipeHistory(activeName);
  const [dirty, setDirty] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [saveError, setSaveError] = useState("");

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

  useEffect(() => {
    (async () => {
      const { recipes: list } = await api.unchain.listRecipes();
      setRecipes(list);
      if (list.length > 0) setActiveName(list[0].name);
    })();
  }, []);

  useEffect(() => {
    if (!activeName) return;
    (async () => {
      const r = await api.unchain.getRecipe(activeName);
      setActiveRecipeSilent(r);
      onSelectNode(null);
      setDirty(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeName]);

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
        />
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
          opacity: listCollapsed ? 0 : 1,
          transform: listCollapsed ? "translateX(-12px)" : "translateX(0)",
          transition:
            resizingPanel === "list"
              ? "none"
              : "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
          pointerEvents: listCollapsed ? "none" : "auto",
        }}
      >
        <RecipeList
          recipes={recipes}
          activeName={activeName}
          onSelect={handleSelectRecipe}
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
        visible={!listCollapsed}
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
      {listCollapsed && (
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
            paddingVertical: 6,
            paddingHorizontal: 6,
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
              icon: { width: 14, height: 14 },
            },
          }}
        />
      )}

      {saveError && (
        <div
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
            boxShadow: overlayShadow,
          }}
        >
          {saveError}
        </div>
      )}

      {/* ── Floating inspector (right detail panel) ── */}
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
        />
      </div>

      {/* ── Detail resize pill (floats just outside the panel's left edge) ── */}
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
    </div>
  );
}
