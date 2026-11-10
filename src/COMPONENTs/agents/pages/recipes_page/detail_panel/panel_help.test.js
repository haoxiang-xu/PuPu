import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import PanelHelp from "./panel_help";
import MissingPolicySelect from "./missing_policy_select";
import OutputRow from "./output_row";
import InputVariablesSection from "./input_variables_section";

const show = (children, dark = false) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: dark ? "dark_mode" : "light_mode" }}>
    {children}
  </ConfigContext.Provider>,
);

// jsdom has no bubble dimensions; native preview verifies the positioned hint.
test.each([false, true])("guidance waits for keyboard focus in theme dark=%s", async (dark) => {
  show(<PanelHelp label="Model">Choose a model before running.</PanelHelp>, dark);
  expect(screen.queryByText("Choose a model before running.")).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button", { name: "Model · About" }));
  expect(await screen.findByText("Choose a model before running.")).toBeInTheDocument();
  fireEvent.blur(screen.getByRole("button", { name: "Model · About" }));
  await waitFor(() => expect(screen.queryByText("Choose a model before running.")).not.toBeInTheDocument());
});

test("mouse users can ask for guidance without a persistent paragraph", async () => {
  show(<PanelHelp label="Result">Only declared fields are accepted.</PanelHelp>);
  fireEvent.click(screen.getByRole("button", { name: "Result · About" }));
  expect(await screen.findByText("Only declared fields are accepted.")).toBeInTheDocument();
});

test("a binding shows the selected policy, without a repeated explanation or a write", async () => {
  const write = jest.fn();
  show(<MissingPolicySelect binding={{ name: "images", value: { kind: "ref", node_id: "start", path: ["images"] }, missing: "null" }} onChange={write} />);
  expect(screen.getByText("Use null if missing")).toBeVisible();
  expect(screen.queryByTestId("missing-policy-description")).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button", { name: "If missing · About" }));
  expect(await screen.findByTestId("missing-policy-description")).toHaveTextContent("never an empty string");
  expect(write).not.toHaveBeenCalled();
});

test("a stored JSON default remains directly visible while general guidance is tucked away", () => {
  show(<MissingPolicySelect binding={{ missing: "default", default: { count: 3 } }} onChange={jest.fn()} />);
  expect(screen.getByTestId("stored-json-default")).toHaveTextContent('{"count":3}');
  expect(screen.queryByTestId("missing-policy-description")).not.toBeInTheDocument();
});

test("output rows use a short source label and keep actual errors visible", () => {
  const write = jest.fn();
  show(<OutputRow mapping={{ name: "answer", source: { kind: "result", path: ["message"] } }} index={0}
    nodeType="agent" kinds={["input", "result"]} inputNames={["question"]}
    resultRoots={{ known: true, closed: true, roots: ["message", "context"] }}
    problems={[{ message: "An actual output error" }]} onChange={write} onRemove={jest.fn()} />);
  expect(screen.getByText("Result.message")).toBeVisible();
  expect(screen.queryByText("Read from the node's own result once it has run.")).not.toBeInTheDocument();
  expect(screen.getByText("An actual output error")).toBeVisible();
  expect(write).not.toHaveBeenCalled();
});

test("Start keeps caller fields visible and puts its explanation behind help", async () => {
  const write = jest.fn();
  const node = { id: "start", type: "start", config: { execution: { outputs: [] } } };
  show(<InputVariablesSection document={{ nodes: [node], edges: [] }} node={node} onChange={write}
    startContext={{ kind: "subagent", fields: [{ name: "message", type: "text" }], message: "Receives the delegated message." }} />);
  expect(screen.getByText("message")).toBeVisible();
  expect(screen.queryByText("Receives the delegated message.")).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole("button", { name: "Input Variables · About" }));
  expect(await screen.findByText("Receives the delegated message.")).toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});

test("an invalid caller stays visible without opening help", () => {
  const node = { id: "start", type: "start", config: {} };
  show(<InputVariablesSection document={{ nodes: [node], edges: [] }} node={node}
    startContext={{ kind: "invalid", fields: [], message: "Caller fields contain duplicate names." }} />);
  expect(screen.getByText("Caller fields contain duplicate names.")).toBeVisible();
});
