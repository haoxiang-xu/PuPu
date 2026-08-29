import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readReleaseBootstrapPolicy } from "./release-bootstrap-policy.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CLI_PATH = fileURLToPath(new URL("./validate-legacy-release-gap.mjs", import.meta.url));
const POLICY_PATH = path.join(ROOT, "contracts/release/release-bootstrap-policy.v1.json");
const policy = readReleaseBootstrapPolicy(POLICY_PATH);

const validApiRelease = () => ({
  id: policy.legacy_release.release_id,
  tag_name: policy.legacy_release.tag,
  draft: policy.legacy_release.draft,
  prerelease: policy.legacy_release.prerelease,
  assets: policy.legacy_release.assets.map((asset) => ({ ...asset })),
});

const runCli = ({ apiRelease, outputPath }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [
    CLI_PATH,
    "--policy", POLICY_PATH,
    "--legacy-tag-commit", policy.legacy_release.tag_commit,
    "--out", outputPath,
  ], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("close", (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(JSON.stringify(apiRelease));
});

test("legacy release gap CLI reads a piped GitHub response under Node 24", async (t) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-legacy-gap-"));
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const outputPath = path.join(outputDir, "legacy-release-projection.v1.json");

  const result = await runCli({ apiRelease: validApiRelease(), outputPath });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /verified legacy gap for v0\.1\.9/);
  const projection = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(projection.release, policy.legacy_release);
});
