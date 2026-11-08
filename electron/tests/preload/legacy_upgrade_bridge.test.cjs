const { createLegacyUpgradeBridge } = require(
  "../../preload/bridges/legacy_upgrade_bridge",
);

describe("legacy upgrade preload bridge", () => {
  test("exposes only the four fixed operations and maps exact commands", () => {
    const invoke = jest.fn((command) => command);
    const api = createLegacyUpgradeBridge(invoke);

    expect(Object.keys(api).sort()).toEqual([
      "applySkeletonLegacyUpgrade",
      "getSkeletonLegacyUpgradeCapabilities",
      "inspectSkeletonLegacyUpgrade",
      "previewSkeletonLegacyUpgrade",
    ].sort());
    expect(api.getSkeletonLegacyUpgradeCapabilities()).toEqual({
      action: "legacy_upgrade_capabilities",
      payload: {},
    });

    const payload = { resource_id: "resource-1", expected_edit_token: "token" };
    expect(api.inspectSkeletonLegacyUpgrade(payload)).toEqual({
      action: "legacy_upgrade_inventory",
      payload,
    });
    expect(api.previewSkeletonLegacyUpgrade(payload)).toEqual({
      action: "legacy_upgrade_preview",
      payload,
    });
    expect(api.applySkeletonLegacyUpgrade(payload)).toEqual({
      action: "legacy_upgrade_apply",
      payload,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, {
      action: "legacy_upgrade_capabilities",
      payload: {},
    });
    expect(invoke).toHaveBeenNthCalledWith(2, {
      action: "legacy_upgrade_inventory",
      payload,
    });
    expect(invoke).toHaveBeenNthCalledWith(3, {
      action: "legacy_upgrade_preview",
      payload,
    });
    expect(invoke).toHaveBeenNthCalledWith(4, {
      action: "legacy_upgrade_apply",
      payload,
    });
    expect(invoke).toHaveBeenCalledTimes(4);
  });

  test("passes payload and successful return values through by identity", () => {
    const payload = Object.freeze({
      resource_id: "../unchanged",
      expected_edit_token: "token",
      extra: "preserved",
    });
    const result = Object.freeze({ response: "authoritative", payload_json: "{}" });
    const invoke = jest.fn(() => result);
    const api = createLegacyUpgradeBridge(invoke);

    expect(api.previewSkeletonLegacyUpgrade(payload)).toBe(result);
    expect(invoke.mock.calls[0][0].payload).toBe(payload);
    expect(Object.keys(invoke.mock.calls[0][0]).sort()).toEqual(["action", "payload"]);
  });

  test("capabilities and inventory are pass-through calls without implicit writes", () => {
    const invoke = jest.fn(() => "ok");
    const api = createLegacyUpgradeBridge(invoke);

    api.getSkeletonLegacyUpgradeCapabilities();
    api.inspectSkeletonLegacyUpgrade({ resource_id: "r" });

    expect(invoke.mock.calls.map(([command]) => command.action)).toEqual([
      "legacy_upgrade_capabilities",
      "legacy_upgrade_inventory",
    ]);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  test("does not retry or replace a rejected invocation", async () => {
    const refusal = Object.assign(new Error("stale token"), { code: "stale_edit_token" });
    const rejected = Promise.reject(refusal);
    const invoke = jest.fn(() => rejected);
    const api = createLegacyUpgradeBridge(invoke);
    const returned = api.applySkeletonLegacyUpgrade({ resource_id: "r" });

    expect(returned).toBe(rejected);
    await expect(returned).rejects.toBe(refusal);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
