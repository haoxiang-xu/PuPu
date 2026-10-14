import { parseContextV2ErrorCode } from "../../../SERVICEs/bridges/context_v2_bridge";

const WAIT_MS = 30000;
const POLL_MS = 250;

/** Await only a new user's frozen rebase. No model execution is replayed here. */
export const waitForContextV2Settlement = async ({
  request,
  payload,
  isCancelled = () => false,
  onWaiting = () => {},
}) => {
  let ended = false;
  let pollTimer = null;
  let wakePoll = null;
  let watchTimer = null;
  const deadline = Date.now() + WAIT_MS;
  const stopped = (code) => Object.assign(new Error(`[${code}] Settlement wait ended.`), { code });
  const watchdog = new Promise((_, reject) => {
    watchTimer = setInterval(() => {
      if (isCancelled()) {
        reject(stopped("context_v2_settlement_cancelled"));
      } else if (Date.now() >= deadline) {
        reject(stopped("context_v2_settlement_timeout"));
      }
    }, 100);
  });
  const waitForPoll = () => new Promise((resolve) => {
    wakePoll = resolve;
    pollTimer = setTimeout(resolve, POLL_MS);
  });
  const poll = async () => {
    let waitingShown = false;
    while (!ended) {
      if (isCancelled()) throw stopped("context_v2_settlement_cancelled");
      if (Date.now() >= deadline) throw stopped("context_v2_settlement_timeout");
      try {
        const ack = await request(payload);
        if (isCancelled()) throw stopped("context_v2_settlement_cancelled");
        return ack;
      } catch (error) {
        if (parseContextV2ErrorCode(error) !== "context_v2_rebase_in_progress") throw error;
        if (ended) return undefined;
        if (isCancelled()) throw stopped("context_v2_settlement_cancelled");
        if (!waitingShown) {
          waitingShown = true;
          onWaiting();
        }
        await waitForPoll();
      }
    }
    return undefined;
  };
  try {
    return await Promise.race([poll(), watchdog]);
  } finally {
    ended = true;
    clearInterval(watchTimer);
    clearTimeout(pollTimer);
    wakePoll?.();
  }
};
