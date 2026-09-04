#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { hashFileSha256, writeJson } from "./release-artifact-manifest.mjs";

export const RESTART_UPDATE_FIXTURE_EVIDENCE_SCHEMA = "pupu.restart-update-fixture.v1";
export const RESTART_UPDATE_FIXTURE_TARGET_IDS = Object.freeze([
  "macos-arm64",
  "macos-x64",
  "windows-x64",
]);

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const GIT_COMMIT = /^[0-9a-f]{40}$/;
const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(required)) {
    throw new Error(`${label} keys must be exactly ${required.join(", ")}`);
  }
};

const requiredString = (value, label) => {
  if (typeof value !== "string" || !value || value !== value.trim()) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
};

const requiredSha256 = (value, label) => {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be sha256:<64 lowercase hex>`);
  }
  return value;
};

const validateVersion = ({ tag, version, label }) => {
  const match = STABLE_TAG.exec(requiredString(tag, `${label}.tag`));
  if (!match) throw new Error(`${label}.tag must be a stable vX.Y.Z tag`);
  if (version !== match.slice(1).join(".")) {
    throw new Error(`${label}.version must match its stable tag`);
  }
};

export function validateRestartUpdateFixtureEvidence(evidence, { targetId = "", fixturePath = "" } = {}) {
  exactKeys(
    evidence,
    ["allowed_differences", "from_commit", "from_tag", "from_version", "installer", "schema", "signer", "target_id"],
    "restart-update fixture evidence",
  );
  if (evidence.schema !== RESTART_UPDATE_FIXTURE_EVIDENCE_SCHEMA) {
    throw new Error(`restart-update fixture evidence schema must be ${RESTART_UPDATE_FIXTURE_EVIDENCE_SCHEMA}`);
  }
  if (!RESTART_UPDATE_FIXTURE_TARGET_IDS.includes(evidence.target_id)) {
    throw new Error("restart-update fixture evidence target is unsupported");
  }
  if (targetId && evidence.target_id !== targetId) {
    throw new Error("restart-update fixture evidence target does not match expectation");
  }
  validateVersion({
    tag: evidence.from_tag,
    version: evidence.from_version,
    label: "restart-update fixture evidence from",
  });
  if (typeof evidence.from_commit !== "string" || !GIT_COMMIT.test(evidence.from_commit)) {
    throw new Error("restart-update fixture evidence from_commit must be a lowercase 40-character Git commit");
  }
  if (JSON.stringify(evidence.allowed_differences) !== JSON.stringify(["app-update.yml"])) {
    throw new Error("restart-update fixture evidence allowed_differences must be exactly app-update.yml");
  }
  exactKeys(evidence.installer, ["name", "sha256"], "restart-update fixture evidence installer");
  const installerName = requiredString(evidence.installer.name, "restart-update fixture evidence installer.name");
  requiredSha256(evidence.installer.sha256, "restart-update fixture evidence installer.sha256");
  exactKeys(evidence.signer, ["subject", "thumbprint"], "restart-update fixture evidence signer");
  requiredString(evidence.signer.subject, "restart-update fixture evidence signer.subject");
  requiredString(evidence.signer.thumbprint, "restart-update fixture evidence signer.thumbprint");
  if (fixturePath) {
    const resolved = path.resolve(fixturePath);
    if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
      throw new Error("restart-update fixture installer is missing");
    }
    if (path.basename(resolved) !== installerName) {
      throw new Error("restart-update fixture evidence installer.name does not match the fixture path");
    }
    if (hashFileSha256(resolved) !== evidence.installer.sha256) {
      throw new Error("restart-update fixture installer SHA-256 does not match its evidence");
    }
  }
  return evidence;
}

export function createRestartUpdateFixtureEvidence({
  fixturePath,
  targetId,
  fromTag,
  fromVersion,
  fromCommit,
  signerSubject,
  signerThumbprint,
}) {
  const resolved = path.resolve(requiredString(fixturePath, "fixture path"));
  if (!fs.statSync(resolved, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("fixture installer is missing");
  }
  const evidence = {
    schema: RESTART_UPDATE_FIXTURE_EVIDENCE_SCHEMA,
    target_id: requiredString(targetId, "fixture target_id"),
    from_tag: requiredString(fromTag, "fixture from_tag"),
    from_version: requiredString(fromVersion, "fixture from_version"),
    from_commit: requiredString(fromCommit, "fixture from_commit"),
    allowed_differences: ["app-update.yml"],
    installer: {
      name: path.basename(resolved),
      sha256: hashFileSha256(resolved),
    },
    signer: {
      subject: requiredString(signerSubject, "fixture signer_subject"),
      thumbprint: requiredString(signerThumbprint, "fixture signer_thumbprint"),
    },
  };
  return validateRestartUpdateFixtureEvidence(evidence, { targetId, fixturePath: resolved });
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of [
    "fixture", "target", "from-tag", "from-version", "from-commit", "signer-subject", "signer-thumbprint", "out",
  ]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const evidence = createRestartUpdateFixtureEvidence({
      fixturePath: args.fixture,
      targetId: args.target,
      fromTag: args["from-tag"],
      fromVersion: args["from-version"],
      fromCommit: args["from-commit"],
      signerSubject: args["signer-subject"],
      signerThumbprint: args["signer-thumbprint"],
    });
    writeJson(path.resolve(args.out), evidence);
    console.log(`[restart-update-fixture] sealed ${evidence.target_id} ${evidence.installer.name}`);
  } catch (error) {
    console.error(`[restart-update-fixture] ${error.message || String(error)}`);
    process.exitCode = 1;
  }
}
