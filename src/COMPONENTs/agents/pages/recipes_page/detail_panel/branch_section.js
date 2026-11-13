import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React, { useEffect, useRef, useState } from "react";
import Select from "./panel_select";
import Input from "./panel_input";
import BareInput from "../../../../../BUILTIN_COMPONENTs/input/input";
import { variablePillField } from "./variable_pill";
import NodeTag from "./node_tag";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import PathEditor from "./path_editor";
import usePendingText from "./pending_text";
import useListIdentities from "./list_identity";
import { safe_text } from "../document_values";
import {
  case_problems,
  compare_problems,
  condition_is_readable,
  condition_node_is_readable,
  free_case_id,
  grouped_with,
  input_names,
  input_value_type,
  is_branch_type,
  json_type,
  new_compare,
  operand_is_readable,
  operator_info,
  operators_for,
  outlet_edges,
  remove_case,
  with_branch_execution,
} from "../skeleton_branch_config";
import { PANEL_SWITCH, Region, SettingRow, addButtonStyle, errorColor, muted, note, problem as problemStyle, removeButtonStyle, text as textColor } from "./panel_style";
import { Block } from "./process_timeline";
import AddButton from "./add_button";
import { SemiSwitch } from "../../../../../BUILTIN_COMPONENTs/input/switch";
import { node_identity } from "./node_identity";

/* If / Else and Switch / Case settings, between Input Variables and the
 * (absent) outputs of a branch (#351).
 *
 * The condition is a typed tree, edited as one: And / Or are groups with one
 * joiner each, nested by the author, never a precedence to remember. A row is
 * two lines — what is compared and how, then what it is compared with — which
 * is what fits the panel's 300px minimum inside a group's rail.
 *
 * Nothing stored is rewritten on the way through. A part of the tree, a case,
 * a value or an execution key this editor cannot take apart is shown as it is
 * stored and kept; only an explicit action replaces or removes it. The
 * backend is the authority on admission: the problems shown here are the
 * runtime's own later refusals, named early, not a new gate. */

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6, minWidth: 0 };
/* A secondary action that is not an add-at-the-end (replace, remove, keep). */
const SMALL_BUTTON = { fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 };
const SELECT_STYLE = { fontSize: 12, paddingVertical: 4, paddingHorizontal: 6, gap: 4 };
const FIELD_TEXT = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };

const is_record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has_own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const ALLOWED_EXECUTION_KEYS = { if_else: ["inputs", "condition"], switch_case: ["inputs", "value", "cases"] };
const JOINERS = [
  { value: "all", label: "All of these (and)" },
  { value: "any", label: "Any of these (or)" },
];
const OPERAND_KINDS = [
  { value: "input", label: "An input" },
  { value: "literal", label: "A fixed value" },
];
const LITERAL_KINDS = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True / false" },
  { value: "null", label: "null" },
];
const LITERAL_SEED = { string: "", number: 0, boolean: true, null: null };

function summary_text(value) {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? safe_text(value) : text;
  } catch (_error) {
    return safe_text(value);
  }
}

function Stored({ value, testid, isDark, children }) {
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={note(isDark)}>{children}</span>
      <span style={{ ...MONO, fontSize: 11.5, lineHeight: 1.45, wordBreak: "break-all", color: muted(isDark) }}>
        {summary_text(value)}
      </span>
    </div>
  );
}

/* ── literal values ─────────────────────────────────────────────────── */

const NUMBER_TEXT = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/* `bare` is a variable row's own field: no box, no fill, nothing on hover or
   focus — the caret marks it. It is a text box either way (no spinner), and
   only a complete number is written; half-typed text waits under it. */
