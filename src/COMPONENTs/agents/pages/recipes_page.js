import { useEffect, useState } from "react";
import { api } from "../../../SERVICEs/api";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { getRuntimePlatform } from "../../side-menu/side_menu_utils";
import { windowStateBridge } from "../../../SERVICEs/bridges/window_state_bridge";
import RecipeList from "./recipes_page/recipe_list";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import RecipeInspector from "./recipes_page/recipe_inspector";

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
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(true);

  useEffect(() => {
    (async () => {
      const { recipes: list } = await api.unchain.listRecipes();
      setRecipes(list);
      if (list.length > 0) setActiveName(list[0].name);
    })();
  }, []);

  useEffect(() => {
    if (!activeName) {
      setActiveRecipe(null);
      return;
    }
    (async () => {
      const r = await api.unchain.getRecipe(activeName);
      setActiveRecipe(r);
      onSelectNode(null);
      setDirty(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeName]);

  const handleRecipeChange = (next) => {
    setActiveRecipe(next);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!activeRecipe) return;
    await api.unchain.saveRecipe(activeRecipe);
    const { recipes: list } = await api.unchain.listRecipes();
    setRecipes(list);
    setDirty(false);
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
          onSave={handleSave}
          dirty={dirty}
          isDark={isDark}
        />
      </div>

      {/* ── Floating recipe list (left side menu) ── */}
      {!listCollapsed && (
        <div
          style={{
            ...overlayPanel,
            top: 6,
            left: 6,
            bottom: 6,
            width: 200,
          }}
        >
          <RecipeList
            recipes={recipes}
            activeName={activeName}
            onSelect={setActiveName}
            onListChange={setRecipes}
            onCollapse={() => setListCollapsed(true)}
            isDark={isDark}
            headerTopPad={headerTopPad}
          />
        </div>
      )}

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

      {/* ── Floating inspector (right detail panel) — only when a node is selected ── */}
      {selectedNodeId && (
        <div
          style={{
            ...overlayPanel,
            top: 6,
            right: 6,
            bottom: 6,
            width: 300,
          }}
        >
          <RecipeInspector
            recipe={activeRecipe}
            selectedNodeId={selectedNodeId}
            onRecipeChange={handleRecipeChange}
            isDark={isDark}
          />
        </div>
      )}
    </div>
  );
}
