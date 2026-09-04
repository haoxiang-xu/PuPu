import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRestartUpdateQualificationReport,
  validateUpdateFixtureSource,
} from "./restart-update-qualification.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const sha512 = "cGF5bG9hZA==";
const manifest = {
  manifest_digest: digest("a"),
  release: { tag: "v0.1.10", version: "0.1.10" },
  assets: [
    {
      target_id: "windows-x64",
      role: "installer",
      format: "exe",
      name: "PuPu-0.1.10-windows-x64-setup.exe",
      sha256: digest("b"),
    },
    {
      target_id: "windows-x64",
      role: "updater-blockmap",
      format: "blockmap",
      name: "PuPu-0.1.10-windows-x64-setup.exe.blockmap",
      sha256: digest("c"),
    },
  ],
  updater_metadata: [
    {
      name: "latest.yml",
      sha256: digest("d"),
      target_ids: ["windows-x64"],
      references: [{ name: "PuPu-0.1.10-windows-x64-setup.exe", sha512 }],
    },
  ],
};

const report = () => ({
  schema: "pupu.restart-update-qualification.v1",
  status: "passed",
  target_id: "windows-x64",
  candidate: {
    manifest_digest: manifest.manifest_digest,
    to_tag: "v0.1.10",
    to_version: "0.1.10",
  },
  fixture: {
    from_tag: "v0.1.9",
    from_version: "0.1.9",
    from_commit: "b".repeat(40),
    sha256: digest("e"),
    signer_subject: "CN=PuPu Test",
    signer_thumbprint: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    allowed_differences: ["app-update.yml"],
  },
  feed: {
    schema: "pupu.qualification-feed.v1",
    transport: "runner-loopback",
    metadata: { name: "latest.yml", sha256: digest("d") },
    payload: {
      name: "PuPu-0.1.10-windows-x64-setup.exe",
      sha256: digest("b"),
      sha512,
    },
    blockmap: {
      name: "PuPu-0.1.10-windows-x64-setup.exe.blockmap",
      sha256: digest("c"),
    },
  },
  update: {
    attempts: 1,
    duplicate_install_blocked: true,
    old_process_cleanup: true,
    events: [
      "checking",
      "downloading",
      "downloaded",
      "install_requested",
      "old_process_exited",
      "relaunched",
    ],
  },
  installed: {
    identity: {
      app_asar_sha256: digest("f"),
      executable_sha256: digest("f"),
      sidecar_sha256: digest("0"),
      snapshot_sha256: digest("1"),
      snapshot_fingerprint: "2".repeat(64),
    },
    sentinel: {
      before_sha256: digest("3"),
      after_sha256: digest("3"),
      retained: true,
    },
  },
  executed_tests: 12,
});

test("restart-update qualification strictly binds the candidate feed, fixture, lifecycle, and retained state", () => {
  const result = validateRestartUpdateQualificationReport(report(), { manifest, targetId: "windows-x64" });
  assert.equal(result.target_id, "windows-x64");
});

test("restart-update qualification rejects fixture, feed, sequence, and unknown-field drift", () => {
  const wrongVersion = report();
  wrongVersion.fixture.from_tag = "v0.1.10";
  wrongVersion.fixture.from_version = "0.1.10";
  assert.throws(
    () => validateRestartUpdateQualificationReport(wrongVersion, { manifest }),
    /must be lower/,
  );

  const wrongPayload = report();
  wrongPayload.feed.payload.sha256 = digest("9");
  assert.throws(
    () => validateRestartUpdateQualificationReport(wrongPayload, { manifest }),
    /payload does not match/,
  );

  const incompleteSequence = report();
  incompleteSequence.update.events.pop();
  assert.throws(
    () => validateRestartUpdateQualificationReport(incompleteSequence, { manifest }),
    /restart sequence/,
  );

  const unknownField = report();
  unknownField.fixture.unreviewed_difference = true;
  assert.throws(
    () => validateRestartUpdateQualificationReport(unknownField, { manifest }),
    /keys must be exactly/,
  );
});

test("N-1 fixture source is an explicit stable tag and immutable lower-version commit", () => {
  assert.deepEqual(
    validateUpdateFixtureSource({
      manifest,
      fromTag: "v0.1.9",
      fromVersion: "0.1.9",
      fromCommit: "a".repeat(40),
    }),
    {
      from_tag: "v0.1.9",
      from_version: "0.1.9",
      from_commit: "a".repeat(40),
    },
  );
  assert.throws(
    () => validateUpdateFixtureSource({
      manifest,
      fromTag: "v0.1.10",
      fromVersion: "0.1.10",
      fromCommit: "a".repeat(40),
    }),
    /must be lower/,
  );
  assert.throws(
    () => validateUpdateFixtureSource({
      manifest,
      fromTag: "v0.1.9",
      fromVersion: "0.1.9",
      fromCommit: "A".repeat(40),
    }),
    /40-character lowercase/,
  );
});
