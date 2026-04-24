import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

export default function ToolkitInspector({ recipe, onRecipeChange, isDark }) {
  const [catalog, setCatalog] = useState([]);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const { toolkits } = await api.unchain.getToolkitCatalog();
        setCatalog(toolkits || []);
      } catch (_exc) {
        setCatalog([]);
      }
    })();
  }, []);

  const toolkitsById = useMemo(() => {
    const map = {};
    recipe.toolkits.forEach((tk) => {
      map[tk.id] = tk;
    });
    return map;
  }, [recipe.toolkits]);

  const switchStyle = {
    width: 28,
    height: 16,
    borderRadius: 8,
    backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)",
    backgroundColor_on: "#4a5bd8",
    color: "#fff",
    transition: "all 0.2s ease",
  };

  const updateToolkits = (nextList) => {
    onRecipeChange({ ...recipe, toolkits: nextList });
  };

  const isToolkitAllOn = (toolkitId) => {
    const entry = toolkitsById[toolkitId];
    return entry && entry.enabled_tools === null;
  };

  const isToolOn = (toolkitId, toolName, allTools) => {
    const entry = toolkitsById[toolkitId];
    if (!entry) return false;
    if (entry.enabled_tools === null) return true;
    return entry.enabled_tools.includes(toolName);
  };

  const setToolkitAllOn = (toolkitId, on) => {
    const has = toolkitsById[toolkitId];
    if (on) {
      if (has) {
        updateToolkits(
          recipe.toolkits.map((tk) =>
            tk.id === toolkitId ? { ...tk, enabled_tools: null } : tk,
          ),
        );
      } else {
        updateToolkits([
          ...recipe.toolkits,
          { id: toolkitId, enabled_tools: null },
        ]);
      }
    } else {
      updateToolkits(recipe.toolkits.filter((tk) => tk.id !== toolkitId));
    }
  };

  const setToolOn = (toolkitId, toolName, on, allTools) => {
    const entry = toolkitsById[toolkitId];
    if (!entry) {
      if (on) {
        updateToolkits([
          ...recipe.toolkits,
          { id: toolkitId, enabled_tools: [toolName] },
        ]);
      }
      return;
    }
    let list;
    if (entry.enabled_tools === null) {
      list = allTools.map((t) => t.name);
      if (!on) list = list.filter((n) => n !== toolName);
    } else {
      const s = new Set(entry.enabled_tools);
      if (on) s.add(toolName);
      else s.delete(toolName);
      list = Array.from(s);
    }
    if (list.length === 0) {
      updateToolkits(recipe.toolkits.filter((tk) => tk.id !== toolkitId));
      return;
    }
    updateToolkits(
      recipe.toolkits.map((tk) =>
        tk.id === toolkitId ? { ...tk, enabled_tools: list } : tk,
      ),
    );
  };

  const toggleExpanded = (id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const textColor = isDark ? "#ddd" : "#333";
  const mutedColor = "#888";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{ fontSize: 12, color: textColor }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: isDark ? "#fff" : "#222",
          marginBottom: 2,
        }}
      >
        Tool Pool
      </div>
      <div style={{ fontSize: 11, color: mutedColor, marginBottom: 14 }}>
        {catalog.length} toolkits · {recipe.toolkits.length} enabled
      </div>

      {catalog.length === 0 && (
        <div style={{ color: mutedColor, fontSize: 11 }}>
          No toolkits available.
        </div>
      )}

      {catalog.map((tk) => {
        const allTools = tk.tools || [];
        const isOpen = !!expanded[tk.id];
        const allOn = isToolkitAllOn(tk.id);
        const entry = toolkitsById[tk.id];
        const enabledCount = !entry
          ? 0
          : entry.enabled_tools === null
            ? allTools.length
            : entry.enabled_tools.length;

        return (
          <div
            key={tk.id}
            style={{
              borderBottom: `1px solid ${borderColor}`,
              paddingBottom: 4,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 0",
              }}
            >
              <div
                onClick={() => toggleExpanded(tk.id)}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  flex: 1,
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <Icon
                  src={isOpen ? "arrow_down" : "arrow_right"}
                  style={{ width: 10, height: 10, flexShrink: 0, opacity: 0.6 }}
                />
                <span style={{ fontWeight: 500, fontSize: 13 }}>{tk.id}</span>
                <span style={{ fontSize: 11, color: mutedColor }}>
                  {enabledCount}/{allTools.length}
                </span>
              </div>
              <Switch
                on={allOn}
                set_on={(next) => setToolkitAllOn(tk.id, next)}
                style={switchStyle}
              />
            </div>
            {isOpen && (
              <div style={{ paddingLeft: 18, paddingBottom: 4 }}>
                {allTools.length === 0 && (
                  <div style={{ fontSize: 11, color: mutedColor, padding: "4px 0" }}>
                    No tools.
                  </div>
                )}
                {allTools.map((tool) => (
                  <div
                    key={tool.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "4px 0",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12 }}>
                      {tool.name}
                    </div>
                    <Switch
                      on={isToolOn(tk.id, tool.name, allTools)}
                      set_on={(next) =>
                        setToolOn(tk.id, tool.name, next, allTools)
                      }
                      style={switchStyle}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
