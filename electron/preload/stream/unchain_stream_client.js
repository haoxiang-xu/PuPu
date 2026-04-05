const { CHANNELS } = require("../../shared/channels");

const createRequestId = () =>
  `unchain-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createMisoStreamClient = (ipcRenderer) => {
  const activeMisoStreamCleanups = new Map();

  const cleanupMisoStreamListener = (requestId) => {
    const cleanup = activeMisoStreamCleanups.get(requestId);
    if (typeof cleanup === "function") {
      cleanup();
      activeMisoStreamCleanups.delete(requestId);
    }
  };

  const registerMisoStreamListener = (requestId, handlers = {}) => {
    const listener = (_event, envelope = {}) => {
      if (envelope.requestId !== requestId) {
        return;
      }

      const eventName = envelope.event;
      const data = envelope.data || {};

      if (eventName === "meta" && typeof handlers.onMeta === "function") {
        handlers.onMeta(data);
        return;
      }

      if (eventName === "token" && typeof handlers.onToken === "function") {
        const delta = typeof data.delta === "string" ? data.delta : "";
        handlers.onToken(delta);
        return;
      }

      if (eventName === "done") {
        if (typeof handlers.onDone === "function") {
          handlers.onDone(data);
        }
        cleanupMisoStreamListener(requestId);
        return;
      }

      if (eventName === "error") {
        if (typeof handlers.onError === "function") {
          handlers.onError({
            code: data.code || "unknown",
            message: data.message || "Unknown stream error",
          });
        }
        cleanupMisoStreamListener(requestId);
      }
    };

    ipcRenderer.on(CHANNELS.UNCHAIN.STREAM_EVENT, listener);

    const cleanup = () => {
      ipcRenderer.removeListener(CHANNELS.UNCHAIN.STREAM_EVENT, listener);
    };

    activeMisoStreamCleanups.set(requestId, cleanup);
  };

  const registerMisoStreamV2Listener = (requestId, handlers = {}) => {
    const listener = (_event, envelope = {}) => {
      if (envelope.requestId !== requestId) {
        return;
      }

      const eventName = envelope.event;
      const data = envelope.data || {};

      if (eventName === "frame") {
        const frameType = data.type;
        const payload = data.payload || {};

        // Forward every frame to onFrame for trace chain processing
        if (typeof handlers.onFrame === "function") {
          handlers.onFrame(data);
        }

        // --- Old protocol: stream_started (synthetic metadata frame) ---
        if (frameType === "stream_started") {
          if (typeof handlers.onMeta === "function") {
            handlers.onMeta({
              thread_id: data.thread_id,
              model: payload.model,
              ...payload,
            });
          }
          return;
        }

        // --- New protocol: run.start (metadata frame) ---
        if (frameType === "run.start") {
          if (typeof handlers.onMeta === "function") {
            handlers.onMeta({
              thread_id: data.thread_id,
              run_id: data.run_id,
              model: payload.model,
              ...payload,
            });
          }
          return;
        }

        // --- Old protocol: token_delta / New protocol: token ---
        if (frameType === "token_delta" || frameType === "token") {
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          if (typeof handlers.onToken === "function") {
            handlers.onToken(delta);
          }
          return;
        }

        // --- Old protocol: done / New protocol: run.done ---
        if (frameType === "done" || frameType === "run.done") {
          if (typeof handlers.onDone === "function") {
            handlers.onDone(payload);
          }
          cleanupMisoStreamListener(requestId);
          return;
        }

        // --- Error (same in both protocols) ---
        if (frameType === "error") {
          if (typeof handlers.onError === "function") {
            handlers.onError({
              code: payload.code || "unknown",
              message: payload.message || "Unknown stream error",
            });
          }
          cleanupMisoStreamListener(requestId);
          return;
        }

        // --- New protocol event types handled via onFrame only ---
        // step, step.result, input.required, input.resolved,
        // branch.fork, branch.merge — all forwarded above via onFrame
        return;
      }

      if (eventName === "error") {
        if (typeof handlers.onError === "function") {
          handlers.onError({
            code: data.code || "unknown",
            message: data.message || "Unknown stream error",
          });
        }
        cleanupMisoStreamListener(requestId);
        return;
      }

      if (eventName === "done") {
        if (data.cancelled) {
          if (typeof handlers.onError === "function") {
            handlers.onError({
              code: "cancelled",
              message: "Stream was cancelled",
            });
          }
        } else if (typeof handlers.onDone === "function") {
          handlers.onDone(data);
        }
        cleanupMisoStreamListener(requestId);
      }
    };

    ipcRenderer.on(CHANNELS.UNCHAIN.STREAM_EVENT, listener);

    const cleanup = () => {
      ipcRenderer.removeListener(CHANNELS.UNCHAIN.STREAM_EVENT, listener);
    };

    activeMisoStreamCleanups.set(requestId, cleanup);
  };

  const startStream = (payload, handlers = {}) => {
    const requestId = createRequestId();
    registerMisoStreamListener(requestId, handlers);

    ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_START, {
      requestId,
      payload,
    });

    return {
      requestId,
      cancel: () => {
        ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_CANCEL, { requestId });
        cleanupMisoStreamListener(requestId);
      },
    };
  };

  const cancelStream = (requestId) => {
    if (typeof requestId !== "string" || !requestId.trim()) {
      return;
    }
    ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_CANCEL, { requestId });
    cleanupMisoStreamListener(requestId);
  };

  const startStreamV2 = (payload, handlers = {}) => {
    const requestId = createRequestId();
    registerMisoStreamV2Listener(requestId, handlers);

    ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_START_V2, {
      requestId,
      payload,
    });

    return {
      requestId,
      cancel: () => {
        ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_CANCEL, { requestId });
        cleanupMisoStreamListener(requestId);
      },
    };
  };

  return {
    startStream,
    cancelStream,
    startStreamV2,
    __debug: {
      getActiveListenerCount: () => activeMisoStreamCleanups.size,
      cleanupMisoStreamListener,
    },
  };
};

module.exports = {
  createMisoStreamClient,
  createRequestId,
};
