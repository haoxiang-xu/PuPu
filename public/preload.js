const { contextBridge, ipcRenderer } = require("electron");

const runtimeInfo = {
  isElectron: true,
  platform: process.platform,
};

const activeMisoStreamCleanups = new Map();

const buildRequestId = () => {
  return `miso-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

  ipcRenderer.on("miso:stream:event", listener);

  const cleanup = () => {
    ipcRenderer.removeListener("miso:stream:event", listener);
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

    // v2: all SSE events arrive as "frame" with data being the full frame object
    if (eventName === "frame") {
      const frameType = data.type;
      const payload = data.payload || {};

      // Forward the full frame for trace display
      if (typeof handlers.onFrame === "function") {
        handlers.onFrame(data);
      }

      if (frameType === "stream_started") {
        if (typeof handlers.onMeta === "function") {
          // thread_id is on the outer frame, not the inner payload
          handlers.onMeta({
            thread_id: data.thread_id,
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

    // Transport-level error (not a frame)
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

    // Synthetic done from electron (fallback when server closed without done frame)
    if (eventName === "done") {
      if (data.cancelled) {
        // Cancelled - treat as error
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

  ipcRenderer.on("miso:stream:event", listener);

  const cleanup = () => {
    ipcRenderer.removeListener("miso:stream:event", listener);
  };

  activeMisoStreamCleanups.set(requestId, cleanup);
};

contextBridge.exposeInMainWorld("runtime", runtimeInfo);

contextBridge.exposeInMainWorld("osInfo", {
  platform: process.platform,
});

contextBridge.exposeInMainWorld("ollamaAPI", {
  getStatus: () => ipcRenderer.invoke("ollama-get-status"),
  restart: () => ipcRenderer.invoke("ollama-restart"),
});

contextBridge.exposeInMainWorld("ollamaLibraryAPI", {
  search: (query, category) =>
    ipcRenderer.invoke("ollama:library-search", { query, category }),
});

contextBridge.exposeInMainWorld("misoAPI", {
  getStatus: () => ipcRenderer.invoke("miso:get-status"),
  getModelCatalog: () => ipcRenderer.invoke("miso:get-model-catalog"),
  getToolkitCatalog: () => ipcRenderer.invoke("miso:get-toolkit-catalog"),
  pickWorkspaceRoot: (defaultPath = "") =>
    ipcRenderer.invoke("miso:pick-workspace-root", { defaultPath }),
  validateWorkspaceRoot: (path = "") =>
    ipcRenderer.invoke("miso:validate-workspace-root", { path }),
  startStream: (payload, handlers = {}) => {
    const requestId = buildRequestId();
    registerMisoStreamListener(requestId, handlers);

    ipcRenderer.send("miso:stream:start", {
      requestId,
      payload,
    });

    return {
      requestId,
      cancel: () => {
        ipcRenderer.send("miso:stream:cancel", { requestId });
        cleanupMisoStreamListener(requestId);
      },
    };
  },
  cancelStream: (requestId) => {
    if (typeof requestId !== "string" || !requestId.trim()) {
      return;
    }
    ipcRenderer.send("miso:stream:cancel", { requestId });
    cleanupMisoStreamListener(requestId);
  },
  startStreamV2: (payload, handlers = {}) => {
    const requestId = buildRequestId();
    registerMisoStreamV2Listener(requestId, handlers);

    ipcRenderer.send("miso:stream:start-v2", {
      requestId,
      payload,
    });

    return {
      requestId,
      cancel: () => {
        ipcRenderer.send("miso:stream:cancel", { requestId });
        cleanupMisoStreamListener(requestId);
      },
    };
  },
});

contextBridge.exposeInMainWorld("themeAPI", {
  setBackgroundColor: (color) => {
    ipcRenderer.send("theme-set-background-color", color);
  },
  setThemeMode: (mode) => {
    ipcRenderer.send("theme-set-mode", mode);
  },
});

contextBridge.exposeInMainWorld("windowStateAPI", {
  windowStateEventHandler: (action) => {
    ipcRenderer.send("window-state-event-handler", action);
  },
  windowStateEventListener: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, payload) => {
      callback(payload || { isMaximized: false });
    };
    ipcRenderer.on("window-state-event-listener", listener);

    return () => {
      ipcRenderer.removeListener("window-state-event-listener", listener);
    };
  },
});
