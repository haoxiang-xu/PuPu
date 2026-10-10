const { createMisoBridge } = require("../../preload/bridges/unchain_bridge");
const { CHANNELS } = require("../../shared/channels");

describe("Skeleton resource preload bridge", () => {
  test("exposes fixed operations without renderer-controlled method or path", async () => {
    const ipcRenderer = { invoke: jest.fn(() => Promise.resolve({ schema: "pupu.skeleton-resource-response.v1", ok: true, data: { ok: true } })) };
    const bridge = createMisoBridge(ipcRenderer, {
      startStream: jest.fn(),
      cancelStream: jest.fn(),
      cancelExecution: jest.fn(),
      startStreamV2: jest.fn(),
      startStreamV4: jest.fn(),
      attachStreamV4: jest.fn(),
    });

    await bridge.saveSkeletonResource({ document: { id: "agent" }, expected_edit_token: "edit-1" });
    await bridge.importSkeletonResource({ id: "imported" });
    await bridge.preflightSkeletonResource("agent", { schema_version: 1 });
    await bridge.publishSkeletonWorkflow("workflow/id", "edit-2");
    await bridge.getSkeletonWorkflowVersion("workflow/id", "rev/1");
    await bridge.resolveSkeletonResource({ legacy_name: "Default", source_scope: "recipes" });

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "save",
        payload: { document: { id: "agent" }, expected_edit_token: "edit-1" },
      }],
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "import",
        payload: { document: { id: "imported" } },
      }],
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "preflight",
        payload: { resource_id: "agent", legacy_kernel: { schema_version: 1 } },
      }],
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "publish",
        payload: {
          resource_id: "workflow/id",
          expected_edit_token: "edit-2",
        },
      }],
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "get_version",
        payload: {
          workflow_id: "workflow/id",
          revision_id: "rev/1",
        },
      }],
      [CHANNELS.UNCHAIN.SKELETON_RESOURCE_COMMAND, {
        action: "resolve",
        payload: { legacy_name: "Default", source_scope: "recipes" },
      }],
    ]);
    for (const [, command] of ipcRenderer.invoke.mock.calls) {
      expect(command).not.toHaveProperty("method");
      expect(command).not.toHaveProperty("path");
      expect(command).not.toHaveProperty("url");
    }
  });

  test("normalizes archived listing to one boolean", async () => {
    const ipcRenderer = { invoke: jest.fn(() => Promise.resolve({ schema: "pupu.skeleton-resource-response.v1", ok: true, data: { resources: [] } })) };
    const bridge = createMisoBridge(ipcRenderer, {});
    expect(await bridge.listSkeletonResources(false)).toEqual({ resources: [] });
    await bridge.listSkeletonResources("false");
    expect(ipcRenderer.invoke.mock.calls.map((call) => call[1])).toEqual([
      { action: "list", payload: { include_archived: false } },
      { action: "list", payload: { include_archived: false } },
    ]);
  });

  test("exposes fixed Python profile operations", async () => {
    const ipcRenderer = { invoke: jest.fn(() => Promise.resolve({ schema: "pupu.skeleton-resource-response.v1", ok: true, data: { ok: true } })) };
    const bridge = createMisoBridge(ipcRenderer, {});
    await bridge.listSkeletonPythonProfiles();
    await bridge.saveSkeletonPythonProfile({
      profile_id: "project", executable: "/venv/bin/python",
    });
    await bridge.probeSkeletonPythonProfile("project");
    await bridge.deleteSkeletonPythonProfile("project", "edit-1");
    expect(ipcRenderer.invoke.mock.calls.map((call) => call[1])).toEqual([
      { action: "list_profiles", payload: {} },
      {
        action: "save_profile",
        payload: { profile_id: "project", executable: "/venv/bin/python" },
      },
      { action: "probe_profile", payload: { profile_id: "project" } },
      {
        action: "delete_profile",
        payload: { profile_id: "project", expected_edit_token: "edit-1" },
      },
    ]);
  });
});


describe("Skeleton bridge strict reply decoding", () => {
  test("restores conflict fields instead of exposing the IPC envelope", async () => {
    const ipcRenderer = { invoke: async () => ({ schema: "pupu.skeleton-resource-response.v1", ok: false,
      error: { code: "edit_conflict", path: ["expected_edit_token"], message: "Reload before saving.", status: 409 } }) };
    await expect(createMisoBridge(ipcRenderer, {}).saveSkeletonResource({})).rejects.toMatchObject({
      code: "edit_conflict", path: ["expected_edit_token"], message: "Reload before saving.", status: 409,
    });
  });

  test("rejects an old main-process response instead of claiming success", async () => {
    const ipcRenderer = { invoke: async () => ({ resources: [] }) };
    await expect(createMisoBridge(ipcRenderer, {}).listSkeletonResources()).rejects.toMatchObject({ code: "skeleton_resource_protocol_error" });
  });
});
