import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  validateShadowRollbackDescendant,
  validateWindowsRolloutStopPolicy,
} from "./windows-rollout-stop-policy.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const policy = JSON.parse(fs.readFileSync(
  path.join(ROOT, "contracts/memory-v2/windows-rollout-stop-policy.v1.json"),
  "utf8",
));
const hash = (digit) => `sha256:${digit.repeat(64)}`;
const prior = {
  build_identity_fingerprint: hash("1"),
  payload_lineage_fingerprint: hash("2"),
  release_snapshot_fingerprint: hash("3"),
};
const rollback = {
  build_identity_fingerprint: hash("4"),
  payload_lineage_fingerprint: hash("2"),
  release_snapshot_fingerprint: hash("5"),
  rollout_mode: "shadow",
};

test("W0-08 freezes unavailable stop authorities as a promotion-blocking policy", () => {
  assert.deepEqual(validateWindowsRolloutStopPolicy(policy), {
    schema: "pupu.windows-rollout-stop-policy.v1",
    promotionAllowed: false,
  });
  const optionalUpdater = structuredClone(policy);
  optionalUpdater.channels.public.authority = "optional_updater";
  optionalUpdater.channels.public.promotion_allowed = true;
  assert.throws(
    () => validateWindowsRolloutStopPolicy(optionalUpdater),
    /fail closed/,
  );
  const publicWrongAuthority = structuredClone(policy);
  publicWrongAuthority.channels.public.required_authority = "optional_updater";
  assert.throws(
    () => validateWindowsRolloutStopPolicy(publicWrongAuthority),
    /authority requirement/,
  );
});

test("W0-08 only accepts a new Shadow build identity with retained payload lineage", () => {
  assert.equal(
    validateShadowRollbackDescendant({ prior, rollback }).rollbackBuildIdentity,
    rollback.build_identity_fingerprint,
  );
  assert.throws(
    () => validateShadowRollbackDescendant({
      prior,
      rollback: { ...rollback, release_snapshot_fingerprint: prior.release_snapshot_fingerprint },
    }),
    /new release snapshot/,
  );
  assert.throws(
    () => validateShadowRollbackDescendant({
      prior,
      rollback: { ...rollback, build_identity_fingerprint: prior.build_identity_fingerprint },
    }),
    /new build identity/,
  );
  assert.throws(
    () => validateShadowRollbackDescendant({
      prior,
      rollback: { ...rollback, rollout_mode: "all" },
    }),
    /must be Shadow/,
  );
});
