import React, { useState } from "react";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
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
  mapping, index, identity, kinds, inputNames, resultRoots, problems, isDark, onChange, onRemove,
}) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(null);
  const testid = `output-row-${index}`;
  const name = typeof mapping?.name === "string" ? mapping.name : "";
  const editable = output_mapping_is_editable(mapping);
  const source = editable ? mapping.source : null;
  const path = source?.path || [];
  const labels = {
    input: t("agents.workflow.inputs"),
    result: t("agents.execution.code.result"),
  };
  const wholeLabels = {
    input: t("agents.io.everything_it_was_given"),
    result: t("agents.io.the_whole_result"),
  };
  const fields = { input: inputNames, result: resultRoots.roots };
  const detail = path.length ? fieldPathLabel(path) : undefined;
  const label = source ? labels[source.kind] : t("common.select");
  const sourceLabel = detail ? `${label} · ${detail}` : label;
  const removeLabel = name ? t("agents.io.remove_output", { name }) : t("agents.io.remove_output_unnamed");
  const menuOpen = menu?.identity === identity;

  function setSource(kind, nextPath) {
    onChange({ ...mapping, source: { kind, path: nextPath } });
  }

  const items = kinds.flatMap((kind, position) => [
    ...(position ? [{ type: "separator" }] : []),
    ...fields[kind].map((field) => ({
      label: <VariablePillValue label={labels[kind]}
        detail={field || t("agents.io.the_field_with_no_name")} isDark={isDark} />,
      onClick: () => {
        if (source?.kind !== kind || path.length !== 1 || path[0] !== field) setSource(kind, [field]);
      },
    })),
    {
      label: wholeLabels[kind],
      onClick: () => {
        if (source?.kind !== kind || path.length) setSource(kind, []);
      },
    },
  ]);

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <VariablePill testid={testid} isDark={isDark} name={name}
        onNameChange={(next) => onChange({ ...mapping, name: next })}
        onRemove={onRemove} removeLabel={removeLabel}>
        <Button ariaLabel={sourceLabel} title={sourceLabel}
          dom_props={{ type: "button", "aria-haspopup": "menu", "aria-expanded": menuOpen, onBlur: () => setMenu(null) }}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ identity, x: bounds.left - 3, y: bounds.bottom + 8 });
          }}
          style={{ ...variablePillField, justifyContent: "flex-start", content: { root: { minWidth: 0 } } }}>
          <VariablePillValue label={label} detail={detail} isDark={isDark} />
        </Button>
      </VariablePill>
      {/* The source button stays focused while a portalled menu row is clicked. */}
      <div onMouseDown={(event) => event.preventDefault()}>
        <ContextMenu visible={menuOpen} x={menu?.x} y={menu?.y} items={items}
          onClose={() => setMenu(null)} isDark={isDark} scrollable />
      </div>
      {!editable && mapping?.source !== undefined && (
        <span data-testid={`${testid}-unreadable`}
          style={{ fontSize: 10.5, overflowWrap: "anywhere", fontFamily: "ui-monospace, Menlo, monospace" }}>
          {JSON.stringify(mapping.source)}
        </span>
      )}
      {problems.map((problem, i) => (
        <span key={i} data-testid={`${testid}-problem-${i}`}
          style={{ fontSize: 10.5, lineHeight: 1.45, overflowWrap: "anywhere", color: isDark ? "#ff8c8c" : "#b02020" }}>
          {problem.message}
        </span>
      ))}
    </div>
  );
}
