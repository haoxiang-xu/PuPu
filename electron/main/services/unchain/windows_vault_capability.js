const { VAULT_SINK_KINDS } = require("../memory_vault/vault_sink_executor");

const WINDOWS_VAULT_CAPABILITY_PROTOCOL = 1;
const WINDOWS_VAULT_CAPABILITY_CONTAINMENT = "win32_job_list_v1";
const WINDOWS_VAULT_PROVENANCE_SCHEMA = "pupu.windows-vault-provenance.v1";
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const STATIC_CODE = /^vault_[a-z0-9_]{1,80}$/;
const RECEIPTS = new WeakSet();
const KNOWN_SINK_KINDS = new Set(VAULT_SINK_KINDS);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const hasExactKeys = (value, keys) =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const sameStringList = (left, right) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const staticCode = (value, fallback = "vault_worker_capability_unavailable") =>
  STATIC_CODE.test(String(value || "")) ? String(value) : fallback;

const isSinkCapability = (value) => {
  if (
    !hasExactKeys(value, ["containment", "enabled_sink_kinds", "protocol"]) ||
    value.containment !== WINDOWS_VAULT_CAPABILITY_CONTAINMENT ||
    value.protocol !== WINDOWS_VAULT_CAPABILITY_PROTOCOL ||
    !Array.isArray(value.enabled_sink_kinds)
  ) {
    return false;
  }
  const seen = new Set();
  for (const sinkKind of value.enabled_sink_kinds) {
    if (
      typeof sinkKind !== "string" ||
      !KNOWN_SINK_KINDS.has(sinkKind) ||
      seen.has(sinkKind)
    ) {
      return false;
    }
    seen.add(sinkKind);
  }
  return true;
};

const isProbe = (value) =>
  hasExactKeys(value, ["containment", "protocol", "supervisor_protocol", "worker_protocol"]) &&
  value.containment === WINDOWS_VAULT_CAPABILITY_CONTAINMENT &&
  value.protocol === WINDOWS_VAULT_CAPABILITY_PROTOCOL &&
  value.supervisor_protocol === WINDOWS_VAULT_CAPABILITY_PROTOCOL &&
  value.worker_protocol === WINDOWS_VAULT_CAPABILITY_PROTOCOL;

const isProvenance = (value) =>
  hasExactKeys(value, [
    "arch",
    "runtime_manifest_digest",
    "schema",
    "sidecar_sha256",
    "unchain_wheel_sha256",
  ]) &&
  value.arch === "x64" &&
  value.schema === WINDOWS_VAULT_PROVENANCE_SCHEMA &&
  SHA256.test(value.runtime_manifest_digest) &&
  SHA256.test(value.sidecar_sha256) &&
  SHA256.test(value.unchain_wheel_sha256);

const createWindowsVaultCapabilityReceipt = ({
  broker,
  capability,
  probe,
  provenance,
} = {}) => {
  if (
    !isSinkCapability(capability) ||
    !isProbe(probe) ||
    !isProvenance(provenance) ||
    !hasExactKeys(broker, ["protocol", "sink_kinds"]) ||
    broker.protocol !== WINDOWS_VAULT_CAPABILITY_PROTOCOL ||
    !Array.isArray(broker.sink_kinds) ||
    !sameStringList(broker.sink_kinds, capability.enabled_sink_kinds)
  ) {
    throw new Error("windows vault capability receipt is invalid");
  }

  const receipt = Object.freeze({
    broker: Object.freeze({
      protocol: broker.protocol,
      sink_kinds: Object.freeze([...broker.sink_kinds]),
    }),
    capability: Object.freeze({
      containment: capability.containment,
      enabled_sink_kinds: Object.freeze([...capability.enabled_sink_kinds]),
      protocol: capability.protocol,
    }),
    probe: Object.freeze({ ...probe }),
    provenance: Object.freeze({
      arch: provenance.arch,
      runtime_manifest_digest: provenance.runtime_manifest_digest,
      schema: provenance.schema,
      sidecar_sha256: provenance.sidecar_sha256,
      unchain_wheel_sha256: provenance.unchain_wheel_sha256,
    }),
  });
  RECEIPTS.add(receipt);
  return receipt;
};

const createWindowsVaultCapabilityLatch = ({ platform = process.platform } = {}) => {
  let status = platform === "win32" ? "pending" : "not_applicable";
  let reason = "";

  const snapshot = () => Object.freeze({ reason, status });
  const becomeUnavailable = (code) => {
    if (status === "pending") {
      status = "unavailable";
      reason = staticCode(code);
    }
    return snapshot();
  };

  return Object.freeze({
    configure: (receipt) => {
      if (status !== "pending") return snapshot();
      if (!RECEIPTS.has(receipt)) {
        return becomeUnavailable("vault_worker_capability_invalid");
      }
      status = "ready";
      reason = "";
      return snapshot();
    },
    finalizePending: (code = "vault_worker_capability_unconfigured") =>
      becomeUnavailable(code),
    getStatus: snapshot,
    markLost: (code = "vault_worker_containment_lost") => {
      if (status === "pending") return becomeUnavailable(code);
      if (status === "ready") {
        status = "lost";
        reason = staticCode(code, "vault_worker_containment_lost");
      }
      return snapshot();
    },
  });
};

module.exports = {
  WINDOWS_VAULT_CAPABILITY_CONTAINMENT,
  WINDOWS_VAULT_CAPABILITY_PROTOCOL,
  WINDOWS_VAULT_PROVENANCE_SCHEMA,
  createWindowsVaultCapabilityLatch,
  createWindowsVaultCapabilityReceipt,
};
