import React, { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SubagentPicker from "../subagent_picker";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function SubagentPoolPanel({ node, recipe, onChange, isDark }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function set_subagents(nextSubagents) {
    if (typeof onChange !== "function") return;
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, subagents: nextSubagents } : n,
      ),
    });
  }

  function add_subagent(entry) {
    set_subagents([...(node.subagents || []), entry]);
    setPickerOpen(false);
  }

  function remove_subagent(index) {
    set_subagents((node.subagents || []).filter((_, i) => i !== index));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #8a8cee, #5a5dd6)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          S
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Subagent Pool</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Subagents</span>
        {(node.subagents || []).map((s, i) => {
          const label =
            s.kind === "recipe_ref"
              ? s.recipe_name
              : s.kind === "ref"
                ? s.template_name
                : s.name;
          const kindLabel = s.kind === "recipe_ref" ? "workflow" : s.kind;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.025)",
                fontSize: 11.5,
              }}
            >
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
                {label}
              </span>
              <span
                style={{ fontSize: 10, color: "#86868b", marginLeft: "auto" }}
              >
                {kindLabel}
              </span>
              <Button
                prefix_icon="delete"
                onClick={() => remove_subagent(i)}
                style={{
                  paddingVertical: 3,
                  paddingHorizontal: 3,
                  borderRadius: 4,
                  opacity: 0.58,
                  content: { icon: { width: 11, height: 11 } },
                }}
              />
            </div>
          );
        })}
        {(node.subagents || []).length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>
            No subagents configured.
          </span>
        )}
        <Button
          prefix_icon="add"
          label="Add subagent"
          onClick={() => setPickerOpen(true)}
          style={{
            alignSelf: "flex-start",
            marginTop: 4,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 9,
            borderRadius: 5,
            color: "#4a5bd8",
            content: { icon: { width: 12, height: 12 } },
          }}
        />
      </div>

      {pickerOpen && (
        <SubagentPicker
          onPick={add_subagent}
          onClose={() => setPickerOpen(false)}
          isDark={isDark}
          currentRecipeName={recipe?.name || ""}
        />
      )}
    </>
  );
}
