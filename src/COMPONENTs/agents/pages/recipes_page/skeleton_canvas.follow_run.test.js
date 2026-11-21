import React from "react";
import { render } from "@testing-library/react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import SkeletonCanvas from "./skeleton_canvas";

let editor;
jest.mock("../../../../BUILTIN_COMPONENTs/flow_editor", () => ({ FlowEditor: (props) => {
  editor = props;
  return <div>{props.nodes.map((node) => <div key={node.id}>{props.render_node(node)}</div>)}</div>;
} }));

const document = {
  schema_version: 1, kind: "agent", id: "r", name: "r",
  nodes: [
    { id: "start", type: "start", config: {} },
    { id: "kernel", type: "agent", config: {} },
    { id: "pool", type: "toolkit_pool", config: {} },
    { id: "end", type: "end", config: {} },
  ],
  edges: [],
};
const canvas = (props) => (
  <ConfigContext.Provider value={{ theme: {} }}>
    <SkeletonCanvas resourceId="follow" commandScope="run" isDark={false} onSelectNode={() => {}}
      document={document} onGraphCommand={() => {}} {...props} />
  </ConfigContext.Provider>
);

test("the side menus' view area reaches the editor, for Home and for following", () => {
  const viewArea = () => ({ left: 320, right: 368 });
  render(canvas({ viewArea }));
  expect(editor.view_area).toBe(viewArea);
});

test("a live run is followed node by node; a configuration pool is not a step; a finished run lets go", () => {
  const view = render(canvas({ runStates: null }));
  expect(editor.follow_node_id).toBeNull();
  view.rerender(canvas({ runStates: [{ node_id: "start", state: "running" }] }));
  expect(editor.follow_node_id).toBe("start");
  view.rerender(canvas({ runStates: [{ node_id: "start", state: "succeeded" }, { node_id: "pool", state: "running" }, { node_id: "kernel", state: "running" }] }));
  expect(editor.follow_node_id).toBe("kernel");
  view.rerender(canvas({ runStates: [{ node_id: "start", state: "succeeded" }, { node_id: "kernel", state: "waiting_approval" }] }));
  expect(editor.follow_node_id).toBe("kernel");
  view.rerender(canvas({ runStates: [{ node_id: "start", state: "succeeded" }, { node_id: "kernel", state: "succeeded" }, { node_id: "end", state: "succeeded" }] }));
  expect(editor.follow_node_id).toBeNull();
});
