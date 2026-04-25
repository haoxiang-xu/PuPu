import React from "react";
import ChipEditor from "../chip_editor";
import { compute_variable_scope } from "../variable_scope";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../../BUILTIN_COMPONENTs/input/input";

const MODEL_OPTIONS = [
  { value: "", label: "(use recipe default)" },
  { value: "claude-opus-4-7", label: "claude-opus-4-7" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6" },
  { value: "claude-haiku-4-5", label: "claude-haiku-4-5" },
  { value: "gpt-4o", label: "gpt-4o" },
  { value: "gemini-2.5-pro", label: "gemini-2.5-pro" },
];

const TYPE_OPTIONS = [
  { value: "string", label: "string" },
  { value: "image[]", label: "image[]" },
  { value: "file[]", label: "file[]" },
  { value: "json", label: "json" },
];

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

export default function AgentPanel({ node, recipe, onChange, onChangeSilent, isDark }) {
  const scope = compute_variable_scope(node.id, recipe.nodes, recipe.edges);

  function set_node(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  }

  function set_override(patch) {
    set_node({ override: { ...(node.override || {}), ...patch } });
  }

  function set_node_silent(patch) {
    onChangeSilent({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  }

  function set_override_silent(patch) {
    set_node_silent({ override: { ...(node.override || {}), ...patch } });
  }

  function update_outputs(next) {
    set_node({ outputs: next });
  }
  function set_out_row(i, patch) {
    update_outputs(
      (node.outputs || []).map((o, idx) =>
        idx === i ? { ...o, ...patch } : o,
      ),
    );
  }
  function add_out_row() {
    update_outputs([...(node.outputs || []), { name: "", type: "string" }]);
  }
  function remove_out_row(i) {
    update_outputs((node.outputs || []).filter((_, idx) => idx !== i));
  }

  const prompt = node.override?.prompt || "";
  const model = node.override?.model || "";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          A
        </div>
        <div style={{ minWidth: 0, flex: 1, fontSize: 14, fontWeight: 600 }}>
          {node.id}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Input Variables</span>
        {scope.length === 0 && (
          <span style={{ fontSize: 11, color: "#86868b" }}>
            No upstream yet.
          </span>
        )}
        {scope.map((v) => (
          <div
            key={`${v.node_id}.${v.field}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "5px 10px",
              borderRadius: 6,
              background: isDark
                ? "rgba(255,255,255,0.04)"
                : "rgba(0,0,0,0.025)",
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11.5,
              cursor: "pointer",
            }}
            onClick={() => {
              set_override_silent({
                prompt: `${prompt}{{#${v.node_id}.${v.field}#}}`,
              });
            }}
            title="Click to append to prompt"
          >
            <span>{`${v.node_id}.${v.field}`}</span>
            <span style={{ fontSize: 10, color: "#86868b" }}>{v.type}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Model</span>
        <Select
          options={MODEL_OPTIONS}
          value={model}
          set_value={(v) => set_override({ model: v })}
          filterable={false}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 6,
          }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Prompt</span>
        <ChipEditor
          value={prompt}
          onChange={(v) => set_override_silent({ prompt: v })}
          scope={scope}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Output</span>
          <Button
            label="+ Add field"
            onClick={add_out_row}
            style={{
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: "#4a5bd8",
            }}
          />
        </div>
        {(node.outputs || []).map((o, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Select
              options={TYPE_OPTIONS}
              value={o.type}
              set_value={(v) => set_out_row(i, { type: v })}
              filterable={false}
              style={{
                fontSize: 11,
                paddingVertical: 4,
                paddingHorizontal: 6,
                borderRadius: 5,
                gap: 4,
                minWidth: 80,
              }}
            />
            <Input
              value={o.name}
              set_value={(v) => set_out_row(i, { name: v })}
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
            />
            <Button
              prefix_icon="close"
              onClick={() => remove_out_row(i)}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 4,
                borderRadius: 4,
                content: { icon: { width: 11, height: 11 } },
              }}
            />
          </div>
        ))}
      </div>
    </>
  );
}
