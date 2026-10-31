import { act, renderHook } from "@testing-library/react";
import useSkeletonResource from "./use_skeleton_resource";
import { can_preflight, can_save, diagnostics_are_current } from "./skeleton_resource_session";
import { RESOURCE_RESULT_KEYS, EDIT_CONFLICT_ERROR } from "./skeleton_resource_capture";
import capture from "./skeleton_graph_edits_capture.json";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const seed = capture.cases.find((row) => row.case === "seed").document;
const args = { id: seed.id, name: seed.name };
const stored = (document, edit_token) => ({
  ...Object.fromEntries(RESOURCE_RESULT_KEYS.map((key) => [key, key === "diagnostics" ? [] : null])),
  id: document.id, kind: document.kind, name: document.name, document, edit_token,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
};
const create = () => {
  const { result } = renderHook(() => useSkeletonResource());
  act(() => { expect(result.current.create(args).ok).toBe(true); });
  return { result };
};

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

test("a new draft is the real stored seed, unsaved and unchecked, with no store request", () => {
  api.unchain.getSkeletonResource = jest.fn();
  api.unchain.saveSkeletonResource = jest.fn();
  api.unchain.preflightSkeletonResource = jest.fn();
  const hook = create();
  expect(hook.result.current.session).toMatchObject({
    status: "ready", resource_id: seed.id, edit_token: null, dirty: true,
    document: seed, saving: false, converting: false, conflict: null, preflight: null,
  });
  expect(hook.result.current.session.open_id).toBeGreaterThan(0);
  expect(can_save(hook.result.current.session)).toBe(true);
  expect(can_preflight(hook.result.current.session)).toBe(false);
  expect(diagnostics_are_current(hook.result.current.session)).toBe(false);
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  expect(api.unchain.preflightSkeletonResource).not.toHaveBeenCalled();
});

test("invalid creation does not replace the draft already on screen", () => {
  const hook = create();
  const before = hook.result.current.session;
  act(() => { expect(hook.result.current.create({ id: "__proto__", name: "Invalid" }).ok).toBe(false); });
  expect(hook.result.current.session).toBe(before);
});

test("first save omits the token; the next edit saves at the returned token", async () => {
  api.unchain.saveSkeletonResource = jest.fn()
    .mockResolvedValueOnce(stored(seed, "edit-first"))
    .mockImplementation(async ({ document }) => stored(document, "edit-second"));
  const hook = create();
  await act(async () => { await hook.result.current.save(); });
  expect(api.unchain.saveSkeletonResource.mock.calls[0][0]).toStrictEqual({ document: seed });
  expect(hook.result.current.session.dirty).toBe(false);
  expect(diagnostics_are_current(hook.result.current.session)).toBe(true);
  const edited = { ...seed, description: "Still the same Agent" };
  act(() => { hook.result.current.edit(edited); });
  await act(async () => { await hook.result.current.save(); });
  expect(api.unchain.saveSkeletonResource.mock.calls[1][0]).toStrictEqual({ document: edited, expected_edit_token: "edit-first" });
  expect(hook.result.current.session.edit_token).toBe("edit-second");
});

test("edits typed during the first save survive while its real token advances", async () => {
  const pending = deferred();
  api.unchain.saveSkeletonResource = jest.fn().mockReturnValue(pending.promise);
  const hook = create();
  let saving;
  act(() => { saving = hook.result.current.save(); });
  const newer = { ...seed, description: "Typed after Save" };
  act(() => { hook.result.current.edit(newer); });
  await act(async () => { pending.resolve(stored(seed, "edit-first")); await saving; });
  expect(hook.result.current.session.document).toBe(newer);
  expect(hook.result.current.session.edit_token).toBe("edit-first");
  expect(hook.result.current.session.dirty).toBe(true);
  expect(diagnostics_are_current(hook.result.current.session)).toBe(false);
});

test.each(["success", "conflict"])("a late first-save %s cannot settle a reopened same-id draft", async (reply) => {
  const pending = deferred();
  api.unchain.saveSkeletonResource = jest.fn().mockReturnValue(pending.promise);
  const hook = create();
  let saving;
  act(() => { saving = hook.result.current.save(); });
  const oldOpen = hook.result.current.session.open_id;
  act(() => { hook.result.current.create(args); });
  const before = hook.result.current.session;
  expect(before.open_id).toBeGreaterThan(oldOpen);
  await act(async () => {
    pending.resolve(reply === "success" ? stored(seed, "old-token") : { error: EDIT_CONFLICT_ERROR });
    await saving;
  });
  expect(hook.result.current.session).toBe(before);
  expect(hook.result.current.session.edit_token).toBeNull();
  expect(hook.result.current.session.conflict).toBeNull();
});

test("a load from the previous sitting cannot replace a new draft with the same id", async () => {
  const pending = deferred();
  api.unchain.getSkeletonResource = jest.fn().mockReturnValue(pending.promise);
  const { result } = renderHook(() => useSkeletonResource());
  let loading;
  act(() => { loading = result.current.load(seed.id); });
  act(() => { result.current.create(args); });
  const before = result.current.session;
  await act(async () => { pending.resolve(stored({ ...seed, description: "Old load" }, "old-token")); await loading; });
  expect(result.current.session).toBe(before);
});

test("a colliding first save retains the draft and never reads or retries automatically", async () => {
  api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
  api.unchain.getSkeletonResource = jest.fn();
  const hook = create();
  const mine = hook.result.current.session.document;
  await act(async () => { await hook.result.current.save(); });
  expect(hook.result.current.session.document).toBe(mine);
  expect(hook.result.current.session.conflict.error.code).toBe("edit_conflict");
  expect(hook.result.current.session.edit_token).toBeNull();
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
  expect(api.unchain.getSkeletonResource).not.toHaveBeenCalled();
});

test("two same-tick saves issue only one first write", async () => {
  const pending = deferred();
  api.unchain.saveSkeletonResource = jest.fn().mockReturnValue(pending.promise);
  const hook = create();
  let saving;
  act(() => { saving = hook.result.current.save(); hook.result.current.save(); });
  expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
  await act(async () => { pending.resolve(stored(seed, "edit-first")); await saving; });
  expect(hook.result.current.session.conflict).toBeNull();
  expect(hook.result.current.session.dirty).toBe(false);
});