function NumberBox({ value, onChange, testid, disabled, isDark, style = FIELD_TEXT, inputRef, bare = false, ariaLabel }) {
  const { t } = useTranslation();
  const pending = usePendingText(value, testid);
  const Field = bare ? BareInput : Input;
  return (
    <span data-testid={`${testid}-number`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <Field
        type="text"
        aria_label={ariaLabel}
        value={pending.text !== null ? pending.text : String(value)}
        disabled={disabled}
        placeholder={t("agents.execution.branch.a_number")}
        input_ref={inputRef}
        set_value={(text) => {
          const parsed = NUMBER_TEXT.test(text) ? Number(text) : NaN;
          if (!Number.isFinite(parsed)) {
            pending.hold(text);
            return;
          }
          if (String(parsed) !== text) pending.hold(text, parsed);
          else pending.release();
          if (parsed !== value) onChange(parsed);
        }}
        style={style}
      />
      {pending.text !== null && !NUMBER_TEXT.test(pending.text) && (
        <span style={note(isDark)}>{t("agents.execution.branch.pending_number", { value: String(value) })}</span>
      )}
    </span>
  );
}

/* One JSON scalar. `kinds` is what may be chosen; the stored kind is always
   offered too, so a stored value of an unexpected type stays visible and can
   be changed deliberately rather than vanishing from the menu. */
function LiteralEditor({ value, kinds, onChange, testid, disabled, isDark }) {
  const { t } = useTranslation();
  const kind = json_type(value);
  if (!["string", "number", "boolean", "null"].includes(kind)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <Stored value={value} testid={`${testid}-stored`} isDark={isDark}>{t("agents.execution.branch.stored_non_scalar")}</Stored>
        <Button label={t("agents.execution.branch.replace_with_text")} disabled={disabled} onClick={() => onChange("")} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
      </div>
    );
  }
  const offered = LITERAL_KINDS.filter((option) => kinds.includes(option.value) || option.value === kind).map((option) => ({ ...option, label: t(`agents.execution.branch.literal_${option.value}`) }));
  return (
    <div style={{ ...ROW, flex: 1 }}>
      {offered.length > 1 && (
        <span data-testid={`${testid}-kind`} style={{ width: 96, flexShrink: 0 }}>
          <Select options={offered} value={kind} filterable={false} disabled={disabled}
            set_value={(next) => next !== kind && onChange(LITERAL_SEED[next])} style={{ ...SELECT_STYLE, width: 96 }} />
        </span>
      )}
      {kind === "string" && (
        <span data-testid={`${testid}-text`} style={{ flex: 1, minWidth: 0 }}>
          <Input value={value} disabled={disabled} placeholder={t("agents.execution.branch.text_placeholder")} set_value={(next) => onChange(next)}
            style={FIELD_TEXT} />
        </span>
      )}
      {kind === "number" && <NumberBox value={value} onChange={onChange} testid={testid} disabled={disabled} isDark={isDark} />}
      {kind === "boolean" && (
        <span data-testid={`${testid}-boolean`} style={{ flex: 1, minWidth: 0 }}>
          <Select options={[{ value: "true", label: "true" }, { value: "false", label: "false" }]} value={String(value)}
            filterable={false} disabled={disabled} set_value={(next) => onChange(next === "true")} style={SELECT_STYLE} />
        </span>
      )}
      {kind === "null" && <span style={{ ...note(isDark), ...MONO }}>null</span>}
    </div>
  );
}

/* ── operands ───────────────────────────────────────────────────────── */

function InputOperand({ operand, names, onChange, testid, disabled, isDark }) {
  const { t } = useTranslation();
  const path = operand.path;
  const head = path.length > 0 ? path[0] : "";
  const options = names.map((name) => ({ value: name, label: name }));
  if (typeof head === "string" && head && !names.includes(head)) options.push({ value: head, label: t("agents.execution.branch.unbound_input_option", { head: head }) });
  if (head !== "" && typeof head !== "string") options.push({ value: String(head), label: t("agents.execution.branch.position_head", { head: head }) });
  const picker = (
    <span data-testid={`${testid}-input`} style={{ flex: 1, minWidth: 0 }}>
      {options.length === 0 ? (
        <span style={note(isDark)}>{t("agents.execution.branch.no_inputs")}</span>
      ) : (
        <Select options={options} value={typeof head === "string" ? head : String(head)} placeholder={t("agents.execution.branch.choose_an_input")}
          filterable={options.length > 8} disabled={disabled}
          set_value={(name) => onChange({ kind: "input", path: [name, ...path.slice(1)] })} style={SELECT_STYLE} />
      )}
    </span>
  );
  return (
    <PathEditor path={path} testid={`${testid}-path`} identity={testid} leading={picker} addLabel={t("agents.execution.branch.read_inside_it")}
      onChange={(next) => !disabled && onChange({ kind: "input", path: next })} />
  );
}

function OperandEditor({ operand, names, expected, allowKinds, onChange, testid, disabled, isDark }) {
  const { t } = useTranslation();
  if (!operand_is_readable(operand)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <Stored value={operand} testid={`${testid}-stored`} isDark={isDark}>{t("agents.execution.branch.unreadable_operand")}</Stored>
        <Button label={t("agents.execution.branch.replace_it")} disabled={disabled || names.length === 0}
          onClick={() => onChange({ kind: "input", path: [names[0]] })} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
      </div>
    );
  }
  const kinds = expected && ["string", "number", "boolean"].includes(expected) ? [expected] : ["string", "number", "boolean"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      {allowKinds && (
        <span data-testid={`${testid}-kind`} style={{ width: 132 }}>
          <Select options={OPERAND_KINDS.map((option) => ({ ...option, label: t(`agents.execution.branch.operand_${option.value}`) }))} value={operand.kind} filterable={false} disabled={disabled}
            set_value={(next) => {
              if (next === operand.kind) return;
              if (next === "input") onChange({ kind: "input", path: names.length ? [names[0]] : [] });
              else onChange({ kind: "literal", value: LITERAL_SEED[kinds[0]] });
            }} style={{ ...SELECT_STYLE, width: 132 }} />
        </span>
      )}
      {operand.kind === "input" ? (
        <InputOperand operand={operand} names={names} onChange={onChange} testid={testid} disabled={disabled} isDark={isDark} />
      ) : (
        <LiteralEditor value={operand.value} kinds={kinds} disabled={disabled} testid={`${testid}-literal`} isDark={isDark}
          onChange={(value) => onChange({ kind: "literal", value })} />
      )}
    </div>
  );
}

/* ── the condition tree ─────────────────────────────────────────────── */

