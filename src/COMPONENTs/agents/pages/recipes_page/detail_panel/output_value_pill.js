import React, { useRef, useState } from "react";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { output_mapping_is_editable } from "../skeleton_io";
import VariablePill, { VariablePillValue, variablePillField } from "./variable_pill";

function fieldPathLabel(path) {
  return path.reduce((label, segment) => {
    if (typeof segment === "number") return `${label}[${segment}]`;
    if (!/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)) return `${label}[${JSON.stringify(segment)}]`;
    return label ? `${label}.${segment}` : segment;
  }, "");
}

export default function OutputValuePill({
  mapping, index, identity, nodeType, kinds, inputNames, resultRoots, problems, isDark, onChange, onRemove,
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState(null);
  const sourceRef = useRef(null);
  const testid = `output-row-${index}`;
  const name = typeof mapping?.name === "string" ? mapping.name : "";
  const editable = output_mapping_is_editable(mapping);
  const source = editable ? mapping.source : null;
  const path = source?.path || [];
  /* A Start's result is what the run was called with, so it is named as
     the caller's input rather than as a result. */
  const start = nodeType === "start";
  const labels = {
    input: t("agents.workflow.inputs"),
    result: start ? t("agents.io.caller_input") : t("agents.execution.code.result"),
  };
  const wholeLabels = {
    input: t("agents.io.everything_it_was_given"),
    result: start ? t("agents.io.everything_it_was_given") : t("agents.io.the_whole_result"),
  };
  const fields = { input: inputNames, result: resultRoots.roots };
  const detail = path.length ? fieldPathLabel(path) : undefined;
  const label = source ? labels[source.kind] : t("common.select");
  const sourceLabel = detail ? `${label} · ${detail}` : label;
  const removeLabel = name ? t("agents.io.remove_output", { name }) : t("agents.io.remove_output_unnamed");
  const menuOpen = menu?.identity === identity;
  /* Where a result's field list is not closed (a Start's caller input, an
     Agent whose schema leaves room), a field the list does not name can be
     typed. Elsewhere the list is the whole truth and only a pick is offered. */
  const typable = editable && kinds.length === 1 && kinds[0] === "result" && !resultRoots.closed;
  const editing = query !== null;
  const filter = editing ? query.trim().toLowerCase() : "";

  function setSource(kind, nextPath) {
    onChange({ ...mapping, source: { kind, path: nextPath } });
  }

  function closeTyping() {
    setMenu(null);
    setQuery(null);
  }

  function startTyping() {
    if (editing) return;
    const bounds = sourceRef.current.getBoundingClientRect();
    setMenu({ identity, x: bounds.left, y: bounds.bottom + 4 });
    setQuery(detail || "");
  }

  /* A typed name that differs from what is shown becomes the field read;
     leaving it unchanged, or emptied, keeps the stored address. */
  function finishTyping() {
    const typed = editing ? query.trim() : "";
    if (typed && typed !== (detail || "")) setSource("result", [typed]);
    closeTyping();
  }

  const items = kinds.flatMap((kind, position) => [
    ...(position ? [{ type: "separator" }] : []),
    ...fields[kind].filter((field) => !filter || String(field).toLowerCase().includes(filter)).map((field) => ({
      label: <VariablePillValue label={labels[kind]}
        detail={field || t("agents.io.the_field_with_no_name")} isDark={isDark} />,
      onClick: () => {
        if (source?.kind !== kind || path.length !== 1 || path[0] !== field) setSource(kind, [field]);
        if (typable) closeTyping();
      },
    })),
    {
      label: wholeLabels[kind],
      onClick: () => {
        if (source?.kind !== kind || path.length) setSource(kind, []);
        if (typable) closeTyping();
      },
    },
  ]);

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <VariablePill testid={testid} isDark={isDark} name={name}
        onNameChange={(next) => onChange({ ...mapping, name: next })}
        onRemove={onRemove} removeLabel={removeLabel} sourceRef={sourceRef}>
        {typable ? <>
          <div onClick={startTyping} style={{ width: "100%", minWidth: 0 }}>
            <Input aria_label={sourceLabel} value={editing ? query : ""}
              placeholder={editing ? t("agents.io.name_placeholder") : ""}
              on_focus={startTyping} on_blur={finishTyping}
              set_value={(next) => { if (!editing) startTyping(); setQuery(next); }}
              on_key_down={(event) => {
                if (!editing || event.nativeEvent.isComposing) return;
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeTyping();
                } else if (event.key === "Enter" && items.length === 0) {
                  event.preventDefault();
                  finishTyping();
                }
              }}
              style={{ ...variablePillField, color: isDark ? "#eeeef1" : "#26262c" }} />
          </div>
          {!editing && <span aria-hidden="true" data-testid={`${testid}-selected`}
            style={{ position: "absolute", left: 9, right: 4, pointerEvents: "none" }}>
            <VariablePillValue label={label} detail={detail} isDark={isDark} />
          </span>}
        </> : <Button ariaLabel={sourceLabel} title={sourceLabel}
          dom_props={{ type: "button", "aria-haspopup": "menu", "aria-expanded": menuOpen, onBlur: () => setMenu(null) }}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ identity, x: bounds.left - 3, y: bounds.bottom + 8 });
          }}
          style={{ ...variablePillField, justifyContent: "flex-start", content: { root: { minWidth: 0 } } }}>
          <VariablePillValue label={label} detail={detail} isDark={isDark} />
        </Button>}
      </VariablePill>
      {/* The source button stays focused while a portalled menu row is clicked. */}
      <div onMouseDown={(event) => event.preventDefault()}>
        <ContextMenu visible={menuOpen && items.length > 0} x={menu?.x} y={menu?.y} items={items}
          onClose={() => setMenu(null)} isDark={isDark} scrollable
          {...(typable ? { selectionKey: filter, onEnterWithoutSelection: finishTyping } : {})} />
      </div>
      {!editable && mapping?.source !== undefined && (
        <span data-testid={`${testid}-unreadable`}
          style={{ fontSize: 10.5, overflowWrap: "anywhere", padding: "0 10px 7px", fontFamily: "ui-monospace, Menlo, monospace" }}>
          {JSON.stringify(mapping.source)}
        </span>
      )}
      {problems.map((problem, i) => (
        <span key={i} data-testid={`${testid}-problem-${i}`}
          style={{ fontSize: 11.5, lineHeight: 1.45, overflowWrap: "anywhere", padding: "0 10px 7px", color: isDark ? "#ff8c8c" : "#b02020" }}>
          {problem.message}
        </span>
      ))}
    </div>
  );
}
