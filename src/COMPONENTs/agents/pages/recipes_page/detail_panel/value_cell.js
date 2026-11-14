import React, { useEffect, useRef, useState } from "react";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { expression_is_editable, expression_summary, literal_expression, ref_expression } from "../skeleton_io";
import { literal_from_text, literal_to_text } from "../tool_call_config";
import { VariablePillValue, variablePillField } from "./variable_pill";
import { CONTROL_HEIGHT, CONTROL_RADIUS, fieldBackground, text as textColor } from "./panel_style";

/* One value of a known type, in one cell: typed in, or picked from what the
 * steps upstream export — the Input Variables pill's single slot, without
 * the name and the way out its row carries, and typed: a number is written
 * as a number, a boolean is picked as true or false.
 *
 * Nothing stored is a placeholder: the callee's default in the muted colour,
 * or the empty prompt when there is none. Text that is not yet a value of
 * the type is held in the cell and never written; the row says why.
 *
 * A picked source is the steps' tag. In a narrow cell the tag keeps its icon
 * and the field it reads, and the step's name moves to the tag's tooltip, so
 * the field — what is actually passed — is never the part cut off. */

const COMPACT_BELOW = 120;

function useCompact(ref) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width < COMPACT_BELOW));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return compact;
}

export default function ValueCell({
  value, type, placeholder, sources, sourceTag, editable = true, optional, isDark, testid, ariaLabel,
  onChange, onProblem, trailing,
}) {
  const { t } = useTranslation();
  const cellRef = useRef(null);
  const compact = useCompact(cellRef);
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState(null);
  const editing = query !== null;
  const tagOf = (node_id) => (sourceTag && sourceTag(node_id)) || {};

  const isRef = value?.kind === "ref" && expression_is_editable(value) && value.path.length > 0;
  const source = isRef && sources.find(({ node_id, name }) => node_id === value.node_id && name === value.path[0]);
  const nodeLabel = isRef ? source?.node_label || value.node_id : "";
  const path = isRef ? value.path.join(".") : "";
  const literal = value?.kind === "literal" ? literal_to_text(value.value, type) : "";
  const shown = isRef ? "" : value?.kind === "literal" ? literal : value ? expression_summary(value, t) : "";
  const filter = editing && query !== literal ? query.trim().toLowerCase() : "";

  const close = () => { setMenu(null); setQuery(null); };
  const open = () => {
    if (!editable || !cellRef.current) return;
    const bounds = cellRef.current.getBoundingClientRect();
    setMenu({ x: bounds.left, y: bounds.bottom + 4 });
    setQuery((current) => current ?? literal);
  };
  const choose = (next) => { if (onProblem) onProblem(null); onChange(next); close(); };
  const finish = () => {
    if (!editing) return close();
    if (query === literal || (query === "" && !value)) return close();
    if (query === "") {
      /* Emptied: an optional value goes back to the callee's default; a
         required one keeps what it has. */
      if (optional) choose(null);
      else close();
      return;
    }
    const read = literal_from_text(query, type, t);
    if (!read.ok) {
      if (onProblem) onProblem(read.problem);
      setMenu(null);
      return;
    }
    choose(literal_expression(read.value));
  };

  const items = [
    ...(type === "boolean" ? [true, false].filter((flag) => !filter || String(flag).includes(filter)).map((flag) => ({
      label: <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{String(flag)}</span>,
      onClick: () => choose(literal_expression(flag)),
    })) : []),
    ...sources
      .filter((item) => `${item.node_label} ${item.node_id} ${item.name}`.toLowerCase().includes(filter))
      .map((item) => ({
        label: <VariablePillValue label={item.node_label} detail={item.name} {...tagOf(item.node_id)} isDark={isDark} />,
        prefix_icon: item.conditional ? "circle" : undefined,
        onClick: () => choose(ref_expression(item.node_id, [item.name])),
      })),
    ...(optional && value && !filter ? [{ type: "separator" }, {
      label: t("agents.execution.tool.unset"),
      onClick: () => choose(null),
    }] : []),
  ];
  const menuVisible = menu !== null && items.length > 0;

  return (
    <div ref={cellRef} data-testid={testid} style={{ position: "relative", minWidth: 0, height: CONTROL_HEIGHT,
      display: "flex", alignItems: "center", borderRadius: CONTROL_RADIUS, background: fieldBackground(isDark),
      boxSizing: "border-box", border: "1px solid transparent" }}>
      <div onClick={open} style={{ flex: 1, minWidth: 0 }}>
        <Input aria_label={isRef && !editing ? `${ariaLabel} · ${nodeLabel} · ${path}` : ariaLabel}
          value={editing ? query : shown}
          placeholder={isRef && !editing ? "" : placeholder}
          disabled={!editable}
          on_focus={open}
          on_blur={finish}
          set_value={(next) => { if (!menu) open(); setQuery(next); }}
          on_key_down={(event) => {
            if (!editing) return;
            if (event.nativeEvent.isComposing) {
              event.stopPropagation();
            } else if (event.key === "Escape") {
              /* Drops what was typed and the list, and leaves the key to the
                 page, which already orders Escape (the pinned view first). */
              close();
            } else if (event.key === "Enter" && !menuVisible) {
              event.preventDefault(); finish();
            }
          }}
          style={{ ...variablePillField, height: CONTROL_HEIGHT - 2, paddingHorizontal: 6, color: textColor(isDark),
            ...(type && type !== "string" ? { fontFamily: "ui-monospace, Menlo, monospace" } : {}) }} />
      </div>
      {isRef && !editing && (
        <span aria-hidden="true" data-testid={`${testid}-selected`} title={`${nodeLabel} · ${path}`}
          style={{ position: "absolute", left: 2, right: trailing ? 24 : 2, display: "flex", pointerEvents: "none", minWidth: 0 }}>
          <VariablePillValue label={compact ? "" : nodeLabel} detail={path} {...(source ? tagOf(value.node_id) : {})}
            testid={`${testid}-tag`} isDark={isDark} />
        </span>
      )}
      {/* The row's "more" sits inside the cell, at its end, so every row's
          cell keeps the same width whether or not it has one. */}
      {trailing && <span style={{ display: "flex", flexShrink: 0 }}>{trailing}</span>}
      <div onMouseDown={(event) => event.preventDefault()}>
        <ContextMenu visible={menuVisible} x={menu?.x} y={menu?.y} items={items}
          isDark={isDark} selectionKey={filter} onEnterWithoutSelection={finish} onClose={() => setMenu(null)} />
      </div>
    </div>
  );
}

