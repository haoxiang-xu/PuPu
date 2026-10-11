const {
  buildSkeletonResourceRequest,
} = require("../../main/services/unchain/service");

describe("Skeleton resource main-process request builder", () => {
  test("maps every supported action to a fixed method and route", () => {
    const shared = {
      resource_id: "agent/one",
      workflow_id: "workflow/two",
      revision_id: "revision three",
      expected_edit_token: "edit-1",
      name: "Renamed",
      new_id: "copy",
      document: { id: "agent-one" },
      legacy_kernel: { schema_version: 1 },
      method: "DELETE",
      path: "/arbitrary",
    };

    expect(buildSkeletonResourceRequest("list", { include_archived: false })).toEqual({
      method: "GET",
      path: "/skeleton_resources?include_archived=false",
    });
    expect(buildSkeletonResourceRequest("get", shared)).toEqual({
      method: "GET",
      path: "/skeleton_resources/agent%2Fone",
    });
    expect(buildSkeletonResourceRequest("save", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources",
      body: { document: { id: "agent-one" }, expected_edit_token: "edit-1" },
    });
    expect(buildSkeletonResourceRequest("diagnose", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/diagnose",
      body: { document: { id: "agent-one" } },
    });
    expect(buildSkeletonResourceRequest("import", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/import",
      body: { document: { id: "agent-one" } },
    });
    expect(buildSkeletonResourceRequest("preflight", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/agent%2Fone/preflight",
      body: { legacy_kernel: { schema_version: 1 } },
    });
    /* The conversion writes the document, so it carries the compare-and-set
       token, and it carries the Kernel an inline legacy subagent needs to be
       materialised into an Agent graph. */
    expect(buildSkeletonResourceRequest("convert_legacy_pools", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/agent%2Fone/convert_legacy_pools",
      body: { expected_edit_token: "edit-1", legacy_kernel: { schema_version: 1 } },
    });
    expect(buildSkeletonResourceRequest("publish", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/agent%2Fone/publish",
      body: { expected_edit_token: "edit-1" },
    });
    expect(buildSkeletonResourceRequest("get_version", shared)).toEqual({
      method: "GET",
      path: "/skeleton_resources/workflow%2Ftwo/versions/revision%20three",
    });

    expect(buildSkeletonResourceRequest("rename", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/agent%2Fone/rename",
      body: { name: "Renamed", expected_edit_token: "edit-1" },
    });
    expect(buildSkeletonResourceRequest("duplicate", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/agent%2Fone/duplicate",
      body: { new_id: "copy", name: "Renamed" },
    });
    for (const action of ["archive", "restore"]) {
      expect(buildSkeletonResourceRequest(action, shared)).toEqual({
        method: "POST",
        path: `/skeleton_resources/agent%2Fone/${action}`,
        body: { expected_edit_token: "edit-1" },
      });
    }
    expect(buildSkeletonResourceRequest("delete", shared)).toEqual({
      method: "DELETE",
      path: "/skeleton_resources/agent%2Fone",
      body: { expected_edit_token: "edit-1" },
    });
    expect(buildSkeletonResourceRequest("migrate", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/migrate",
      body: {},
    });
    expect(buildSkeletonResourceRequest("resolve", shared)).toEqual({
      method: "POST",
      path: "/skeleton_resources/resolve",
      body: {
        resource_id: "agent/one",
        revision_id: "revision three",
      },
    });
    expect(buildSkeletonResourceRequest("list_profiles", shared)).toEqual({
      method: "GET",
      path: "/skeleton_python_profiles",
    });
    expect(buildSkeletonResourceRequest("save_profile", {
      profile_id: "project", executable: "/venv/bin/python",
      expected_edit_token: "profile-edit", path: "/arbitrary",
    })).toEqual({
      method: "POST",
      path: "/skeleton_python_profiles",
      body: {
        profile_id: "project",
        executable: "/venv/bin/python",
        expected_edit_token: "profile-edit",
      },
    });
    expect(buildSkeletonResourceRequest("probe_profile", {
      profile_id: "project/name",
    })).toEqual({
      method: "POST",
      path: "/skeleton_python_profiles/project%2Fname/probe",
      body: {},
    });
    expect(buildSkeletonResourceRequest("delete_profile", {
      profile_id: "project/name", expected_edit_token: "profile-edit",
    })).toEqual({
      method: "DELETE",
      path: "/skeleton_python_profiles/project%2Fname",
      body: { expected_edit_token: "profile-edit" },
    });
  });

  test("rejects arbitrary routing and missing identifiers", () => {
    expect(() =>
      buildSkeletonResourceRequest("publish", {
        method: "DELETE",
        path: "/arbitrary",
      }),
    ).toThrow("resource_id is required");
    expect(() =>
      buildSkeletonResourceRequest("arbitrary", {
        method: "DELETE",
        path: "/arbitrary",
      }),
    ).toThrow("Unsupported Skeleton resource action");
    expect(buildSkeletonResourceRequest("save", [])).toEqual({
      method: "POST",
      path: "/skeleton_resources",
      body: {},
    });
  });
});
