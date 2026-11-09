import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import TextField from "../../../../../BUILTIN_COMPONENTs/input/textfield";
import SegmentedButton from "../../../../../BUILTIN_COMPONENTs/input/segmented_button";

export default function AgentInspector({ recipe, onRecipeChange, isDark }) {
  const { t } = useTranslation();
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
        {t("agents.inspector.agent_node")}
      </div>

      {label(t("agents.inspector.description"))}
      <Input
        value={recipe.description || ""}
        set_value={(v) => onRecipeChange({ ...recipe, description: v })}
        placeholder={t("agents.inspector.short_description")}
        style={inputStyle}
      />

      {label(t("agents.inspector.model"))}
      <Input
        value={recipe.model || ""}
        set_value={(v) => onRecipeChange({ ...recipe, model: v || null })}
        placeholder={t("agents.inspector.model_example", { model: "anthropic:claude-sonnet-4-6" })}
        style={inputStyle}
      />

      {label(t("agents.inspector.max_iterations"))}
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
        placeholder={t("agents.inspector.system_default")}
        style={inputStyle}
      />

      {label(t("agents.inspector.prompt_format"))}
      <SegmentedButton
        options={[
          { label: t("agents.inspector.soul"), value: "soul" },
          { label: t("agents.inspector.skeleton"), value: "skeleton" },
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
          ? t("agents.inspector.soul_prompt")
          : t("agents.inspector.skeleton_prompt"),
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
        placeholder={t("agents.inspector.enter_prompt")}
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
