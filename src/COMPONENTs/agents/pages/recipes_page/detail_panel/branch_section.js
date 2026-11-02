import React, { useState } from "react";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
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
  move_case,
  new_compare,
  operand_is_readable,
  operator_info,
  operators_for,
  outlet_edges,
  remove_case,
  with_branch_execution,
} from "../skeleton_branch_config";

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

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const PROBLEM_LIGHT = "rgba(176,32,32,0.95)";
const PROBLEM_DARK = "rgba(255,140,140,0.95)";
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const SECTION_LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const ROW = { display: "flex", alignItems: "center", gap: 6, minWidth: 0 };
const SMALL_BUTTON = { fontSize: 11, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5 };
const ICON_BUTTON = { paddingVertical: 4, paddingHorizontal: 4, borderRadius: 4, content: { icon: { width: 11, height: 11 } } };
const SELECT_STYLE = { fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5, gap: 4 };

const is_record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const has_own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const problem_style = (isDark) => ({ fontSize: 10.5, lineHeight: 1.45, color: isDark ? PROBLEM_DARK : PROBLEM_LIGHT });

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
      <span style={CAPTION}>{children}</span>
      <span style={{ ...MONO, fontSize: 10.5, lineHeight: 1.45, wordBreak: "break-all", color: isDark ? "#c9c9d1" : "#55555d" }}>
        {summary_text(value)}
      </span>
    </div>
  );
}

/* ── literal values ─────────────────────────────────────────────────── */

const NUMBER_TEXT = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function NumberBox({ value, onChange, testid, disabled }) {
  const pending = usePendingText(value, testid);
  return (
    <span data-testid={`${testid}-number`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
      <Input
        value={pending.text !== null ? pending.text : String(value)}
        disabled={disabled}
        placeholder="a number"
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
        style={{ width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }}
      />
      {pending.text !== null && !NUMBER_TEXT.test(pending.text) && (
        <span style={CAPTION}>Not a number yet. The stored value stays {String(value)} until it is one.</span>
      )}
    </span>
  );
}

/* One JSON scalar. `kinds` is what may be chosen; the stored kind is always
   offered too, so a stored value of an unexpected type stays visible and can
   be changed deliberately rather than vanishing from the menu. */
function LiteralEditor({ value, kinds, onChange, testid, disabled, isDark }) {
  const kind = json_type(value);
  if (!["string", "number", "boolean", "null"].includes(kind)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <Stored value={value} testid={`${testid}-stored`} isDark={isDark}>
          This value is not one piece of text, a number or true/false, so it is kept as stored.
        </Stored>
        <Button label="Replace with text" disabled={disabled} onClick={() => onChange("")} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
      </div>
    );
  }
  const offered = LITERAL_KINDS.filter((option) => kinds.includes(option.value) || option.value === kind);
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
          <Input value={value} disabled={disabled} placeholder="text" set_value={(next) => onChange(next)}
            style={{ width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 }} />
        </span>
      )}
      {kind === "number" && <NumberBox value={value} onChange={onChange} testid={testid} disabled={disabled} />}
      {kind === "boolean" && (
        <span data-testid={`${testid}-boolean`} style={{ flex: 1, minWidth: 0 }}>
          <Select options={[{ value: "true", label: "true" }, { value: "false", label: "false" }]} value={String(value)}
            filterable={false} disabled={disabled} set_value={(next) => onChange(next === "true")} style={SELECT_STYLE} />
        </span>
      )}
      {kind === "null" && <span style={{ ...CAPTION, ...MONO }}>null</span>}
    </div>
  );
}

/* ── operands ───────────────────────────────────────────────────────── */

