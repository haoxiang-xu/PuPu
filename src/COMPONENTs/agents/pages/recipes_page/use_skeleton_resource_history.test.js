import { act, renderHook } from "@testing-library/react";
import { api } from "../../../../SERVICEs/api";
import { install_legacy_store_bridge } from "./legacy_store_test_bridge";
import useSkeletonResource from "./use_skeleton_resource";
import { session_token } from "./skeleton_resource_session";
import { apply_graph_command } from "./skeleton_graph_commands";

/* The hook's half of undo: one gesture is one step (two edits in the same
   tick fold together, the rule the legacy history uses), and undo / redo walk
   the session's own history. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
/* The editor speaks v2 only (#357 G1); these mocks are graph-only. */
install_legacy_store_bridge(api.unchain);
const setup = () => {
  const view = renderHook(() => useSkeletonResource());
  act(() => view.result.current.create({ id: "history", name: "History" }));
  return view;
};
const add = (current) => apply_graph_command(current.document, { type: "add_node", node_type: "agent" }).document;
const ids = (result) => result.current.session.document.nodes.map((n) => n.id);

test("two edits in one gesture are one step back; separate gestures are separate steps", async () => {
  const { result } = setup();
  const issued = session_token(result.current.session);
  act(() => {
    result.current.editCurrent(issued, add);
    result.current.editCurrent(issued, add);
  });
  await act(async () => { await Promise.resolve(); });
  act(() => result.current.editCurrent(issued, add));
  expect(ids(result)).toEqual(["start", "agent", "end", "agent-2", "agent-3", "agent-4"]);
  act(() => result.current.undo());
  expect(ids(result)).toEqual(["start", "agent", "end", "agent-2", "agent-3"]);
  act(() => result.current.undo());
  expect(ids(result)).toEqual(["start", "agent", "end"]);
  act(() => result.current.redo());
  expect(ids(result)).toEqual(["start", "agent", "end", "agent-2", "agent-3"]);
});

test("a plain edit records a step and undo is a no-op with nothing to undo", async () => {
  const { result } = setup();
  const first = result.current.session;
  act(() => result.current.undo());
  expect(result.current.session).toBe(first);
  act(() => result.current.edit({ ...first.document, name: "Renamed" }));
  await act(async () => { await Promise.resolve(); });
  act(() => result.current.undo());
  expect(result.current.session.document.name).toBe("History");
});
