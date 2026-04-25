import { useEffect, useState } from "react";
import { api } from "../../../SERVICEs/api";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { getRuntimePlatform } from "../../side-menu/side_menu_utils";
import { windowStateBridge } from "../../../SERVICEs/bridges/window_state_bridge";
import RecipeList from "./recipes_page/recipe_list";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import DetailPanel from "./recipes_page/detail_panel/detail_panel";
import { to_save_payload } from "./recipes_page/recipe_save_payload";
import useRecipeHistory from "./recipes_page/use_recipe_history";

export default function RecipesPage({
  isDark,
  selectedNodeId,
  onSelectNode,
  fullscreen,
}) {
  const isDarwin = getRuntimePlatform() === "darwin";
  const [appFullscreen, setAppFullscreen] = useState(false);

  useEffect(() => {
    if (!windowStateBridge.isListenerAvailable()) return undefined;
    const cleanup = windowStateBridge.onWindowStateChange(({ isMaximized }) => {
      setAppFullscreen(Boolean(isMaximized));
    });
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  const trafficLightPad = fullscreen && isDarwin && !appFullscreen;
  const headerTopPad = trafficLightPad ? 28 : 0;
  const expandTop = trafficLightPad ? 42 : 14;
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
  const [listCollapsed, setListCollapsed] = useState(true);
  const [saveError, setSaveError] = useState("");

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
    zIndex: 3,
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
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
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
        style={{
          ...overlayPanel,
          top: 6,
          left: 6,
          bottom: 6,
          width: 200,
          opacity: listCollapsed ? 0 : 1,
          transform: listCollapsed ? "translateX(-12px)" : "translateX(0)",
          transition:
            "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
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

      {/* ── Expand button (only when list is collapsed) ── */}
      {listCollapsed && (
        <Button
          prefix_icon="side_menu_left"
          onClick={() => setListCollapsed(false)}
          style={{
            position: "absolute",
            top: expandTop,
            left: 14,
            zIndex: 4,
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
            zIndex: 5,
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
        style={{
          ...overlayPanel,
          top: 6,
          right: 6,
          bottom: 6,
          width: 300,
          opacity: selectedNodeId ? 1 : 0,
          transform: selectedNodeId ? "translateX(0)" : "translateX(12px)",
          transition:
            "opacity 0.25s cubic-bezier(0.32,1,0.32,1), transform 0.25s cubic-bezier(0.32,1,0.32,1)",
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
    </div>
  );
}
