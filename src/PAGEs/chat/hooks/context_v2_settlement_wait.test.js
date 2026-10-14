import { waitForContextV2Settlement } from "./context_v2_settlement_wait";

const busy = () => Object.assign(new Error("[context_v2_rebase_in_progress] private detail"), { code: "context_v2_rebase_in_progress" });
const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test("polls only the same frozen rebase and returns its ack after settlement", async () => {
  const payload = Object.freeze({ operationId: "same", replacementHistory: [] });
  const ack = { generationId: "next" };
  const request = jest.fn().mockRejectedValueOnce(busy()).mockResolvedValue(ack);
  const onWaiting = jest.fn();
  const result = waitForContextV2Settlement({ request, payload, onWaiting });
  await flush();
  expect(onWaiting).toHaveBeenCalledTimes(1);
  jest.advanceTimersByTime(250);
  await expect(result).resolves.toBe(ack);
  expect(request.mock.calls).toEqual([[payload], [payload]]);
});

test("Stop while waiting sends no subsequent request", async () => {
  let cancelled = false;
  const request = jest.fn().mockRejectedValue(busy());
  const result = waitForContextV2Settlement({ request, payload: {}, isCancelled: () => cancelled });
  const rejected = expect(result).rejects.toMatchObject({ code: "context_v2_settlement_cancelled" });
  await flush();
  cancelled = true;
  jest.advanceTimersByTime(100);
  await rejected;
  jest.advanceTimersByTime(30000);
  expect(request).toHaveBeenCalledTimes(1);
});

test("a hanging bridge is bounded and a late ack cannot resume", async () => {
  let resolve;
  const result = waitForContextV2Settlement({ request: () => new Promise((r) => { resolve = r; }), payload: {} });
  const rejected = expect(result).rejects.toMatchObject({ code: "context_v2_settlement_timeout" });
  jest.advanceTimersByTime(30000);
  await rejected;
  resolve({ generationId: "late" });
  await flush();
});

test("ordinary rejection is not polled", async () => {
  const error = Object.assign(new Error("rejected"), { code: "context_v2_revision_conflict" });
  const request = jest.fn().mockRejectedValue(error);
  await expect(waitForContextV2Settlement({ request, payload: {} })).rejects.toBe(error);
  expect(request).toHaveBeenCalledTimes(1);
});
