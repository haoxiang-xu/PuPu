const path = require("path");
const { createOllamaService } = require("../../main/services/ollama/service");

const createBusyNet = () => ({
  createServer() {
    const listeners = new Map();
    return {
      unref() {},
      once(event, callback) {
        listeners.set(event, callback);
      },
      listen() {
        const onError = listeners.get("error");
        if (typeof onError === "function") {
          onError(new Error("EADDRINUSE"));
        }
      },
      close(callback) {
        if (typeof callback === "function") {
          callback();
        }
      },
    };
  },
});

const createRejectedHttp = () => ({
  get() {
    const req = {
      setTimeout: jest.fn(),
      on: jest.fn((event, callback) => {
        if (event === "error") {
          process.nextTick(() => callback(new Error("connect ECONNREFUSED")));
        }
        return req;
      }),
      destroy: jest.fn(),
    };
    return req;
  },
});

describe("ollama service", () => {
  test("does not treat a random listener on 11434 as a running Ollama instance", async () => {
    const spawn = jest.fn();

    const service = createOllamaService({
      app: {},
      shell: {},
      spawn,
      http: createRejectedHttp(),
      https: {},
      fs: {},
      path,
      net: createBusyNet(),
    });

    await service.startOllama();

    expect(spawn).not.toHaveBeenCalled();
    expect(service.getStatus()).toBe("error");
  });
});