function CompareRow({ condition, document, node, names, onChange, testid, disabled, isDark }) {
  const { t } = useTranslation();
  const op = operator_info(condition.operator);
  const left_type = condition.left.kind === "input"
    ? input_value_type(document, node, condition.left.path)
    : json_type(condition.left.value);
  const offered = operators_for(left_type).map((option) => ({ ...option, label: t(`agents.execution.branch.operator_${option.value}`) }));
  if (!offered.some((entry) => entry.value === op.value)) offered.push({ ...op, label: t(`agents.execution.branch.operator_${op.value}`) });
  const problems = compare_problems(document, node, condition, t);

  function set_operator(next) {
    const target = operator_info(next);
    if (!target || next === condition.operator) return;
    if (target.arity === 1) {
      onChange({ kind: "compare", operator: next, left: condition.left });
    } else if (op.arity === 1) {
      const seed = has_own(LITERAL_SEED, left_type || "") && left_type !== "null" ? LITERAL_SEED[left_type] : "";
      onChange({ kind: "compare", operator: next, left: condition.left, right: { kind: "literal", value: seed } });
    } else {
      onChange({ ...condition, operator: next });
    }
  }

  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...ROW, alignItems: "flex-start" }}>
        <OperandEditor operand={condition.left} names={names} expected={null} allowKinds={condition.left.kind !== "input"}
          testid={`${testid}-left`} disabled={disabled} isDark={isDark}
          onChange={(left) => onChange({ ...condition, left })} />
        <span data-testid={`${testid}-operator`} style={{ width: 128, flexShrink: 0 }}>
          <Select options={offered.map((entry) => ({ value: entry.value, label: entry.label }))} value={op.value}
            filterable={false} disabled={disabled} set_value={set_operator} style={{ ...SELECT_STYLE, width: 128 }} />
        </span>
      </div>
      {op.arity === 2 && (
        <OperandEditor operand={condition.right} names={names} expected={left_type} allowKinds
          testid={`${testid}-right`} disabled={disabled} isDark={isDark}
          onChange={(right) => onChange({ ...condition, right })} />
      )}
      {left_type === null && condition.left.kind === "input" && (
        <span style={note(isDark)}>{t("agents.execution.branch.input_type_unknown")}</span>
      )}
      {problems.map((problem, index) => (
        <span key={index} data-testid={`${testid}-problem-${index}`} style={problemStyle(isDark)}>{problem.message}</span>
      ))}
    </div>
  );
}

