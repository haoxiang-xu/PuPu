import { api } from "./api";

describe("api.unchain Skeleton resource methods", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.unchainAPI = {
      listSkeletonResources: jest.fn(async () => ({
        resources: [{ id: "workflow", kind: "workflow" }],
      })),
      saveSkeletonResource: jest.fn(async (payload) => payload),
      importSkeletonResource: jest.fn(async (document) => ({ document })),
      preflightSkeletonResource: jest.fn(async (resourceId, legacyKernel) => ({
        id: resourceId,
        legacyKernel,
        definition_digest: "digest",
      })),
      publishSkeletonWorkflow: jest.fn(async (resourceId, editToken) => ({
        workflow_id: resourceId,
        expected_edit_token: editToken,
      })),
      resolveSkeletonResource: jest.fn(async (payload) => payload),
      listSkeletonPythonProfiles: jest.fn(async () => ({
        profiles: [{ id: "builtin", kind: "bundled" }],
      })),
      saveSkeletonPythonProfile: jest.fn(async (payload) => payload),
      probeSkeletonPythonProfile: jest.fn(async (profileId) => ({
        id: profileId, ok: true,
      })),
      deleteSkeletonPythonProfile: jest.fn(async () => ({ ok: true })),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("normalizes lists and preserves fixed resource arguments", async () => {
    await expect(api.unchain.listSkeletonResources(false)).resolves.toEqual({
      resources: [{ id: "workflow", kind: "workflow" }],
    });
    expect(window.unchainAPI.listSkeletonResources).toHaveBeenCalledWith(false);

    await api.unchain.preflightSkeletonResource("workflow", { schema_version: 1 });
    await api.unchain.publishSkeletonWorkflow("workflow", "edit-1");
    expect(window.unchainAPI.preflightSkeletonResource).toHaveBeenCalledWith(
      "workflow",
      { schema_version: 1 },
    );
    expect(window.unchainAPI.publishSkeletonWorkflow).toHaveBeenCalledWith(
      "workflow",
      "edit-1",
    );
  });

  test("normalizes non-object mutation payloads before crossing the bridge", async () => {
    await api.unchain.saveSkeletonResource([]);
    await api.unchain.resolveSkeletonResource("Default");
    await api.unchain.importSkeletonResource({ id: "imported" });
    expect(window.unchainAPI.saveSkeletonResource).toHaveBeenCalledWith({});
    expect(window.unchainAPI.resolveSkeletonResource).toHaveBeenCalledWith({});
    expect(window.unchainAPI.importSkeletonResource).toHaveBeenCalledWith({
      id: "imported",
    });
  });

  test("forwards host-local Python profile operations", async () => {
    await expect(api.unchain.listSkeletonPythonProfiles()).resolves.toEqual({
      profiles: [{ id: "builtin", kind: "bundled" }],
    });
    await api.unchain.saveSkeletonPythonProfile({
      profile_id: "project", executable: "/venv/bin/python",
    });
    await api.unchain.probeSkeletonPythonProfile("project");
    await api.unchain.deleteSkeletonPythonProfile("project", "edit-1");
    expect(window.unchainAPI.probeSkeletonPythonProfile).toHaveBeenCalledWith("project");
    expect(window.unchainAPI.deleteSkeletonPythonProfile).toHaveBeenCalledWith(
      "project",
      "edit-1",
    );
  });
});

describe("making the legacy Subagent Pool conversion permanent", () => {
  const original = window.unchainAPI;

  afterEach(() => {
    window.unchainAPI = original;
  });

  test("it carries the resource, the edit token and the chosen Kernel", async () => {
    window.unchainAPI = {
      convertSkeletonLegacyPools: jest.fn(async () => ({
        id: "agent", kind: "agent", document: {}, diagnostics: [],
      })),
    };
    await api.unchain.convertSkeletonLegacyPools("agent", "edit-1", { schema_version: 1 });
    expect(window.unchainAPI.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "agent", "edit-1", { schema_version: 1 },
    );
  });

  test("a Kernel that is not an object is sent as none rather than as itself", async () => {
    /* An inline legacy subagent needs a real Kernel; anything else is the
       absence of one, and the store refuses that with its own code instead of
       being handed a shape to validate. */
    window.unchainAPI = {
      convertSkeletonLegacyPools: jest.fn(async () => ({ id: "agent" })),
    };
    await api.unchain.convertSkeletonLegacyPools("agent", "edit-1", "gpt-4.1");
    expect(window.unchainAPI.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "agent", "edit-1", null,
    );
  });
});
