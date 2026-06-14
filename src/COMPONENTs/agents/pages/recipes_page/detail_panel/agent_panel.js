import React from "react";
import ChipEditor from "../chip_editor";
import { compute_variable_scope } from "../variable_scope";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import { Input } from "../../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";

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

const OPTIMIZER_PRESET_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "aggressive", label: "Aggressive" },
  { value: "off", label: "Off" },
  { value: "custom", label: "Custom" },
];

const DEFAULT_CUSTOM_OPTIMIZER = {
  preset: "custom",
  sliding_window: {
    enabled: true,
    max_window_pct: 0.5,
    max_window_tokens: null,
  },
  tool_history_compaction: {
    enabled: true,
    keep_completed_turns: 1,
    max_chars: 1200,
    preview_chars: 160,
    hash_payloads: true,
  },
  context_usage: { enabled: true },
  tool_pair_safety: { enabled: true },
};

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

function clamp_number(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clamp_int(raw, min, max, fallback) {
  return Math.round(clamp_number(raw, min, max, fallback));
}

function custom_optimizer_from(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    preset: "custom",
    sliding_window: {
      ...DEFAULT_CUSTOM_OPTIMIZER.sliding_window,
      ...(source.sliding_window || {}),
    },
    tool_history_compaction: {
      ...DEFAULT_CUSTOM_OPTIMIZER.tool_history_compaction,
      ...(source.tool_history_compaction || {}),
    },
    context_usage: {
      ...DEFAULT_CUSTOM_OPTIMIZER.context_usage,
      ...(source.context_usage || {}),
    },
    tool_pair_safety: {
      ...DEFAULT_CUSTOM_OPTIMIZER.tool_pair_safety,
      ...(source.tool_pair_safety || {}),
    },
  };
}

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
  const optimizer = node.override?.optimizer || { preset: "default" };
  const optimizer_preset =
    optimizer.enabled === false ? "off" : optimizer.preset || "default";
  const optimizer_enabled = optimizer_preset !== "off";
  const custom_optimizer = custom_optimizer_from(optimizer);
  const muted = isDark ? "#9a9aa3" : "#86868b";
  const row_bg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";

  function set_optimizer(next) {
    set_override({ optimizer: next });
  }

  function set_optimizer_preset(next_preset) {
    if (next_preset === "custom") {
      set_optimizer(custom_optimizer_from(optimizer));
      return;
    }
    if (next_preset === "aggressive") {
      set_optimizer({ preset: "aggressive" });
      return;
    }
    if (next_preset === "off") {
      set_optimizer({ preset: "off", enabled: false });
      return;
    }
    set_optimizer({ preset: "default" });
  }

  function set_optimizer_enabled(on) {
    set_optimizer(
      on ? { preset: "default" } : { preset: "off", enabled: false },
    );
  }

  function update_custom_optimizer(section, patch) {
    set_optimizer({
      ...custom_optimizer,
      [section]: {
        ...custom_optimizer[section],
        ...patch,
      },
    });
  }

  function update_tool_max_chars(raw) {
    const current = custom_optimizer.tool_history_compaction;
    const max_chars = clamp_int(raw, 64, 1000000, current.max_chars);
    update_custom_optimizer("tool_history_compaction", {
      max_chars,
      preview_chars: Math.min(
        max_chars,
        clamp_int(current.preview_chars, 32, max_chars, 160),
      ),
    });
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="bot" color="#fff" style={{ width: 14, height: 14 }} />
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
        <span style={SECTION_LABEL}>Context Optimizer</span>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "6px 8px",
            borderRadius: 6,
            background: row_bg,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500 }}>Enabled</span>
          <div data-testid="optimizer-enabled-switch">
            <Switch
              on={optimizer_enabled}
              set_on={set_optimizer_enabled}
              style={{ width: 32, height: 18 }}
            />
          </div>
        </div>
        <Select
          options={OPTIMIZER_PRESET_OPTIONS}
          value={optimizer_preset}
          set_value={set_optimizer_preset}
          filterable={false}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 6,
          }}
        />
        {optimizer_preset === "custom" && (
          <div
            data-testid="optimizer-custom-fields"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 6,
              background: row_bg,
            }}
          >
            <Input
              prefix_label="Window %"
              value={String(custom_optimizer.sliding_window.max_window_pct)}
              set_value={(v) =>
                update_custom_optimizer("sliding_window", {
                  max_window_pct: clamp_number(
                    v,
                    0.05,
                    1,
                    custom_optimizer.sliding_window.max_window_pct,
                  ),
                })
              }
              style={{
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
              }}
            />
            <Input
              prefix_label="Max tokens"
              value={
                custom_optimizer.sliding_window.max_window_tokens == null
                  ? ""
                  : String(custom_optimizer.sliding_window.max_window_tokens)
              }
              set_value={(v) =>
                update_custom_optimizer("sliding_window", {
                  max_window_tokens:
                    String(v).trim() === ""
                      ? null
                      : clamp_int(
                          v,
                          1,
                          1000000,
                          custom_optimizer.sliding_window.max_window_tokens ||
                            12000,
                        ),
                })
              }
              placeholder="none"
              style={{
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
              }}
            />
            <Input
              prefix_label="Keep turns"
              value={String(
                custom_optimizer.tool_history_compaction.keep_completed_turns,
              )}
              set_value={(v) =>
                update_custom_optimizer("tool_history_compaction", {
                  keep_completed_turns: clamp_int(
                    v,
                    0,
                    100,
                    custom_optimizer.tool_history_compaction.keep_completed_turns,
                  ),
                })
              }
              style={{
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
              }}
            />
            <Input
              prefix_label="Result chars"
              value={String(custom_optimizer.tool_history_compaction.max_chars)}
              set_value={update_tool_max_chars}
              style={{
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
              }}
            />
            <Input
              prefix_label="Preview chars"
              value={String(
                custom_optimizer.tool_history_compaction.preview_chars,
              )}
              set_value={(v) =>
                update_custom_optimizer("tool_history_compaction", {
                  preview_chars: clamp_int(
                    v,
                    32,
                    custom_optimizer.tool_history_compaction.max_chars,
                    custom_optimizer.tool_history_compaction.preview_chars,
                  ),
                })
              }
              style={{
                fontSize: 11.5,
                paddingVertical: 3,
                paddingHorizontal: 6,
                borderRadius: 5,
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: 8,
                fontSize: 11.5,
                color: muted,
              }}
            >
              <span>Hash payloads</span>
              <Switch
                on={custom_optimizer.tool_history_compaction.hash_payloads}
                set_on={(on) =>
                  update_custom_optimizer("tool_history_compaction", {
                    hash_payloads: !!on,
                  })
                }
                style={{ width: 30, height: 17 }}
              />
              <span>Context usage</span>
              <Switch
                on={custom_optimizer.context_usage.enabled}
                set_on={(on) =>
                  update_custom_optimizer("context_usage", { enabled: !!on })
                }
                style={{ width: 30, height: 17 }}
              />
              <span>Pair safety</span>
              <Switch
                on={custom_optimizer.tool_pair_safety.enabled}
                set_on={(on) =>
                  update_custom_optimizer("tool_pair_safety", { enabled: !!on })
                }
                style={{ width: 30, height: 17 }}
              />
            </div>
          </div>
        )}
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