function ConditionTree({ condition, path, document, node, names, onChange, onRemove, removeDisabled, identity, disabled, isDark }) {
  const { t } = useTranslation();
  const testid = `condition-${path.length ? path.join("-") : "root"}`;
  const remove = onRemove && (
    <Button prefix_icon="close" ariaLabel={path.length ? t("agents.execution.branch.remove_part") : t("agents.execution.branch.remove_condition")} disabled={disabled || removeDisabled}
      onClick={onRemove} style={removeButtonStyle(isDark)} />
  );
  if (!condition_node_is_readable(condition)) {
    return (
      <div style={{ ...ROW, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stored value={condition} testid={`${testid}-stored`} isDark={isDark}>{t("agents.execution.branch.unreadable_condition_part")}</Stored>
        </div>
        {remove}
      </div>
    );
  }
  if (condition.kind === "compare") {
    return (
      <div style={{ ...ROW, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CompareRow condition={condition} document={document} node={node} names={names} onChange={onChange}
            testid={testid} disabled={disabled} isDark={isDark} />
        </div>
        {remove}
      </div>
    );
  }
  return (
    <ConditionGroup condition={condition} path={path} document={document} node={node} names={names} onChange={onChange}
      remove={remove} identity={identity} testid={testid} disabled={disabled} isDark={isDark} />
  );
}

function ConditionGroup({ condition, path, document, node, names, onChange, remove, identity, testid, disabled, isDark }) {
  const { t } = useTranslation();
  const children = condition.conditions;
  const rows = useListIdentities(identity, children.length);
  const add = (child) => {
    rows.added();
    onChange({ ...condition, conditions: [...children, child] });
  };
  const opposite = condition.kind === "all" ? "any" : "all";
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 10 }}>
      <div style={ROW}>
        <span data-testid={`${testid}-joiner`} style={{ width: 168 }}>
          <Select options={JOINERS.map((option) => ({ ...option, label: t(`agents.execution.branch.join_${option.value}`) }))} value={condition.kind} filterable={false} disabled={disabled}
            set_value={(kind) => kind !== condition.kind && onChange({ ...condition, kind })} style={{ ...SELECT_STYLE, width: 168 }} />
        </span>
        <span style={{ flex: 1 }} />
        {remove}
      </div>
      {children.length === 0 && (
        <span data-testid={`${testid}-empty`} style={problemStyle(isDark)}>{t("agents.execution.branch.empty_group")}</span>
      )}
      {children.map((child, index) => (
        <ConditionTree key={rows.ids[index]} condition={child} path={[...path, index]} document={document} node={node} names={names}
          identity={`${identity}/${rows.ids[index]}`} disabled={disabled} isDark={isDark}
          removeDisabled={children.length <= 1}
          onChange={(next) => onChange({ ...condition, conditions: children.map((old, at) => (at === index ? next : old)) })}
          onRemove={() => {
            rows.removed(index);
            onChange({ ...condition, conditions: children.filter((_, at) => at !== index) });
          }} />
      ))}
      {children.length === 1 && <span style={note(isDark)}>{t("agents.execution.branch.last_part_remove_group")}</span>}
      <div style={ROW}>
        <Button label={t("agents.execution.branch.comparison")} disabled={disabled || names.length === 0} onClick={() => add(new_compare(document, node, names[0]))} style={addButtonStyle(isDark)} />
        <Button label={opposite === "all" ? t("agents.execution.branch.add_all_group") : t("agents.execution.branch.add_any_group")} disabled={disabled || names.length === 0}
          onClick={() => add({ kind: opposite, conditions: [new_compare(document, node, names[0])] })} style={addButtonStyle(isDark)} />
      </div>
    </div>
  );
}

function IfEditor({ document, node, execution, names, write, identity, disabled, isDark }) {
  const { t } = useTranslation();
  if (!has_own(execution, "condition")) {
    return (
      <div data-testid="branch-condition-missing" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={note(isDark)}>{t("agents.execution.branch.condition_missing")}</span>
        <Button label={t("agents.execution.branch.add_a_condition")} disabled={disabled || names.length === 0}
          onClick={() => write("condition", new_compare(document, node, names[0]))} style={addButtonStyle(isDark)} />
        {names.length === 0 && <span style={note(isDark)}>{t("agents.execution.branch.condition_needs_input")}</span>}
      </div>
    );
  }
  const root = execution.condition;
  const readable_root = condition_node_is_readable(root);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={note(isDark)}>{t("agents.execution.branch.condition_flow_note")}</span>
      <ConditionTree condition={root} path={[]} document={document} node={node} names={names} identity={identity}
        disabled={disabled} isDark={isDark} onChange={(next) => write("condition", next)} />
      {readable_root && root.kind === "compare" && (
        <div style={ROW}>
          <Button label={t("agents.execution.branch.and")} disabled={disabled || names.length === 0}
            onClick={() => write("condition", grouped_with(root, "all", new_compare(document, node, names[0])))} style={addButtonStyle(isDark)} />
          <Button label={t("agents.execution.branch.or")} disabled={disabled || names.length === 0}
            onClick={() => write("condition", grouped_with(root, "any", new_compare(document, node, names[0])))} style={addButtonStyle(isDark)} />
        </div>
      )}
      {!condition_is_readable(root) && readable_root && (
        <span style={note(isDark)}>{t("agents.execution.branch.stored_parts_unchanged")}</span>
      )}
      <div style={ROW}>
        {!readable_root && (
          <Button label={t("agents.execution.branch.replace_condition")} disabled={disabled || names.length === 0}
            onClick={() => write("condition", new_compare(document, node, names[0]))} style={SMALL_BUTTON} />
        )}
        <Button label={t("agents.execution.branch.remove_condition")} disabled={disabled} onClick={() => write("condition", undefined)} style={SMALL_BUTTON} />
      </div>
    </div>
  );
}

/* ── the switch ─────────────────────────────────────────────────────── */

/* The Switch on picker, sized as the Kernel's setting selects are (12px,
   5 / 8): its text sits on the same line as the label beside it. */
const SWITCH_ON_SELECT = { fontSize: 12, paddingVertical: 5, paddingHorizontal: 8 };

/* One row of a region: its own padding, no surface of its own. */
const REGION_ROW = { padding: "6px 6px 6px 11px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 };

/* A case row is laid out as a variable row is (variable_pill): the same
   5 : 6 columns around a narrow middle, 32px tall, the way out on the right —
   `value  →  [step]  ×` where a variable row is `name = value ×`. */
const CASE_ROW_HEIGHT = 32;
const CASE_GRID = { display: "grid", gridTemplateColumns: "minmax(0, 5fr) 18px minmax(0, 6fr)", flex: 1, minWidth: 0, fontSize: 12 };
const CASE_CELL = { position: "relative", minWidth: 0, display: "flex", alignItems: "center", minHeight: CASE_ROW_HEIGHT };
const CASE_VALUE_CELL = { ...CASE_CELL, padding: "0 0 0 8px" };
const CASE_TARGET_CELL = { ...CASE_CELL, padding: "0 4px 0 6px" };
/* A variable row's own field. */
const caseField = (isDark) => ({ ...variablePillField, color: textColor(isDark) });
/* Under a row: its problems, a pending number, the removal question. */
const CASE_BELOW = { padding: "0 10px 7px", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 };

/* Where an outlet goes: the step itself, so it can be drawn as the canvas
   draws it — never its stored id. A step the edge names that is no longer in
   the graph is null. */
function outlet_targets(document, node_id, port_id) {
  const nodes = is_record(document) && Array.isArray(document.nodes) ? document.nodes : [];
  return outlet_edges(document, node_id, port_id).map((edge) =>
    nodes.find((candidate) => is_record(candidate) && candidate.id === edge.target_node_id) || null);
}

/* The same targets in words, for the removal question. */
function target_titles(targets, t) {
  return targets.map((target) => {
    const identity = target ? node_identity(target, t) : null;
    return identity && identity.title ? identity.title : t("agents.execution.branch.missing_step");
  });
}

/* The step an outlet goes to, as a tag; a removed step in plain muted words;
   a red Not connected when there is none — a run needs every outlet wired. */
function Target({ targets, presentation, testid, isDark, t }) {
  if (targets.length === 0) {
    return (
      <span data-testid={testid} style={{ minWidth: 0, fontSize: 11.5, lineHeight: "18px", overflow: "hidden",
        textOverflow: "ellipsis", whiteSpace: "nowrap", color: errorColor(isDark) }}>
        {t("agents.execution.branch.not_connected")}
      </span>
    );
  }
  return (
    <span data-testid={testid} title={target_titles(targets, t).join(t("agents.schema.fields.list_separator"))}
      style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0, overflow: "hidden" }}>
      {targets.map((target, at) => (target && node_identity(target, t) ? (
        <NodeTag key={at} node={target} presentation={presentation} isDark={isDark} testid={`${testid}-tag-${at}`}
          style={{ flexShrink: at === 0 ? 1 : 0 }} />
      ) : (
        <span key={at} data-testid={`${testid}-removed-${at}`} style={{ minWidth: 0, fontSize: 11.5, lineHeight: "18px",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: muted(isDark) }}>
          {target ? target_titles([target], t)[0] : t("agents.execution.branch.missing_step")}
        </span>
      )))}
    </span>
  );
}

