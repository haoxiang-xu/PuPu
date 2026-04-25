import React, { useContext, useEffect, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import VariablePicker from "./variable_picker";
import { parse_chip_string, serialize_chip_nodes } from "./chip_editor_parse";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

function render_chip(node, onRemove) {
  return (
    <span
      contentEditable={false}
      data-var-chip={`${node.node_id}.${node.field}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "rgba(99,102,241,0.12)",
        color: "#4f46e5",
        borderRadius: 5,
        padding: "1px 6px 1px 4px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        fontWeight: 600,
        margin: "0 1px",
        cursor: "pointer",
        border: "1px solid rgba(99,102,241,0.25)",
        userSelect: "none",
      }}
      onClick={onRemove}
      title="Click to remove"
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: SOURCE_DOT_COLOR.start,
        }}
      />
      {node.node_id}.{node.field}
    </span>
  );
}

export default function ChipEditor({ value, onChange, scope, placeholder }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [nodes, setNodes] = useState(() => parse_chip_string(value || ""));
  const last_prop_value = useRef(value);

  useEffect(() => {
    const serialized = serialize_chip_nodes(nodes);
    if (value !== serialized && value !== last_prop_value.current) {
      last_prop_value.current = value;
      setNodes(parse_chip_string(value || ""));
    }
  }, [value, nodes]);

  function emit(next) {
    setNodes(next);
    const s = serialize_chip_nodes(next);
    last_prop_value.current = s;
    onChange(s);
  }

  function insert_var(v) {
    emit([...nodes, { kind: "var", node_id: v.node_id, field: v.field }]);
    setPickerOpen(false);
  }

  function remove_at(idx) {
    emit(nodes.filter((_, i) => i !== idx));
  }

  function update_text(idx, text) {
    emit(
      nodes.map((n, i) =>
        i === idx && n.kind === "text" ? { ...n, value: text } : n,
      ),
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          border: `1px solid ${
            isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
          }`,
          borderRadius: 8,
          background: isDark ? "#141416" : "#fafafa",
          padding: "10px 12px",
          minHeight: 80,
          fontSize: 12,
          lineHeight: 1.7,
          fontFamily: "ui-monospace, Menlo, monospace",
          color: "inherit",
        }}
      >
        {nodes.length === 0 && (
          <span style={{ color: "#86868b" }}>
            {placeholder || "Type here… use {{ to insert a variable"}
          </span>
        )}
        {nodes.map((n, i) => {
          if (n.kind === "var") {
            return (
              <React.Fragment key={`v-${i}`}>
                {render_chip(n, () => remove_at(i))}
              </React.Fragment>
            );
          }
          return (
            <input
              key={`t-${i}`}
              value={n.value}
              onChange={(e) => {
                const v = e.target.value;
                if (v.endsWith("{{")) {
                  update_text(i, v.slice(0, -2));
                  setPickerOpen(true);
                } else {
                  update_text(i, v);
                }
              }}
              style={{
                border: "none",
                background: "transparent",
                font: "inherit",
                color: "inherit",
                outline: "none",
                minWidth: 8,
                width: `${Math.max(1, n.value.length + 1)}ch`,
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 10.5, color: "#86868b" }}>
          Type <code>{"{{"}</code> to insert a variable
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            background: "transparent",
            border: "none",
            color: "#6366f1",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          + Insert variable
        </button>
      </div>
      {pickerOpen && (
        <VariablePicker
          scope={scope || []}
          position={{ x: 0, y: "100%" }}
          onPick={insert_var}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
