import { api } from "./api";

const writeSettings = (settings) => {
  window.localStorage.setItem("settings", JSON.stringify(settings || {}));
};

describe("api.unchain.startStream workspace root injection", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    window.unchainAPI = {
      startStream: jest.fn(() => ({ cancel: jest.fn() })),
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("does not inject workspace root when runtime setting is missing", () => {
    api.unchain.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    expect(window.unchainAPI.startStream).toHaveBeenCalledTimes(1);
    const [payload] = window.unchainAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBeUndefined();
    expect(payload.options.workspace_root).toBeUndefined();
  });

  test("injects workspace root from settings.runtime.workspace_root", () => {
    writeSettings({
      runtime: {
        workspace_root: "   /tmp/demo-workspace   ",
      },
    });

    api.unchain.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBe("/tmp/demo-workspace");
    expect(payload.options.workspace_root).toBe("/tmp/demo-workspace");
  });

  test("prefers explicit payload workspace root over global runtime root", () => {
    writeSettings({
      runtime: {
        workspace_root: "/tmp/global-root",
      },
    });

    api.unchain.startStream({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        workspaceRoot: "/tmp/request-root",
      },
    });

    const [payload] = window.unchainAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBe("/tmp/request-root");
    expect(payload.options.workspace_root).toBeUndefined();
  });

  test("ignores blank runtime workspace root values", () => {
    writeSettings({
      runtime: {
        workspace_root: "   ",
      },
    });

    api.unchain.startStream({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStream.mock.calls[0];
    expect(payload.options.workspaceRoot).toBeUndefined();
    expect(payload.options.workspace_root).toBeUndefined();
  });

  test("does not inject workspace roots when disable_workspace_root is enabled", () => {
    writeSettings({
      runtime: {
        workspace_root: "/tmp/global-root",
      },
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        selectedWorkspaceIds: ["workspace-1"],
        disable_workspace_root: true,
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.disable_workspace_root).toBe(true);
    expect(payload.options.workspaceRoot).toBeUndefined();
    expect(payload.options.workspace_root).toBeUndefined();
    expect(payload.options.workspace_roots).toBeUndefined();
  });

  test("prefers selected workspaces before the global default root", () => {
    writeSettings({
      runtime: {
        workspace_root: "/tmp/global-root",
        workspaces: [
          {
            id: "workspace-1",
            name: "Project A",
            path: "/tmp/project-a",
          },
          {
            id: "workspace-2",
            name: "Project B",
            path: "/tmp/project-b",
          },
        ],
      },
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        selectedWorkspaceIds: ["workspace-2", "workspace-1"],
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.workspaceRoot).toBe("/tmp/project-b");
    expect(payload.options.workspace_root).toBe("/tmp/project-b");
    expect(payload.options.workspace_roots).toEqual([
      "/tmp/project-b",
      "/tmp/project-a",
      "/tmp/global-root",
    ]);
  });

  test("does not duplicate the global default root when it is selected", () => {
    writeSettings({
      runtime: {
        workspace_root: "/tmp/project-a",
        workspaces: [
          {
            id: "workspace-1",
            name: "Project A",
            path: "/tmp/project-a",
          },
        ],
      },
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        selectedWorkspaceIds: ["workspace-1"],
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.workspace_roots).toEqual(["/tmp/project-a"]);
  });
});
