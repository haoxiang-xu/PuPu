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

const createFakeHttps = (body = "") => {
  const calls = [];
  return {
    calls,
    get(url, _opts, cb) {
      calls.push(url);
      const res = {
        on(event, fn) {
          if (event === "data") fn(body);
          if (event === "end") fn();
          return res;
        },
      };
      cb(res);
      const req = {
        setTimeout: jest.fn(),
        on: jest.fn(() => req),
        destroy: jest.fn(),
      };
      return req;
    },
  };
};

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

describe("ollama service library", () => {
  const buildService = (https) =>
    createOllamaService({
      app: {},
      shell: {},
      spawn: jest.fn(),
      http: {},
      https,
      fs: {},
      path,
      net: {},
    });

  test("searchLibrary builds a query+category URL", async () => {
    const https = createFakeHttps("<html>ok</html>");
    const service = buildService(https);

    const result = await service.searchLibrary({ query: "q", category: "c" });

    expect(https.calls[0]).toBe("https://ollama.com/search?q=q&c=c");
    expect(result).toBe("<html>ok</html>");
  });

  test("sort=newest alone is enough to use the /search URL, mapped to o=newest", async () => {
    const https = createFakeHttps("");
    const service = buildService(https);

    await service.searchLibrary({ sort: "newest" });

    expect(https.calls[0]).toBe("https://ollama.com/search?o=newest");
  });

  test("BC-003 negative: an unrecognized sort value is never forwarded verbatim", async () => {
    const https = createFakeHttps("");
    const service = buildService(https);

    await service.searchLibrary({ query: "q", sort: "evil" });

    expect(https.calls[0]).toBe("https://ollama.com/search?q=q");
  });

  test("fetchLibraryTags fetches the library tags page for a valid name", async () => {
    const https = createFakeHttps("<html>tags</html>");
    const service = buildService(https);

    const result = await service.fetchLibraryTags({ name: "qwen3" });

    expect(https.calls[0]).toBe("https://ollama.com/library/qwen3/tags");
    expect(result).toBe("<html>tags</html>");
  });

  test("fetchLibraryTags rejects a path-traversal name before any network call", async () => {
    const https = createFakeHttps("");
    const service = buildService(https);

    await expect(service.fetchLibraryTags({ name: "../x" })).rejects.toThrow(
      "invalid model name",
    );
    expect(https.calls).toHaveLength(0);
  });

  test("fetchLibraryTags rejects a missing name before any network call", async () => {
    const https = createFakeHttps("");
    const service = buildService(https);

    await expect(service.fetchLibraryTags({})).rejects.toThrow(
      "invalid model name",
    );
    expect(https.calls).toHaveLength(0);
  });
});
