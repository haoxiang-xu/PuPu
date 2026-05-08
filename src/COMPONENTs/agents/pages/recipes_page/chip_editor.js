import React, {
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import TextField from "../../../../BUILTIN_COMPONENTs/input/textfield";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { parse_chip_string } from "./chip_editor_parse";

const SOURCE_DOT_COLOR = {
  start: "#4cbe8b",
  agent: "#6478f6",
  end: "#e06a9a",
};

const KNOWN_SYSTEM_PROMPTS = {
  USE_BUILTIN_DEVELOPER_PROMPT: {
    label: "Built-in developer prompt",
    description: "Applies the built-in developer prompt at runtime",
  },
  SUBAGENT_LIST: {
    label: "Subagent list",
    description: "Expands to the available subagent list at runtime",
  },
};

function get_chip_meta(node, scope) {
  if (node.kind === "system_prompt") {
    const known = KNOWN_SYSTEM_PROMPTS[node.name];
    if (known) {
      return {
        label: known.label,
        title: `${known.description}: {{${node.name}}}`,
      };
    }
    return {
      unknown: true,
      title: `Unknown system prompt: {{${node.name}}}`,
    };
  }

  if (node.kind === "var") {
    const key = `${node.node_id}.${node.field}`;
    const exists = (scope || []).some(
      (entry) => `${entry.node_id}.${entry.field}` === key,
    );
    if (!exists) {
      return {
        unknown: true,
        title: `Unknown variable: {{#${key}#}}`,
      };
    }
  }

  return {};
}

function get_chip_diagnostics(nodes, scope) {
  return nodes
    .map((node) => {
      const meta = get_chip_meta(node, scope);
      if (!meta.unknown) return null;
      if (node.kind === "system_prompt") {
        return `Unknown system prompt {{${node.name}}}. Check spelling or remove it.`;
      }
      if (node.kind === "var") {
        return `Unknown variable {{#${node.node_id}.${node.field}#}}. Connect the source node or check spelling.`;
      }
      return null;
    })
    .filter(Boolean);
}

function render_chip(node, meta = {}, onActivate) {
  const isSystemPrompt = node.kind === "system_prompt";
  const isUnknown = !!meta.unknown;
  const label = isSystemPrompt
    ? meta.label || node.name
    : `${node.node_id}.${node.field}`;
  const dataAttrs = isSystemPrompt
    ? { "data-system-prompt-chip": node.name }
    : { "data-var-chip": `${node.node_id}.${node.field}` };
  const color = isUnknown ? "#c2410c" : isSystemPrompt ? "#0f766e" : "#4f46e5";
  const background = isUnknown
    ? "rgba(234,88,12,0.12)"
    : isSystemPrompt
      ? "rgba(20,184,166,0.12)"
      : "rgba(99,102,241,0.12)";
  const border = isUnknown
    ? "1px solid rgba(234,88,12,0.28)"
    : isSystemPrompt
      ? "1px solid rgba(20,184,166,0.28)"
      : "1px solid rgba(99,102,241,0.25)";
  const dotColor = isUnknown
    ? "#ea580c"
    : isSystemPrompt
      ? "#14b8a6"
      : SOURCE_DOT_COLOR[node.node_id] || SOURCE_DOT_COLOR.start;

  return (
    <button
      type="button"
      {...dataAttrs}
      data-chip-invalid={isUnknown ? "true" : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onActivate();
      }}
      title={meta.title || "Edit raw token"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background,
        color,
        borderRadius: 5,
        padding: "1px 6px 1px 4px",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 11,
        fontWeight: 600,
        margin: "0 1px",
        cursor: "text",
        border,
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: dotColor,
        }}
      />
      {label}
    </button>
  );
}

function build_variable_options(scope) {
  const groups = new Map();
  for (const entry of scope || []) {
    if (!entry || !entry.node_id || !entry.field) continue;
    if (!groups.has(entry.node_id)) groups.set(entry.node_id, []);
    const label = `${entry.node_id}.${entry.field}`;
    groups.get(entry.node_id).push({
      value: `{{#${entry.node_id}.${entry.field}#}}`,
      label,
      search: label,
      description: entry.type || "",
    });
  }
  return [...groups.entries()].map(([node_id, options]) => ({
    group: `From ${node_id}`,
    options,
  }));
}

function node_raw_text(node) {
  if (node.kind === "var") return `{{#${node.node_id}.${node.field}#}}`;
  if (node.kind === "system_prompt") return `{{${node.name}}}`;
  return node.value || "";
}

