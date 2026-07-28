const { CHANNELS } = require("../../shared/channels");

const createRequestId = () =>
  `unchain-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createAttachmentId = () =>
  `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

        if (typeof handlers.onFrame === "function") {
          handlers.onFrame(data);
        }

        if (frameType === "stream_started") {
          if (typeof handlers.onMeta === "function") {
            handlers.onMeta({
              thread_id: payload.thread_id || data.thread_id,
              model: payload.model,
              ...payload,
            });
          }
          return;
        }

        if (frameType === "token_delta") {
          const delta = typeof payload.delta === "string" ? payload.delta : "";
          if (typeof handlers.onToken === "function") {
            handlers.onToken(delta);
          }
          return;
        }

        if (frameType === "done") {
          if (typeof handlers.onDone === "function") {
            handlers.onDone(payload);
          }
          cleanupMisoStreamListener(requestId);
          return;
        }

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

  const registerRuntimeEventStreamListener = (
    requestId,
    handlers = {},
    observer = {},
  ) => {
    cleanupMisoStreamListener(requestId);

    let cleaned = false;
    let listener = null;
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      if (listener) {
        ipcRenderer.removeListener(CHANNELS.UNCHAIN.STREAM_EVENT, listener);
      }
      if (activeMisoStreamCleanups.get(requestId) === cleanup) {
        activeMisoStreamCleanups.delete(requestId);
      }
    };

    listener = (_event, envelope = {}) => {
      if (envelope.requestId !== requestId) {
        return;
      }

      if (typeof observer.onEnvelope === "function") {
        observer.onEnvelope(envelope);
      }

      const eventName = envelope.event;
      const data = envelope.data || {};

      if (eventName === "runtime_event") {
        if (typeof handlers.onRuntimeEvent === "function") {
          const streamSeq = Number(envelope.streamSeq || 0);
          if (streamSeq > 0) {
            handlers.onRuntimeEvent(data, { streamSeq });
          } else {
            handlers.onRuntimeEvent(data);
          }
        }
        return;
      }

      if (eventName === "error") {
        if (typeof handlers.onError === "function") {
          handlers.onError({
            code: data.code || "unknown",
            message: data.message || "Unknown stream error",
          });
        }
        cleanup();
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
        cleanup();
      }
    };

    ipcRenderer.on(CHANNELS.UNCHAIN.STREAM_EVENT, listener);
    activeMisoStreamCleanups.set(requestId, cleanup);
    return cleanup;
  };

  const registerMisoStreamV4Listener = (
    requestId,
    handlers = {},
    observer = {},
  ) => registerRuntimeEventStreamListener(requestId, handlers, observer);

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

  const cancelExecution = (payload = {}) =>
    ipcRenderer.invoke(CHANNELS.UNCHAIN.CANCEL_EXECUTION, payload);

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

  const startStreamV4 = (payload, handlers = {}) => {
    const requestId = createRequestId();
    const attachmentId = createAttachmentId();
    const requestPayload =
      payload && typeof payload === "object" ? { ...payload } : {};
    const attemptIdCandidate =
      requestPayload.attempt_id ?? requestPayload.attemptId;
    const requestedAttemptId =
      typeof attemptIdCandidate === "string" ? attemptIdCandidate.trim() : "";
    const attemptId = requestedAttemptId || requestId;
    const executionIdCandidate =
      requestPayload.execution_id ??
      requestPayload.executionId ??
      requestPayload.session_id ??
      requestPayload.sessionId ??
      requestPayload.threadId ??
      requestPayload.thread_id;
    const executionId =
      typeof executionIdCandidate === "string"
        ? executionIdCandidate.trim()
        : "";

    const listenerCleanup = registerMisoStreamV4Listener(requestId, handlers);

    ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_START_V4, {
      requestId,
      attachmentId,
      payload: {
        ...requestPayload,
        attempt_id: attemptId,
      },
    });

    const detach = () => {
      ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_DETACH, {
        requestId,
        executionId,
        attemptId,
        attachmentId,
      });
      listenerCleanup();
    };

    const cancel = () => {
      ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_CANCEL, { requestId });
      listenerCleanup();
    };

    return {
      requestId,
      executionId,
      attemptId,
      attachmentId,
      detach,
      disconnect: cancel,
      cancel,
    };
  };

  const attachStreamV4 = async (payload = {}, handlers = {}) => {
    const requestIdCandidate = payload.requestId ?? payload.request_id;
    const executionIdCandidate =
      payload.executionId ??
      payload.execution_id ??
      payload.sessionId ??
      payload.session_id;
    const attemptIdCandidate = payload.attemptId ?? payload.attempt_id;
    const requestId =
      typeof requestIdCandidate === "string" ? requestIdCandidate.trim() : "";
    const executionId =
      typeof executionIdCandidate === "string"
        ? executionIdCandidate.trim()
        : "";
    const attemptId =
      typeof attemptIdCandidate === "string" ? attemptIdCandidate.trim() : "";
    const afterSeqCandidate = payload.afterSeq ?? payload.after_seq;
    const afterSeq = Number.isInteger(Number(afterSeqCandidate))
      ? Math.max(0, Number(afterSeqCandidate))
      : 0;
    const attachmentId = createAttachmentId();

    if (!requestId || !executionId || !attemptId) {
      const error = new TypeError(
        "request_id, execution_id, and attempt_id are required to attach a stream",
      );
      error.code = "invalid_stream_attach_identity";
      throw error;
    }

    let highestObservedStreamSeq = 0;
    let pendingReplayDelivery = null;
    const listenerCleanup = registerMisoStreamV4Listener(
      requestId,
      handlers,
      {
        onEnvelope: (envelope) => {
          const streamSeq = Number(envelope?.streamSeq || 0);
          if (
            Number.isInteger(streamSeq) &&
            streamSeq > highestObservedStreamSeq
          ) {
            highestObservedStreamSeq = streamSeq;
          }
          if (
            pendingReplayDelivery &&
            highestObservedStreamSeq >= pendingReplayDelivery.targetSeq
          ) {
            const { resolve, timeoutId } = pendingReplayDelivery;
            pendingReplayDelivery = null;
            clearTimeout(timeoutId);
            resolve();
          }
        },
      },
    );
    let result;
    try {
      result = await ipcRenderer.invoke(CHANNELS.UNCHAIN.STREAM_ATTACH_V4, {
        requestId,
        executionId,
        attemptId,
        attachmentId,
        afterSeq,
      });
    } catch (error) {
      listenerCleanup();
      throw error;
    }
    if (!result?.ok) {
      listenerCleanup();
      const error = new Error(result?.message || "Unable to attach stream");
      error.code = result?.code || "stream_attach_failed";
      error.details = result || null;
      throw error;
    }

    const replayedThroughSeq = Number(result.replayed_through_seq || 0);
    if (
      Number.isInteger(replayedThroughSeq) &&
      replayedThroughSeq > highestObservedStreamSeq
    ) {
      try {
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            pendingReplayDelivery = null;
            const error = new Error(
              "Timed out while delivering the attached stream replay",
            );
            error.code = "stream_replay_delivery_timeout";
            error.details = {
              request_id: requestId,
              execution_id: executionId,
              attempt_id: attemptId,
              replayed_through_seq: replayedThroughSeq,
              observed_through_seq: highestObservedStreamSeq,
            };
            reject(error);
          }, 1000);
          pendingReplayDelivery = {
            targetSeq: replayedThroughSeq,
            timeoutId,
            resolve,
          };
          if (highestObservedStreamSeq >= replayedThroughSeq) {
            pendingReplayDelivery = null;
            clearTimeout(timeoutId);
            resolve();
          }
        });
      } catch (error) {
        listenerCleanup();
        throw error;
      }
    }

    const detach = () => {
      ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_DETACH, {
        requestId,
        executionId,
        attemptId,
        attachmentId,
      });
      listenerCleanup();
    };
    const cancel = () => {
      ipcRenderer.send(CHANNELS.UNCHAIN.STREAM_CANCEL, { requestId });
      listenerCleanup();
    };
    return {
      requestId,
      executionId,
      attemptId,
      attachmentId,
      replayedThroughSeq,
      active: result.active === true,
      terminal: result.terminal === true,
      detach,
      disconnect: cancel,
      cancel,
    };
  };

  return {
    startStream,
    cancelStream,
    cancelExecution,
    startStreamV2,
    startStreamV4,
    attachStreamV4,
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
