import AgentInspector from "./inspectors/agent_inspector";
import ToolkitInspector from "./inspectors/toolkit_inspector";
import PoolInspector from "./inspectors/pool_inspector";

export default function RecipeInspector({
  recipe,
  selectedNodeId,
  onRecipeChange,
  isDark,
}) {
  const emptyStyle = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    fontSize: 12,
    color: isDark ? "#888" : "#888",
    userSelect: "none",
    WebkitUserSelect: "none",
  };
  if (!recipe) {
    return <div style={emptyStyle}>Select a recipe</div>;
  }
  if (!selectedNodeId) {
    return <div style={emptyStyle}>Click a node</div>;
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
      className="scrollable"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "14px 16px",
      }}
    >
      {content}
    </div>
  );
}
