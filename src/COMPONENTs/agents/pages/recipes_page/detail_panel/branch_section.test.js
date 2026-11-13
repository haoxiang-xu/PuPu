import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import BranchSection from "./branch_section";

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function MockSelect({ options, value, set_value, disabled, placeholder }) {
  return (
    <select data-testid="select" value={value === undefined || value === null ? "" : value} disabled={disabled}
      onChange={(event) => set_value(event.target.value)}>
      <option value="">{placeholder || ""}</option>
      {(options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => function MockInput({ value, set_value, placeholder, disabled, input_ref }) {
  /* input_ref is passed through like the real Input does, so focus can be asserted. */
  return <input ref={input_ref} placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});

const out = (name, root) => ({ name, source: { kind: "result", path: [root] } });
const ref = (node_id, name) => ({ kind: "ref", node_id, path: [name] });
const binding = (name, value) => ({ name, value, missing: "error" });
const input = (path) => ({ kind: "input", path });
const literal = (value) => ({ kind: "literal", value });
const compare = (operator, left, right) => ({ kind: "compare", operator, left, ...(right === undefined ? {} : { right }) });

function graph(branch, extraEdges = []) {
  return {
    schema_version: 1, kind: "agent", id: "doc", name: "doc",
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
      { id: "agent", type: "agent", config: {
        execution: { inputs: [], outputs: [out("reply", "message"), out("score", "score")] },
        kernel: { json_schema: { type: "object", properties: { score: { type: "number" } } } },
      } },
      branch,
      { id: "yes", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [
      { id: "e1", kind: "flow", source_node_id: "start", source_port_id: "out", target_node_id: "agent", target_port_id: "in" },
      { id: "e2", kind: "flow", source_node_id: "agent", source_port_id: "out", target_node_id: branch.id, target_port_id: "in" },
      ...extraEdges,
    ],
  };
}
const ifNode = (execution) => ({ id: "if", type: "if_else", config: { execution } });
const switchNode = (execution) => ({ id: "sw", type: "switch_case", config: { execution } });
const withInputs = (...names) => names.map((name) => binding(name, ref("agent", name === "score" ? "score" : "reply")));

let latest;
let writes;
function Harness({ initial, nodeId }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return <BranchSection document={document} node={document.nodes.find((node) => node.id === nodeId)} isDark={false}
    onChange={(next) => { writes.push(next); setDocument(next); }} />;
}
const show = (document, nodeId) => render(<Harness initial={document} nodeId={nodeId} />);
const execution = (id = "if") => latest.nodes.find((node) => node.id === id).config.execution;
const pick = (testid, value) => fireEvent.change(within(screen.getByTestId(testid)).getAllByTestId("select")[0], { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole("button", { name }));
beforeEach(() => { writes = []; latest = null; });

describe("If / Else", () => {
  test("an unfinished If explains itself and only adds a condition once it has an input to read", () => {
    show(graph(ifNode({ inputs: [] })), "if");
    expect(screen.getByTestId("branch-condition-missing")).toHaveTextContent("No condition yet");
    expect(screen.getByRole("button", { name: "+ Add a condition" })).toBeDisabled();
    expect(writes).toHaveLength(0);
  });

  test("adding a condition writes a typed comparison of the first input; nothing is a string expression", () => {
    show(graph(ifNode({ inputs: withInputs("reply") })), "if");
    click("+ Add a condition");
    expect(execution().condition).toStrictEqual(compare("eq", input(["reply"]), literal("")));
    fireEvent.change(within(screen.getByTestId("condition-root-right-literal-text")).getByPlaceholderText("text"), { target: { value: "yes" } });
    pick("condition-root-operator", "contains");
    expect(execution().condition).toStrictEqual(compare("contains", input(["reply"]), literal("yes")));
    expect(execution().inputs).toBe(writes[0].nodes[2].config.execution.inputs);
  });

  test("the operator menu is filtered by the input's proved type", () => {
    show(graph(ifNode({ inputs: withInputs("reply", "score"), condition: compare("gt", input(["score"]), literal(3)) })), "if");
    const options = within(screen.getByTestId("condition-root-operator")).getAllByRole("option").map((option) => option.value).filter(Boolean);
    expect(options).toEqual(["eq", "ne", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]);
    pick("condition-root-left-input", "reply");
    const text = within(screen.getByTestId("condition-root-operator")).getAllByRole("option").map((option) => option.value).filter(Boolean);
    expect(text).toEqual(["eq", "ne", "contains", "is_null", "is_not_null", "gt"]); // the stored operator stays visible
    expect(screen.getByTestId("condition-root-problem-0")).toHaveTextContent("Greater/less comparisons need numbers");
  });

  test("a null operator has no right side, and leaving it brings back a typed literal", () => {
    show(graph(ifNode({ inputs: withInputs("score"), condition: compare("eq", input(["score"]), literal(1)) })), "if");
    pick("condition-root-operator", "is_null");
    expect(execution().condition).toStrictEqual(compare("is_null", input(["score"])));
    pick("condition-root-operator", "lt");
    expect(execution().condition).toStrictEqual(compare("lt", input(["score"]), literal(0)));
  });

  test("And / Or are explicit groups that nest, and a group never empties itself", () => {
    show(graph(ifNode({ inputs: withInputs("reply"), condition: compare("eq", input(["reply"]), literal("a")) })), "if");
    click("+ Or");
    expect(execution().condition.kind).toBe("any");
    expect(execution().condition.conditions).toHaveLength(2);
    click("+ All-of group");
    const nested = execution().condition.conditions[2];
    expect(nested).toStrictEqual({ kind: "all", conditions: [compare("eq", input(["reply"]), literal(""))] });
    pick("condition-root-joiner", "all");
    expect(execution().condition.kind).toBe("all");
    // The nested group can be removed as a whole; its only child cannot be removed on its own.
    expect(within(screen.getByTestId("condition-2")).getAllByRole("button", { name: "Remove this part" }).map((button) => button.disabled))
      .toEqual([false, true]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove this part" })[0]);
    expect(execution().condition.conditions).toHaveLength(2);
    expect(execution().condition.conditions[1]).toStrictEqual(nested);
  });

  test("a part the editor cannot read is shown as stored and survives edits to its siblings untouched", () => {
    const weird = { kind: "compare", operator: "matches", left: input(["reply"]), right: literal("x") };
    const document = graph(ifNode({ inputs: withInputs("reply"), condition: { kind: "any", conditions: [compare("eq", input(["reply"]), literal("a")), weird] } }));
    show(document, "if");
    expect(screen.getByTestId("condition-1-stored")).toHaveTextContent('"operator":"matches"');
    fireEvent.change(within(screen.getByTestId("condition-0-right-literal-text")).getByPlaceholderText("text"), { target: { value: "b" } });
    expect(execution().condition.conditions[1]).toBe(weird);
    expect(execution().condition.conditions[0].right.value).toBe("b");
  });

  test("an unreadable condition is never rewritten unless the author replaces it", () => {
    const stored = { kind: "nand", conditions: [] };
    show(graph(ifNode({ inputs: withInputs("reply"), condition: stored })), "if");
    expect(screen.getByTestId("condition-root-stored")).toBeInTheDocument();
    expect(writes).toHaveLength(0);
    click("Replace with a new condition");
    expect(execution().condition).toStrictEqual(compare("eq", input(["reply"]), literal("")));
  });

  test("problems name the runtime's later refusal; removing the condition returns the draft to unfinished", () => {
    show(graph(ifNode({ inputs: withInputs("score"), condition: compare("eq", input(["score"]), literal("2")) })), "if");
    expect(screen.getByTestId("condition-root-problem-0")).toHaveTextContent("It saves, but the runtime refuses it");
    click("Remove the condition");
    expect(Object.keys(execution())).toEqual(["inputs"]);
  });

  test("a key the runtime does not know is kept, explained and removed only on request", () => {
    show(graph(ifNode({ inputs: [], outputs: [] })), "if");
    expect(screen.getByTestId("branch-extra-outputs")).toHaveTextContent("is not a setting of this step");
    expect(writes).toHaveLength(0);
    click("Remove “outputs”");
    expect(execution()).toStrictEqual({ inputs: [] });
  });

  test("two nodes with one id are shown read-only, never written", () => {
    const document = graph(ifNode({ inputs: withInputs("reply") }));
    document.nodes.push({ ...document.nodes[2] });
    show(document, "if");
    expect(screen.getByRole("button", { name: "+ Add a condition" })).toBeDisabled();
    expect(screen.getByTestId("branch-section")).toHaveTextContent("Two steps in this graph can't be told apart");
  });
});

describe("Switch / Case", () => {
  const edges = [
    { id: "w1", kind: "flow", source_node_id: "sw", source_port_id: "case-1", target_node_id: "yes", target_port_id: "in" },
    { id: "w2", kind: "flow", source_node_id: "sw", source_port_id: "default", target_node_id: "end", target_port_id: "in" },
  ];
  const flagInput = () => [binding("flag", ref("agent", "flag"))];
  const rows = () => within(screen.getByTestId("branch-case-list")).getAllByTestId(/^branch-case-(\d+|default)$/);

  test("an unfinished switch picks its value from an input", () => {
    show(graph(switchNode({ inputs: withInputs("reply"), cases: [] })), "sw");
    expect(screen.getByTestId("branch-switch-value")).toHaveTextContent("Choose the input to switch on.");
    expect(screen.getByTestId("process-problems-branch-switch-on")).toHaveTextContent("1");
    pick("branch-switch-value-pick", "reply");
    expect(execution("sw")).toStrictEqual({ inputs: execution("sw").inputs, cases: [], value: input(["reply"]) });
    expect(screen.queryByTestId("process-problems-branch-switch-on")).toBeNull();
  });

  test("there is no input-or-fixed-value choice; a stored fixed value is shown and kept until an input is picked", () => {
    const stored = switchNode({ inputs: withInputs("reply"), value: literal("hi"), cases: [{ id: "case-1", value: "hi" }] });
    show(graph(stored, edges), "sw");
    expect(screen.queryByText("A fixed value")).toBeNull();
    expect(screen.getByTestId("branch-switch-value-literal")).toHaveTextContent('Fixed: "hi"');
    expect(writes).toHaveLength(0);
    fireEvent.change(within(screen.getByTestId("branch-case-0-value-text")).getByPlaceholderText("text"), { target: { value: "ho" } });
    expect(execution("sw").value).toBe(stored.config.execution.value);
    pick("branch-switch-value-replace", "reply");
    expect(execution("sw").value).toStrictEqual(input(["reply"]));
  });

  test("each case is one flat row and Default is the fixed last row, with nowhere to remove it", () => {
    show(graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]),
      cases: [{ id: "case-1", value: "a" }, { id: "case-2", value: "b" }] }), edges), "sw");
    expect(rows().map((row) => row.getAttribute("data-testid"))).toEqual(["branch-case-0", "branch-case-1", "branch-case-default"]);
    expect(screen.getByTestId("process-aside-branch-cases")).toHaveTextContent("2");
    expect(screen.queryByRole("button", { name: /Move case/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /expand|collapse/i })).toBeNull();
    const fallback = screen.getByTestId("branch-case-default");
    expect(fallback).toHaveTextContent("Default");
    /* What the Default is for is said once, in the Cases help, not on the row. */
    expect(fallback).not.toHaveTextContent("When nothing matches");
    expect(within(fallback).queryAllByRole("button")).toHaveLength(0);
    expect(within(fallback).queryAllByRole("textbox")).toHaveLength(0);
    expect(fallback).toHaveTextContent(/^Default→End$/);
    expect(screen.getByTestId("branch-case-default-target")).toHaveTextContent(/^End$/);
    expect(within(screen.getByTestId("branch-case-default-target")).getByTestId("branch-case-default-target-tag-0")).toBeInTheDocument();
  });

  test("Goes to names the step as the canvas does, never its stored id; an unconnected case is a problem", () => {
    show(graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]),
      cases: [{ id: "case-1", value: "a" }, { id: "case-2", value: "b" }] }), [edges[0]]), "sw");
    expect(screen.getByTestId("branch-case-0-target").textContent).toBe("Agent");
    expect(screen.getByTestId("branch-case-0-target-tag-0")).toHaveTextContent(/^Agent$/);
    expect(screen.getByTestId("branch-case-1-target")).toHaveTextContent(/^Not connected$/);
    expect(screen.getByTestId("branch-case-default-target")).toHaveTextContent(/^Not connected$/);
    expect(screen.getByTestId("process-problems-branch-cases")).toHaveTextContent("2");
    const panel = screen.getByTestId("branch-section").textContent;
    for (const word of ["yes", "case-1", "case-2", "outlet", "runtime", "null", "kept as stored"]) expect(panel).not.toContain(word);
  });

  test("the value field follows the switch-on input's type: true/false is a switch", () => {
    const document = graph(switchNode({ inputs: flagInput(), value: input(["flag"]), cases: [{ id: "case-1", value: true }] }));
    document.nodes[1].config.execution.outputs.push(out("flag", "flag"));
    document.nodes[1].config.kernel.json_schema.properties.flag = { type: "boolean" };
    show(document, "sw");
    const toggle = screen.getByRole("switch", { name: "Case 1 value" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(screen.queryAllByTestId("select").length).toBe(1); // only the Switch-on input; no per-row type
    fireEvent.click(toggle);
    expect(execution("sw").cases).toStrictEqual([{ id: "case-1", value: false }]);
    click("Add a case");
    expect(execution("sw").cases[1]).toStrictEqual({ id: "case-2", value: true });
    expect(screen.getByRole("button", { name: "Add a case" })).toBeDisabled();
  });

  test("adding never repeats a value: numbers take the next unused integer, ids stay stable", () => {
    show(graph(switchNode({ inputs: withInputs("score"), value: input(["score"]), cases: [] })), "sw");
    click("Add a case");
    click("Add a case");
    expect(execution("sw").cases).toStrictEqual([{ id: "case-1", value: 0 }, { id: "case-2", value: 1 }]);
    fireEvent.change(within(screen.getByTestId("branch-case-1-value-number")).getByPlaceholderText("a number"), { target: { value: "0" } });
    expect(screen.getByTestId("branch-case-1-problem-0")).toHaveTextContent("Another case already matches this value");
    click("Add a case");
    expect(execution("sw").cases[2]).toStrictEqual({ id: "case-3", value: 1 });
  });

  test("adding text starts empty, then a unique placeholder", () => {
    show(graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]), cases: [] })), "sw");
    click("Add a case");
    click("Add a case");
    click("Add a case");
    expect(execution("sw").cases.map((entry) => entry.value)).toEqual(["", "case 2", "case 3"]);
    expect(case_values_unique(execution("sw").cases)).toBe(true);
  });

  test("the placeholder text is fixed English, whatever the interface language", () => {
    /* It is stored and matched at run time, so it never comes from i18n. */
    const source = require("fs").readFileSync(require("path").join(__dirname, "branch_section.js"), "utf8");
    expect(source).not.toMatch(/case_seed/);
    expect(source).toMatch(/`case \$\{n\}`/);
  });

  test("after Add, the focus lands in the new case's value field", () => {
    show(graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]), cases: [{ id: "case-1", value: "a" }] })), "sw");
    click("Add a case");
    const added = within(screen.getByTestId("branch-case-1-value-text")).getByPlaceholderText(/./);
    expect(added).toHaveFocus();
  });

  test("after Add on a number switch, the new number box takes the focus", () => {
    show(graph(switchNode({ inputs: withInputs("score"), value: input(["score"]), cases: [] })), "sw");
    click("Add a case");
    expect(within(screen.getByTestId("branch-case-0-value-number")).getByPlaceholderText("a number")).toHaveFocus();
  });

  test("a half-typed number stays on screen and is not written until it is a number", () => {
    show(graph(switchNode({ inputs: withInputs("score"), value: input(["score"]), cases: [{ id: "case-1", value: 1 }] })), "sw");
    const box = within(screen.getByTestId("branch-case-0-value-number")).getByPlaceholderText("a number");
    fireEvent.change(box, { target: { value: "1." } });
    expect(box).toHaveValue("1.");
    fireEvent.change(box, { target: { value: "-" } });
    expect(box).toHaveValue("-");
    expect(screen.getByTestId("branch-case-0-value-number")).toHaveTextContent("Not a number yet");
    expect(execution("sw").cases[0]).toStrictEqual({ id: "case-1", value: 1 });
    fireEvent.change(box, { target: { value: "1.5" } });
    expect(execution("sw").cases[0]).toStrictEqual({ id: "case-1", value: 1.5 });
  });

  test("removing a connected case asks first, then removes the case and exactly its connection", () => {
    const document = graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]),
      cases: [{ id: "case-1", value: "a" }, { id: "case-2", value: "b" }] }), edges);
    show(document, "sw");
    click("Remove case 1");
    expect(writes).toHaveLength(0);
    expect(screen.getByTestId("branch-case-0-confirm")).toHaveTextContent("This case goes to Agent. Removing it also removes that connection.");
    click("Keep it");
    expect(screen.queryByTestId("branch-case-0-confirm")).toBeNull();
    click("Remove case 1");
    click("Remove case and connection");
    expect(execution("sw").cases).toStrictEqual([{ id: "case-2", value: "b" }]);
    expect(latest.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "w2"]);
    click("Remove case 1"); // case-2, not connected: no question
    expect(execution("sw").cases).toStrictEqual([]);
  });

  test("stored cases of other types are shown and saved back unchanged while a sibling is edited", () => {
    const cases = [{ id: "case-1", value: 2 }, { id: "case-2", value: null }, { id: "case-3", value: true }, { id: "case-4", value: "a" }];
    show(graph(switchNode({ inputs: withInputs("reply"), value: input(["reply"]), cases }), edges), "sw");
    expect(within(screen.getByTestId("branch-case-0-value-number")).getByPlaceholderText("a number")).toHaveValue("2");
    expect(screen.getByTestId("branch-case-1-stored")).toHaveTextContent("Empty (no value)");
    expect(screen.getByRole("switch", { name: "Case 3 value" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Never taken/)).toBeNull();
    fireEvent.change(within(screen.getByTestId("branch-case-3-value-text")).getByPlaceholderText("text"), { target: { value: "b" } });
    const after = execution("sw").cases;
    expect(after.slice(0, 3)).toStrictEqual(cases.slice(0, 3));
    after.slice(0, 3).forEach((entry, index) => expect(entry).toBe(cases[index]));
    expect(after[3]).toStrictEqual({ id: "case-4", value: "b" });
  });

  test("an unreadable case list is kept as stored and its edges are not touched", () => {
    show(graph(switchNode({ inputs: [], value: input(["reply"]), cases: "a,b" }), edges), "sw");
    expect(screen.getByTestId("branch-switch-cases-stored")).toHaveTextContent('"a,b"');
    expect(screen.queryByRole("button", { name: "Add a case" })).toBeNull();
    expect(writes).toHaveLength(0);
    click("Replace with an empty case list");
    expect(execution("sw").cases).toStrictEqual([]);
    expect(latest.edges.map((edge) => edge.id)).toEqual(["e1", "e2", "w1", "w2"]);
  });
});

function case_values_unique(cases) {
  return new Set(cases.map((entry) => JSON.stringify(entry.value))).size === cases.length;
}

test("the section renders nothing for other node types", () => {
  const document = graph(ifNode({ inputs: [] }));
  const { container } = render(<BranchSection document={document} node={document.nodes[1]} isDark={false} onChange={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});
