import AgentInspector from "./inspectors/agent_inspector";
import ToolkitInspector from "./inspectors/toolkit_inspector";
import PoolInspector from "./inspectors/pool_inspector";

export default function RecipeInspector({
  recipe,
  selectedNodeId,
  onRecipeChange,
  isDark,
}) {
  const borderLeft = `1px solid ${
    isDark ? "rgba(255,255,255,0.08)" : "#e5e5e7"
  }`;
  if (!recipe) {
    return (
      <div
        style={{
          borderLeft,
          paddingLeft: 12,
          fontSize: 12,
          color: isDark ? "#888" : "#888",
        }}
      >
        Select a recipe
      </div>
    );
  }
  if (!selectedNodeId) {
    return (
      <div
        style={{
          borderLeft,
          paddingLeft: 12,
          fontSize: 12,
          color: isDark ? "#888" : "#888",
        }}
      >
        Click a node
      </div>
    );
  }

  let content = null;
  if (selectedNodeId === "agent") {
    content = (
      <AgentInspector
        recipe={recipe}
        onRecipeChange={onRecipeChange}
        isDark={isDark}
      />
    );
  } else if (selectedNodeId.startsWith("tk:")) {
    const toolkitId = selectedNodeId.slice(3);
    content = (
      <ToolkitInspector
        recipe={recipe}
        toolkitId={toolkitId}
        onRecipeChange={onRecipeChange}
        isDark={isDark}
      />
    );
  } else if (selectedNodeId === "pool") {
    content = (
      <PoolInspector
        recipe={recipe}
        onRecipeChange={onRecipeChange}
        isDark={isDark}
      />
    );
  }
  return (
    <div
      style={{
        borderLeft,
        paddingLeft: 12,
        overflowY: "auto",
        minWidth: 0,
      }}
    >
      {content}
    </div>
  );
}
