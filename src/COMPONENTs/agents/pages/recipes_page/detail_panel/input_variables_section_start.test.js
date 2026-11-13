import React from "react";

/* This suite checks the guidance's contract and document writes. The real
   disclosure interaction and compact surface are tested in panel_help.test.js. */
jest.mock("./panel_help", () => function GuidanceText({ children }) { return <>{children}</>; });
import { render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import InputVariablesSection, { binding_sources } from "./input_variables_section";

const start = { id: "start", type: "start", config: { execution: { outputs: [
  { name: "question", source: { kind: "result", path: ["question"] } },
] } } };
const doc = { nodes: [start], edges: [] };
const show = (context, onChange = jest.fn()) => render(
  <ConfigContext.Provider value={{ theme: {} }}>
    <InputVariablesSection document={doc} node={start} startContext={context} isDark={false} onChange={onChange} />
  </ConfigContext.Provider>,
);

test("Start displays a locked whole caller object when this library view has no caller", () => {
  const write = jest.fn();
  show(undefined, write);
  const section = screen.getByTestId("skeleton-input-variables");
  expect(section).toHaveTextContent("Caller input");
  expect(section).toHaveTextContent("object");
  expect(within(section).getByLabelText("Read-only caller input")).toBeInTheDocument();
  expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
  expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
});

test("identified caller fields are read-only and never written as execution inputs", () => {
  const write = jest.fn();
  show({ kind: "subagent", fields: [{ name: "question", type: "text" }], message: "When called from this Subagent Pool." }, write);
  const section = screen.getByTestId("skeleton-input-variables");
  expect(section).toHaveTextContent("question");
  expect(section).toHaveTextContent("text");
  expect(within(section).queryByText("Caller input")).not.toBeInTheDocument();
  expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  expect(within(section).queryByRole("textbox")).not.toBeInTheDocument();
  expect(write).not.toHaveBeenCalled();
  expect(start.config.execution).not.toHaveProperty("inputs");
});

test("an invalid caller definition shows its problem without inventing a field", () => {
  show({ kind: "invalid", fields: [], message: "Caller fields are not determined: duplicate names." });
  expect(screen.getByTestId("skeleton-start-context-problem")).toHaveTextContent("duplicate names");
  expect(screen.queryByText("Caller input")).not.toBeInTheDocument();
});

test("upstream captions use safe common labels while ref identity stays the node id", () => {
  const end = { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } };
  const document = { nodes: [{ ...start, label: "User question", config: { ...start.config, name: "not-a-label" } }, end], edges: [{ kind: "flow", source_node_id: "start", target_node_id: "end" }] };
  expect(binding_sources(document, "end")).toEqual([{ node_id: "start", node_label: "User question", name: "question", conditional: false }]);
  document.nodes[0].label = { toString: null };
  expect(binding_sources(document, "end")[0].node_label).toBe("start");
});
