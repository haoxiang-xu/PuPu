import { useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";

export default function RecipeList({
  recipes,
  activeName,
  onSelect,
  onListChange,
  onCollapse,
  isDark,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const accent = "#4a5bd8";
  const mutedColor = isDark ? "#888" : "#888";
  const rowBase = {
    padding: "7px 10px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
    marginBottom: 2,
    color: isDark ? "#ddd" : "#222",
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const payload = {
      name,
      description: "",
      model: null,
      max_iterations: null,
      agent: { prompt_format: "soul", prompt: "" },
      toolkits: [],
      subagent_pool: [],
    };
    await api.unchain.saveRecipe(payload);
    const { recipes: updated } = await api.unchain.listRecipes();
    onListChange(updated);
    onSelect(name);
    setCreating(false);
    setNewName("");
  };

  const handleDelete = async (name, ev) => {
    ev.stopPropagation();
    if (name === "Default") return;
    if (!window.confirm(`Delete recipe "${name}"?`)) return;
    await api.unchain.deleteRecipe(name);
    const { recipes: updated } = await api.unchain.listRecipes();
    onListChange(updated);
    if (activeName === name) {
      onSelect(updated[0]?.name || null);
    }
  };

  const handleDuplicate = async (name, ev) => {
    ev.stopPropagation();
    const full = await api.unchain.getRecipe(name);
    const base = `${name} Copy`;
    full.name = base;
    await api.unchain.saveRecipe(full);
    const { recipes: updated } = await api.unchain.listRecipes();
    onListChange(updated);
    onSelect(base);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        padding: "10px 8px",
        gap: 2,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "2px 6px 8px 2px",
        }}
      >
        {onCollapse && (
          <Button
            prefix_icon="side_menu_close"
            onClick={onCollapse}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 4,
              opacity: 0.5,
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
        <div
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: mutedColor,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          Agents
        </div>
      </div>
      <div
        className="scrollable"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 2,
        }}
      >
      {recipes.map((r) => (
        <div
          key={r.name}
          onClick={() => onSelect(r.name)}
          style={{
            ...rowBase,
            backgroundColor:
              r.name === activeName
                ? isDark
                  ? "rgba(74,91,216,0.18)"
                  : "#eef1ff"
                : "transparent",
            color: r.name === activeName ? accent : rowBase.color,
            fontWeight: r.name === activeName ? 600 : 400,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{r.name}</span>
          {r.name !== "Default" && (
            <span style={{ display: "flex", gap: 4, opacity: 0.6 }}>
              <button
                onClick={(e) => handleDuplicate(r.name, e)}
                title="Duplicate"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ⎘
              </button>
              <button
                onClick={(e) => handleDelete(r.name, e)}
                title="Delete"
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 11,
                }}
              >
                ✕
              </button>
            </span>
          )}
        </div>
      ))}
      </div>
      {creating ? (
        <div style={{ padding: "6px 4px" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            placeholder="Name"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") {
                setCreating(false);
                setNewName("");
              }
            }}
            style={{
              width: "100%",
              padding: "4px 6px",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#ccc"}`,
              borderRadius: 4,
              fontSize: 12,
              background: isDark ? "#1e1e22" : "#fff",
              color: isDark ? "#fff" : "#222",
            }}
          />
        </div>
      ) : (
        <div
          onClick={() => setCreating(true)}
          style={{
            ...rowBase,
            border: `1px dashed ${isDark ? "rgba(255,255,255,0.15)" : "#d0d0d5"}`,
            color: mutedColor,
            textAlign: "center",
            marginTop: 8,
          }}
        >
          + New Agent
        </div>
      )}
    </div>
  );
}
