export const createRuntimeEventBatcher = ({ delayMs = 0, onFlush }) => {
  let pendingEvents = [];
  let scheduledHandle = null;
  let scheduledHandleType = null;

  const clearScheduledFlush = () => {
    if (scheduledHandle == null) {
      return;
    }

    if (
      scheduledHandleType === "raf" &&
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      window.cancelAnimationFrame(scheduledHandle);
    } else {
      clearTimeout(scheduledHandle);
    }

    scheduledHandle = null;
    scheduledHandleType = null;
  };

  const flush = () => {
    clearScheduledFlush();
    if (pendingEvents.length === 0) {
      return;
    }

    const events = pendingEvents;
    pendingEvents = [];
    onFlush(events);
  };

  const scheduleFlush = () => {
    if (scheduledHandle != null) {
      return;
    }

    if (typeof delayMs === "number" && delayMs > 0) {
      scheduledHandleType = "timeout";
      scheduledHandle = setTimeout(flush, delayMs);
      return;
    }

    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      scheduledHandleType = "raf";
      scheduledHandle = window.requestAnimationFrame(flush);
      return;
    }

    scheduledHandleType = "timeout";
    scheduledHandle = setTimeout(flush, 16);
  };

  return {
    enqueue(event) {
      pendingEvents.push(event);
      scheduleFlush();
    },
    flushNow() {
      flush();
    },
    cancel() {
      clearScheduledFlush();
      pendingEvents = [];
    },
  };
};
