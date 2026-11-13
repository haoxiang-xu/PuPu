import { act, renderHook } from "@testing-library/react";
import { api } from "../../../../SERVICEs/api";
import waiting from "./__fixtures__/run_observation/test_real_route_receipt_record0--producer-observation-approval-0.json";
import receipt from "./__fixtures__/run_observation/test_real_route_receipt_record0--producer-observation-receipt-0.json";
import useSkeletonRunObservation from "./use_skeleton_run_observation";

jest.mock("../../../../SERVICEs/api", () => ({ api: { unchain: {} } }));
const scope = { owner_chat_id: "production-chat", execution_id: "view-wait-session", resource_id: "production-agent" };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
beforeEach(() => { jest.useFakeTimers(); jest.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); console.warn.mockRestore(); });

test("discovery pins root; a higher-prefix receipt updates at the same graph revision", async () => {
  api.unchain.getSkeletonRunObservation = jest.fn().mockResolvedValueOnce({ ok: true, data: waiting }).mockResolvedValue({ ok: true, data: receipt });
  const { result } = renderHook(() => useSkeletonRunObservation(scope));
  await flush();
  expect(result.current.run).toEqual(waiting.run);
  await act(async () => { jest.advanceTimersByTime(2500); });
  expect(api.unchain.getSkeletonRunObservation.mock.calls[1][0]).toEqual({ ...scope, root_run_id: "view-wait-root" });
  expect(result.current.run).toEqual(receipt.run);
  expect(result.current.phase).toBe("ready");
});

test("only one request is in flight; closing or navigating discards its late answer", async () => {
  const pending = deferred();
  api.unchain.getSkeletonRunObservation = jest.fn().mockReturnValue(pending.promise);
  const { result, rerender } = renderHook(({ request }) => useSkeletonRunObservation(request), { initialProps: { request: scope } });
  act(() => { result.current.refresh(); });
  await act(async () => { jest.advanceTimersByTime(10000); });
  expect(api.unchain.getSkeletonRunObservation).toHaveBeenCalledTimes(1);
  rerender({ request: null });
  await act(async () => { pending.resolve({ ok: true, data: waiting }); });
  expect(result.current.run).toBeNull();
  expect(result.current.phase).toBe("closed");
});

test("unavailable differs from an empty matching run, and never erases a previous observation", async () => {
  api.unchain.getSkeletonRunObservation = jest.fn()
    .mockResolvedValueOnce({ ok: true, data: { schema: waiting.schema, run: null } })
    .mockResolvedValueOnce({ ok: true, data: waiting })
    .mockResolvedValueOnce({ ok: false, error: { code: "observation_unavailable", message: "Cannot read this run" } });
  const { result } = renderHook(() => useSkeletonRunObservation(scope));
  await flush();
  expect(result.current.phase).toBe("empty");
  await act(async () => { result.current.refresh(); });
  expect(result.current.run).toEqual(waiting.run);
  await act(async () => { result.current.refresh(); });
  expect(result.current.phase).toBe("error");
  expect(result.current.run).toEqual(waiting.run);
  expect(result.current.error).toBe("Cannot read this run");
});

test("a stale read is reported, without replacing the newer receipt", async () => {
  api.unchain.getSkeletonRunObservation = jest.fn().mockResolvedValueOnce({ ok: true, data: receipt }).mockResolvedValue({ ok: true, data: waiting });
  const { result } = renderHook(() => useSkeletonRunObservation(scope));
  await flush();
  await act(async () => { result.current.refresh(); });
  expect(result.current.run).toEqual(receipt.run);
  expect(result.current.phase).toBe("error");
  /* A plain message on the page; the reason is logged for developers. */
  expect(result.current.error).toBe("Run details could not be updated.");
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/older_observation/));
});

test("a response for chat A cannot become chat B's view", async () => {
  const a = deferred(); const b = deferred();
  api.unchain.getSkeletonRunObservation = jest.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  const { result, rerender } = renderHook(({ request }) => useSkeletonRunObservation(request), { initialProps: { request: scope } });
  rerender({ request: { ...scope, owner_chat_id: "other" } });
  await act(async () => { a.resolve({ ok: true, data: waiting }); });
  expect(result.current.run).toBeNull();
  expect(result.current.phase).toBe("loading");
  await act(async () => { b.resolve({ ok: true, data: waiting }); });
  expect(result.current.run).toBeNull();
  expect(result.current.error).toBe("Run details could not be updated.");
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/run_scope_mismatch/));
});
