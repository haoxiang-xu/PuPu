/* These are real pointer/key gestures in the shared editor. Native consumers
 * need semantic intent: a refused reconnect must not masquerade as deletion. */
/* eslint-disable testing-library/no-node-access, testing-library/no-container */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FlowEditor } from "./flow_editor";

if (!global.ResizeObserver) global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const nodes = [
  { id: "a", x: 0, y: 0, ports: [{ id: "out", side: "right", kind: "out" }] },
  { id: "b", x: 200, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
  { id: "c", x: 400, y: 0, ports: [{ id: "in", side: "left", kind: "in" }] },
];
const edges = [{ id: "e", source_node_id: "a", source_port_id: "out", target_node_id: "b", target_port_id: "in" }];
const show = (props = {}) => render(
  <ConfigContext.Provider value={{ theme: {} }}>
    <FlowEditor nodes={nodes} edges={edges} {...props} />
  </ConfigContext.Provider>,
);

test("semantic key deletion reports one selection and never drawing arrays", () => {
  const on_delete = jest.fn(), on_nodes_change = jest.fn(), on_edges_change = jest.fn();
  show({ on_delete, on_nodes_change, on_edges_change, select_all_token: 1,
    nodes: [{ ...nodes[0], deletable: false }, nodes[1], { ...nodes[2], deletable: false }] });
  fireEvent.keyDown(window, { code: "Delete" });
  expect(on_delete).toHaveBeenCalledTimes(1);
  expect(on_delete).toHaveBeenCalledWith({ node_ids: ["b"], edge_ids: [] });
  expect(on_nodes_change).not.toHaveBeenCalled();
  expect(on_edges_change).not.toHaveBeenCalled();
});

test("a protected node cannot be deleted through the semantic callback", () => {
  const on_delete = jest.fn();
  const view = show({ on_delete, nodes: [{ ...nodes[0], deletable: false }] });
  const node = view.container.querySelector('[data-flow-node-id="a"]');
  fireEvent.mouseDown(node, { button: 0 }); fireEvent.mouseUp(window);
  fireEvent.keyDown(window, { code: "Delete" });
  expect(on_delete).not.toHaveBeenCalled();
});

test.each(["key", "button"])("edge %s deletion has explicit edge identity", (gesture) => {
  const on_delete = jest.fn(), on_edges_change = jest.fn();
  const view = show({ on_delete, on_edges_change });
  fireEvent.click(view.container.querySelector('[data-flow-edge-id="e"]'));
  if (gesture === "key") fireEvent.keyDown(window, { code: "Backspace" });
  else fireEvent.click(view.container.querySelector('[data-edge-delete-btn="e"]'));
  expect(on_delete).toHaveBeenCalledTimes(1);
  expect(on_delete).toHaveBeenCalledWith({ node_ids: [], edge_ids: ["e"] });
  expect(on_edges_change).not.toHaveBeenCalled();
});

test("the semantic callback alone exposes edge deletion", () => {
  const view = show({ on_delete: jest.fn() });
  expect(view.container.querySelector('[data-edge-delete-btn="e"]')).not.toBeNull();
});

test.each(["port", "blank"])("reconnect to %s is an intent, never a deleted-edge list", (target) => {
  const on_reconnect = jest.fn(), on_edges_change = jest.fn();
  const view = show({ on_reconnect, on_edges_change, validate_connection: () => false });
  const path = view.container.querySelector('[data-flow-edge-id="e"]');
  fireEvent.click(path);
  const handles = path.parentElement.querySelectorAll('circle[r="8"]');
  const previous = document.elementFromPoint;
  document.elementFromPoint = () => target === "blank" ? null : view.container.querySelector('[data-node-id="c"][data-port-id="in"]');
  try {
    fireEvent.mouseDown(handles[1], { button: 0 });
    fireEvent.mouseUp(window, { clientX: 400, clientY: 40 });
  } finally { document.elementFromPoint = previous; }
  expect(on_reconnect).toHaveBeenCalledWith({ edge_id: "e", connection: target === "blank" ? null : {
    source_node_id: "a", source_port_id: "out", target_node_id: "c", target_port_id: "in",
  } });
  expect(on_edges_change).not.toHaveBeenCalled();
});

test("a read-only drawing does not offer inert reconnect handles", () => {
  const view = show();
  const path = view.container.querySelector('[data-flow-edge-id="e"]');
  fireEvent.click(path);
  expect(path.parentElement.querySelectorAll('circle[r="8"]')).toHaveLength(0);
});
