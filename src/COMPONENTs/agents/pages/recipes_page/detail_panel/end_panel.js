import React from "react";
import { compute_variable_scope } from "../variable_scope";
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

export default function EndPanel({ node, recipe, onChange, isDark }) {
  const scope = compute_variable_scope(node.id, recipe.nodes, recipe.edges);

  function update_schema(next) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, outputs_schema: next } : n,
      ),
    });
  }
  function set_row(i, patch) {
    update_schema(
      (node.outputs_schema || []).map((o, idx) =>
        idx === i ? { ...o, ...patch } : o,
      ),
    );
  }
  function add_row() {
    update_schema([
      ...(node.outputs_schema || []),
      { name: "", type: "string" },
    ]);
  }
  function remove_row(i) {
    update_schema((node.outputs_schema || []).filter((_, idx) => idx !== i));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #e06a9a, #b64a78)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon
            src="stop_mini_filled"
            color="#fff"
            style={{ width: 16, height: 16 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>End</div>
          <div style={{ fontSize: 11, color: "#86868b" }}>Workflow exit</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Input Variables (upstream)</span>
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
              navigator.clipboard?.writeText(`{{#${v.node_id}.${v.field}#}}`);
            }}
            title="Click to copy"
          >
            <span>{`${v.node_id}.${v.field}`}</span>
            <span style={{ fontSize: 10, color: "#86868b" }}>{v.type}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Output Schema</span>
          <Button
            label="+ Add field"
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
        {(node.outputs_schema || []).map((o, i) => (
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