function InputOperand({ operand, names, onChange, testid, disabled }) {
  const path = operand.path;
  const head = path.length > 0 ? path[0] : "";
  const options = names.map((name) => ({ value: name, label: name }));
  if (typeof head === "string" && head && !names.includes(head)) options.push({ value: head, label: `${head} (not an input of this node)` });
  if (head !== "" && typeof head !== "string") options.push({ value: String(head), label: `position ${head}` });
  const picker = (
    <span data-testid={`${testid}-input`} style={{ flex: 1, minWidth: 0 }}>
      {options.length === 0 ? (
        <span style={CAPTION}>This node has no inputs yet.</span>
      ) : (
        <Select options={options} value={typeof head === "string" ? head : String(head)} placeholder="choose an input"
          filterable={options.length > 8} disabled={disabled}
          set_value={(name) => onChange({ kind: "input", path: [name, ...path.slice(1)] })} style={SELECT_STYLE} />
      )}
    </span>
  );
  return (
    <PathEditor path={path} testid={`${testid}-path`} identity={testid} leading={picker} addLabel="+ Read inside it"
      onChange={(next) => !disabled && onChange({ kind: "input", path: next })} />
  );
}

function OperandEditor({ operand, names, expected, allowKinds, onChange, testid, disabled, isDark }) {
  if (!operand_is_readable(operand)) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
        <Stored value={operand} testid={`${testid}-stored`} isDark={isDark}>
          This side is not a shape the editor can take apart, so it is kept exactly as stored.
        </Stored>
        <Button label="Replace it" disabled={disabled || names.length === 0}
          onClick={() => onChange({ kind: "input", path: [names[0]] })} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
      </div>
    );
  }
  const kinds = expected && ["string", "number", "boolean"].includes(expected) ? [expected] : ["string", "number", "boolean"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      {allowKinds && (
        <span data-testid={`${testid}-kind`} style={{ width: 132 }}>
          <Select options={OPERAND_KINDS} value={operand.kind} filterable={false} disabled={disabled}
            set_value={(next) => {
              if (next === operand.kind) return;
              if (next === "input") onChange({ kind: "input", path: names.length ? [names[0]] : [] });
              else onChange({ kind: "literal", value: LITERAL_SEED[kinds[0]] });
            }} style={{ ...SELECT_STYLE, width: 132 }} />
        </span>
      )}
      {operand.kind === "input" ? (
        <InputOperand operand={operand} names={names} onChange={onChange} testid={testid} disabled={disabled} />
      ) : (
        <LiteralEditor value={operand.value} kinds={kinds} disabled={disabled} testid={`${testid}-literal`} isDark={isDark}
          onChange={(value) => onChange({ kind: "literal", value })} />
      )}
    </div>
  );
}

/* ── the condition tree ─────────────────────────────────────────────── */

function CompareRow({ condition, document, node, names, onChange, testid, disabled, isDark }) {
  const op = operator_info(condition.operator);
  const left_type = condition.left.kind === "input"
    ? input_value_type(document, node, condition.left.path)
    : json_type(condition.left.value);
  const offered = operators_for(left_type);
  if (!offered.some((entry) => entry.value === op.value)) offered.push(op);
  const problems = compare_problems(document, node, condition);

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
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 10px", borderRadius: 7,
      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
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
        <span style={CAPTION}>This input's type is not declared upstream, so every comparison is offered; the runtime checks the types when this branch runs.</span>
      )}
      {problems.map((problem, index) => (
        <span key={index} data-testid={`${testid}-problem-${index}`} style={problem_style(isDark)}>{problem.message}</span>
      ))}
    </div>
  );
}

