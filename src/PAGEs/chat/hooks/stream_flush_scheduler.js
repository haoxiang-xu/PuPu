/**
 * Coalesces N same-tick message updates into 1 flush.
 * Closure-scoped: create one scheduler per active stream.
 *
 * commit(next) — store latest messages (sync) + schedule a microtask flush
 *   if none pending. Subsequent commits in the same tick overwrite
 *   latestMessages but do not schedule a second microtask.
 *
 * flushSync() — flush the pending commit immediately (if any). Used on
 *   stream end/cancel to ensure React state is up-to-date before cleanup.
 *
 * cancel() — drop any pending commit without flushing. Used when the
 *   stream is aborted and the buffered messages should be discarded.
 */
export const createStreamFlushScheduler = ({ onFlush }) => {
  let scheduled = false;
  let latestMessages = null;

  const flush = () => {
    if (!scheduled) return;
    scheduled = false;
    const toFlush = latestMessages;
    latestMessages = null;
    onFlush(toFlush);
  };

  return {
    commit(nextMessages) {
      latestMessages = nextMessages;
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    },
    flushSync() {
      if (!scheduled) return;
      flush();
    },
    cancel() {
      scheduled = false;
      latestMessages = null;
    },
  };
};
