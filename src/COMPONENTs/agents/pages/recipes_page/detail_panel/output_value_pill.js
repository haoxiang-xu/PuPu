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

/* A path typed as text — `result.items[0].name`, `inputs.query`, or just
   `items` — read back into the source it names. The first step may name the
   side (`result`/`input`, singular or plural, or the side's label as shown);
   without one the row keeps the side it already reads. After it, `.name` is a
   field, `[3]` a list position and `["a.b"]` a field whose name needs quoting,
   which is exactly how `fieldPathLabel` writes them. Anything else is not a
   path: null, and nothing is written. */
export function parse_typed_path(text, kinds, current, labels = {}) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return null;
  const sides = (word) => {
    const lower = word.toLowerCase();
    return kinds.find((kind) => lower === kind || lower === `${kind}s` ||
      (typeof labels[kind] === "string" && lower === labels[kind].toLowerCase())) || null;
  };
  let kind = kinds.includes(current) ? current : kinds.includes("result") ? "result" : kinds[0];
  let rest = raw;
  const head = /^([^.[\]]+)(?=$|[.[])/.exec(raw);
  if (head && sides(head[1].trim())) {
    kind = sides(head[1].trim());
    rest = raw.slice(head[0].length);
  } else if (head) {
    rest = `.${raw}`;
  }
  const path = [];
  while (rest.length) {
    let match = /^\.([^.[\]]+)/.exec(rest);
    if (match) {
      path.push(match[1].trim());
      rest = rest.slice(match[0].length);
      continue;
    }
    match = /^\[(\d+)\]/.exec(rest);
    if (match) {
      const position = Number(match[1]);
      if (!Number.isSafeInteger(position)) return null;
      path.push(position);
      rest = rest.slice(match[0].length);
      continue;
    }
    match = /^\[("(?:[^"\\]|\\.)*")\]/.exec(rest);
    if (match) {
      try {
        path.push(JSON.parse(match[1]));
      } catch (error) {
        return null;
      }
      rest = rest.slice(match[0].length);
      continue;
    }
    return null;
  }
  if (path.some((segment) => segment === "")) return null;
  return { kind, path };
}

export default function OutputValuePill({
  mapping, index, identity, nodeType, kinds, inputNames, resultRoots, problems, isDark, onChange, onRemove,
  /* Opt-in, for nodes whose outputs reach inside a value: the value side is
     typed as a path (`result.items[0]`) with the fields offered as you type,
     and any depth is kept. Agent, Start and End leave it off and are exactly
     as they were. */
  typedPath = false,
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
  const typable = editable && (typedPath || (kinds.length === 1 && kinds[0] === "result" && !resultRoots.closed));
  const editing = query !== null;
  /* What the typed text is reaching for, so the list can follow it: only
     the first step after the side is a field the list can offer. */
  const typedFirst = typedPath && editing
    ? (() => {
      const text = query.trim();
      const head = /^([^.[\]]*)/.exec(text)[1];
      const named = head && kinds.find((kind) => [kind, `${kind}s`, String(labels[kind]).toLowerCase()].includes(head.toLowerCase()));
      const after = named ? text.slice(head.length).replace(/^\./, "") : text;
      return /^[^.[\]]*$/.test(after) ? { kind: named || null, text: after.toLowerCase() } : null;
    })()
    : null;
  const filter = editing ? (typedPath ? (typedFirst ? typedFirst.text : "\u0000") : query.trim().toLowerCase()) : "";

  function setSource(kind, nextPath) {
    onChange({ ...mapping, source: { kind, path: nextPath } });
  }

  function closeTyping() {
    setMenu(null);
    setQuery(null);
  }

  /* The text a typed-path row opens with: the side, then the path, written
     the way the parser reads it back. */
  const typedText = source
    ? (kinds.length > 1 ? `${source.kind}${detail ? (detail.startsWith("[") ? detail : `.${detail}`) : ""}` : (detail || ""))
    : "";

  function startTyping() {
    if (editing) return;
    const bounds = sourceRef.current.getBoundingClientRect();
    setMenu({ identity, x: bounds.left, y: bounds.bottom + 4 });
    setQuery(typedPath ? typedText : (detail || ""));
  }

  /* A typed name that differs from what is shown becomes the field read;
     leaving it unchanged, or emptied, keeps the stored address. A typed path
     that is not one is not written either. */
  function finishTyping() {
    const typed = editing ? query.trim() : "";
    if (typedPath) {
      const next = typed && typed !== typedText ? parse_typed_path(typed, kinds, source?.kind, labels) : null;
      if (next && (next.kind !== source?.kind || JSON.stringify(next.path) !== JSON.stringify(path))) setSource(next.kind, next.path);
    } else if (typed && typed !== (detail || "")) setSource("result", [typed]);
    closeTyping();
  }

  const items = kinds.filter((kind) => !typedFirst || !typedFirst.kind || typedFirst.kind === kind).flatMap((kind, position) => [
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