export default function ChipEditor({ value, onChange, scope, placeholder }) {
  const cfg = useContext(ConfigContext);
  const isDark = cfg?.onThemeMode === "dark_mode";
  const [editing, setEditing] = useState(false);
  const rootRef = useRef(null);
  const textareaRef = useRef(null);
  const lastSelectionRef = useRef({ start: 0, end: 0 });
  const rawValue = typeof value === "string" ? value : "";
  const nodes = useMemo(() => parse_chip_string(rawValue), [rawValue]);
  const diagnostics = get_chip_diagnostics(nodes, scope);
  const variableOptions = useMemo(() => build_variable_options(scope), [scope]);

  function focus_editor(position) {
    setEditing(true);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      if (Number.isFinite(position)) {
        textarea.setSelectionRange(position, position);
        lastSelectionRef.current = { start: position, end: position };
      }
    });
  }

  function remember_selection() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    lastSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function remember_selection_soon() {
    requestAnimationFrame(remember_selection);
  }

  function handle_editor_blur() {
    remember_selection();
    setTimeout(() => {
      if (!rootRef.current?.contains(document.activeElement)) {
        setEditing(false);
      }
    }, 0);
  }

  function insert_token(token) {
    if (!token) return;
    const raw = rawValue;
    const fallback = { start: raw.length, end: raw.length };
    const active = document.activeElement === textareaRef.current;
    const range =
      active && textareaRef.current
        ? {
            start: textareaRef.current.selectionStart,
            end: textareaRef.current.selectionEnd,
          }
        : lastSelectionRef.current || fallback;
    const start = Math.max(0, Math.min(raw.length, range.start));
    const end = Math.max(start, Math.min(raw.length, range.end));
    const next = `${raw.slice(0, start)}${token}${raw.slice(end)}`;
    const nextPosition = start + token.length;
    onChange(next);
    focus_editor(nextPosition);
  }

  const fieldBorder =
    diagnostics.length > 0
      ? isDark
        ? "1px solid rgba(251,146,60,0.34)"
        : "1px solid rgba(234,88,12,0.28)"
      : isDark
        ? "1px solid rgba(255,255,255,0.08)"
        : "1px solid rgba(0,0,0,0.08)";
  let previewOffset = 0;

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {editing ? (
        <TextField
          value={rawValue}
          set_value={(next, event) => {
            onChange(next);
            if (event?.target) {
              lastSelectionRef.current = {
                start: event.target.selectionStart,
                end: event.target.selectionEnd,
              };
            }
          }}
          textarea_ref={textareaRef}
          min_rows={4}
          max_display_rows={12}
          placeholder={placeholder || "Type raw prompt..."}
          on_focus={remember_selection_soon}
          on_blur={handle_editor_blur}
          on_key_down={remember_selection_soon}
          style={{
            width: "100%",
            fontSize: 12,
            lineHeight: 1.7,
            fontFamily: "ui-monospace, Menlo, monospace",
            padding: 10,
            borderRadius: 8,
          }}
        />
      ) : (
        <div
          onClick={() => focus_editor()}
          aria-label="Prompt preview"
          style={{
            border: fieldBorder,
            borderRadius: 8,
            background: isDark ? "#141416" : "#fafafa",
            padding: "10px 12px",
            minHeight: 92,
            fontSize: 12,
            lineHeight: 1.7,
            fontFamily: "ui-monospace, Menlo, monospace",
            color: "inherit",
            cursor: "text",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {nodes.length === 0 && (
            <span style={{ color: "#86868b" }}>
              {placeholder || "Type raw prompt..."}
            </span>
          )}
          {nodes.map((node, i) => {
            const tokenText = node_raw_text(node);
            const tokenEnd = previewOffset + tokenText.length;
            previewOffset = tokenEnd;
            if (node.kind === "text") {
              return (
                <React.Fragment key={`t-${i}`}>{node.value}</React.Fragment>
              );
            }
            return (
              <React.Fragment key={`${node.kind}-${i}`}>
                {render_chip(node, get_chip_meta(node, scope), () =>
                  focus_editor(tokenEnd),
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
      {diagnostics.length > 0 && (
        <div
          role="alert"
          style={{
            marginTop: 6,
            padding: "6px 8px",
            borderRadius: 6,
            background: isDark ? "rgba(234,88,12,0.12)" : "#fff7ed",
            border: isDark
              ? "1px solid rgba(251,146,60,0.22)"
              : "1px solid rgba(251,146,60,0.28)",
            color: isDark ? "#fdba74" : "#9a3412",
            fontSize: 10.5,
            lineHeight: 1.45,
          }}
        >
          {diagnostics.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
        }}
      >
        <span style={{ fontSize: 10.5, color: "#86868b" }}>
          Click a tag to edit the raw token.
        </span>
        <Select
          options={variableOptions}
          value=""
          set_value={insert_token}
          placeholder="+ Variable"
          search_placeholder="Search variables..."
          filterable={true}
          style={{
            fontSize: 11,
            paddingVertical: 3,
            paddingHorizontal: 7,
            borderRadius: 5,
            color: "#6366f1",
          }}
          dropdown_style={{
            width: 280,
            maxWidth: 280,
            maxHeight: 300,
          }}
          option_style={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11.5,
          }}
          disabled={variableOptions.length === 0}
        />
      </div>
    </div>
  );
}
