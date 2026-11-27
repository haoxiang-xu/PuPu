import { renderHook, act } from "@testing-library/react";
import { install_legacy_store_bridge } from "./legacy_store_test_bridge";
import useSkeletonResource from "./use_skeleton_resource";
import { session_token } from "./skeleton_resource_session";
import { RESOURCE_RESULT_KEYS } from "./skeleton_resource_capture";
import { apply_graph_command } from "./skeleton_graph_commands";
import { api } from "../../../../SERVICEs/api";

/* SEQ-NL-001: a move is an edit. It marks a clean draft unsaved, Save sends
   the layout in the document at the loaded token, a reload reads it back,
   and undo takes the move out again. */

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
install_legacy_store_bridge(api.unchain);

const result = (overrides) => {
  const base = {};
  RESOURCE_RESULT_KEYS.forEach((key) => { base[key] = key === "diagnostics" ? [] : null; });
  return { ...base, id: "life", kind: "workflow", name: "life", ...overrides };
};
const doc = () => ({
  schema_version: 1, kind: "workflow", id: "life", name: "life",
  nodes: [{ id: "s", type: "start", config: {} }, { id: "e", type: "end", config: {} }],
  edges: [],
});
const move = (hook, positions) => act(() => {
  hook.result.current.editCurrent(session_token(hook.result.current.session),
    (current) => apply_graph_command(current.document, { type: "move_nodes", positions }).document);
});

beforeEach(() => { Object.keys(api.unchain).forEach((key) => delete api.unchain[key]); });

test("move marks unsaved, Save carries the layout, a reload reads it, undo removes it", async () => {
  let stored = { document: doc(), edit_token: "t1" };
  api.unchain.getSkeletonResource = jest.fn(async () => result(stored));
  api.unchain.saveSkeletonResource = jest.fn(async (payload) => {
    stored = { document: payload.document, edit_token: "t2" };
    return result(stored);
  });
  const hook = renderHook(() => useSkeletonResource());
  await act(async () => { await hook.result.current.load("life"); });
  expect(hook.result.current.session.dirty).toBe(false);

  move(hook, { s: { x: 10, y: 20 }, e: { x: 400, y: 20 } });
  expect(hook.result.current.session.dirty).toBe(true);
  expect(hook.result.current.session.document.layout).toEqual({ nodes: { s: { x: 10, y: 20 }, e: { x: 400, y: 20 } } });

  await act(async () => { await hook.result.current.save(); });
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
  const sent = api.unchain.saveSkeletonResource.mock.calls[0][0];
  expect(sent.expected_edit_token).toBe("t1");
  expect(sent.document.layout).toEqual({ nodes: { s: { x: 10, y: 20 }, e: { x: 400, y: 20 } } });
  expect(hook.result.current.session.dirty).toBe(false);

  /* A second move in the same sitting, at the token the first save returned. */
  move(hook, { e: { x: 500, y: 60 } });
  expect(hook.result.current.session.document.layout.nodes.e).toEqual({ x: 500, y: 60 });
  act(() => hook.result.current.undo());
  expect(hook.result.current.session.document.layout.nodes.e).toEqual({ x: 400, y: 20 });

  /* Opening again reads the saved drawing from the store. */
  const again = renderHook(() => useSkeletonResource());
  await act(async () => { await again.result.current.load("life"); });
  expect(again.result.current.session.document.layout).toEqual({ nodes: { s: { x: 10, y: 20 }, e: { x: 400, y: 20 } } });
});

test("a drop onto the same place is no edit and leaves a clean draft clean", async () => {
  const placed = { ...doc(), layout: { nodes: { s: { x: 1, y: 2 } } } };
  api.unchain.getSkeletonResource = jest.fn(async () => result({ document: placed, edit_token: "t1" }));
  const hook = renderHook(() => useSkeletonResource());
  await act(async () => { await hook.result.current.load("life"); });
  const before = hook.result.current.session;
  move(hook, { s: { x: 1, y: 2 } });
  expect(hook.result.current.session).toBe(before);
  expect(hook.result.current.session.dirty).toBe(false);
});
