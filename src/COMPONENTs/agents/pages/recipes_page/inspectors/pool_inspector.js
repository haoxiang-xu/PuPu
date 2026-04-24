import { useState } from "react";
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
      <div
        style={{
          fontSize: 11,
          color: isDark ? "#888" : "#888",
          marginTop: 2,
        }}
      >
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
              borderBottom: `1px dashed ${
                isDark ? "rgba(255,255,255,0.06)" : "#f0f0f2"
              }`,
            }}
          >
            <span style={{ color: isDark ? "#ddd" : "#333" }}>
              {entry.kind === "ref" ? entry.template_name : entry.name}
            </span>
            <span
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: isDark ? "#888" : "#888",
                  padding: "1px 6px",
                  border: `1px solid ${
                    isDark ? "rgba(255,255,255,0.15)" : "#d6d6db"
                  }`,
                  borderRadius: 10,
                }}
              >
                {entry.kind}
              </span>
              <button
                onClick={() => removeAt(idx)}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: "#c44",
                }}
              >
                ✕
              </button>
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setPickerOpen(true)}
        style={{
          marginTop: 12,
          padding: "4px 10px",
          border: `1px solid #4a5bd8`,
          background: "transparent",
          color: "#4a5bd8",
          borderRadius: 4,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        + Add subagent
      </button>

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
