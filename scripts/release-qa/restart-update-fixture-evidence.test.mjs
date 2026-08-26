import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createRestartUpdateFixtureEvidence,
  validateRestartUpdateFixtureEvidence,
} from "./restart-update-fixture-evidence.mjs";

test("restart-update fixture evidence binds the exact installer, signer, source, target, and sole allowed difference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-restart-fixture-evidence-"));
  try {
    const fixturePath = path.join(root, "PuPu-0.1.9-windows-x64-setup.exe");
    fs.writeFileSync(fixturePath, "signed fixture bytes\n", "utf8");
    const evidence = createRestartUpdateFixtureEvidence({
      fixturePath,
      targetId: "windows-x64",
      fromTag: "v0.1.9",
      fromVersion: "0.1.9",
      fromCommit: "a".repeat(40),
      signerSubject: "CN=Haoxiang Xu",
      signerThumbprint: "A1B2C3D4",
    });
    assert.equal(validateRestartUpdateFixtureEvidence(evidence, {
      targetId: "windows-x64",
      fixturePath,
    }).installer.name, path.basename(fixturePath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("restart-update fixture evidence fails closed on an unrecorded build difference or byte drift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-restart-fixture-evidence-"));
  try {
    const fixturePath = path.join(root, "PuPu-0.1.9-windows-x64-setup.exe");
    fs.writeFileSync(fixturePath, "signed fixture bytes\n", "utf8");
    const evidence = createRestartUpdateFixtureEvidence({
      fixturePath,
      targetId: "windows-x64",
      fromTag: "v0.1.9",
      fromVersion: "0.1.9",
      fromCommit: "a".repeat(40),
      signerSubject: "CN=Haoxiang Xu",
      signerThumbprint: "A1B2C3D4",
    });
    evidence.allowed_differences.push("package.json");
    assert.throws(
      () => validateRestartUpdateFixtureEvidence(evidence, { targetId: "windows-x64", fixturePath }),
      /allowed_differences/,
    );
    evidence.allowed_differences = ["app-update.yml"];
    fs.appendFileSync(fixturePath, "tampered\n", "utf8");
    assert.throws(
      () => validateRestartUpdateFixtureEvidence(evidence, { targetId: "windows-x64", fixturePath }),
      /SHA-256/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
