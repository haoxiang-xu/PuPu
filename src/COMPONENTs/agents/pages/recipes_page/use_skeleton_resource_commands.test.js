import { act, renderHook } from "@testing-library/react";
import useSkeletonResource from "./use_skeleton_resource";
import { session_token } from "./skeleton_resource_session";
import { apply_graph_command } from "./skeleton_graph_commands";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const args = { id: "canvas-commands", name: "Commands" };
const setup = () => {
  const view = renderHook(() => useSkeletonResource());
  act(() => view.result.current.create(args));
  return view;
};

test("two commands in the same React batch read the latest graph", () => {
  const { result } = setup();
  const issued = session_token(result.current.session);
  const before = result.current.session.version;
  act(() => {
    for (let i = 0; i < 2; i += 1) {
      result.current.editCurrent(issued, (current) => apply_graph_command(current.document, { type: "add_node", node_type: "agent" }).document);
    }
  });
  expect(result.current.session.document.nodes.map((n) => n.id)).toEqual(["start", "agent", "end", "agent-2", "agent-3"]);
  expect(result.current.session.version).toBe(before + 2);
});

test("a command from a previous same-id sitting cannot transform the new draft", () => {
  const { result } = setup();
  const issued = session_token(result.current.session);
  act(() => result.current.create(args));
  const before = result.current.session;
  const transform = jest.fn();
  act(() => result.current.editCurrent(issued, transform));
  expect(transform).not.toHaveBeenCalled();
  expect(result.current.session).toBe(before);
});

test("a refusal or no-op does not advance the session or dirty a saved graph", () => {
  const { result } = setup();
  const before = result.current.session;
  act(() => result.current.editCurrent(session_token(before), (current) => current.document));
  expect(result.current.session).toBe(before);
});
