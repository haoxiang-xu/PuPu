import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import capture from "./code_capture.json";

/* A Code node on the native canvas (#357): a plain header node — its name
   and the language it runs — with one inlet and one outlet. The code is read
   and written in the panel, never drawn on the card. The editor is a probe
   that keeps its props and draws each node. */

let editor = null;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return <div data-testid="editor">{(props.nodes || []).map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>;
  },
}));

const complete = capture.rows.find((row) => row.case === "complete").config.code;
const SOURCE = "def main(input, context):\n    return {\"rows\": 0}\n";
const doc = (code) => ({
  schema_version: 1, kind: "agent", id: "c", name: "c",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
    { id: "score", type: "code", config: { execution: { inputs: [], outputs: [] }, ...(code === undefined ? {} : { code }) } },
    { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
  ],
  edges: [],
});
const show = (code, extra = {}) => render(
  <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SkeletonCanvas resourceId="c" document={doc(code)} onSelectNode={jest.fn()} isDark={false} onGraphCommand={() => ({ ok: true })} {...extra} />
  </ConfigContext.Provider>,
);
const node = () => screen.getByTestId("code-node-score");

beforeEach(() => {
  localStorage.clear();
});

test("its ports are one inlet and one outlet, level with the header", () => {
  show(complete);
  expect(editor.nodes.find((entry) => entry.id === "score").ports).toStrictEqual([
    { id: "in", side: "left", kind: "in", anchor: 31.5 },
    { id: "out", side: "right", kind: "out", anchor: 31.5 },
  ]);
});

test("the card is the header only: name and language, never the code or its file", () => {
  show(complete);
  expect(node()).toHaveTextContent("score");
  expect(node()).toHaveTextContent("Python");
  expect(node()).not.toHaveTextContent("tools/score.py");
  expect(screen.queryByTestId("code-node-score-block")).toBeNull();
  expect(screen.queryByTestId("code-node-score-source")).toBeNull();
});

test("a node with code written here does not show it either", () => {
  show(complete, { managedSources: { x: SOURCE } });
  expect(node()).not.toHaveTextContent("def main");
  expect(node()).toHaveTextContent("Python");
  expect(screen.queryByRole("button", { name: /View the code/ })).toBeNull();
});

test("a new node and a stored id that is not text are drawn without throwing", () => {
  show(undefined);
  expect(node()).toHaveTextContent("Python");
  const original = console.error;
  console.error = () => {};
  try {
    show({ ...complete, environment_profile_id: { toString: null }, source: { kind: "file", path: { toString: null } } });
  } finally {
    console.error = original;
  }
  expect(screen.getAllByTestId("code-node-score").at(-1)).toHaveTextContent("Python");
});
