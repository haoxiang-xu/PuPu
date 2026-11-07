/* eslint-disable testing-library/no-node-access, testing-library/no-container -- Selection is exercised on real graph elements. */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import FlowEditor from "./flow_editor";
const nodes = [{ id: "a", x: 0, y: 0, ports: [] }, { id: "b", x: 200, y: 0, ports: [] }];
const wrap = (props) => <ConfigContext.Provider value={{ theme: {} }}><FlowEditor nodes={nodes} edges={[]} {...props} /></ConfigContext.Provider>;
test("optional observer sees copied mount, select, select-all and cleanup snapshots without replacing on_select", () => {
  const seen = []; const on_select = jest.fn();
  const observer = jest.fn((snapshot) => { seen.push(snapshot); snapshot.node_ids.push("external-mutation"); });
  const { container, rerender, unmount } = render(wrap({ on_selection_change: observer, on_select }));
  expect(seen[0]).toEqual({ node_ids: ["external-mutation"], edge_id: null });
  fireEvent.mouseDown(container.querySelector('[data-flow-node-id="a"]'), { button: 0 }); fireEvent.mouseUp(document);
  expect(on_select).toHaveBeenLastCalledWith("a");
  expect(seen.at(-1).node_ids).toEqual(["a", "external-mutation"]);
  rerender(wrap({ on_selection_change: observer, on_select, select_all_token: 1 }));
  expect(seen.at(-1).node_ids).toEqual(["a", "b", "external-mutation"]);
  unmount(); expect(seen.at(-1)).toEqual({ node_ids: ["external-mutation"], edge_id: null });
});

test("replacing an observer reports the current selection without cleanup-clearing it", () => {
  const first = jest.fn(), second = jest.fn(), on_select = jest.fn();
  const { container, rerender } = render(wrap({ on_selection_change: first, on_select }));
  fireEvent.mouseDown(container.querySelector('[data-flow-node-id="a"]'), { button: 0 }); fireEvent.mouseUp(document);
  const before = first.mock.calls.length;
  rerender(wrap({ on_selection_change: second, on_select }));
  expect(first).toHaveBeenCalledTimes(before);
  expect(second).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenLastCalledWith({ node_ids: ["a"], edge_id: null });
  expect(on_select).toHaveBeenCalledTimes(1);
  rerender(wrap({ on_select }));
  fireEvent.mouseDown(container.querySelector('[data-flow-node-id="b"]'), { button: 0 }); fireEvent.mouseUp(document);
  expect(second).toHaveBeenCalledTimes(1); expect(on_select).toHaveBeenLastCalledWith("b");
});

test("clear and edge selection are reported without reopening a node", () => {
  const observed = jest.fn(), on_select = jest.fn();
  const wired = nodes.map((node) => ({ ...node, ports: [{ id: "out", side: "right" }, { id: "in", side: "left" }] }));
  const edge = { id: "wire", source_node_id: "a", source_port_id: "out", target_node_id: "b", target_port_id: "in" };
  const { container } = render(wrap({ nodes: wired, edges: [edge], on_selection_change: observed, on_select }));
  fireEvent.mouseDown(container.querySelector('[data-flow-node-id="a"]'), { button: 0 }); fireEvent.mouseUp(document);
  fireEvent.click(container.querySelector('[data-flow-edge-id="wire"]'));
  expect(observed).toHaveBeenLastCalledWith({ node_ids: [], edge_id: "wire" });
  expect(on_select).toHaveBeenCalledTimes(1);
  fireEvent.mouseDown(container.querySelector('[data-testid="flow-editor-viewport"]').parentElement, { button: 0 });
  fireEvent.mouseUp(document);
  expect(observed).toHaveBeenLastCalledWith({ node_ids: [], edge_id: null });
  expect(on_select).toHaveBeenLastCalledWith(null);
});
