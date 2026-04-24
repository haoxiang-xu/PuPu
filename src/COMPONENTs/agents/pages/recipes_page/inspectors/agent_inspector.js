import { useState } from "react";

export default function AgentInspector({ recipe, onRecipeChange, isDark }) {
  const [format, setFormat] = useState(recipe.agent.prompt_format);

  const label = (text) => (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: isDark ? "#888" : "#888",
        marginBottom: 4,
        marginTop: 12,
      }}
    >
      {text}
    </div>
  );
  const input = {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
    borderRadius: 4,
    fontSize: 12,
    background: isDark ? "#1e1e22" : "#fff",
    color: isDark ? "#fff" : "#222",
    boxSizing: "border-box",
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
        {recipe.name}
      </div>
      <div
        style={{
          fontSize: 11,
          color: isDark ? "#888" : "#888",
          marginTop: 2,
        }}
      >
        Agent node
      </div>

      {label("Description")}
      <input
        style={input}
        value={recipe.description || ""}
        onChange={(e) =>
          onRecipeChange({ ...recipe, description: e.target.value })
        }
      />

      {label("Model")}
      <input
        style={input}
        placeholder="e.g., anthropic:claude-sonnet-4-6 (empty = system default)"
        value={recipe.model || ""}
        onChange={(e) =>
          onRecipeChange({ ...recipe, model: e.target.value || null })
        }
      />

      {label("Max iterations")}
      <input
        type="number"
        style={input}
        placeholder="empty = system default"
        value={recipe.max_iterations ?? ""}
        onChange={(e) =>
          onRecipeChange({
            ...recipe,
            max_iterations: e.target.value
              ? parseInt(e.target.value, 10)
              : null,
          })
        }
      />

      {label("Prompt format")}
      <div
        style={{
          display: "inline-flex",
          gap: 0,
          border: `1px solid ${isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"}`,
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        {["soul", "skeleton"].map((f) => (
          <span
            key={f}
            onClick={() => {
              setFormat(f);
              onRecipeChange({
                ...recipe,
                agent: { ...recipe.agent, prompt_format: f },
              });
            }}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              cursor: "pointer",
              background: format === f ? "#4a5bd8" : "transparent",
              color:
                format === f ? "#fff" : isDark ? "#aaa" : "#888",
            }}
          >
            {f}
          </span>
        ))}
      </div>

      {label(
        format === "soul" ? "Prompt (soul body)" : "Prompt (skeleton JSON)",
      )}
      <textarea
        rows={14}
        style={{
          ...input,
          fontFamily: "ui-monospace, monospace",
          lineHeight: 1.5,
          resize: "vertical",
        }}
        value={recipe.agent.prompt || ""}
        onChange={(e) =>
          onRecipeChange({
            ...recipe,
            agent: { ...recipe.agent, prompt: e.target.value },
          })
        }
      />
    </div>
  );
}
