import React from "react";
import { render, screen } from "@testing-library/react";
import BindingRow from "./binding_row";
import { binding_sources } from "./input_variables_section";

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => function MockSelect({ options, value, set_value }) {
  return (
    <select data-testid="select" value={value || ""} onChange={(event) => set_value(event.target.value)}>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value} data-icon={option.icon || ""}>{option.label}</option>
      ))}
    </select>
  );
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => function MockInput({ value, set_value, placeholder }) {
  return <input placeholder={placeholder} value={value} onChange={(event) => set_value(event.target.value)} />;
});
jest.mock("../../../../../BUILTIN_COMPONENTs/input/button", () => function MockButton({ label, ariaLabel, onClick, disabled }) {
  return <button type="button" aria-label={ariaLabel} disabled={disabled} onClick={onClick}>{label || ariaLabel}</button>;
});

/* Downstream of a branch a value may exist on one path and not another, which
   reachability alone cannot rule out (#351 "Values from a branch are
   conditionally available"). A source is marked when some path from Start to
   the reading node avoids it. */

const out = (name) => ({ name, source: { kind: "result", path: ["message"] } });
const node = (id, type, outputs = []) => ({ id, type, config: { execution: type === "start" ? { outputs } : { inputs: [], outputs } } });
const flow = (id, s, sp, t) => ({ id, kind: "flow", source_node_id: s, source_port_id: sp, target_node_id: t, target_port_id: "in" });
const graph = () => ({
  schema_version: 1, kind: "agent", id: "g", name: "g",
  nodes: [
    node("start", "start", [out("message")]),
    node("router", "agent", [out("reply")]),
    { id: "if", type: "if_else", config: { execution: { inputs: [] } } },
    node("yes", "agent", [out("answer")]),
    node("no", "agent", [out("answer")]),
    node("after", "agent", [out("final")]),
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [
    flow("a", "start", "out", "router"), flow("b", "router", "out", "if"),
    flow("c", "if", "true", "yes"), flow("d", "if", "false", "no"),
    flow("e", "yes", "out", "after"), flow("f", "no", "out", "after"), flow("g", "after", "out", "end"),
  ],
});

test("values produced on one side of a branch are conditional at the rejoin; values before it are not", () => {
  const sources = binding_sources(graph(), "after");
  const by = (id) => sources.filter((source) => source.node_id === id).map((source) => source.conditional);
  expect(by("start")).toEqual([false]);
  expect(by("router")).toEqual([false]);
  expect(by("yes")).toEqual([true]);
  expect(by("no")).toEqual([true]);
  expect(sources.some((source) => source.node_id === "if")).toBe(false); // a branch exports nothing
});

test("inside one side of the branch, that side's own values are not conditional", () => {
  const document = graph();
  document.nodes.push(node("deeper", "agent", []));
  document.edges = document.edges.map((edge) => (edge.id === "e" ? flow("e", "yes", "out", "deeper") : edge));
  document.edges.push(flow("h", "deeper", "out", "after"));
  const sources = binding_sources(document, "deeper");
  expect(sources.find((source) => source.node_id === "yes").conditional).toBe(false);
});

test("a straight chain marks nothing, and a graph without one Start claims nothing", () => {
  const document = graph();
  expect(binding_sources(document, "router").every((source) => !source.conditional)).toBe(true);
  const twoStarts = { ...document, nodes: [...document.nodes, node("start-2", "start", [])] };
  expect(binding_sources(twoStarts, "after").every((source) => source.conditional === false)).toBe(true);
});

test("the picker shows the hollow marker and says why, without changing the stored reference", () => {
  const sources = binding_sources(graph(), "after");
  const binding = { name: "answer", value: { kind: "ref", node_id: "yes", path: ["answer"] }, missing: "error" };
  render(<BindingRow binding={binding} index={0} sources={sources} problems={[]} isDark={false} onChange={() => {}} onRemove={() => {}} />);
  const option = screen.getByRole("option", { name: /yes · answer/ });
  expect(option).toHaveTextContent("yes · answer — only if its branch ran");
  expect(option.getAttribute("data-icon")).toBe("circle");
  expect(screen.getByRole("option", { name: "router · reply" }).getAttribute("data-icon")).toBe("");
});
