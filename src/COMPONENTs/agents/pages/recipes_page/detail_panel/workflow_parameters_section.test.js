import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import StartEndPanel from "./start_end_panel";
import { api } from "../../../../../SERVICEs/api";
import capture from "../workflow_parameters_producer.json";
import { start_context_for_view } from "../start_context";

jest.mock("../../../../../SERVICEs/api", () => ({ api: { unchain: { getManagedCodeCapabilities: jest.fn() } } }));
jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });
jest.mock("./panel_select", () => function TestSelect({ options, value, set_value, disabled }) {
  return <select value={value} disabled={disabled} onChange={(event) => set_value(event.target.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>;
});

const doc = () => ({ schema_version: 1, kind: "workflow", id: "w", name: "W", input_schema: { type: "object", properties: { city: { type: "string" }, days: { type: "integer", default: 1 } }, required: ["city"], additionalProperties: false },
  nodes: [{ id: "start", type: "start", config: { execution: { outputs: ["city", "days"].map((name) => ({ name, source: { kind: "result", path: [name] } })) } } },
    { id: "end", type: "end", config: { execution: { inputs: [{ name: "city", value: { kind: "ref", node_id: "start", path: ["city"] }, missing: "error" }], outputs: [] } } }], edges: [] });
function show(initial, write = jest.fn()) {
  function Live() {
    const [document, setDocument] = React.useState(initial);
    return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}><StartEndPanel document={document} node={document.nodes[0]} isDark={false} onChange={(next) => { write(next); setDocument(next); }} /></ConfigContext.Provider>;
  }
  render(<Live />); return write;
}
beforeEach(() => {
  api.unchain.getManagedCodeCapabilities.mockResolvedValue(capture.capabilities);
});

test("Workflow Start displays editable Parameters instead of an unknown Caller input", async () => {
  const write = show(doc());
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  expect(screen.getByDisplayValue("city")).toBeInTheDocument();
  expect(screen.getByDisplayValue("days")).toBeInTheDocument();
  expect(screen.queryByText("Caller input")).not.toBeInTheDocument();
  expect(screen.queryByTestId("skeleton-output-variables")).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});

test("parameter rename preserves focus and updates the local Start export and references atomically", async () => {
  const write = show(doc()); await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  const name = screen.getByDisplayValue("city"); name.focus();
  fireEvent.change(name, { target: { value: "destination" } });
  expect(screen.getByDisplayValue("destination")).toBe(name); expect(name).toHaveFocus();
  const saved = write.mock.calls.at(-1)[0];
  expect(saved.input_schema.required).toEqual(["destination"]);
  expect(saved.nodes[0].config.execution.outputs[0]).toEqual({ name: "destination", source: { kind: "result", path: ["destination"] } });
  expect(saved.nodes[1].config.execution.inputs[0].value.path).toEqual(["destination"]);
});

test("type and default edits change the signature and keep other parameters intact", async () => {
  const initial = doc(); const write = show(initial);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  const row = screen.getByTestId("workflow-parameter-1");
  fireEvent.change(within(row).getByLabelText("Default value"), { target: { value: "3" } });
  const saved = write.mock.calls.at(-1)[0];
  expect(saved.input_schema.properties.days).toEqual({ type: "integer", default: 3 });
  expect(saved.input_schema.properties.city).toEqual(initial.input_schema.properties.city);
});

test("old/unknown capability prevents writes without deleting the saved signature", async () => {
  api.unchain.getManagedCodeCapabilities.mockResolvedValue(require("../../../../../SERVICEs/agent_resource_presentation_producer.json").capabilities);
  const write = show(doc());
  await screen.findByText("This runtime cannot edit Workflow parameters.");
  expect(screen.getByRole("button", { name: "Add parameter" })).toBeDisabled();
  expect(screen.getByDisplayValue("city")).toBeDisabled();
  expect(write).not.toHaveBeenCalled();
});

test("an embedded Hook Start keeps the fixed caller and output editor without adding a signature", () => {
  const document = doc(); delete document.input_schema;
  const before = JSON.stringify(document); const write = jest.fn();
  const startContext = start_context_for_view([{ member: "hooks" }], [], document);
  render(<ConfigContext.Provider value={{ theme: {} }}><StartEndPanel document={document} node={document.nodes[0]}
    startContext={startContext} isDark={false} onChange={write} /></ConfigContext.Provider>);
  expect(screen.queryByTestId("workflow-parameters")).toBeNull();
  expect(screen.getByTestId("start-caller-input-Caller input")).toHaveTextContent("Caller input");
  expect(screen.getByTestId("skeleton-output-variables")).toBeInTheDocument();
  expect(JSON.stringify(document)).toBe(before); expect(write).not.toHaveBeenCalled();
});

test.each([null, [], { toString: null }, "constructor", "__proto__", "toString"])("a stored malformed type %p opens without a write and can be replaced", async (type) => {
  const document = doc(); document.input_schema.properties.city.type = type;
  const before = JSON.stringify(document); const write = show(document);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  expect(write).not.toHaveBeenCalled(); expect(JSON.stringify(document)).toBe(before);
  const row = screen.getByTestId("workflow-parameter-0");
  expect(within(row).getByRole("status")).toHaveTextContent("input_schema.properties.city.type");
  fireEvent.change(within(row).getAllByRole("combobox")[0], { target: { value: "string" } });
  expect(write.mock.calls.at(-1)[0].input_schema.properties.city).toEqual({ type: "string" });
});

test.each(["constructor", "__proto__", "toString"])("an invalid stored type %s cannot create a non-JSON default", async (type) => {
  const document = doc(); document.input_schema.properties.city.type = type;
  const write = show(document);
  await waitFor(() => expect(screen.getByRole("button", { name: "Add parameter" })).toBeEnabled());
  const row = screen.getByTestId("workflow-parameter-0");
  fireEvent.change(within(row).getAllByRole("combobox")[1], { target: { value: "default" } });
  const next = write.mock.calls.at(-1)[0];
  expect(next.input_schema.properties.city.default).toBeNull();
  expect(JSON.parse(JSON.stringify(next))).toEqual(next);
  expect(next.input_schema.properties.city.type).toBe(type);
});
