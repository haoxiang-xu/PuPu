import React, { useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { first_present_expression, ref_expression } from "../skeleton_io";
import VariablePill, { VariablePillValue, variablePillField } from "./variable_pill";
import usePillMissingPolicy from "./pill_missing_policy";

/* A row that reads the first of several sources, in the pill's language: the
   row names it, and the sources follow in the order they are tried, each one
   filled row, numbered, with its own pick and its own way out. */

const muted = (isDark) => (isDark ? "#a6a6af" : "#686870");

export default function FirstPresentPill({ binding, index, sources, sourceTag, problems, isDark, onChange, onRemove, hideMissingPolicy = true }) {
  const tagOf = (node_id) => (sourceTag && sourceTag(node_id)) || {};
  const { t } = useTranslation();
  const policy = usePillMissingPolicy({ binding, onChange, isDark, hidden: hideMissingPolicy, testid: `binding-row-${index}` });
  const [menu, setMenu] = useState(null);
  const name = typeof binding?.name === "string" ? binding.name : "";
  const values = binding.value.values;
  const removeLabel = name ? t("agents.io.remove_input", { name }) : t("agents.io.remove_input_unnamed");
  const testid = `binding-row-${index}`;

  function setValues(next) {
    onChange({ ...binding, value: first_present_expression(next) });
  }

  const describe = (entry) => {
    const source = entry?.kind === "ref" && sources.find((candidate) =>
      candidate.node_id === entry.node_id && candidate.name === entry.path?.[0]);
    return {
      node: source ? source.node_label : entry?.node_id || "—",
      path: Array.isArray(entry?.path) ? entry.path.join(".") : "",
      tag: source ? tagOf(entry.node_id) : {},
    };
  };

  const open = (event, position) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setMenu({ position, x: bounds.left, y: bounds.bottom + 4 });
  };

  const items = sources.map((source) => ({
    label: <VariablePillValue label={source.node_label} detail={source.name} {...tagOf(source.node_id)} isDark={isDark} />,
    prefix_icon: source.conditional ? "circle" : undefined,
    onClick: () => {
      const next = ref_expression(source.node_id, [source.name]);
      setValues(menu.position === values.length
        ? [...values, next]
        : values.map((old, i) => (i === menu.position ? next : old)));
      setMenu(null);
    },
  }));

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <VariablePill testid={testid} isDark={isDark} name={name}
        onNameChange={(next) => onChange({ ...binding, name: next })}
        onRemove={onRemove} removeLabel={removeLabel} actions={policy.action}>
        <span title={t("agents.io.first_present_caption")} style={{ ...variablePillField, display: "flex", alignItems: "center", minWidth: 0 }}>
          <VariablePillValue label={t("agents.io.source.first_present")} isDark={isDark} />
        </span>
      </VariablePill>
      {values.map((entry, i) => {
        const shown = describe(entry);
        return (
          <div key={i} data-testid={`${testid}-alt-${i}`}
            style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, height: 28,
              padding: "0 5px 0 20px" }}>
            <span aria-hidden="true" style={{ width: 12, flexShrink: 0, fontSize: 11.5, color: muted(isDark),
              fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <Button ariaLabel={t("agents.io.source_option", { node: shown.node, name: shown.path })}
              dom_props={{ type: "button", "aria-haspopup": "menu", onBlur: () => setMenu(null) }}
              onClick={(event) => open(event, i)}
              style={{ ...variablePillField, flex: 1, justifyContent: "flex-start", content: { root: { minWidth: 0 } } }}>
              <VariablePillValue label={shown.node} detail={shown.path || undefined} {...shown.tag}
                testid={`${testid}-alt-${i}-tag`} isDark={isDark} />
            </Button>
            <Button prefix_icon="close" ariaLabel={t("agents.io.remove_source", { position: i + 1 })}
              disabled={values.length <= 2} onClick={() => setValues(values.filter((_, j) => j !== i))}
              style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, backgroundColor: "transparent",
                color: muted(isDark), opacity: values.length <= 2 ? 0.3 : 0.75,
                iconOnlyPaddingVertical: 0, iconOnlyPaddingHorizontal: 0, content: { icon: { width: 12, height: 12 } } }} />
          </div>
        );
      })}
      <Button label={t("agents.io.add_a_source")}
        dom_props={{ type: "button", "aria-haspopup": "menu", onBlur: () => setMenu(null) }}
        onClick={(event) => open(event, values.length)}
        style={{ alignSelf: "flex-start", fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 5,
          marginLeft: 14, marginBottom: 4, color: muted(isDark) }} />
      {policy.settings}
      <div onMouseDown={(event) => event.preventDefault()}>
        <ContextMenu visible={menu !== null && items.length > 0} x={menu?.x} y={menu?.y} items={items}
          onClose={() => setMenu(null)} isDark={isDark} scrollable />
      </div>
      {problems.map((problem, i) => (
        <span key={i} data-testid={`${testid}-problem-${i}`}
          style={{ fontSize: 11.5, lineHeight: 1.45, overflowWrap: "anywhere", padding: "0 10px 7px", color: isDark ? "#ff8c8c" : "#b02020" }}>
          {problem.message}
        </span>
      ))}
    </div>
  );
}