/* The muted arrow between a case and where it goes. */
function CaseArrow({ isDark }) {
  return (
    <span aria-hidden="true" style={{ alignSelf: "center", textAlign: "center", fontSize: 12, lineHeight: 1,
      color: muted(isDark), opacity: 0.7, userSelect: "none", pointerEvents: "none" }}>→</span>
  );
}

/* What a new case holds: never a value another case already matches. Text
   starts empty, then "case 2", "case 3"…; a number takes the first unused
   integer; true/false the one still free (null when both are taken). */
/* Stored data that is matched at run time, so it is fixed English and never
   follows the interface language. */
const CASE_SEED_TEXT = (n) => `case ${n}`;

function seed_case_value(cases, kind) {
  const taken = (candidate) => cases.some((entry) => is_record(entry) && has_own(entry, "value") &&
    json_type(entry.value) === json_type(candidate) && entry.value === candidate);
  if (kind === "boolean") return !taken(true) ? true : !taken(false) ? false : undefined;
  if (kind === "number") {
    for (let n = 0; ; n += 1) if (!taken(n)) return n;
  }
  if (!taken("")) return "";
  for (let n = 2; ; n += 1) {
    const candidate = CASE_SEED_TEXT(n);
    if (!taken(candidate)) return candidate;
  }
}

/* A case's value, edited as what it already is: text, a number or true/false.
   A stored value of another kind (null, a list…) is shown as it is and saved
   back unchanged. */
function CaseValue({ entry, index, testid, onChange, disabled, isDark, autoFocus = false, onFocused }) {
  const { t } = useTranslation();
  /* A case just added takes the focus, so its value can be typed at once. */
  const field = useRef(null);
  useEffect(() => {
    if (!autoFocus || !field.current) return;
    field.current.focus();
    if (onFocused) onFocused();
  }, [autoFocus, onFocused]);
  if (!is_record(entry) || !has_own(entry, "value")) {
    return <span data-testid={`${testid}-stored`} style={{ ...note(isDark), flex: 1, minWidth: 0, paddingLeft: 3 }}>{t("agents.execution.branch.case_no_value")}</span>;
  }
  const { value } = entry;
  const kind = json_type(value);
  if (kind === "string") {
    return (
      <span data-testid={`${testid}-value-text`} style={{ flex: 1, minWidth: 0, display: "flex" }}>
        <BareInput value={value} disabled={disabled} placeholder={t("agents.execution.branch.text_placeholder")}
          aria_label={t("agents.execution.branch.case_value_label", { value1: index + 1 })}
          input_ref={field} set_value={(next) => onChange(next)} style={caseField(isDark)} />
      </span>
    );
  }
  if (kind === "number") {
    return <NumberBox value={value} onChange={onChange} testid={`${testid}-value`} disabled={disabled} isDark={isDark}
      style={caseField(isDark)} inputRef={field} bare ariaLabel={t("agents.execution.branch.case_value_label", { value1: index + 1 })} />;
  }
  if (kind === "boolean") {
    const flip = () => !disabled && onChange(!value);
    return (
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, paddingLeft: 3 }}>
        <span ref={field} role="switch" aria-checked={value} aria-disabled={disabled || undefined}
          aria-label={t("agents.execution.branch.case_value_label", { value1: index + 1 })} tabIndex={disabled ? -1 : 0}
          data-testid={`${testid}-value-boolean`}
          onClick={(event) => { if (event.target === event.currentTarget) flip(); }}
          onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); flip(); } }}
          style={{ display: "inline-flex", flexShrink: 0, cursor: disabled ? "default" : "pointer" }}>
          {/* The switch stops its click from bubbling and commits it itself;
              the span answers the keyboard and an assistive click. */}
          <SemiSwitch on={value} set_on={flip} style={PANEL_SWITCH} />
        </span>
        <span style={{ fontSize: 12, minWidth: 0, color: textColor(isDark) }}>{value ? t("agents.branch.true") : t("agents.branch.false")}</span>
      </span>
    );
  }
  return (
    <span data-testid={`${testid}-stored`} style={{ ...note(isDark), flex: 1, minWidth: 0, paddingLeft: 3 }}>
      {kind === "null" ? t("agents.execution.branch.case_empty_value") : summary_text(value)}
    </span>
  );
}

