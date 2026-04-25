import React from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

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

export default function StartPanel({ node, recipe, onChange, isDark }) {
  function update_outputs(next) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, outputs: next } : n,
      ),
    });
  }

  function set_row(i, patch) {
    update_outputs(
      node.outputs.map((o, idx) => (idx === i ? { ...o, ...patch } : o)),
    );
  }
  function add_row() {
    update_outputs([...(node.outputs || []), { name: "", type: "string" }]);
  }
  function remove_row(i) {
    update_outputs(node.outputs.filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #4cbe8b, #2f9a68)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="play" color="#fff" style={{ width: 14, height: 14 }} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Start</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>Workflow entry</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Output Variables</span>
          <Button
            label="+ Add output"
            onClick={add_row}
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
              set_value={(v) => set_row(i, { type: v })}
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
              set_value={(v) => set_row(i, { name: v })}
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
              onClick={() => remove_row(i)}
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
