import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import api from "../../../SERVICEs/api.unchain";
import RecipeList from "./recipes_page/recipe_list";
import RecipeCanvas from "./recipes_page/recipe_canvas";
import RecipeInspector from "./recipes_page/recipe_inspector";

export default function RecipesPage({ isDark }) {
  const { theme } = useContext(ConfigContext);
  const [recipes, setRecipes] = useState([]);
  const [activeName, setActiveName] = useState(null);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      const { recipes: list } = await api.listRecipes();
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
      const r = await api.getRecipe(activeName);
      setActiveRecipe(r);
      setSelectedNodeId("agent");
      setDirty(false);
    })();
  }, [activeName]);

  const handleRecipeChange = (next) => {
    setActiveRecipe(next);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!activeRecipe) return;
    await api.saveRecipe(activeRecipe);
    const { recipes: list } = await api.listRecipes();
    setRecipes(list);
    setDirty(false);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "200px 1fr 300px",
        gap: 12,
        height: "100%",
        padding: 12,
      }}
    >
      <RecipeList
        recipes={recipes}
        activeName={activeName}
        onSelect={setActiveName}
        onListChange={setRecipes}
        isDark={isDark}
      />
      <RecipeCanvas
        recipe={activeRecipe}
        selectedNodeId={selectedNodeId}
        onSelectNode={setSelectedNodeId}
        onRecipeChange={handleRecipeChange}
        onSave={handleSave}
        dirty={dirty}
        isDark={isDark}
      />
      <RecipeInspector
        recipe={activeRecipe}
        selectedNodeId={selectedNodeId}
        onRecipeChange={handleRecipeChange}
        isDark={isDark}
      />
    </div>
  );
}
