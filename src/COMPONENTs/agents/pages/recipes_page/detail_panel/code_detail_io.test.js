import React, { useState } from "react";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";
import { parse_typed_path } from "./output_value_pill";
import { python_profiles } from "../skeleton_resources";

jest.mock("./panel_help", () => function GuidanceText({ children }) { return <>{children}</>; });

/* A Code node's Input and Output Variables wear the same rows as an
   Agent's, Start's and End's — the pill with its NodeRefTag — and the output
   rows keep what the older row could do: reach any depth inside the result,
   and name a field the list does not offer. */

jest.mock("../skeleton_resources", () => ({
  is_unavailable: () => false,
  python_profiles: jest.fn(),
  list_resources: jest.fn(),
  kernel_profiles: jest.fn(),
}));

beforeEach(() => {
  python_profiles.mockResolvedValue({ ok: true, data: { profiles: [] } });
});

const SCHEMA = { type: "object", properties: { items: { type: "array" }, summary: { type: "string" } } };
const documentWith = (outputs) => ({
  schema_version: 1, kind: "workflow", id: "w", name: "W",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
    { id: "score", type: "code", config: {
      execution: { inputs: [{ name: "diff", value: { kind: "ref", node_id: "start", path: ["message"] }, missing: "error" }], outputs },
      code: { environment_profile_id: "builtin", result_schema: SCHEMA },
    } },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});

let latest;
function Live({ initial }) {
  const [document, setDocument] = useState(initial);
  latest = document;
  return (
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <DetailPanel document={document} selectedNodeId="score" onDocumentChange={(next) => setDocument(next)} />
    </ConfigContext.Provider>
  );
}
const outputs = () => latest.nodes[1].config.execution.outputs;
const valueBox = (row) => within(row).getByRole("textbox", { name: /^(?!name$).+/ });
const typePath = (row, text) => {
  fireEvent.change(valueBox(row), { target: { value: text } });
  fireEvent.keyDown(valueBox(row), { key: "Enter" });
};

describe("a typed output path", () => {
  const kinds = ["input", "result"];
  test.each([
    ["result.items[0].name", { kind: "result", path: ["items", 0, "name"] }],
    ["Result.items", { kind: "result", path: ["items"] }],
    ["results", { kind: "result", path: [] }],
    ["inputs.diff", { kind: "input", path: ["diff"] }],
    ["summary", { kind: "result", path: ["summary"] }],
    ['result["a.b"][2]', { kind: "result", path: ["a.b", 2] }],
    ["result[0]", { kind: "result", path: [0] }],
  ])("%s reads %j", (text, expected) => {
    expect(parse_typed_path(text, kinds, "result", { result: "Result", input: "Inputs" })).toEqual(expected);
  });

  test.each(["", "result..a", "result.a[", "result[x]", "result.[0]"])("%j is not a path, and nothing is written", (text) => {
    expect(parse_typed_path(text, kinds, "result")).toBeNull();
  });

  test("without a side the row keeps the side it already reads", () => {
    expect(parse_typed_path("diff", kinds, "input")).toEqual({ kind: "input", path: ["diff"] });
  });
});

describe("a Code node's variables", () => {
  test("the inputs are the shared pill rows with the step's NodeRefTag", () => {
    render(<Live initial={documentWith([])} />);
    const row = screen.getByTestId("binding-row-0");
    expect(within(row).getByTestId("binding-row-0-tag")).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: / · More$/ })).toBeNull();
    /* The header names the language, not a runtime to choose. */
    expect(screen.getByTestId("recipe-detail-panel-header")).toHaveTextContent("Python");
    expect(screen.getByTestId("recipe-detail-panel-header")).not.toHaveTextContent(/choose a runtime|builtin/);
  });

  test("an output reading deep inside the result is shown whole and kept through a rename", () => {
    render(<Live initial={documentWith([{ name: "first", source: { kind: "result", path: ["items", 0, "name"] } }])} />);
    const row = screen.getByTestId("output-row-0");
    /* The pill row, not the older one with its settings drawer. */
    expect(within(row).queryByRole("button", { name: / · More$/ })).toBeNull();
    expect(within(row).getByTestId("output-row-0-selected")).toHaveTextContent("Result");
    expect(within(row).getByTestId("output-row-0-selected")).toHaveTextContent("items[0].name");
    fireEvent.change(within(row).getByRole("textbox", { name: "name" }), { target: { value: "head" } });
    expect(outputs()).toEqual([{ name: "head", source: { kind: "result", path: ["items", 0, "name"] } }]);
  });

  test("a path is typed, at any depth, and a field the list does not offer can be named", () => {
    render(<Live initial={documentWith([{ name: "out", source: { kind: "result", path: ["summary"] } }])} />);
    typePath(screen.getByTestId("output-row-0"), "result.items[2].title");
    expect(outputs()[0].source).toEqual({ kind: "result", path: ["items", 2, "title"] });
    typePath(screen.getByTestId("output-row-0"), "result.unlisted");
    expect(outputs()[0].source).toEqual({ kind: "result", path: ["unlisted"] });
    typePath(screen.getByTestId("output-row-0"), "inputs.diff");
    expect(outputs()[0].source).toEqual({ kind: "input", path: ["diff"] });
  });

  test("a typed text that is not a path writes nothing", () => {
    render(<Live initial={documentWith([{ name: "out", source: { kind: "result", path: ["summary"] } }])} />);
    typePath(screen.getByTestId("output-row-0"), "result..broken");
    expect(outputs()[0].source).toEqual({ kind: "result", path: ["summary"] });
  });
});
