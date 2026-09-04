const {
  WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
  WINDOWS_VAULT_CAPABILITY_PROTOCOL,
  WINDOWS_VAULT_PROVENANCE_SCHEMA,
  createWindowsVaultCapabilityLatch,
  createWindowsVaultCapabilityReceipt,
} = require("../../main/services/unchain/windows_vault_capability");

const digest = (digit) => `sha256:${digit.repeat(64)}`;

const validReceipt = () =>
  createWindowsVaultCapabilityReceipt({
    broker: {
      protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
      sink_kinds: [],
    },
    capability: {
      containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
      enabled_sink_kinds: [],
      protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
    },
    probe: {
      containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
      protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
      supervisor_protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
      worker_protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
    },
    provenance: {
      arch: "x64",
      runtime_manifest_digest: digest("a"),
      schema: WINDOWS_VAULT_PROVENANCE_SCHEMA,
      sidecar_sha256: digest("b"),
      unchain_wheel_sha256: digest("c"),
    },
  });

describe("Windows Vault capability latch", () => {
  test("admits only a locally sealed exact receipt and does not expose it in status", () => {
    const latch = createWindowsVaultCapabilityLatch({ platform: "win32" });

    expect(latch.getStatus()).toEqual({ reason: "", status: "pending" });
    expect(latch.configure(validReceipt())).toEqual({ reason: "", status: "ready" });
    expect(latch.getStatus()).toEqual({ reason: "", status: "ready" });
  });

  test("rejects Boolean and lookalike receipts as terminal unavailable", () => {
    const latch = createWindowsVaultCapabilityLatch({ platform: "win32" });
    const lookalike = {
      broker: { protocol: 1, sink_kinds: [] },
      capability: {
        containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
        enabled_sink_kinds: [],
        protocol: 1,
      },
      probe: {
        containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
        protocol: 1,
        supervisor_protocol: 1,
        worker_protocol: 1,
      },
      provenance: {
        arch: "x64",
        runtime_manifest_digest: digest("a"),
        schema: WINDOWS_VAULT_PROVENANCE_SCHEMA,
        sidecar_sha256: digest("b"),
        unchain_wheel_sha256: digest("c"),
      },
    };

    expect(latch.configure(true)).toEqual({
      reason: "vault_worker_capability_invalid",
      status: "unavailable",
    });
    expect(latch.configure(lookalike)).toEqual({
      reason: "vault_worker_capability_invalid",
      status: "unavailable",
    });
  });

  test("validates the closed receipt shape before sealing it", () => {
    expect(() =>
      createWindowsVaultCapabilityReceipt({
        broker: { protocol: 1, sink_kinds: [] },
        capability: {
          containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
          enabled_sink_kinds: ["unknown"],
          protocol: 1,
        },
        probe: {},
        provenance: {},
      }),
    ).toThrow("windows vault capability receipt is invalid");
  });

  test("requires the immutable Unchain wheel digest in provenance", () => {
    const receipt = {
      broker: { protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL, sink_kinds: [] },
      capability: {
        containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
        enabled_sink_kinds: [],
        protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
      },
      probe: {
        containment: WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
        protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
        supervisor_protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
        worker_protocol: WINDOWS_VAULT_CAPABILITY_PROTOCOL,
      },
      provenance: {
        arch: "x64",
        runtime_manifest_digest: digest("a"),
        schema: WINDOWS_VAULT_PROVENANCE_SCHEMA,
        sidecar_sha256: digest("b"),
      },
    };

    expect(() => createWindowsVaultCapabilityReceipt(receipt)).toThrow(
      "windows vault capability receipt is invalid",
    );
  });

  test("unconfigured startup and structural loss are irreversible in one app lifecycle", () => {
    const unconfigured = createWindowsVaultCapabilityLatch({ platform: "win32" });
    expect(unconfigured.finalizePending()).toEqual({
      reason: "vault_worker_capability_unconfigured",
      status: "unavailable",
    });
    expect(unconfigured.configure(validReceipt())).toEqual({
      reason: "vault_worker_capability_unconfigured",
      status: "unavailable",
    });

    const ready = createWindowsVaultCapabilityLatch({ platform: "win32" });
    ready.configure(validReceipt());
    expect(ready.markLost("vault_worker_containment_lost")).toEqual({
      reason: "vault_worker_containment_lost",
      status: "lost",
    });
    expect(ready.configure(validReceipt())).toEqual({
      reason: "vault_worker_containment_lost",
      status: "lost",
    });
  });

  test("is not applicable outside Windows", () => {
    const latch = createWindowsVaultCapabilityLatch({ platform: "darwin" });
    expect(latch.getStatus()).toEqual({ reason: "", status: "not_applicable" });
    expect(latch.configure(validReceipt())).toEqual({
      reason: "",
      status: "not_applicable",
    });
  });
});