function ConditionTree({ condition, path, document, node, names, onChange, onRemove, removeDisabled, identity, disabled, isDark }) {
  const testid = `condition-${path.length ? path.join("-") : "root"}`;
  const remove = onRemove && (
    <Button prefix_icon="close" ariaLabel={`Remove ${path.length ? "this part" : "the condition"}`} disabled={disabled || removeDisabled}
      onClick={onRemove} style={ICON_BUTTON} />
  );
  if (!condition_node_is_readable(condition)) {
    return (
      <div style={{ ...ROW, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stored value={condition} testid={`${testid}-stored`} isDark={isDark}>
            This part of the condition is not a shape the editor can take apart, so it is kept exactly as stored.
          </Stored>
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
  const children = condition.conditions;
  const rows = useListIdentities(identity, children.length);
  const add = (child) => {
    rows.added();
    onChange({ ...condition, conditions: [...children, child] });
  };
  const opposite = condition.kind === "all" ? "any" : "all";
  return (
    <div data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 10,
      borderLeft: `2px solid ${isDark ? "rgba(120,200,215,0.55)" : "rgba(29,135,152,0.45)"}` }}>
      <div style={ROW}>
        <span data-testid={`${testid}-joiner`} style={{ width: 168 }}>
          <Select options={JOINERS} value={condition.kind} filterable={false} disabled={disabled}
            set_value={(kind) => kind !== condition.kind && onChange({ ...condition, kind })} style={{ ...SELECT_STYLE, width: 168 }} />
        </span>
        <span style={{ flex: 1 }} />
        {remove}
      </div>
      {children.length === 0 && (
        <span data-testid={`${testid}-empty`} style={problem_style(isDark)}>This group is empty; the runtime refuses an empty group. Add a comparison or remove the group.</span>
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
      {children.length === 1 && <span style={CAPTION}>A group's last part cannot be removed on its own; remove the group instead.</span>}
      <div style={ROW}>
        <Button label="+ Comparison" disabled={disabled || names.length === 0} onClick={() => add(new_compare(document, node, names[0]))} style={SMALL_BUTTON} />
        <Button label={`+ ${opposite === "all" ? "All-of" : "Any-of"} group`} disabled={disabled || names.length === 0}
          onClick={() => add({ kind: opposite, conditions: [new_compare(document, node, names[0])] })} style={SMALL_BUTTON} />
      </div>
    </div>
  );
}

function IfEditor({ document, node, execution, names, write, identity, disabled, isDark }) {
  if (!has_own(execution, "condition")) {
    return (
      <div data-testid="branch-condition-missing" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={CAPTION}>No condition yet. This branch saves as a draft, and Run refuses it until it has one.</span>
        <Button label="+ Add a condition" disabled={disabled || names.length === 0}
          onClick={() => write("condition", new_compare(document, node, names[0]))} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
        {names.length === 0 && <span style={CAPTION}>A condition compares this node's inputs. Add an input above first.</span>}
      </div>
    );
  }
  const root = execution.condition;
  const readable_root = condition_node_is_readable(root);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={CAPTION}>When the condition holds, the flow leaves through True; otherwise through False. Groups are checked in order and stop as soon as the answer is known.</span>
      <ConditionTree condition={root} path={[]} document={document} node={node} names={names} identity={identity}
        disabled={disabled} isDark={isDark} onChange={(next) => write("condition", next)} />
      {readable_root && root.kind === "compare" && (
        <div style={ROW}>
          <Button label="+ And" disabled={disabled || names.length === 0}
            onClick={() => write("condition", grouped_with(root, "all", new_compare(document, node, names[0])))} style={SMALL_BUTTON} />
          <Button label="+ Or" disabled={disabled || names.length === 0}
            onClick={() => write("condition", grouped_with(root, "any", new_compare(document, node, names[0])))} style={SMALL_BUTTON} />
        </div>
      )}
      {!condition_is_readable(root) && readable_root && (
        <span style={CAPTION}>Parts shown as stored are kept unchanged when the rest is edited.</span>
      )}
      <div style={ROW}>
        {!readable_root && (
          <Button label="Replace with a new condition" disabled={disabled || names.length === 0}
            onClick={() => write("condition", new_compare(document, node, names[0]))} style={SMALL_BUTTON} />
        )}
        <Button label="Remove the condition" disabled={disabled} onClick={() => write("condition", undefined)} style={SMALL_BUTTON} />
      </div>
    </div>
  );
}

/* ── the switch ─────────────────────────────────────────────────────── */

function targets_text(document, node_id, port_id) {
  const edges = outlet_edges(document, node_id, port_id);
  if (edges.length === 0) return "Not connected yet. Drag from this outlet on the canvas.";
  return `→ ${edges.map((edge) => safe_text(edge.target_node_id)).join(", ")}`;
}

function SwitchEditor({ document, node, execution, names, write, onChange, disabled, isDark }) {
  const [confirming, setConfirming] = useState(null);
  const has_value = has_own(execution, "value");
  const value = execution.value;
  const value_type = has_value && operand_is_readable(value)
    ? (value.kind === "input" ? input_value_type(document, node, value.path) : json_type(value.value)) : null;
  const cases = execution.cases;
  const readable_cases = Array.isArray(cases);
  const problems = readable_cases ? case_problems(cases) : [];
  const unique_ids = readable_cases ? new Set() : null;
  const keys = readable_cases ? cases.map((entry, index) => {
    const id = is_record(entry) && typeof entry.id === "string" && entry.id ? entry.id : null;
    if (id && !unique_ids.has(id)) { unique_ids.add(id); return `id:${id}`; }
    return `at:${index}`;
  }) : [];
  const seed_kind = ["string", "number", "boolean"].includes(value_type) ? value_type : "string";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div data-testid="branch-switch-value" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Switch on</span>
        {!has_value ? (
          <>
            <span style={CAPTION}>No value yet. This branch saves as a draft, and Run refuses it until it has one.</span>
            {names.length > 0 ? (
              <span data-testid="branch-switch-value-pick" style={{ width: 200 }}>
                <Select options={names.map((name) => ({ value: name, label: name }))} value="" placeholder="choose an input"
                  filterable={false} disabled={disabled} set_value={(name) => write("value", { kind: "input", path: [name] })} style={SELECT_STYLE} />
              </span>
            ) : (
              <span style={CAPTION}>A switch reads one of this node's inputs. Add an input above first.</span>
            )}
          </>
        ) : (
          <OperandEditor operand={value} names={names} expected={null} allowKinds testid="branch-switch-value-operand"
            disabled={disabled} isDark={isDark} onChange={(next) => write("value", next)} />
        )}
      </div>

      <div data-testid="branch-switch-cases" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Cases</span>
        <span style={CAPTION}>The first case whose value is exactly equal is taken — text never equals a number, and true is not 1. A case keeps its outlet and its connection when its value changes or it moves.</span>
        {!has_own(execution, "cases") && (
          <>
            <span style={problem_style(isDark)}>This switch has no case list.</span>
            <Button label="Start an empty case list" disabled={disabled} onClick={() => write("cases", [])} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
          </>
        )}
        {has_own(execution, "cases") && !readable_cases && (
          <>
            <Stored value={cases} testid="branch-switch-cases-stored" isDark={isDark}>
              The case list is not a list the editor can read, so it is kept exactly as stored. Its connections are still drawn on the canvas.
            </Stored>
            <Button label="Replace with an empty case list" disabled={disabled} onClick={() => write("cases", [])} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
          </>
        )}
        {readable_cases && cases.map((entry, index) => {
          const testid = `branch-case-${index}`;
          const readable = is_record(entry) && typeof entry.id === "string" && entry.id;
          const wired = readable ? outlet_edges(document, node.id, entry.id) : [];
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
            <div key={keys[index]} data-testid={testid} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 10px", borderRadius: 7,
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}>
              <div style={{ ...ROW, alignItems: "flex-start" }}>
                {is_record(entry) && has_own(entry, "value") ? (
                  <LiteralEditor value={entry.value} kinds={["string", "number", "boolean", "null"]} testid={`${testid}-value`}
                    disabled={disabled} isDark={isDark}
                    onChange={(next) => write("cases", cases.map((old, at) => (at === index ? { ...old, value: next } : old)))} />
                ) : (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Stored value={entry} testid={`${testid}-stored`} isDark={isDark}>This case is kept as stored.</Stored>
                  </div>
                )}
                <Button prefix_icon="arrow_up" ariaLabel={`Move case ${index + 1} up`} disabled={disabled || index === 0}
                  onClick={() => write("cases", move_case(cases, index, index - 1))} style={ICON_BUTTON} />
                <Button prefix_icon="arrow_down" ariaLabel={`Move case ${index + 1} down`} disabled={disabled || index === cases.length - 1}
                  onClick={() => write("cases", move_case(cases, index, index + 1))} style={ICON_BUTTON} />
                <Button prefix_icon="close" ariaLabel={`Remove case ${index + 1}`} disabled={disabled}
                  onClick={() => (wired.length > 0 ? setConfirming(keys[index]) : remove_now())} style={ICON_BUTTON} />
              </div>
              {readable && <span data-testid={`${testid}-target`} style={CAPTION}>{targets_text(document, node.id, entry.id)}</span>}
              {readable && value_type && has_own(entry, "value") && json_type(entry.value) !== "null" &&
                json_type(entry.value) !== value_type && (
                <span style={CAPTION}>Never taken while the switch value is {value_type === "string" ? "text" : `a ${value_type}`}: exact matching never converts.</span>
              )}
              {(problems[index] || []).map((problem, at) => (
                <span key={at} data-testid={`${testid}-problem-${at}`} style={problem_style(isDark)}>{problem.message}</span>
              ))}
              {confirming === keys[index] && (
                <div data-testid={`${testid}-confirm`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={problem_style(isDark)}>
                    This case is connected {targets_text(document, node.id, entry.id)}. Removing it also removes that connection.
                  </span>
                  <div style={ROW}>
                    <Button label="Remove case and connection" disabled={disabled} onClick={remove_now} style={SMALL_BUTTON} />
                    <Button label="Keep it" onClick={() => setConfirming(null)} style={SMALL_BUTTON} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {readable_cases && (
          <Button label="+ Add a case" disabled={disabled}
            onClick={() => write("cases", [...cases, { id: free_case_id(cases), value: LITERAL_SEED[seed_kind] }])}
            style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
        )}
        <div data-testid="branch-case-default" style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 7,
          border: `1px dashed ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.12)"}` }}>
          <span style={{ fontSize: 11.5, fontWeight: 600 }}>Default</span>
          <span style={CAPTION}>Taken when no case matches. Every switch has it, so it cannot be removed.</span>
          <span data-testid="branch-case-default-target" style={CAPTION}>{targets_text(document, node.id, "default")}</span>
        </div>
      </div>
    </div>
  );
}

/* ── the section ────────────────────────────────────────────────────── */

export default function BranchSection({ document, node, isDark, onChange }) {
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
      <section data-testid="branch-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Stored value={node.config} testid="branch-section-stored" isDark={isDark}>
          This branch's settings are not a shape the editor can read, so they are kept exactly as stored.
        </Stored>
      </section>
    );
  }
  const allowed = ALLOWED_EXECUTION_KEYS[node.type];
  const extra = Object.keys(execution).filter((key) => !allowed.includes(key));
  return (
    <section data-testid="branch-section" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={SECTION_LABEL}>{node.type === "if_else" ? "Condition" : "Switch"}</span>
      {!editable && (
        <span style={problem_style(isDark)}>
          {!unique ? "Another node has the same id, so this branch cannot be edited until the ids differ." : "These settings belong to an Agent graph this editor cannot write; they are shown read-only."}
        </span>
      )}
      {node.type === "if_else" ? (
        <IfEditor document={document} node={node} execution={execution} names={names} write={write} identity={identity}
          disabled={!editable} isDark={isDark} />
      ) : (
        <SwitchEditor document={document} node={node} execution={execution} names={names} write={write}
          onChange={(next) => editable && onChange(next)} disabled={!editable} isDark={isDark} />
      )}
      {extra.map((key) => (
        <div key={key} data-testid={`branch-extra-${key}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <Stored value={execution[key]} testid={`branch-extra-${key}-stored`} isDark={isDark}>
            {`“${key}” is not a setting of this node. It is kept as stored, and the runtime refuses the branch while it is there.`}
          </Stored>
          <Button label={`Remove “${key}”`} disabled={!editable} onClick={() => write(key, undefined)} style={{ ...SMALL_BUTTON, alignSelf: "flex-start" }} />
        </div>
      ))}
    </section>
  );
}
