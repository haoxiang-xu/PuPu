import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";

export default function AgentInspector({ recipe, onRecipeChange, isDark }) {
  const label = (text) => (
    <div
      style={{
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#888",
        marginBottom: 4,
        marginTop: 12,
      }}
    >
      {text}
    </div>
  );

  const inputStyle = {
    width: "100%",
    fontSize: 12,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
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
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
        Agent node
      </div>

      {label("Description")}
      <Input
        value={recipe.description || ""}
        set_value={(v) => onRecipeChange({ ...recipe, description: v })}
        placeholder="Short description"
        style={inputStyle}
      />

      {label("Model")}
      <Input
        value={recipe.model || ""}
        set_value={(v) => onRecipeChange({ ...recipe, model: v || null })}
        placeholder="e.g., anthropic:claude-sonnet-4-6"
        style={inputStyle}
      />

      {label("Max iterations")}
      <Input
        value={recipe.max_iterations != null ? String(recipe.max_iterations) : ""}
        set_value={(v) => {
          const trimmed = (v || "").trim();
          const next = trimmed ? parseInt(trimmed, 10) : null;
          onRecipeChange({
            ...recipe,
            max_iterations: Number.isFinite(next) ? next : null,
          });
        }}
        placeholder="system default"
        style={inputStyle}
      />

      {label("Prompt format")}
      <SegmentedButton
        options={[
          { label: "Soul", value: "soul" },
          { label: "Skeleton", value: "skeleton" },
        ]}
        value={recipe.agent.prompt_format}
        on_change={(v) =>
          onRecipeChange({
            ...recipe,
            agent: { ...recipe.agent, prompt_format: v },
          })
        }
        style={{ fontSize: 11 }}
      />

      {label(
        recipe.agent.prompt_format === "soul"
          ? "Prompt (soul body)"
          : "Prompt (skeleton JSON)",
      )}
      <TextField
        value={recipe.agent.prompt || ""}
        set_value={(v) =>
          onRecipeChange({
            ...recipe,
            agent: { ...recipe.agent, prompt: v },
          })
        }
        min_rows={10}
        max_display_rows={20}
        placeholder="Enter prompt..."
        style={{
          fontSize: 12,
          fontFamily: "ui-monospace, monospace",
          borderRadius: 6,
          width: "100%",
          padding: 8,
        }}
      />
    </div>
  );
}
