import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import DetailPanel from "./detail_panel";

const cfg = { theme: {}, onThemeMode: "light_mode" };
const flow = (id, a, b, port = "out") => ({
  id, kind: "flow", source_node_id: a, source_port_id: port, target_node_id: b, target_port_id: "in",
});

const base = () => ({
  id: "doc",
  nodes: [
    { id: "start", type: "start", config: { execution: { outputs: [
      { name: "text", source: { kind: "result", path: ["message"] } },
    ] } } },
    { id: "router", type: "agent", config: { execution: { inputs: [], outputs: [{ name: "reply", source: { kind: "result", path: ["message"] } }] } } },
    { id: "if", type: "if_else", config: { execution: { inputs: [], condition: null } } },
    { id: "agent", type: "agent", config: { execution: { inputs: [], outputs: [{ name: "message", source: { kind: "result", path: ["message"] } }] } } },
    { id: "end", type: "end", config: { execution: {
      inputs: [{ name: "reply", value: { kind: "ref", node_id: "router", path: ["reply"] }, missing: "null" }],
      outputs: [{ name: "answer", source: { kind: "input", path: ["reply"] } }],
    } } },
  ],
  edges: [
    flow("e1", "start", "router"), flow("e2", "router", "if"),
    flow("e3", "if", "agent", "true"), flow("e4", "if", "end", "false"), flow("e5", "agent", "end"),
  ],
});

function Live({ initial, selected, onWrite }) {
  const [doc, setDoc] = React.useState(initial);
  return (
    <ConfigContext.Provider value={cfg}>
      <DetailPanel document={doc} selectedNodeId={selected} onChange={() => {}} onChangeSilent={() => {}}
        onDocumentChange={(next) => { onWrite(next); setDoc(next); }} />
    </ConfigContext.Provider>
  );
}

const nodeOf = (doc, id) => doc.nodes.find((node) => node.id === id);

describe("Start and End in the Agent panel's language", () => {
  test("a Start shows its caller input as locked rows and its outputs as pills, with counts", () => {
    const onWrite = jest.fn();
    render(<Live initial={base()} selected="start" onWrite={onWrite} />);
    expect(screen.getByTestId("start-detail")).toBeInTheDocument();
    expect(screen.getByTestId("process-header-start-input")).toHaveTextContent("Input Variables");
    expect(screen.getByTestId("start-caller-input-Caller input")).toHaveTextContent(/Caller input\s*object/);
    expect(within(screen.getByTestId("skeleton-input-variables")).queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("process-aside-start-output")).toHaveTextContent("1");
    expect(screen.getByTestId("output-row-0-selected")).toHaveTextContent(/Caller input\s*message/);
    expect(screen.queryByRole("button", { name: / · More$/ })).toBeNull();
    expect(onWrite).not.toHaveBeenCalled();
  });

  test("a Start's output reads a field typed by name, since the caller's shape is not declared", () => {
    const onWrite = jest.fn();
    render(<Live initial={base()} selected="start" onWrite={onWrite} />);
    const field = within(screen.getByTestId("output-row-0-source")).getByRole("textbox");
    fireEvent.focus(field);
    expect(field.value).toBe("message");
    fireEvent.change(field, { target: { value: "images" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    const written = onWrite.mock.calls.at(-1)[0];
    expect(nodeOf(written, "start").config.execution.outputs).toStrictEqual([
      { name: "text", source: { kind: "result", path: ["images"] } },
    ]);
  });

  test("leaving a Start's typed field unchanged writes nothing", () => {
    const onWrite = jest.fn();
    render(<Live initial={base()} selected="start" onWrite={onWrite} />);
    const field = within(screen.getByTestId("output-row-0-source")).getByRole("textbox");
    fireEvent.focus(field);
    fireEvent.blur(field);
    expect(onWrite).not.toHaveBeenCalled();
  });

  test("an End draws inputs and outputs as pills, adding at the end of each list", () => {
    const onWrite = jest.fn();
    render(<Live initial={base()} selected="end" onWrite={onWrite} />);
    expect(screen.getByTestId("end-detail")).toBeInTheDocument();
    expect(screen.getByTestId("binding-row-0-selected")).toHaveTextContent(/reply/);
    expect(screen.getByTestId("output-row-0-source")).toHaveTextContent(/reply/);
    expect(screen.getByRole("button", { name: "+ Add input", exact: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add output", exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: / · More$/ })).toBeNull();
  });

  test("after a branch, an End's input can become the first of several sources", () => {
    const onWrite = jest.fn();
    render(<Live initial={base()} selected="end" onWrite={onWrite} />);
    fireEvent.click(within(screen.getByTestId("binding-row-0")).getByRole("textbox", { name: /^(?!name$).+/ }));
    fireEvent.click(screen.getByText("First of several", { exact: true }));
    const written = onWrite.mock.calls.at(-1)[0];
    /* The source that may not have run comes first; what it read is the fallback. */
    expect(nodeOf(written, "end").config.execution.inputs[0]).toStrictEqual({
      name: "reply",
      value: { kind: "first_present", values: [
        { kind: "ref", node_id: "agent", path: ["message"] },
        { kind: "ref", node_id: "router", path: ["reply"] },
      ] },
      missing: "null",
    });
  });

  test("without a branch upstream no first-of-several choice is offered", () => {
    const doc = base();
    doc.nodes = doc.nodes.filter((node) => node.id !== "if" && node.id !== "agent");
    doc.edges = [flow("e1", "start", "router"), flow("e2", "router", "end")];
    render(<Live initial={doc} selected="end" onWrite={() => {}} />);
    fireEvent.click(within(screen.getByTestId("binding-row-0")).getByRole("textbox", { name: /^(?!name$).+/ }));
    expect(screen.queryByText("First of several", { exact: true })).toBeNull();
  });
});
