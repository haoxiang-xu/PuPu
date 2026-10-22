import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const root = path.resolve(import.meta.dirname, "../..");
const read = (name) => YAML.parse(fs.readFileSync(path.join(root, ".github/workflows", name), "utf8"));

test("operator-selected runtime code has read-only cache tokens, including reusable jobs", () => {
  for (const name of ["release-qa.yml", "_shared-release-deterministic.yml"]) {
    const workflow = read(name);
    assert.equal(workflow["cache-mode"], "read", name);
    for (const job of Object.values(workflow.jobs)) {
      assert.ok(!job["cache-mode"] || ["read", "none"].includes(job["cache-mode"]), name);
    }
  }
});

test("runtime cache authority guard rejects absent or writable authority before checkout", () => {
  const steps = read("_shared-release-deterministic.yml").jobs.deterministic.steps;
  const guard = steps.find((step) => step.name === "Verify read-only cache authority");
  assert.ok(guard);
  assert.ok(steps.indexOf(guard) < steps.findIndex((step) => step.uses?.startsWith("actions/checkout")));
  for (const mode of ["read", "none", "write", "write-only", ""]) {
    const result = spawnSync("bash", ["-eu", "-c", guard.run], {
      env: { ...process.env, ACTIONS_CACHE_MODE: mode }, encoding: "utf8",
    });
    assert.equal(result.status, ["read", "none"].includes(mode) ? 0 : 1, mode);
  }
});
