import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import WorkflowTestInputs from "./workflow_test_inputs";

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });

const schema = (properties, required = []) => ({
  type: "object", properties, required, additionalProperties: false,
});
const workflow = (input_schema) => ({
  schema_version: 1, kind: "workflow", id: "input-form", name: "Input form",
  ...(input_schema === undefined ? {} : { input_schema }),
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [] } } },
    { id: "end", type: "end", config: { execution: { outputs: [] } } },
  ], edges: [],
});
const renderForm = (props = {}) => {
  const onChange = jest.fn();
  const onValidityChange = jest.fn();
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <WorkflowTestInputs document={workflow(schema({ city: { type: "string" }, days: { type: "integer", default: 3 } }, ["city"]))}
      value={{}} onChange={onChange} onValidityChange={onValidityChange} isDark={false} {...props} />
  </ConfigContext.Provider>);
  return { onChange, onValidityChange };
};
const anyModeButton = (key, mode = "json") => within(screen.getByTestId(`workflow-test-input-${key}-mode`))
  .getByRole("button", { name: mode === "json" ? /json_mode|json/i : /text_mode|text/i });

test("required and defaulted parameters are shown without injecting defaults into the supplied value", () => {
  const { onChange } = renderForm();
  expect(screen.getByTestId("workflow-test-input-city")).toBeInTheDocument();
  expect(screen.getByText(/Required/)).toBeInTheDocument();
  expect(screen.getByText(/defaults to 3/)).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("typed values retain false, zero, empty string, and explicit null", () => {
  const doc = workflow(schema({ flag: { type: "boolean" }, count: { type: "number" }, note: { type: "string" }, maybe: { type: "null" } }, ["flag", "count", "note", "maybe"]));
  const onChange = jest.fn();
  const graphBefore = JSON.stringify(doc);
  function Live() {
    const [value, setValue] = React.useState({});
    return <WorkflowTestInputs document={doc} value={value} onChange={(next) => { onChange(next); setValue(next); }} isDark={false} />;
  }
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}><Live /></ConfigContext.Provider>);
  fireEvent.change(screen.getByLabelText("flag"), { target: { value: "false" } });
  expect(onChange).toHaveBeenLastCalledWith({ flag: false });
  fireEvent.change(screen.getByLabelText("count"), { target: { value: "0" } });
  expect(onChange).toHaveBeenLastCalledWith({ flag: false, count: 0 });
  fireEvent.change(screen.getByLabelText("note"), { target: { value: "draft" } });
  expect(onChange).toHaveBeenLastCalledWith({ flag: false, count: 0, note: "draft" });
  fireEvent.change(screen.getByLabelText("note"), { target: { value: "" } });
  expect(onChange).toHaveBeenLastCalledWith({ flag: false, count: 0, note: "" });
  fireEvent.change(screen.getByLabelText("maybe"), { target: { value: "null" } });
  expect(onChange).toHaveBeenLastCalledWith({ flag: false, count: 0, note: "", maybe: null });
  expect(JSON.stringify(doc)).toBe(graphBefore);
});

test("number edits do not coerce blank or invalid intermediate text and expose validity problems", () => {
  const { onChange, onValidityChange } = renderForm({
    document: workflow(schema({ count: { type: "number" } }, ["count"])), value: { count: 4 },
  });
  fireEvent.change(screen.getByLabelText("count"), { target: { value: "" } });
  expect(onChange).not.toHaveBeenCalled();
  expect(onValidityChange).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ path: "count" }),
  ]));
});

test("object and array JSON editors accept only matching JSON values", () => {
  const { onChange, onValidityChange } = renderForm({
    document: workflow(schema({ config: { type: "object" }, items: { type: "array" } }, ["config", "items"])), value: {},
  });
  fireEvent.change(screen.getByLabelText("config"), { target: { value: "{\"x\":1}" } });
  expect(onChange).toHaveBeenLastCalledWith({ config: { x: 1 } });
  fireEvent.change(screen.getByLabelText("items"), { target: { value: "[1,2]" } });
  expect(onChange).toHaveBeenLastCalledWith({ items: [1, 2] });
  fireEvent.change(screen.getByLabelText("config"), { target: { value: "{" } });
  expect(onValidityChange).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ path: "config" }),
  ]));
});

