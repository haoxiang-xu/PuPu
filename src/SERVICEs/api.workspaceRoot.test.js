import { api } from "./api";

const writeSettings = (settings) => {
  window.localStorage.setItem("settings", JSON.stringify(settings || {}));
};

describe("api.miso.startStream workspace root injection", () => {
  const originalMisoApi = window.misoAPI;

  beforeEach(() => {
    window.localStorage.clear();
    window.misoAPI = {
      startStream: jest.fn(() => ({ cancel: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.misoAPI = originalMisoApi;
  });

  test("does not inject workspace root when runtime setting is missing", () => {
    api.miso.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    expect(window.misoAPI.startStream).toHaveBeenCalledTimes(1);
    const [payload] = window.misoAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBeUndefined();
    expect(payload.options.workspace_root).toBeUndefined();
  });

  test("injects workspace root from settings.runtime.workspace_root", () => {
    writeSettings({
      runtime: {
        workspace_root: "   /tmp/demo-workspace   ",
      },
    });

    api.miso.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.misoAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(payload.options.workspace_root).toBe("/tmp/demo-workspace");
  });

  test("prefers explicit payload workspace root over global runtime root", () => {
    writeSettings({
      runtime: {
        workspace_root: "/tmp/global-root",
      },
    });

    api.miso.startStream({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        workspaceRoot: "/tmp/request-root",
      },
    });

    const [payload] = window.misoAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBe("/tmp/request-root");
    expect(payload.options.workspace_root).toBeUndefined();
  });

  test("ignores blank runtime workspace root values", () => {
    writeSettings({
      runtime: {
        workspace_root: "   ",
      },
    });

    api.miso.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.misoAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBeUndefined();
    expect(payload.options.workspace_root).toBeUndefined();
  });
});

