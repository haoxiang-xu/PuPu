import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";
import completed from "./__fixtures__/run_observation/test_real_route_observes_compl0--producer-observation-completed.json";
import { run_status_caption } from "./nodes/run_node_status";

let editor;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({ FlowEditor: (props) => {
  editor = props;
  return <div>{props.nodes.map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>;
} }));
const show = (props) => render(<ConfigContext.Provider value={{ theme: {} }}><SkeletonCanvas
  resourceId="run-layout" commandScope="run" isDark={false} onSelectNode={() => {}} {...props}
/></ConfigContext.Provider>);
const graph = completed.run.graphs[0];

test("only the exact frozen read-only graph can carry run badges; an editable copy cannot", () => {
  const document = JSON.parse(JSON.stringify(graph.document));
  const { rerender } = show({ document, observation: graph });
  expect(screen.queryByTestId("run-node-state-start")).toBeNull();
  rerender(<ConfigContext.Provider value={{ theme: {} }}><SkeletonCanvas resourceId="run-layout" isDark={false}
    readOnly document={graph.document} observation={graph} onSelectNode={() => {}} />
  </ConfigContext.Provider>);
  expect(screen.getByTestId("run-node-state-start")).toHaveAttribute("aria-label", "Succeeded");
  expect(screen.getByTestId("run-node-state-kernel")).toHaveAttribute("data-run-state", "succeeded");
  expect(editor.on_connect).toBeUndefined();
  expect(editor.on_delete).toBeUndefined();
  expect(editor.nodes.every((node) => !Object.prototype.hasOwnProperty.call(node.config, "run_state"))).toBe(true);
});

test("configuration pools have no execution badge and skipped evidence changes only drawing edges", () => {
  const document = { ...graph.document, nodes: [...graph.document.nodes, { id: "pool", type: "toolkit_pool", config: {} }] };
  const observed = { ...graph, document, nodes: [...graph.nodes, { node_id: "pool", state: "succeeded", phase: "completed" }], skipped_edges: ["b"] };
  show({ document, readOnly: true, observation: observed });
  expect(screen.queryByTestId("run-node-state-pool")).toBeNull();
  expect(editor.edges.find((edge) => edge.id === "b").style).toBe("dashed");
  expect(document.edges.find((edge) => edge.id === "b").style).toBeUndefined();
  expect(screen.getByTestId("run-node-state-end")).toHaveAttribute("data-run-state", "succeeded");
});

test("status captions distinguish receipt, sealed result and unknown effects", () => {
  expect(run_status_caption({ state: "waiting", phase: "receipt_recorded" })).toMatch(/Receipt recorded.*resume/i);
  expect(run_status_caption({ state: "waiting", phase: "receipt_recorded_upstream" })).toMatch(/parent/i);
  expect(run_status_caption({ state: "running", phase: "result_received" })).toMatch(/not committed/i);
  expect(run_status_caption({ state: "cancelled", phase: "cancelled" })).toBe("Cancelled");
  expect(run_status_caption({ state: "outcome_unknown", phase: "outcome_unknown" })).toBe("Outcome unknown");
});

test("recorded Code is the plain header card: no path, no request to reopen, never the draft's text", () => {
  const sha = "a".repeat(64);
  const path = `__pupu_code__/sha256/${sha}.py`;
  const document = { ...graph.document, nodes: [graph.document.nodes[0], {
    id: "code", type: "code", config: { code: { source: { kind: "file", path }, environment_profile_id: "builtin" } },
  }, graph.document.nodes[2]] };
  const observed = { ...graph, document, nodes: [{ node_id: "code", state: "pending", phase: "pending", reason: null }] };
  show({ document, readOnly: true, observation: observed, managedSources: { [sha]: "new B source must not appear" } });
  expect(screen.getByTestId("code-node-code")).toHaveTextContent("Python");
  expect(screen.getByTestId("code-node-code")).not.toHaveTextContent(path);
  expect(screen.queryByText(/reopen this Agent/i)).toBeNull();
  expect(screen.queryByText(/new B source must not appear/)).toBeNull();
  expect(screen.queryByTestId("code-node-code-expand")).toBeNull();
});

test("the Test panel's run states are drawn on the editable canvas: a line on the node's outline and a glyph, editing stays on", () => {
  const document = JSON.parse(JSON.stringify(graph.document));
  show({ document, onGraphCommand: () => {}, runStates: [{ node_id: "start", state: "succeeded" }, { node_id: "kernel", state: "failed" }] });
  expect(screen.getByTestId("run-node-state-start")).toHaveAttribute("data-run-state", "succeeded");
  const failed = screen.getByTestId("run-node-state-kernel");
  expect(failed).toHaveAttribute("aria-label", "Failed");
  /* no box ring around the puzzle piece any more: the line is the outline's */
  expect(failed.parentElement.style.boxShadow).toBe("");
  expect(failed.parentElement).toHaveAttribute("data-run-line", "solid");
  expect(screen.getByTestId("run-node-state-start").parentElement).not.toHaveAttribute("data-run-line");
  expect(screen.queryByTestId("run-node-state-end")).toBeNull();
  expect(typeof editor.on_connect).toBe("function");
});

test("running is the theme colour passing through, with no glyph, and the edge into it flows", () => {
  const document = JSON.parse(JSON.stringify(graph.document));
  const [first] = document.edges;
  show({ document, onGraphCommand: () => {}, runStates: [{ node_id: first.source_node_id, state: "succeeded" }, { node_id: first.target_node_id, state: "running" }] });
  const running = screen.getByTestId(`run-node-state-${first.target_node_id}`);
  expect(running.getAttribute("aria-label")).toMatch(/running/i);
  expect(running.parentElement).toHaveAttribute("data-run-line", "pass");
  expect(running.querySelector("svg, img")).toBeNull();
  const edge = editor.edges.find((e) => e.id === first.id);
  expect(edge).toMatchObject({ color: "var(--pupu-accent)", flowing: true });
  expect(document.edges.find((e) => e.id === first.id).flowing).toBeUndefined();
});

test("the path a run took stays tinted; a failure turns its way in red and its way out dashed", () => {
  const document = JSON.parse(JSON.stringify(graph.document));
  const drawn = (id) => editor.edges.find((e) => e.id === id);
  const { unmount } = show({ document, onGraphCommand: () => {}, runStates: [
    { node_id: "start", state: "succeeded" }, { node_id: "kernel", state: "succeeded" }, { node_id: "end", state: "failed" }] });
  expect(drawn("a").color).toMatch(/--pupu-success/);
  expect(drawn("b").color).toMatch(/--pupu-danger/);
  unmount();
  show({ document, onGraphCommand: () => {}, runStates: [{ node_id: "start", state: "succeeded" }, { node_id: "kernel", state: "failed" }] });
  expect(drawn("a").color).toMatch(/--pupu-danger/);
  expect(drawn("b")).toMatchObject({ style: "dashed" });
  expect(drawn("b").color).toBeUndefined();
});

test("a configuration pool's link keeps its drawing during a run", () => {
  const document = { ...graph.document, nodes: [...graph.document.nodes, { id: "pool", type: "toolkit_pool", config: {} }],
    edges: [...graph.document.edges, { id: "pool-link", source_node_id: "pool", source_port_id: "out", target_node_id: "kernel", target_port_id: "in" }] };
  show({ document, onGraphCommand: () => {}, runStates: [{ node_id: "pool", state: "succeeded" }, { node_id: "kernel", state: "running" }] });
  const link = editor.edges.find((e) => e.id === "pool-link");
  expect(link.color).toBeUndefined();
  expect(link.flowing).toBeUndefined();
});