test("string inputs preserve exact bytes and unset only the selected supplied argument", () => {
  const original = { city: "old", days: 2 };
  const { onChange } = renderForm({ value: original });
  fireEvent.change(screen.getByLabelText("city"), { target: { value: "  Montréal\n" } });
  expect(onChange).toHaveBeenLastCalledWith({ city: "  Montréal\n", days: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Remove city" }));
  expect(onChange).toHaveBeenLastCalledWith({ days: 2 });
  fireEvent.click(screen.getByRole("button", { name: "Remove days" }));
  expect(onChange).toHaveBeenLastCalledWith({ city: "old" });
  expect(original).toEqual({ city: "old", days: 2 });
});

test("disabled mode prevents edits and invalid stored signatures are visible and locked", () => {
  const { onChange } = renderForm({ disabled: true });
  expect(screen.getByLabelText("city")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("city"), { target: { value: "Paris" } });
  expect(onChange).not.toHaveBeenCalled();
  const malformed = workflow({ type: "array" });
  const invalidChange = jest.fn();
  const view = render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <WorkflowTestInputs document={malformed} value={{ city: "stored" }} onChange={invalidChange} isDark={false} />
  </ConfigContext.Provider>);
  expect(screen.getByRole("alert")).toHaveTextContent(/input_schema/);
  expect(invalidChange).not.toHaveBeenCalled();
  view.unmount();
});

test("legacy named reads remain editable and whole-object reads expose a JSON object editor", () => {
  const legacy = workflow(undefined);
  legacy.nodes[0].config.execution.outputs = [
    { name: "cityAlias", source: { kind: "result", path: ["city"] } },
    { name: "all", source: { kind: "result", path: [] } },
  ];
  const onChange = jest.fn();
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <WorkflowTestInputs document={legacy} value={{}} onChange={onChange} isDark={false} />
  </ConfigContext.Provider>);
  expect(screen.getByLabelText("city")).toBeInTheDocument();
  expect(screen.getByTestId("workflow-test-input-whole-control")).toBeInTheDocument();
  fireEvent.change(screen.getByTestId("workflow-test-input-whole-control"), { target: { value: "{\"city\":\"Ottawa\"}" } });
  expect(onChange).toHaveBeenLastCalledWith({ city: "Ottawa" });
  expect(legacy.input_schema).toBeUndefined();
});

test("server field refusals are shown beside their matching parameter", () => {
  const { onChange } = renderForm({
    errors: [{ path: ["arguments", "city"], message: "Rejected by workflow", code: "invalid_value" }],
  });
  expect(within(screen.getByTestId("workflow-test-input-city")).getByText("Rejected by workflow")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});

test("Any defaults to exact Text mode and can author arbitrary JSON types through the mode control", () => {
  const properties = { text: {}, object: {}, array: {}, boolean: {}, number: {}, nothing: {} };
  const doc = workflow(schema(properties, Object.keys(properties)));
  const onChange = jest.fn();
  function Live() {
    const [value, setValue] = React.useState({});
    return <WorkflowTestInputs document={doc} value={value} onChange={(next) => { onChange(next); setValue(next); }} isDark={false} />;
  }
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}><Live /></ConfigContext.Provider>);

  fireEvent.change(screen.getByLabelText("text"), { target: { value: "  exact text\n" } });
  expect(onChange).toHaveBeenLastCalledWith({ text: "  exact text\n" });
  const jsonCases = [["object", "{\"toString\":null}"], ["array", "[1,2]"], ["boolean", "false"], ["number", "0"], ["nothing", "null"]];
  const expected = { text: "  exact text\n" };
  jsonCases.forEach(([key, raw]) => {
    fireEvent.click(anyModeButton(key));
    const input = screen.getByLabelText(key);
    act(() => input.focus());
    fireEvent.change(input, { target: { value: raw } });
    expected[key] = JSON.parse(raw);
    expect(onChange).toHaveBeenLastCalledWith(expected);
    expect(anyModeButton(key)).toHaveAttribute("aria-pressed", "true");
    expect(input).toHaveFocus();
  });
});

test("Any JSON mode keeps the last valid value when malformed JSON is being edited", () => {
  const doc = workflow(schema({ payload: {} }, ["payload"]));
  const onChange = jest.fn();
  const onValidityChange = jest.fn();
  function Live() {
    const [value, setValue] = React.useState({ payload: { kept: true } });
    return <WorkflowTestInputs document={doc} value={value} onChange={(next) => { onChange(next); setValue(next); }}
      onValidityChange={onValidityChange} isDark={false} />;
  }
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}><Live /></ConfigContext.Provider>);
  const input = screen.getByLabelText("payload");
  expect(anyModeButton("payload")).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(input, { target: { value: "{\"new\":2}" } });
  expect(onChange).toHaveBeenLastCalledWith({ payload: { new: 2 } });
  fireEvent.change(input, { target: { value: "{" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onValidityChange).toHaveBeenLastCalledWith(expect.arrayContaining([
    expect.objectContaining({ path: "payload" }),
  ]));
  expect(input).toHaveValue("{");
});

test("Any chooses JSON for an existing non-string value without coercing hostile object properties", () => {
  const hostile = { toString: null, other: [false, 0] };
  renderForm({
    document: workflow(schema({ payload: {} }, ["payload"])), value: { payload: hostile },
  });
  expect(anyModeButton("payload")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("payload")).toHaveValue(JSON.stringify(hostile, null, 2));
});
