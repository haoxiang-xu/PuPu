import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartEndPanel from "./start_end_panel";
import OutputVariablesSection from "./output_variables_section";
import { binding_sources } from "./input_variables_section";

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });

const output = (name, kind, path) => ({ name, source: { kind, path } });
const input = (name, node_id, path) => ({ name, value: { kind: "ref", node_id, path }, missing: "null" });
const node = (id, type, inputs, outputs) => ({ id, type, config: { execution: { inputs, outputs } } });
function graph() {
  return { schema_version: 1, id: "d", name: "D", kind: "agent", nodes: [
    node("agent", "agent", [], [output("context", "result", ["context"]), output("message", "result", ["message"])]),
    node("end", "end", [input("context", "agent", ["context"]), input("message", "agent", ["message"])],
      [output("context", "input", ["context"]), output("message", "input", ["message"])]),
  ], edges: [{ id: "flow", kind: "flow", source_node_id: "agent", source_port_id: "out", target_node_id: "end", target_port_id: "in" }] };
}
function show(document, extra = {}) {
  const onChange = jest.fn();
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <StartEndPanel document={document} node={document.nodes[1]} isDark={false} onChange={onChange} {...extra} />
  </ConfigContext.Provider>);
  return onChange;
}

test("End hides system context inputs and outputs, and counts only visible rows, without writing", () => {
  const document = graph(); const before = JSON.stringify(document);
  const write = show(document);
  expect(screen.queryByDisplayValue("context")).not.toBeInTheDocument();
  expect(screen.getAllByDisplayValue("message")).toHaveLength(2);
  expect(screen.getAllByText("1", { exact: true })).toHaveLength(2);
  expect(write).not.toHaveBeenCalled();
  expect(JSON.stringify(document)).toBe(before);
});

test("editing a visible End row preserves hidden bindings, mappings and upstream nodes", () => {
  const document = graph(); const write = show(document);
  fireEvent.change(within(screen.getByTestId("skeleton-output-variables")).getByDisplayValue("message"), { target: { value: "reply" } });
  const saved = write.mock.calls.at(-1)[0];
  expect(saved.nodes[0]).toEqual(document.nodes[0]);
  expect(saved.nodes[1].config.execution.inputs).toEqual(document.nodes[1].config.execution.inputs);
  expect(saved.nodes[1].config.execution.outputs).toEqual([
    document.nodes[1].config.execution.outputs[0], output("reply", "input", ["message"]),
  ]);
});

test("End's output source menu does not offer the internal context binding", () => {
  show(graph());
  fireEvent.click(screen.getByRole("button", { name: "Inputs · message" }));
  expect(screen.queryByText("context", { exact: true })).not.toBeInTheDocument();
});

test("new binding menus omit system metadata, but retain business outputs with the same name", () => {
  const document = graph();
  expect(binding_sources(document, "end").map((source) => source.name)).toEqual(["message"]);
  document.nodes[0].config.execution.outputs[0].source.path = ["message"];
  expect(binding_sources(document, "end").map((source) => source.name)).toEqual(["context", "message"]);
});

test("business data called context remains editable in End", () => {
  const document = graph(); document.nodes[0].type = "code";
  show(document);
  expect(screen.getAllByDisplayValue("context")).toHaveLength(2);
});

test("an aliased, nested metadata passthrough is hidden across multiple hops", () => {
  const document = graph();
  document.nodes[0].config.execution.outputs[0].name = "run_info";
  const relay = node("relay", "agent", [input("received", "agent", ["run_info", "usage"])], [output("renamed", "input", ["received"])]);
  document.nodes.push(relay);
  document.nodes[1].config.execution.inputs[0] = input("context", "relay", ["renamed"]);
  show(document);
  expect(screen.queryByDisplayValue("context")).not.toBeInTheDocument();
});

test("diagnosed metadata remains visible for repair", () => {
  show(graph(), { rowDiagnostics: { inputs: { 0: [{ message: "Repair input" }] }, outputs: { 0: [{ message: "Repair output" }] } } });
  expect(screen.getAllByDisplayValue("context")).toHaveLength(2);
  expect(screen.getByText("Repair input")).toBeVisible();
  expect(screen.getByText("Repair output")).toBeVisible();
});

test.each(["missing", "cycle", "duplicate", "malformed", "fallback"])("uncertain %s references stay visible", (shape) => {
  const document = graph();
  const binding = document.nodes[1].config.execution.inputs[0];
  if (shape === "missing") binding.value.node_id = "missing";
  if (shape === "cycle") binding.value.node_id = "end";
  if (shape === "duplicate") document.nodes[0].config.execution.outputs.push(output("context", "result", ["message"]));
  if (shape === "malformed") binding.missing = "unknown";
  if (shape === "fallback") binding.value = { kind: "first_present", values: [binding.value, { kind: "literal", value: "fallback" }] };
  show(document);
  expect(screen.getAllByDisplayValue("context")).toHaveLength(2);
});

test("whole-result exports can pass a nested context field without exposing metadata controls", () => {
  const document = graph();
  document.nodes[0].config.execution.outputs[0] = output("all", "result", []);
  document.nodes[1].config.execution.inputs[0].value.path = ["all", "context", "model"];
  show(document);
  expect(screen.queryByDisplayValue("context")).not.toBeInTheDocument();
});

test("adding and removing End's visible rows leave the hidden metadata in the document", () => {
  const document = graph(); const write = show(document);
  fireEvent.click(within(screen.getByTestId("skeleton-input-variables")).getByRole("button", { name: "Remove message" }));
  expect(write.mock.calls.at(-1)[0].nodes[1].config.execution.inputs).toEqual([document.nodes[1].config.execution.inputs[0]]);
  fireEvent.click(within(screen.getByTestId("skeleton-output-variables")).getByRole("button", { name: "+ Add output" }));
  expect(write.mock.calls.at(-1)[0].nodes[1].config.execution.outputs.slice(0, 2)).toEqual(document.nodes[1].config.execution.outputs);
});

test("Agent output aliases copied from metadata inputs are hidden too", () => {
  const document = graph();
  const relay = node("relay", "agent", [input("run_info", "agent", ["context"])], [output("internal", "input", ["run_info"])]);
  document.nodes.push(relay);
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <OutputVariablesSection document={document} node={relay} isDark={false} onChange={jest.fn()} breadcrumb />
  </ConfigContext.Provider>);
  expect(screen.queryByDisplayValue("internal")).not.toBeInTheDocument();
});
