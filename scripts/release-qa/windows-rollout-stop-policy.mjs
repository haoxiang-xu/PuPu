const SHA256 = /^sha256:[0-9a-f]{64}$/;
const POLICY_SCHEMA = "pupu.windows-rollout-stop-policy.v1";
const CHANNELS = Object.freeze(["internal", "public"]);
const STOP_ACTIONS = Object.freeze([
  "stop_new_admission",
  "stop_vault_use",
  "install_shadow_descendant",
]);

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, keys, label) => {
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(
    (key) => Object.prototype.hasOwnProperty.call(value, key),
  )) {
    throw new Error(`${label} must have exact keys`);
  }
};

const exactArray = (value, expected, label) => {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`${label} must be exact`);
  }
};

export function validateWindowsRolloutStopPolicy(policy) {
  exactKeys(policy, ["channels", "schema"], "stop policy");
  if (policy.schema !== POLICY_SCHEMA) {
    throw new Error("stop policy schema is invalid");
  }
  exactKeys(policy.channels, CHANNELS, "stop policy channels");
  const requiredAuthorities = {
    internal: "managed_device_force_install",
    public: "signed_remote_stop_or_forced_update",
  };
  for (const channel of CHANNELS) {
    const definition = policy.channels[channel];
    exactKeys(
      definition,
      ["authority", "promotion_allowed", "required_authority", "rollback_mode", "stop_actions"],
      `stop policy ${channel}`,
    );
    if (definition.required_authority !== requiredAuthorities[channel]) {
      throw new Error(`stop policy ${channel} authority requirement is invalid`);
    }
    if (definition.authority !== "unavailable" || definition.promotion_allowed !== false) {
      throw new Error(`stop policy ${channel} must fail closed until authority is verified`);
    }
    if (definition.rollback_mode !== "shadow") {
      throw new Error(`stop policy ${channel} rollback must target Shadow`);
    }
    exactArray(definition.stop_actions, STOP_ACTIONS, `stop policy ${channel} actions`);
  }
  return Object.freeze({ schema: POLICY_SCHEMA, promotionAllowed: false });
}

export function validateShadowRollbackDescendant({ prior, rollback } = {}) {
  exactKeys(
    prior,
    ["build_identity_fingerprint", "payload_lineage_fingerprint", "release_snapshot_fingerprint"],
    "prior candidate",
  );
  exactKeys(
    rollback,
    ["build_identity_fingerprint", "payload_lineage_fingerprint", "release_snapshot_fingerprint", "rollout_mode"],
    "rollback candidate",
  );
  for (const [label, value] of [
    ["prior build identity", prior.build_identity_fingerprint],
    ["prior payload lineage", prior.payload_lineage_fingerprint],
    ["prior release snapshot", prior.release_snapshot_fingerprint],
    ["rollback build identity", rollback.build_identity_fingerprint],
    ["rollback payload lineage", rollback.payload_lineage_fingerprint],
    ["rollback release snapshot", rollback.release_snapshot_fingerprint],
  ]) {
    if (typeof value !== "string" || !SHA256.test(value)) {
      throw new Error(`${label} must be sha256`);
    }
  }
  if (rollback.rollout_mode !== "shadow") {
    throw new Error("rollback candidate must be Shadow");
  }
  if (rollback.payload_lineage_fingerprint !== prior.payload_lineage_fingerprint) {
    throw new Error("rollback candidate must retain payload lineage");
  }
  if (rollback.release_snapshot_fingerprint === prior.release_snapshot_fingerprint) {
    throw new Error("rollback candidate must use a new release snapshot");
  }
  if (rollback.build_identity_fingerprint === prior.build_identity_fingerprint) {
    throw new Error("rollback candidate must use a new build identity");
  }
  return Object.freeze({
    payloadLineage: rollback.payload_lineage_fingerprint,
    rollbackBuildIdentity: rollback.build_identity_fingerprint,
  });
}
