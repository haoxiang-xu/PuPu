import React, { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import BranchSection from "./branch_section";
import InputVariablesSection from "./input_variables_section";
import DetailPanel from "./detail_panel";
import NodeTag from "./node_tag";
import { PROBLEM_COUNT_PADDING, ProblemCount } from "./process_timeline";
import { errorColor, muted } from "./panel_style";

/* The Switch panel's rows and the generic nodes' inputs, rendered with the
   real Input, so the styles the owner sees are the styles asserted. */

jest.mock("../skeleton_resources", () => ({
  is_unavailable: () => false,
  list_resources: jest.fn(() => new Promise(() => {})),
  kernel_profiles: jest.fn(() => new Promise(() => {})),
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>;
const out = (name, root) => ({ name, source: { kind: "result", path: [root] } });
const ref = (node_id, name) => ({ kind: "ref", node_id, path: [name] });
const flow = (id, a, ap, b) => ({ id, kind: "flow", source_node_id: a, source_port_id: ap, target_node_id: b, target_port_id: "in" });

function graph(branch, edges = []) {
  return {
    schema_version: 1, kind: "agent", id: "doc", name: "doc",
    presentation: { icon: "bot", color: "#7c4dd8" },
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [out("message", "message")] } } },
      { id: "agent", type: "agent", config: {
        execution: { inputs: [], outputs: [out("reply", "message"), out("score", "score")] },
        kernel: { json_schema: { type: "object", properties: { score: { type: "number" } } } },
      } },
      branch,
      { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [flow("e1", "start", "out", "agent"), flow("e2", "agent", "out", branch.id), ...edges],
  };
}
const switchNode = (inputName, cases) => ({ id: "sw", type: "switch_case", config: { execution: {
  inputs: [{ name: inputName, value: ref("agent", inputName === "score" ? "score" : "reply"), missing: "error" }],
  value: { kind: "input", path: [inputName] }, cases,
} } });

let latest;
function Harness({ initial, nodeId }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return <BranchSection document={document} node={document.nodes.find((node) => node.id === nodeId)} isDark={false}
    onChange={(next) => setDocument(next)} />;
}
const show = (document, nodeId = "sw") => render(wrap(<Harness initial={document} nodeId={nodeId} />));
/* The Input's outer box is the input element's parent; it has no handle of
   its own, and its inline style is what is being asserted. */
// eslint-disable-next-line testing-library/no-node-access
const box = (input) => input.parentElement;

describe("a case row reads like a variable row", () => {
  test("value field without a box, an arrow, the target as a tag, and the way out", () => {
    show(graph(switchNode("reply", [{ id: "case-1", value: "a" }]), [flow("w1", "sw", "case-1", "end"), flow("w2", "sw", "default", "agent")]));
    const row = screen.getByTestId("branch-case-0");
    const field = within(screen.getByTestId("branch-case-0-value-text")).getByRole("textbox", { name: "Case 1 value" });
    expect(field).toHaveValue("a");
    /* variablePillField: no border, no fill, nothing on hover or focus. */
    const outer = box(field);
    expect(outer.style.borderWidth || outer.style.border).toMatch(/^0(px)?/);
    expect(outer.style.background).toBe("transparent");
    expect(outer.style.getPropertyValue("--pupu-overlay-hover")).toBe("transparent");
    expect(outer.style.getPropertyValue("--pupu-overlay-active")).toBe("transparent");
    expect(outer.style.height).toBe("24px");
    expect(outer.style.fontSize).toBe("12px");
    expect(row).toHaveTextContent(/^a?→End$/);
    const tag = screen.getByTestId("branch-case-0-target-tag-0");
    expect(tag).toHaveTextContent(/^End$/);
    /* A rounded rectangle filled with the step's own colour (End's red). */
    expect(tag.style.borderRadius).toBe("6px");
    expect(tag.style.background).toBe("rgb(210, 63, 55)");
    expect(tag.style.fontSize).toBe("11.5px");
    expect(within(row).getByRole("button", { name: "Remove case 1" })).toBeInTheDocument();
    /* One row height, as a variable row: the cells are 32px. */
    expect(within(row).getByTestId("branch-case-0-value-cell").style.minHeight).toBe("32px");
  });

  test("the number field is a text field with no highlight and no spinner, and holds a half-typed number", () => {
    show(graph(switchNode("score", [{ id: "case-1", value: 2 }])));
    const field = within(screen.getByTestId("branch-case-0-value-number")).getByRole("textbox", { name: "Case 1 value" });
    expect(field).toHaveAttribute("type", "text");
    expect(field).toHaveValue("2");
    const outer = box(field);
    expect(outer.style.background).toBe("transparent");
    expect(outer.style.backgroundColor).not.toMatch(/surface|255, 255, 255/);
    expect(outer.style.getPropertyValue("--pupu-overlay-hover")).toBe("transparent");
    expect(outer.style.borderRadius).not.toBe("10px");
    fireEvent.change(field, { target: { value: "3." } });
    expect(field).toHaveValue("3.");
    fireEvent.change(field, { target: { value: "-" } });
    expect(latest.nodes[2].config.execution.cases[0]).toStrictEqual({ id: "case-1", value: 3 });
  });

  test("Default is the same row: muted label, arrow, tag, no way out; an unwired one is red", () => {
    show(graph(switchNode("reply", [{ id: "case-1", value: "a" }]), [flow("w2", "sw", "default", "agent")]));
    const fallback = screen.getByTestId("branch-case-default");
    expect(within(fallback).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByTestId("branch-case-default-label").style.color).toBe(hexToRgb(muted(false)));
    /* An Agent node wears the fixed node identity, not the document's presentation. */
    expect(screen.queryByTestId("branch-case-default-target-tag-0-avatar")).toBeNull();
    expect(screen.getByTestId("branch-case-default-target-tag-0-icon")).toBeInTheDocument();
    expect(screen.getByTestId("branch-case-default-target-tag-0")).not.toHaveAttribute("data-node-fill", "#7c4dd8");
    const unwired = screen.getByTestId("branch-case-0-target");
    expect(unwired).toHaveTextContent(/^Not connected$/);
    expect(unwired.style.color).toBe(hexToRgb(errorColor(false)));
    expect(screen.getByTestId("process-problems-branch-cases")).toHaveTextContent("1");
  });

  test("a target step that was removed is plain muted words, not a tag", () => {
    show(graph(switchNode("reply", [{ id: "case-1", value: "a" }]), [flow("w1", "sw", "case-1", "gone")]));
    expect(screen.queryByTestId("branch-case-0-target-tag-0")).toBeNull();
    expect(screen.getByTestId("branch-case-0-target-removed-0")).toHaveTextContent("A step that was removed");
  });

  test("the Switch on picker is sized like the Kernel's selects", () => {
    show(graph(switchNode("reply", [])));
    const combo = within(screen.getByTestId("branch-switch-value-operand-input")).getByRole("combobox");
    expect(combo.style.fontSize).toBe("12px");
    expect(combo.style.padding).toBe("5px 8px");
  });
});

test("NodeTag takes a node or its parts", () => {
  render(wrap(<>
    <NodeTag node={{ id: "c", type: "code", config: {} }} isDark={false} testid="one" />
    <NodeTag icon="tool" color="#ea7547" name="Fetch" isDark={false} testid="two" />
  </>));
  expect(screen.getByTestId("one")).toHaveTextContent(/^Code$/);
  /* No icon tile: the whole tag wears Code's graphite. */
  expect(screen.getByTestId("one").style.background).toBe("rgb(91, 100, 117)");
  expect(screen.getByTestId("one-icon").style.background).toBe("");
  expect(screen.getByTestId("two")).toHaveTextContent(/^Fetch$/);
});

test("the problem count's digit is centred: 2px above it, none below", () => {
  render(wrap(<ProblemCount count={3} section="x" isDark={false} />));
  const badge = screen.getByTestId("process-problems-x");
  expect(PROBLEM_COUNT_PADDING).toBe("2px 5px 0");
  expect(badge.style.padding).toBe("2px 5px 0px");
  expect(badge.style.height).toBe("16px");
  expect(badge.style.boxSizing).toBe("border-box");
});

describe("a generic node's inputs are the shared variable rows", () => {
  const ifDocument = (inputs) => graph({ id: "if", type: "if_else", config: { execution: { inputs } } });

  test("pill rows in one region, with the node's own missing policy kept", () => {
    const binding = { name: "reply", value: ref("agent", "reply"), missing: "default", default: "none" };
    const document = ifDocument([binding]);
    const changes = jest.fn();
    render(wrap(<InputVariablesSection document={document} node={document.nodes[2]} isDark={false}
      onChange={changes} hideHeading addAtEnd look="pill" />));
    const row = screen.getByTestId("binding-row-0");
    expect(within(row).getByRole("textbox", { name: "name" })).toHaveValue("reply");
    expect(screen.getByTestId("binding-row-0-selected")).toHaveTextContent(/^agentreply$/);
    /* No old "more" menu with a source-kind picker; the policy keeps its control. */
    expect(within(row).queryByRole("button", { name: / · More$/ })).toBeNull();
    const policy = within(row).getByRole("button", { name: "reply · If missing" });
    fireEvent.click(policy);
    expect(policy).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByTestId("binding-row-0-settings")).getByText("If missing")).toBeInTheDocument();
    /* Renaming keeps the stored policy and default exactly. */
    fireEvent.change(within(row).getByRole("textbox", { name: "name" }), { target: { value: "r" } });
    const next = changes.mock.calls.at(-1)[0].nodes[2].config.execution.inputs[0];
    expect(next).toStrictEqual({ ...binding, name: "r" });
    /* A new row still starts as this node's default: stop the run. */
    fireEvent.click(screen.getByRole("button", { name: "+ Add input" }));
    expect(changes.mock.calls.at(-1)[0].nodes[2].config.execution.inputs[1].missing).toBe("error");
  });

  test("Agent / End semantics are untouched: a new row reads null, and no policy control", () => {
    const document = graph({ id: "if", type: "end", config: { execution: { inputs: [{ name: "x", value: ref("agent", "reply"), missing: "null" }], outputs: [] } } });
    const changes = jest.fn();
    render(wrap(<InputVariablesSection document={document} node={document.nodes[2]} isDark={false}
      onChange={changes} hideHeading addAtEnd breadcrumb />));
    expect(screen.queryByRole("button", { name: /If missing$/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Add input" }));
    expect(changes.mock.calls.at(-1)[0].nodes[2].config.execution.inputs[1].missing).toBe("null");
  });

  test("the panel heads a Switch's inputs with the same caption, count and problems as Start / End", () => {
    const document = graph(switchNode("reply", []));
    render(wrap(<DetailPanel recipe={null} selectedNodeId="sw" document={document} onDocumentChange={() => {}}
      onChange={() => {}} onChangeSilent={() => {}} />));
    const section = screen.getByTestId("process-section-switch_case-input");
    expect(within(screen.getByTestId("process-header-switch_case-input")).getByText("Input Variables")).toBeInTheDocument();
    expect(screen.getByTestId("process-aside-switch_case-input")).toHaveTextContent("1");
    expect(within(section).getByTestId("binding-row-0-selected")).toBeInTheDocument();
    /* A branch passes nothing on, so there is no Output caption. */
    expect(screen.queryByTestId("process-section-switch_case-output")).toBeNull();
  });
});

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
