import { useEffect, useState } from "react";
import api from "../../../../../SERVICEs/api.unchain";

export default function ToolkitInspector({
  recipe,
  toolkitId,
  onRecipeChange,
  isDark,
}) {
  const [allTools, setAllTools] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { toolkits } = await api.getToolkitCatalog();
        const match = (toolkits || []).find((tk) => tk.id === toolkitId);
        setAllTools(match ? match.tools || [] : []);
      } catch (exc) {
        setAllTools([]);
      }
    })();
  }, [toolkitId]);

  const current = recipe.toolkits.find((tk) => tk.id === toolkitId);
  if (!current) return <div>(toolkit not in recipe)</div>;

  const allOn = current.enabled_tools === null;
  const enabledSet = new Set(current.enabled_tools || []);
  const isEnabled = (toolName) => allOn || enabledSet.has(toolName);

  const setEnabled = (toolName, on) => {
    let nextList;
    if (allOn) {
      nextList = allTools
        .map((t) => t.name)
        .filter((n) => n !== toolName || on);
    } else {
      const s = new Set(current.enabled_tools);
      if (on) s.add(toolName);
      else s.delete(toolName);
      nextList = Array.from(s);
    }
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.map((tk) =>
        tk.id === toolkitId ? { ...tk, enabled_tools: nextList } : tk,
      ),
    });
  };

  const resetToAll = () => {
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.map((tk) =>
        tk.id === toolkitId ? { ...tk, enabled_tools: null } : tk,
      ),
    });
  };

  const removeToolkit = () => {
    if (!window.confirm(`Remove toolkit "${toolkitId}" from this recipe?`))
      return;
    onRecipeChange({
      ...recipe,
      toolkits: recipe.toolkits.filter((tk) => tk.id !== toolkitId),
    });
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: isDark ? "#fff" : "#222",
        }}
      >
        {toolkitId}
      </div>
      <div
        style={{
          fontSize: 11,
          color: isDark ? "#888" : "#888",
          marginTop: 2,
        }}
      >
        Toolkit
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={resetToAll}
          style={{
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid ${
              isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
            }`,
            background: "transparent",
            color: isDark ? "#ddd" : "#333",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Enable all
        </button>
        <button
          onClick={removeToolkit}
          style={{
            padding: "3px 8px",
            fontSize: 11,
            border: `1px solid #c44`,
            background: "transparent",
            color: "#c44",
            borderRadius: 4,
            cursor: "pointer",
          }}
        >
          Remove from recipe
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        {allTools.map((tool) => (
          <label
            key={tool.name}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "5px 0",
              borderBottom: `1px dashed ${
                isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"
              }`,
              color: isDark ? "#ddd" : "#333",
            }}
          >
            <span>{tool.name}</span>
            <input
              type="checkbox"
              checked={isEnabled(tool.name)}
              onChange={(e) => setEnabled(tool.name, e.target.checked)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