/* What the switch reads: one of this node's inputs, and where inside it. A
   stored fixed value (or a shape this editor cannot take apart) is shown as
   it is and kept until the author picks an input instead. */
function SwitchOn({ document, node, execution, names, write, disabled, isDark }) {
  const { t } = useTranslation();
  const has_value = has_own(execution, "value");
  const value = execution.value;
  const input_options = names.map((name) => ({ value: name, label: name }));
  const pick_row = (label, current, onPick, testid) => (
    <div key={testid} style={REGION_ROW}>
      <SettingRow label={label} isDark={isDark}>
        <span data-testid={testid} style={{ flex: 1, minWidth: 0, maxWidth: "60%" }}>
          <Select options={current.options} value={current.value} placeholder={t("agents.execution.branch.choose_an_input")}
            filterable={current.options.length > 8} disabled={disabled} set_value={onPick} style={SWITCH_ON_SELECT} />
        </span>
      </SettingRow>
    </div>
  );

  if (!has_value) {
    return (
      <div data-testid="branch-switch-value" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {names.length > 0 ? (
          <>
            <Region isDark={isDark}>
              {pick_row(t("agents.execution.branch.switch_value"), { options: input_options, value: "" },
                (name) => write("value", { kind: "input", path: [name] }), "branch-switch-value-pick")}
            </Region>
            <span style={problemStyle(isDark)}>{t("agents.execution.branch.switch_value_missing")}</span>
          </>
        ) : (
          <span style={note(isDark)}>{t("agents.execution.branch.switch_needs_input")}</span>
        )}
      </div>
    );
  }
  if (!operand_is_readable(value) || value.kind !== "input") {
    const fixed = operand_is_readable(value);
    return (
      <div data-testid="branch-switch-value" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Region isDark={isDark}>
          <div key="stored" data-testid="branch-switch-value-literal" style={REGION_ROW}>
            <SettingRow label={t("agents.execution.branch.switch_value")} isDark={isDark}>
              <span style={{ ...note(isDark), maxWidth: "60%", textAlign: "right" }}>
                {fixed ? t("agents.execution.branch.switch_fixed_value", { value: summary_text(value.value) }) : t("agents.execution.branch.switch_value_unreadable")}
              </span>
            </SettingRow>
          </div>
          {names.length > 0 && pick_row(t("agents.execution.branch.use_an_input"), { options: input_options, value: "" },
            (name) => write("value", { kind: "input", path: [name] }), "branch-switch-value-replace")}
        </Region>
        {names.length === 0 && <span style={note(isDark)}>{t("agents.execution.branch.switch_needs_input")}</span>}
      </div>
    );
  }

  const path = value.path;
  const head = path.length > 0 ? path[0] : "";
  const options = [...input_options];
  if (head !== "" && !names.includes(head)) options.push({ value: String(head), label: t("agents.execution.branch.unbound_input_option", { head: String(head) }) });
  const unknown = typeof head === "string" && head && Array.isArray(execution.inputs) && !names.includes(head);
  return (
    <div data-testid="branch-switch-value" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Region isDark={isDark}>
        {pick_row(t("agents.execution.branch.switch_value"), { options, value: String(head) },
          (name) => write("value", { kind: "input", path: [name, ...path.slice(1)] }), "branch-switch-value-operand-input")}
        <div key="inside" style={REGION_ROW}>
          {path.length > 1 && <span style={{ fontSize: 12.5, lineHeight: "18px" }}>{t("agents.execution.branch.read_inside")}</span>}
          {/* The input itself is picked in the row above; this edits only the
              steps after it, and adds the first one on demand. */}
          <PathEditor path={path} testid="branch-switch-value-operand-path" identity="branch-switch-value"
            leading={<React.Fragment />} addLabel={t("agents.execution.branch.read_inside_it")}
            onChange={(next) => !disabled && write("value", { kind: "input", path: next })} />
        </div>
      </Region>
      {unknown && <span style={problemStyle(isDark)}>{t("agents.execution.branch.unknown_input", { name: head })}</span>}
    </div>
  );
}

function switch_on_problems(execution, names) {
  if (!has_own(execution, "value")) return [{ code: "missing_value" }];
  const value = execution.value;
  if (operand_is_readable(value) && value.kind === "input" && typeof value.path[0] === "string" && value.path[0] &&
      Array.isArray(execution.inputs) && !names.includes(value.path[0])) return [{ code: "unknown_input" }];
  return [];
}

