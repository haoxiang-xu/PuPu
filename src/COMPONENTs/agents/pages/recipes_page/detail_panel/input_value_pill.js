import React, { useRef, useState } from "react";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { expression_is_editable, expression_summary, literal_expression, ref_expression } from "../skeleton_io";
import VariablePill, { VariablePillValue, variablePillField } from "./variable_pill";

export default function InputValuePill({ binding, index, sources, problems, isDark, onChange, onRemove }) {
  const { t } = useTranslation();
  const sourceRef = useRef(null);
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState(null);
  const editing = query !== null;
  const name = typeof binding?.name === "string" ? binding.name : "";
  const value = binding?.value;
  const isRef = value?.kind === "ref" && expression_is_editable(value);
  const source = isRef && sources.find(({ node_id, name }) => node_id === value.node_id && name === value.path[0]);
  const selected = isRef && value.path.length > 0;
  const nodeLabel = selected ? source?.node_label || value.node_id : "";
  const path = selected ? value.path.join(".") : "";
  const isText = value?.kind === "literal" && typeof value.value === "string";
  const literal = isText ? value.value : "";
  const displayValue = isRef ? "" : isText ? literal : expression_summary(value, t);
  const filter = editing && query !== literal ? query.trim().toLowerCase() : "";
  const options = sources.filter((source) =>
    `${source.node_label} ${source.node_id} ${source.name}`.toLowerCase().includes(filter));

  const sourceLabel = t("model_providers.custom.import_source");
  const removeLabel = name ? t("agents.io.remove_input", { name }) : t("agents.io.remove_input_unnamed");
  const color = isDark ? "#eeeef1" : "#26262c";

  function close() {
    setMenu(null);
    setQuery(null);
  }

  function startEditing() {
    const bounds = sourceRef.current.getBoundingClientRect();
    setMenu({ x: bounds.left, y: bounds.bottom + 4 });
    setQuery((current) => current ?? literal);
  }

  function finishEditing() {
    if (editing && query !== literal) choose(literal_expression(query));
    else close();
  }

  function choose(next) {
    onChange({ ...binding, value: next });
    close();
  }

  const items = options.map((source) => ({
    label: <VariablePillValue label={source.node_label} detail={source.name} isDark={isDark} />,
    prefix_icon: source.conditional ? "circle" : undefined,
    onClick: () => choose(ref_expression(source.node_id, [source.name])),
  }));
  const menuVisible = menu !== null && items.length > 0;

  return (
    <div data-testid={`binding-row-${index}`} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <VariablePill testid={`binding-row-${index}`} isDark={isDark} name={name}
        onNameChange={(next) => onChange({ ...binding, name: next })}
        onRemove={onRemove} removeLabel={removeLabel} sourceRef={sourceRef}>
        <div onClick={startEditing} style={{ width: "100%", minWidth: 0 }}>
          <Input aria_label={selected && !editing ? t("agents.io.source_option", { node: nodeLabel, name: path }) : sourceLabel}
            value={editing ? query : displayValue}
            placeholder={selected && !editing ? "" : t("common.search")}
            on_focus={startEditing}
            on_blur={finishEditing}
            set_value={(next) => {
              if (!menu) startEditing();
              setQuery(next);
            }}
            on_key_down={(event) => {
              if (!editing) return;
              if (event.nativeEvent.isComposing) {
                event.stopPropagation();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              } else if (event.key === "Enter" && !menuVisible) {
                event.preventDefault();
                finishEditing();
              }
            }}
            style={{ ...variablePillField, color }} />
        </div>
        {selected && !editing && (
          <span aria-hidden="true" data-testid={`binding-row-${index}-selected`}
            style={{ position: "absolute", left: 11, right: 12, pointerEvents: "none" }}>
            <VariablePillValue label={nodeLabel} detail={path} isDark={isDark} />
          </span>
        )}
      </VariablePill>
      {/* Keep the text field focused until the menu's click chooses a source. */}
      <div onMouseDown={(event) => event.preventDefault()}>
        <ContextMenu visible={menuVisible} x={menu?.x} y={menu?.y} items={items}
          isDark={isDark} selectionKey={filter} onEnterWithoutSelection={finishEditing} onClose={() => setMenu(null)} />
      </div>
      {problems.map((problem, i) => (
        <span key={i} data-testid={`binding-row-${index}-problem-${i}`}
          style={{ fontSize: 11.5, lineHeight: 1.45, overflowWrap: "anywhere", color: isDark ? "#ff8c8c" : "#b02020" }}>
          {problem.message}
        </span>
      ))}
    </div>
  );
}
