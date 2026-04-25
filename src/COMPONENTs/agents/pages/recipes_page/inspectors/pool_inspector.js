import { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SubagentPicker from "../subagent_picker";

export default function PoolInspector({ recipe, onRecipeChange, isDark }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const removeAt = (idx) => {
    onRecipeChange({
      ...recipe,
      subagent_pool: recipe.subagent_pool.filter((_, i) => i !== idx),
    });
  };

  const add = (entry) => {
    onRecipeChange({
      ...recipe,
      subagent_pool: [...recipe.subagent_pool, entry],
    });
    setPickerOpen(false);
  };

  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: isDark ? "#fff" : "#222",
        }}
      >
        Subagent Pool
      </div>
      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
        {recipe.subagent_pool.length} subagents
      </div>

      <div style={{ marginTop: 14 }}>
        {recipe.subagent_pool.map((entry, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 0",
              borderBottom: `1px solid ${borderColor}`,
            }}
          >
            <span style={{ color: isDark ? "#ddd" : "#333" }}>
              {entry.kind === "ref" ? entry.template_name : entry.name}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 10,
                  color: "#888",
                  padding: "1px 6px",
                  border: `1px solid ${
                    isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
                  }`,
                  borderRadius: 10,
                }}
              >
                {entry.kind}
              </span>
              <Button
                prefix_icon="delete"
                onClick={() => removeAt(idx)}
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 4,
                  borderRadius: 4,
                  opacity: 0.5,
                  content: { icon: { width: 12, height: 12 } },
                }}
              />
            </span>
          </div>
        ))}
      </div>

      <Button
        prefix_icon="add"
        label="Add subagent"
        onClick={() => setPickerOpen(true)}
        style={{
          marginTop: 12,
          paddingVertical: 5,
          paddingHorizontal: 10,
          borderRadius: 6,
          fontSize: 12,
          iconSize: 12,
        }}
      />

      {pickerOpen && (
        <SubagentPicker
          onPick={add}
          onClose={() => setPickerOpen(false)}
          isDark={isDark}
        />
      )}
    </div>
  );
}
