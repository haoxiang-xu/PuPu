import React, { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import SubagentPicker from "../subagent_picker";
import { entry_reference } from "../subagent_eligibility";
import {
  can_drill,
  drill_unavailable_reason,
  reference_exists,
} from "../subagent_drill";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function SubagentPoolPanel({
  node,
  recipe,
  onChange,
  isDark,
  recipes,
  onDrillIn,
}) {
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Subagents</span>
        <span style={{ fontSize: 10.5, color: "#86868b", lineHeight: 1.45 }}>
          Each entry is an Agent with its own graph. This panel manages the
          entries; double-click one to open its graph and edit it there.
        </span>
        {(node.subagents || []).map((s, i) => {
          /* The row says where this Agent comes from. It used to print the
           * entry's `kind` verbatim, so a `recipe_ref` row read "workflow" —
           * a reference field name mistaken for a resource kind. Every entry
           * here is an Agent. */
          const { name, source } = entry_reference(s);
          const present = reference_exists(s, recipes);
          const openable = can_drill(s) && present && typeof onDrillIn === "function";
          const missingColor = isDark
            ? "rgba(255,120,120,0.92)"
            : "rgba(176,32,32,0.92)";
          return (
            <div
              key={i}
              data-testid={`subagent-row-${i}`}
              title={
                present
                  ? drill_unavailable_reason(s) || `Double-click to open ${name}`
                  : `${name} is no longer in the Agent library`
              }
              onDoubleClick={
                typeof onDrillIn === "function" ? () => onDrillIn(s) : undefined
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                cursor: openable ? "pointer" : "default",
                background: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.025)",
                fontSize: 11.5,
              }}
            >
              <span
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  color: present ? undefined : missingColor,
                }}
              >
                {name}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: present ? "#86868b" : missingColor,
                  marginLeft: "auto",
                }}
              >
                {present ? source : "missing"}
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