function SwitchEditor({ document, node, execution, names, write, onChange, disabled, isDark }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(null);
  /* The id of the case "+ Add" just created; its value field takes focus once. */
  const [focusCaseId, setFocusCaseId] = useState(null);
  const clearFocusCase = React.useCallback(() => setFocusCaseId(null), []);
  const value = execution.value;
  const value_type = has_own(execution, "value") && operand_is_readable(value)
    ? (value.kind === "input" ? input_value_type(document, node, value.path) : json_type(value.value)) : null;
  const cases = execution.cases;
  const readable_cases = Array.isArray(cases);
  const problems = readable_cases ? case_problems(cases, t) : [];
  const unique_ids = readable_cases ? new Set() : null;
  const keys = readable_cases ? cases.map((entry, index) => {
    const id = is_record(entry) && typeof entry.id === "string" && entry.id ? entry.id : null;
    if (id && !unique_ids.has(id)) { unique_ids.add(id); return `id:${id}`; }
    return `at:${index}`;
  }) : [];
  const seed_kind = ["string", "number", "boolean"].includes(value_type) ? value_type : "string";
  const seed = readable_cases ? seed_case_value(cases, seed_kind) : undefined;
  const case_targets = readable_cases ? cases.map((entry) => (is_record(entry) && typeof entry.id === "string" && entry.id
    ? outlet_targets(document, node.id, entry.id) : null)) : [];
  const default_targets = outlet_targets(document, node.id, "default");
  /* The Agent node of an Agent document is that Agent: its tag wears the
     Agent's own icon and colour, as the canvas draws it. */
  const presentation = is_record(document) && document.kind === "agent" && has_own(document, "presentation")
    ? document.presentation : null;
  /* Everything a run would stop on: each case's own refusals, each case and
     the Default with nowhere to go, and a missing case list. */
  const case_block_problems = [
    ...problems.flat(),
    ...case_targets.filter((names_of) => names_of && names_of.length === 0),
    ...(default_targets.length === 0 ? ["default"] : []),
    ...(!has_own(execution, "cases") ? ["missing"] : []),
  ];

  return (
    <>
      <Block section="branch-switch-on" title={t("agents.execution.branch.switch_on")} help={t("agents.execution.branch.switch_on_help")}
        problems={switch_on_problems(execution, names)} isDark={isDark}>
        <SwitchOn document={document} node={node} execution={execution} names={names} write={write} disabled={disabled} isDark={isDark} />
      </Block>

      <Block section="branch-cases" title={t("agents.execution.branch.cases")}
        help={<>
          <span style={{ display: "block" }}>{t("agents.execution.branch.cases_help")}</span>
          {/* What the Default row is for, said once here rather than on the row. */}
          <span data-testid="branch-cases-help-default" style={{ display: "block", marginTop: 4 }}>
            {`${t("agents.execution.branch.default")}: ${t("agents.execution.branch.default_outlet_note")}`}
          </span>
        </>}
        aside={readable_cases ? String(cases.length) : undefined} problems={case_block_problems} isDark={isDark}>
        <div data-testid="branch-switch-cases" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {!has_own(execution, "cases") && (
            <>
              <span style={problemStyle(isDark)}>{t("agents.execution.branch.case_list_missing")}</span>
              <Button label={t("agents.execution.branch.start_cases")} disabled={disabled} onClick={() => write("cases", [])} style={addButtonStyle(isDark)} />
            </>
          )}
          {has_own(execution, "cases") && !readable_cases && (
            <>
              <Stored value={cases} testid="branch-switch-cases-stored" isDark={isDark}>{t("agents.execution.branch.unreadable_case_list")}</Stored>
              <Button label={t("agents.execution.branch.replace_cases")} disabled={disabled} onClick={() => write("cases", [])} style={addButtonStyle(isDark)} />
            </>
          )}
          <Region isDark={isDark} testid="branch-case-list">
            {readable_cases && cases.map((entry, index) => {
              const testid = `branch-case-${index}`;
              const readable = is_record(entry) && typeof entry.id === "string" && entry.id;
              const targets = case_targets[index] || [];
              const remove_now = () => {
                setConfirming(null);
                if (!readable) {
                  write("cases", cases.filter((_, at) => at !== index));
                  return;
                }
                const result = remove_case(document, node.id, entry.id);
                if (result.document !== document) onChange(result.document);
              };
              return (
                <div key={keys[index]} data-testid={testid} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  <div data-testid={`${testid}-header`} style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
                    <div style={CASE_GRID}>
                      <div data-testid={`${testid}-value-cell`} style={CASE_VALUE_CELL}>
                        <CaseValue entry={entry} index={index} testid={testid} disabled={disabled} isDark={isDark}
                          autoFocus={is_record(entry) && entry.id === focusCaseId} onFocused={clearFocusCase}
                          onChange={(next) => write("cases", cases.map((old, at) => (at === index ? { ...old, value: next } : old)))} />
                      </div>
                      <CaseArrow isDark={isDark} />
                      <div style={CASE_TARGET_CELL}>
                        {readable && <Target targets={targets} presentation={presentation} testid={`${testid}-target`} isDark={isDark} t={t} />}
                      </div>
                    </div>
                    <Button prefix_icon="close" ariaLabel={t("agents.execution.branch.remove_case", { value1: index + 1 })} disabled={disabled}
                      onClick={() => (targets.length > 0 ? setConfirming(keys[index]) : remove_now())}
                      style={{ ...removeButtonStyle(isDark), marginRight: 5 }} />
                  </div>
                  {((problems[index] || []).length > 0 || confirming === keys[index]) && (
                    <div style={CASE_BELOW}>
                      {(problems[index] || []).map((problem, at) => (
                        <span key={at} data-testid={`${testid}-problem-${at}`} style={problemStyle(isDark)}>{problem.message}</span>
                      ))}
                      {confirming === keys[index] && (
                        <div data-testid={`${testid}-confirm`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={note(isDark)}>
                            {t("agents.execution.branch.connected_case", { targets: target_titles(targets, t).join(t("agents.schema.fields.list_separator")) })}
                          </span>
                          <div style={ROW}>
                            <Button label={t("agents.execution.branch.remove_case_and_connection")} disabled={disabled} onClick={remove_now}
                              style={{ ...addButtonStyle(isDark), color: errorColor(isDark) }} />
                            <Button label={t("agents.execution.branch.keep_it")} onClick={() => setConfirming(null)} style={addButtonStyle(isDark)} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* The Default is always there and always last, as on the canvas:
                not removable, nothing to edit, only where it goes. */}
            <div key="default" data-testid="branch-case-default" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* No way out to make room for: the × column is left empty so
                  the tag lines up with the cases' tags. */}
              <div data-testid="branch-case-default-header" style={{ display: "flex", alignItems: "center", minWidth: 0, paddingRight: 27 }}>
                <div style={CASE_GRID}>
                  <div style={CASE_VALUE_CELL}>
                    <span data-testid="branch-case-default-label" style={{ paddingLeft: 3, fontSize: 12, color: muted(isDark),
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t("agents.execution.branch.default")}</span>
                  </div>
                  <CaseArrow isDark={isDark} />
                  <div style={CASE_TARGET_CELL}>
                    <Target targets={default_targets} presentation={presentation} testid="branch-case-default-target" isDark={isDark} t={t} />
                  </div>
                </div>
              </div>
            </div>
          </Region>
          {readable_cases && (
            <AddButton label={t("agents.legacy_tools.add")} ariaLabel={t("agents.execution.branch.add_a_case")} isDark={isDark}
              disabled={disabled || seed === undefined} testid="branch-case-add"
              onClick={() => {
                if (seed === undefined) return;
                const id = free_case_id(cases);
                setFocusCaseId(id);
                write("cases", [...cases, { id, value: seed }]);
              }} />
          )}
        </div>
      </Block>
    </>
  );
}

/* ── the section ────────────────────────────────────────────────────── */

export default function BranchSection({ document, node, isDark, onChange }) {
  const { t } = useTranslation();
  if (!node || !is_branch_type(node.type)) return null;
  const execution = is_record(node.config) && is_record(node.config.execution) ? node.config.execution : null;
  const unique = is_record(document) && Array.isArray(document.nodes) &&
    document.nodes.filter((candidate) => is_record(candidate) && candidate.id === node.id).length === 1;
  const editable = Boolean(unique && (document.kind === "agent" || document.kind === "workflow") && document.schema_version === 1 &&
    typeof onChange === "function" && execution);
  const names = input_names(node);
  const identity = `${is_record(document) ? safe_text(document.id) : ""}/${safe_text(node.id)}`;

  function write(key, value) {
    if (!editable) return;
    const next = with_branch_execution(document, node.id, key, value);
    if (next !== document) onChange(next);
  }

  if (!execution) {
    return (
      <section data-testid="branch-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Stored value={node.config} testid="branch-section-stored" isDark={isDark}>{t("agents.execution.branch.unreadable_settings")}</Stored>
      </section>
    );
  }
  const allowed = ALLOWED_EXECUTION_KEYS[node.type];
  const extra = Object.keys(execution).filter((key) => !allowed.includes(key));
  return (
    <section data-testid="branch-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <span style={problemStyle(isDark)}>
          {!unique ? t("agents.execution.branch.duplicate_node_id") : t("agents.execution.branch.read_only_graph")}
        </span>
      )}
      {node.type === "if_else" ? (
        <Block section="branch-condition" title={t("agents.execution.branch.condition")} isDark={isDark}>
          <IfEditor document={document} node={node} execution={execution} names={names} write={write} identity={identity}
            disabled={!editable} isDark={isDark} />
        </Block>
      ) : (
        <SwitchEditor document={document} node={node} execution={execution} names={names} write={write}
          onChange={(next) => editable && onChange(next)} disabled={!editable} isDark={isDark} />
      )}
      {extra.map((key) => (
        <div key={key} data-testid={`branch-extra-${key}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Stored value={execution[key]} testid={`branch-extra-${key}-stored`} isDark={isDark}>
            {t("agents.execution.branch.unknown_setting", { key: key })}
          </Stored>
          <Button label={t("agents.execution.branch.remove_key", { key: key })} disabled={!editable} onClick={() => write(key, undefined)} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
        </div>
      ))}
    </section>
  );
}
