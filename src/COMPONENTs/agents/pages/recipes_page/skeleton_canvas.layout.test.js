import React, { useRef, useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { api } from "../../../../SERVICEs/api";
import capture from "../../../../../electron/tests/fixtures/managed_code_producer.json";
import SkeletonCanvas from "./skeleton_canvas";
import { new_agent_document } from "./skeleton_graph_edits";
import { apply_graph_command } from "./skeleton_graph_commands";
import { document_problems } from "./skeleton_document";

/* BC-NL-002: a drop on the canvas reaches the document as a `move_nodes`
   command only when the actual runtime stores layout (1.10 +
   document_layout_v1); otherwise positions stay on this machine, as before. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: { getManagedCodeCapabilities: jest.fn() } } }));

let lastProps = null;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    lastProps = props;
    return (
      <div>
        {(props.nodes || []).map((n) => <div key={n.id} data-testid={`node-${n.id}`} data-x={n.x} data-y={n.y} />)}
        <button type="button" onClick={() => props.on_nodes_change(
          (props.nodes || []).map((n) => (n.type === "agent" ? { ...n, x: 777.4, y: 42 } : n)))}>drag-agent</button>
      </div>
    );
  },
}));

const manifest = (minor, features) => ({ ...capture.capabilities, runtime_manifest: {
  ...capture.capabilities.runtime_manifest,
  protocols: [{ id: "skeleton_execution", major: 1, minor, features }],
} });
const WITH_LAYOUT = () => manifest(10, ["document_layout_v1", "node_display_label_v1"]);
const WITHOUT_LAYOUT = () => manifest(9, ["document_presentation_v1", "node_display_label_v1"]);

let commands, current, undoTo;
const seed = () => new_agent_document({ id: "layout", name: "Layout" }).document;
function Harness({ initial = seed() }) {
  const [graph, setGraph] = useState(initial);
  const ref = useRef(graph); ref.current = graph; current = graph;
  undoTo = setGraph;
  return <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <SkeletonCanvas resourceId="layout" commandScope="one" document={graph}
      onGraphCommand={(command) => {
        commands.push(command);
        const result = apply_graph_command(ref.current, command);
        if (result.ok) setGraph(result.document);
        return result;
      }} />
  </ConfigContext.Provider>;
}
const agentId = () => current.nodes.find((n) => n.type === "agent").id;
const settled = async () => { await waitFor(() => expect(api.unchain.getManagedCodeCapabilities).toHaveBeenCalled()); await act(async () => {}); };

beforeEach(() => { commands = []; lastProps = null; window.localStorage.clear(); });

test("with a layout runtime, a drop is one move_nodes command carrying every node, and the result saves", async () => {
  api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(WITH_LAYOUT());
  render(<Harness />); await settled();
  fireEvent.click(screen.getByText("drag-agent"));
  expect(commands).toHaveLength(1);
  expect(commands[0].type).toBe("move_nodes");
  expect(Object.keys(commands[0].positions).sort()).toEqual(current.nodes.map((n) => n.id).sort());
  expect(current.layout.nodes[agentId()]).toEqual({ x: 777, y: 42 });
  expect(document_problems(current)).toEqual([]);
  expect(screen.getByTestId(`node-${agentId()}`).getAttribute("data-x")).toBe("777");
});

test("the document's layout is what a fresh open draws, even with no record on this machine", async () => {
  api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(WITH_LAYOUT());
  const placed = seed();
  const id = placed.nodes.find((n) => n.type === "agent").id;
  placed.layout = { nodes: { [id]: { x: 1234, y: 567 } } };
  render(<Harness initial={placed} />); await settled();
  expect(screen.getByTestId(`node-${id}`).getAttribute("data-x")).toBe("1234");
  expect(screen.getByTestId(`node-${id}`).getAttribute("data-y")).toBe("567");
});

test("undoing a move puts the node back where it was drawn", async () => {
  api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(WITH_LAYOUT());
  const before = seed();
  render(<Harness initial={before} />); await settled();
  const id = agentId();
  const start = screen.getByTestId(`node-${id}`).getAttribute("data-x");
  fireEvent.click(screen.getByText("drag-agent"));
  expect(screen.getByTestId(`node-${id}`).getAttribute("data-x")).toBe("777");
  act(() => undoTo(before));
  expect(screen.getByTestId(`node-${id}`).getAttribute("data-x")).toBe(start);
});

test("without a layout runtime, a drop issues no command and the document keeps no layout", async () => {
  api.unchain.getManagedCodeCapabilities.mockReset().mockResolvedValue(WITHOUT_LAYOUT());
  render(<Harness />); await settled();
  fireEvent.click(screen.getByText("drag-agent"));
  expect(commands).toEqual([]);
  expect("layout" in current).toBe(false);
  expect(screen.getByTestId(`node-${agentId()}`).getAttribute("data-x")).toBe("777.4");
});

test("a failed capability check falls back to this machine", async () => {
  api.unchain.getManagedCodeCapabilities.mockReset().mockRejectedValue(Object.assign(new Error("down"), { code: "unavailable" }));
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  render(<Harness />); await settled();
  fireEvent.click(screen.getByText("drag-agent"));
  expect(commands).toEqual([]);
  warn.mockRestore();
});
