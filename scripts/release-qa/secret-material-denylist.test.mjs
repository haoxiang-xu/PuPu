import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanArtifactUploadPaths } from "./secret-material-denylist.mjs";

const denylistScript = fileURLToPath(new URL("./secret-material-denylist.mjs", import.meta.url));

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-artifact-safety-"));
  try {
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function write(root, relativePath, content = "{}") {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

test("artifact denylist accepts ordinary evidence without exposing its contents", () => {
  withFixture((root) => {
    write(root, "evidence/signing-evidence.v1.json", '{"status":"passed"}');

    assert.deepEqual(scanArtifactUploadPaths({ root, paths: ["evidence"] }), {
      checked_file_count: 1,
      violations: [],
    });
  });
});

test("artifact denylist rejects signing material by safe path/category diagnostics only", () => {
  withFixture((root) => {
    write(root, "evidence/identity.p12", "opaque");
    write(root, "evidence/windows-signing.pfx", "opaque");
    write(root, "evidence/AuthKey_ABC123.p8", "opaque");
    write(root, "evidence/evidence.json", "-----BEGIN PRIVATE KEY-----\nnot-a-real-key");

    const result = scanArtifactUploadPaths({ root, paths: ["evidence"] });

    assert.deepEqual(
      result.violations,
      [
        { path: "evidence/AuthKey_ABC123.p8", category: "api-private-key-filename" },
        { path: "evidence/evidence.json", category: "private-key-pem-header" },
        { path: "evidence/identity.p12", category: "pkcs12-extension" },
        { path: "evidence/windows-signing.pfx", category: "pkcs12-extension" },
      ],
    );
    assert.throws(
      () => scanArtifactUploadPaths({ root, paths: ["evidence"], failOnViolation: true }),
      (error) => {
        assert.match(error.message, /evidence\/identity\.p12 \[pkcs12-extension\]/);
        assert.doesNotMatch(error.message, /BEGIN PRIVATE KEY|not-a-real-key/);
        return true;
      },
    );
  });
});

test("artifact denylist rejects paths that resolve outside the declared upload root", () => {
  withFixture((root) => {
    assert.throws(
      () => scanArtifactUploadPaths({ root, paths: ["../outside.json"] }),
      /must remain inside the declared upload root/,
    );
  });
});

test("artifact denylist executes its fail-closed CLI entrypoint with a portable URL guard", () => {
  const result = spawnSync(process.execPath, [denylistScript, "--root", "/does-not-exist", "--path", "evidence"], {
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /artifact upload root must be an existing directory/);
  assert.match(fs.readFileSync(denylistScript, "utf8"), /pathToFileURL\(process\.argv\[1\]\)\.href/);
});
